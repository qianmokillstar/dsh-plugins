#!/usr/bin/env node
/**
 * 由 data/catalog.json + data/curated.json 生成 DSH 市场索引 market/index.json（format 1）。
 *
 * 硬规则：
 *   - 只收录 registry 详情里确证存在 package.json#dsh.bundle.patch 的包（否则安装必失败）
 *   - 所有字段来自采集数据或人工审核文件，不做推测
 *   - 不写 registry 字段，安装时沿用用户已配置的 registry
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

const CATEGORIES = {
  productivity: { title: { en: 'Productivity', zh: '效率与工作流' } },
  devtools: { title: { en: 'Development and Remote', zh: '开发与远程' } },
  memory: { title: { en: 'Memory and Context', zh: '记忆与上下文' } },
  search: { title: { en: 'Search and Information', zh: '搜索与信息' } },
  automation: { title: { en: 'Automation and Desktop', zh: '自动化与桌面' } },
  media: { title: { en: 'Media and Multimodal', zh: '多模态与媒体' } },
  appearance: { title: { en: 'Appearance', zh: '外观与主题' } },
  observability: { title: { en: 'Cost and Observability', zh: '成本与可观测' } },
  collab: { title: { en: 'Chat and Collaboration', zh: '沟通与协作' } },
  models: { title: { en: 'Models and Integrations', zh: '模型与接入' } },
}

const LABELS = {
  reviewed: { title: { en: 'Editor reviewed', zh: '人工审核' } },
  'catalog-only': { title: { en: 'Metadata only, not reviewed', zh: '仅元数据 · 未审核' } },
  'chinese-docs': { title: { en: 'Chinese documentation', zh: '中文文档' } },
  'needs-network': { title: { en: 'Requires network access', zh: '需要联网' } },
  'needs-credentials': { title: { en: 'Requires your own credentials', zh: '需要自备凭据' } },
  'external-service': { title: { en: 'Relies on a third-party service', zh: '依赖第三方服务' } },
  'license-review': { title: { en: 'License needs review', zh: '许可证需自行确认' } },
  experimental: { title: { en: 'Experimental', zh: '实验性' } },
  'auto-category': { title: { en: 'Category inferred automatically', zh: '分类由关键词自动推断' } },
}

const SORT_KEYS = {
  curation: { title: { en: 'Editor priority', zh: '人工推荐序' }, order: 'desc' },
  weeklyDownloads: { title: { en: 'Weekly downloads', zh: '周下载量' }, order: 'desc' },
}

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u
const SEMVER_RANGE_SAFE = /^[0-9A-Za-z.<>=~^*+| -]+$/u

/** 未人工审核条目的分类推断；站点与索引共用同一套规则，并用 auto-category 标签明示。 */
const KEYWORD_CATEGORIES = [
  [/cost|billing|price|usage|token|balance|budget|费用|计费/u, 'observability'],
  [/memory|recall|context|mem0|记忆|上下文/u, 'memory'],
  [/search|serp|websearch|搜索/u, 'search'],
  [/remote|ssh|ide|editor|lsp|terminal|tui|cli|git|开发|编辑器/u, 'devtools'],
  [/theme|skin|wallpaper|appearance|主题|皮肤|壁纸|换肤/u, 'appearance'],
  [/mcp|provider|model|llm|连接器|模型/u, 'models'],
  [/qq|telegram|feishu|wechat|wecom|dingtalk|slack|discord|chatbot|微信|飞书|钉钉|沟通/u, 'collab'],
  [/image|video|audio|tts|asr|office|document|pdf|spreadsheet|图片|视频|文档/u, 'media'],
  [/browser|automation|desktop|computer-use|windows|自动化|桌面/u, 'automation'],
  [/agent|team|subagent|workflow|schedule|plan|skill|prompt|session|archive|export|归档|会话|计划/u, 'productivity'],
]

function inferCategory(plugin) {
  const haystack = [plugin.name, ...(plugin.keywords ?? []), plugin.description ?? ''].join(' ').toLowerCase()
  for (const [pattern, category] of KEYWORD_CATEGORIES) if (pattern.test(haystack)) return category
  return undefined
}

function text(value, max = 400) {
  if (typeof value !== 'string') return undefined
  const clean = value.replace(/\s+/gu, ' ').trim()
  if (clean === '') return undefined
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

function cleanHomepage(url) {
  if (typeof url !== 'string' || !URL.canParse(url)) return undefined
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined
  return parsed.href
}

function cleanRepository(url) {
  if (typeof url !== 'string') return undefined
  let candidate = url.trim()
  if (candidate.startsWith('git+')) candidate = candidate.slice(4)
  if (candidate.startsWith('git@')) return undefined
  if (!URL.canParse(candidate)) return undefined
  const parsed = new URL(candidate)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined
  if (parsed.username || parsed.password) return undefined
  if (parsed.search || parsed.hash) return undefined
  if (!/^(?:\/[^/]+){2,}$/u.test(parsed.pathname)) return undefined
  if (/\.(?:tgz|tar\.gz)$/iu.test(parsed.pathname)) return undefined
  return parsed.href
}

function repositoryPath(directory) {
  if (typeof directory !== 'string') return undefined
  const segments = directory.replace(/^\.?\//u, '').replace(/\/$/u, '').split('/').filter(Boolean)
  if (segments.length === 0) return undefined
  if (segments.some((segment) => !/^[A-Za-z0-9._@+-]+$/u.test(segment) || segment === '.' || segment === '..')) return undefined
  return segments.join('/')
}

function dshRange(range) {
  if (typeof range !== 'string') return undefined
  if (!SEMVER_RANGE_SAFE.test(range)) return undefined
  if (range.startsWith('workspace:')) return undefined
  return range
}

function publishSeconds(iso) {
  const ms = Date.parse(iso ?? '')
  if (!Number.isFinite(ms) || ms < 0) return undefined
  return Math.floor(ms / 1000)
}

const catalog = JSON.parse(await readFile(join(ROOT, 'data', 'catalog.json'), 'utf8'))
let curated = { items: [] }
try {
  curated = JSON.parse(await readFile(join(ROOT, 'data', 'curated.json'), 'utf8'))
} catch {
  console.warn('未找到 data/curated.json，先生成仅收录采集数据的索引')
}

const curatedByName = new Map(curated.items.map((item) => [item.name, item]))
const byName = new Map(catalog.plugins.map((plugin) => [plugin.name, plugin]))

const plugins = []
const skipped = []
for (const item of curated.items) {
  if (!byName.has(item.name)) {
    skipped.push({ name: item.name, reason: '审核条目不在于本次采集窗口内（下载量排名靠后或采集未覆盖）' })
  }
}

for (const plugin of catalog.plugins) {
  if (!plugin.dshBundle) continue
  if (!PACKAGE_NAME.test(plugin.name)) continue
  const version = text(plugin.version, 64)
  const published = publishSeconds(plugin.publishTime)
  if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)) continue
  if (published === undefined) continue

  const review = curatedByName.get(plugin.name)
  const category = review?.category ?? inferCategory(plugin)
  const labels = review
    ? ['reviewed', ...(review.labels ?? [])]
    : ['catalog-only', ...(review?.category === undefined && category !== undefined ? ['auto-category'] : [])]
  const entry = {
    name: plugin.name,
    metadata: {
      category,
      keywords: (plugin.keywords ?? []).slice(0, 12).map((keyword) => String(keyword).slice(0, 40)),
      labels: labels.filter((label, index, list) => list.indexOf(label) === index),
      sortKeys: {},
    },
    versions: [{
      version,
      publishTimestamp: published,
      source: { type: 'npm' },
      ...dshRange(plugin.dshEngines) === undefined ? {} : { engines: { dsh: dshRange(plugin.dshEngines) } },
    }],
  }
  if (review?.title) entry.title = review.title
  else {
    // 未审核条目：只用可读的英文短名，避免把包名当中文标题展示。
    const short = text(plugin.name.replace(/^@[^/]+\//u, '').replace(/^dsh[-_]?/u, '').replace(/[-_]/gu, ' '), 60)
    if (short) entry.title = short.replace(/^\w/u, (char) => char.toUpperCase())
  }
  const description = review?.summary ?? text(plugin.description, 300)
  if (description) entry.description = description
  const author = plugin.maintainers?.[0]
  if (author) entry.author = author
  const homepage = cleanHomepage(plugin.homepage)
  if (homepage) entry.homepage = homepage
  const repoUrl = cleanRepository(plugin.repoUrl ?? plugin.repository)
  const repoDir = repositoryPath(plugin.repoDir)
  if (repoUrl) entry.repository = { url: repoUrl, ...repoDir === undefined ? {} : { directory: repoDir } }
  if (review?.curationRank !== undefined) entry.metadata.sortKeys.curation = review.curationRank
  entry.metadata.sortKeys.weeklyDownloads = plugin.weeklyDownloads ?? 0
  if (!entry.metadata.category) delete entry.metadata.category
  plugins.push(entry)
}

const uncategorized = plugins.filter((plugin) => !plugin.metadata.category)
if (uncategorized.length > 0) {
  // 未审核条目归入「效率与工作流」会失真，改为不声明分类，由站点侧自动归类。
  console.log(`提示：${uncategorized.length} 个条目未声明分类（Discover 中不参与分类筛选）`)
}

const index = {
  format: 1,
  title: { en: 'DSH Plugin Market · curated by 插件市场deepseek', zh: 'DSH 插件市场 · 人工审核版' },
  description: {
    en: 'Human-reviewed index for DeepSeek Harness plugins. Only entries whose package declares a bundle patch are listed.',
    zh: '面向 DeepSeek Harness 的人工审核插件索引；仅收录在 package.json 中声明了 bundle patch 的包。',
  },
  metadata: { categories: CATEGORIES, labels: LABELS, sortKeys: SORT_KEYS },
  plugins: plugins.sort((left, right) => {
    const l = left.metadata.sortKeys.curation ?? -1
    const r = right.metadata.sortKeys.curation ?? -1
    if (l !== r) return r - l
    return (right.metadata.sortKeys.weeklyDownloads ?? 0) - (left.metadata.sortKeys.weeklyDownloads ?? 0)
  }),
}

await mkdir(join(ROOT, 'market'), { recursive: true })
await writeFile(join(ROOT, 'market', 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8')

const reviewed = plugins.filter((plugin) => plugin.metadata.labels.includes('reviewed')).length
console.log(`索引写入 market/index.json`)
console.log(`可安装条目 ${plugins.length}（其中人工审核 ${reviewed}）`)
console.log(`跳过审核条目 ${skipped.length}`)
for (const skip of skipped) console.log(`  - ${skip.name}: ${skip.reason}`)

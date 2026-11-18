#!/usr/bin/env node
/**
 * 生成 DSH 插件站（静态、零后端、零外部依赖）。
 *
 * 数据合并：
 *   data/catalog.json  —— npm 侧：可安装性（dsh.bundle.patch）、周下载、许可证、版本
 *   data/github.json   —— GitHub 侧：star、最近推送、仓库、插件声明
 *   data/curated.json  —— 人工判断：分类、风险、短评、推荐序
 *   content/reviews/   —— 人工撰写的四问短评正文
 *
 * 页面：
 *   index.html        搜索 / 分类 / 排序 / 卡片（star、更新、核实状态、安装 spec 复制）
 *   p/<slug>.html     详情（有短评的显示判断；没有的明确标注"未验证"）
 *   changelog.html    最近更新与变更
 *   submit.html       提交插件
 *   index.json        DSH 市场索引副本（可被 DSH 直接读取）
 */
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SITE = join(ROOT, 'site')
const BUILT_AT = new Date()
const DSH_VERSION = '0.2.2-rc.3'
const SITE_URL = 'https://qianmokillstar.github.io/dsh-plugins'
const DISCUSSIONS = {
  home: 'https://github.com/qianmokillstar/dsh-plugins/discussions',
  correction: 'https://github.com/qianmokillstar/dsh-plugins/discussions/2',
  sceneIdeas: 'https://github.com/qianmokillstar/dsh-plugins/discussions/3',
}

const CATEGORY_TITLES = {
  productivity: '效率与工作流',
  devtools: '开发与远程',
  memory: '记忆与上下文',
  search: '搜索与信息',
  automation: '自动化与桌面',
  media: '多模态与媒体',
  appearance: '外观与主题',
  observability: '成本与可观测',
  collab: '沟通与协作',
  models: '模型与接入',
  sandbox: '沙箱与安全',
  general: '其他',
}

const LABEL_TITLES = {
  reviewed: '人工审核',
  'catalog-only': '仅元数据',
  'auto-category': '自动归类',
  'chinese-docs': '中文文档',
  'needs-network': '需联网',
  'needs-credentials': '需自备凭据',
  'external-service': '依赖第三方服务',
  'license-review': '许可证需确认',
  experimental: '实验性',
}

const KEYWORD_CATEGORIES = [
  [/cost|billing|price|usage|token|balance|budget|费用|计费|余额/u, 'observability'],
  [/memory|recall|context|mem0|记忆|上下文/u, 'memory'],
  [/search|serp|websearch|搜索/u, 'search'],
  [/remote|ssh|ide|editor|lsp|terminal|tui|cli|git|开发|编辑器/u, 'devtools'],
  [/theme|skin|wallpaper|appearance|主题|皮肤|壁纸|换肤/u, 'appearance'],
  [/sandbox|permission|security|audit|沙箱|权限|安全|审计/u, 'sandbox'],
  [/mcp|provider|model|llm|连接器|模型/u, 'models'],
  [/qq|telegram|feishu|wechat|wecom|dingtalk|slack|discord|chatbot|微信|飞书|钉钉|沟通/u, 'collab'],
  [/image|video|audio|tts|asr|office|document|pdf|spreadsheet|图片|视频|文档/u, 'media'],
  [/browser|automation|desktop|computer-use|windows|自动化|桌面/u, 'automation'],
  [/agent|team|subagent|workflow|schedule|plan|skill|prompt|session|archive|export|归档|会话|计划/u, 'productivity'],
]

const readJson = async (path, fallback = null) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

const catalog = (await readJson(join(ROOT, 'data', 'catalog.json'), { plugins: [] })) ?? { plugins: [] }
const github = await readJson(join(ROOT, 'data', 'github.json'), null)
const curated = (await readJson(join(ROOT, 'data', 'curated.json'), { items: [] })) ?? { items: [] }
const marketIndex = await readJson(join(ROOT, 'market', 'index.json'), null)
const trialData = await readJson(join(ROOT, 'data', 'trial-install.json'), null)
const trialByName = new Map((trialData?.items ?? []).map((item) => [item.name, item]))
// 批次安装结果（batch-prepare）也计入实测：否则新核验条目会丢日期
const batchData = await readJson(join(ROOT, 'data', 'batch-prepare.json'), null)
for (const item of batchData?.items ?? []) {
  if (trialByName.has(item.name)) continue
  if (!item.install?.ok) continue
  trialByName.set(item.name, {
    name: item.name,
    date: item.date,
    dshVersion: item.dshVersion ?? DSH_VERSION,
    result: 'installed',
    version: item.install.version ?? item.latest ?? null,
    seconds: item.install.seconds ?? null,
    source: 'batch-prepare',
  })
}
const trialInstalled = [...trialByName.values()].filter((item) => item.result === 'installed')
const launchData = await readJson(join(ROOT, 'data', 'launch-test.json'), null)
const riskData = await readJson(join(ROOT, 'data', 'risk-flags.json'), null)
const RISK_FLAG_TEXT = {
  'broken-npm': 'npm 包损坏',
  'github-only': '仅 GitHub 可装',
  paused: '已暂停维护',
  mirror: '镜像仓库',
  jailbreak: '破甲/越狱类',
  unverified: '未核实',
  incompatible: '版本不兼容',
  'clone-timeout': '克隆超时未完成',
}
const launchByName = new Map((launchData?.plugins ?? []).map((item) => [item.name, item]))
const ACTIVATION_TEXT = {
  loaded: '已加载（日志证实）',
  'no-error': '已组合 · 未见报错',
  pending: '待激活（缺 webServer）',
  'not-composed': '独立 app · 未参与组合',
}

const PRIVACY_META = {
  local: { badge: '🟢 纯本地', cls: 'ok', text: '数据留在本机或你自己的服务器' },
  cloud: { badge: '🔴 需云端', cls: 'high', text: '会把内容发送到第三方服务' },
  unknown: { badge: '⚪ 未确认', cls: '', text: '隐私行为未确认' },
}

/** 从四问短评里抽首条要点，用于结构化 index.json 的答案摘要。 */
function reviewSections(markdown) {
  const sections = {}
  let current = ''
  for (const line of markdown.split('\n')) {
    const heading = /^##\s+(.*)$/u.exec(line)
    if (heading) {
      current = heading[1].trim()
      sections[current] = ''
      continue
    }
    if (current) sections[current] += `${line}\n`
  }
  return sections
}

function firstBullet(text) {
  const match = /^[-*]\s+(.+)$/mu.exec(text ?? '')
  if (!match) return null
  return match[1].replace(/\*\*/gu, '').replace(/\s+/gu, ' ').trim()
}

function judgmentOf(markdown) {
  const sections = reviewSections(markdown ?? '')
  const pick = (keyword) => {
    const key = Object.keys(sections).find((name) => name.includes(keyword))
    return key ? firstBullet(sections[key]) : null
  }
  return {
    fit: pick('适合谁'),
    solves: pick('解决什么'),
    risk: pick('风险点'),
    alternatives: pick('替代品'),
  }
}

const curatedByName = new Map(curated.items.map((item) => [item.name, item]))
const reviewFiles = new Set(await readdir(join(ROOT, 'content', 'reviews')).catch(() => []))
const reviewBodies = new Map()
for (const file of reviewFiles) {
  if (!file.endsWith('.md')) continue
  reviewBodies.set(file, await readFile(join(ROOT, 'content', 'reviews', file), 'utf8'))
}

// ---------- 工具 ----------
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
}

function inline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/gu, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/gu, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
}

function renderMarkdown(markdown) {
  const out = []
  let list = null
  const closeList = () => {
    if (list) { out.push(`</${list}>`); list = null }
  }
  for (const raw of markdown.replace(/\r\n/gu, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (line.trim() === '') { closeList(); continue }
    const heading = /^(#{1,4})\s+(.*)$/u.exec(line)
    if (heading) {
      closeList()
      const level = heading[1].length
      if (level === 1) continue
      out.push(`<h${String(level)}>${inline(heading[2])}</h${String(level)}>`)
      continue
    }
    const bullet = /^[-*]\s+(.*)$/u.exec(line)
    if (bullet) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul' }
      out.push(`<li>${inline(bullet[1])}</li>`)
      continue
    }
    const quote = /^>\s?(.*)$/u.exec(line)
    if (quote) { closeList(); out.push(`<blockquote>${inline(quote[1])}</blockquote>`); continue }
    closeList()
    out.push(`<p>${inline(line)}</p>`)
  }
  closeList()
  return out.join('\n')
}

const textOf = (value) => (typeof value === 'string' ? value : value?.zh ?? value?.en ?? '')

function inferCategory(haystack) {
  const text = String(haystack).toLowerCase()
  for (const [pattern, category] of KEYWORD_CATEGORIES) if (pattern.test(text)) return category
  return 'general'
}

function normalizeRepo(url) {
  if (!url) return null
  const match = /github\.com[/:]([^/]+)\/([^/#?]+)/iu.exec(String(url))
  if (!match) return null
  return `${match[1]}/${match[2].replace(/\.git$/u, '')}`.toLowerCase()
}

function daysSince(iso) {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return Math.floor((BUILT_AT.getTime() - ms) / 86400000)
}

function slugOf(value) {
  return String(value).replace(/^@/u, '').replace(/\//gu, '__').replace(/[^A-Za-z0-9._-]/gu, '-')
}

// ---------- 合并数据 ----------
const githubByRepo = new Map()
for (const plugin of github?.plugins ?? []) githubByRepo.set(plugin.fullName.toLowerCase(), plugin)

const entries = []
const seenRepos = new Set()

for (const plugin of catalog.plugins) {
  if (!plugin.dshBundle) continue
  const repo = normalizeRepo(plugin.repoUrl ?? plugin.repository)
  const gh = repo ? githubByRepo.get(repo) : undefined
  if (repo) seenRepos.add(repo)
  const review = curatedByName.get(plugin.name)
  const reviewFile = review?.review ? review.review.split('/').at(-1) : undefined
  const reviewBody = reviewFile ? reviewBodies.get(reviewFile) : undefined
  const category = review?.category ?? inferCategory([
    plugin.name,
    ...(plugin.keywords ?? []),
    plugin.description ?? '',
    ...(gh?.topics ?? []),
  ].join(' '))
  entries.push({
    key: plugin.name,
    slug: slugOf(plugin.name),
    name: plugin.name,
    title: textOf(review?.title) || plugin.name.replace(/^@[^/]+\//u, ''),
    summary: textOf(review?.summary) || plugin.description || '（作者未填写描述）',
    stars: gh?.stars ?? null,
    updatedAt: gh?.pushedAt ?? (plugin.publishTime ?? null),
    repoUrl: gh?.url ?? (repo ? `https://github.com/${repo}` : null),
    homepage: plugin.homepage ?? gh?.homepage ?? null,
    npmUrl: `https://www.npmjs.com/package/${plugin.name}`,
    license: plugin.license ?? null,
    downloads: plugin.weeklyDownloads ?? 0,
    version: plugin.version ?? null,
    enginesDsh: plugin.dshEngines ?? null,
    install: plugin.version ? `${plugin.name}@${plugin.version}` : plugin.name,
    verified: true,
    verifyNote: 'npm 包声明了 dsh.bundle.patch',
    category,
    labels: review?.labels ?? [],
    risk: review?.risk ?? null,
    privacy: review?.privacy ?? 'unknown',
    rp: review?.rp ?? false,
    curationRank: review?.curationRank ?? -1,
    reviewBody,
    reviewHeading: reviewBody ? (/^#\s+(.*)$/mu.exec(reviewBody)?.[1]?.trim() ?? plugin.name) : null,
    source: 'npm',
  })
}

for (const plugin of github?.plugins ?? []) {
  const repoKey = plugin.fullName.toLowerCase()
  if (seenRepos.has(repoKey)) continue
  const review = plugin.dsh?.name ? curatedByName.get(plugin.dsh.name) : undefined
  const reviewFile = review?.review ? review.review.split('/').at(-1) : undefined
  const category = review?.category ?? inferCategory([
    plugin.name,
    plugin.description,
    ...(plugin.topics ?? []),
  ].join(' '))
  entries.push({
    key: plugin.fullName,
    slug: slugOf(plugin.fullName),
    name: plugin.dsh?.name ?? plugin.fullName,
    title: textOf(review?.title) || plugin.name,
    summary: textOf(review?.summary) || plugin.description || '（仓库未填写描述）',
    stars: plugin.stars ?? 0,
    updatedAt: plugin.pushedAt,
    repoUrl: plugin.url,
    homepage: plugin.homepage ?? null,
    npmUrl: plugin.dsh?.name ? `https://www.npmjs.com/package/${plugin.dsh.name}` : null,
    license: plugin.license ?? null,
    downloads: null,
    version: plugin.dsh?.version ?? null,
    enginesDsh: plugin.dsh?.enginesDsh ?? null,
    install: plugin.install ?? null,
    verified: plugin.evidence !== 'readme-hint',
    verifyNote: plugin.evidence === 'manifest'
      ? '仓库 package.json 声明了 dsh 字段'
      : plugin.evidence === 'patch'
        ? '仓库自带 cordis.patch.yml'
        : '仅 README 提到安装方式，未核实包声明',
    category,
    labels: review?.labels ?? [],
    risk: review?.risk ?? null,
    privacy: review?.privacy ?? 'unknown',
    rp: review?.rp ?? false,
    curationRank: review?.curationRank ?? -1,
    reviewBody: reviewFile ? reviewBodies.get(reviewFile) : undefined,
    reviewHeading: reviewFile && reviewBodies.get(reviewFile)
      ? (/^#\s+(.*)$/mu.exec(reviewBodies.get(reviewFile))?.[1]?.trim() ?? plugin.name)
      : null,
    source: 'github',
  })
}

const reviewed = entries.filter((entry) => entry.reviewBody)
const verified = entries.filter((entry) => entry.verified)
const withStars = entries.filter((entry) => Number.isFinite(entry.stars))

// 去重：同一个包名可能同时来自 npm 与多个 GitHub 仓库（镜像/同名），只保留最可信的一条。
const deduped = new Map()
for (const entry of entries) {
  const current = deduped.get(entry.name)
  if (!current) { deduped.set(entry.name, entry); continue }
  const score = (item) =>
    (item.reviewBody ? 1000 : 0) +
    (item.source === 'npm' ? 100 : 0) +
    (item.downloads ?? 0) / 1000 +
    (item.stars ?? 0) / 1000
  if (score(entry) > score(current)) deduped.set(entry.name, entry)
}
const duplicates = entries.length - deduped.size
entries.length = 0
entries.push(...deduped.values())
if (duplicates > 0) console.log(`去重：合并 ${duplicates} 条同名条目`)


// 去重：不同来源可能产生同一个 slug，追加序号避免互相覆盖。
const usedSlugs = new Set()
for (const entry of entries) {
  let slug = entry.slug
  let index = 2
  while (usedSlugs.has(slug)) slug = `${entry.slug}-${String(index++)}`
  usedSlugs.add(slug)
  entry.slug = slug
}

const stats = {
  total: entries.length,
  verified: verified.length,
  reviewed: reviewed.length,
  stars: withStars.reduce((sum, entry) => sum + entry.stars, 0),
  githubChecked: github?.searchedRepos ?? 0,
  githubRejected: github?.rejectedRepos ?? 0,
  builtAt: BUILT_AT.toISOString().slice(0, 10),
}

// 去重之后再算一遍，保证首页数字与列表一致
stats.total = entries.length
stats.verified = entries.filter((entry) => entry.verified).length
stats.reviewed = entries.filter((entry) => entry.reviewBody).length

// ---------- 样式 ----------
const CSS = `:root {
  color-scheme: light dark;
  --bg: #f7f7f5; --bg-raised: #fff; --ink: #14181d; --ink-muted: #5a636e;
  --line: #e2e2dd; --accent: #2f6fdd; --accent-soft: #e8effc;
  --warn: #b45309; --warn-soft: #fdf3e3; --high: #b3261e; --high-soft: #fdecea;
  --ok: #1f7a4d; --ok-soft: #e6f5ec;
  --radius: 14px; --shadow: 0 1px 2px rgba(16,24,40,.04), 0 8px 24px -16px rgba(16,24,40,.28);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101317; --bg-raised: #171b21; --ink: #e7eaee; --ink-muted: #9aa4b1;
    --line: #262c34; --accent: #7aa5ff; --accent-soft: #1b2637;
    --warn: #f0b357; --warn-soft: #2a2115; --high: #ff8b80; --high-soft: #2c1a18;
    --ok: #57c98a; --ok-soft: #16281f;
    --shadow: 0 1px 2px rgba(0,0,0,.4), 0 12px 32px -20px rgba(0,0,0,.8);
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 20px 72px; }
header.top { padding: 40px 0 20px; }
.brand { display: flex; align-items: center; gap: 12px; }
.brand svg { width: 34px; height: 34px; flex: none; }
h1.title { font-size: 26px; line-height: 1.25; margin: 0; letter-spacing: -.01em; }
.subtitle { color: var(--ink-muted); margin: 8px 0 0; max-width: 66ch; }
.nav { display: flex; gap: 16px; margin-top: 14px; font-size: 14px; flex-wrap: wrap; }
.stats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.stat { background: var(--bg-raised); border: 1px solid var(--line); border-radius: 999px; padding: 5px 13px; font-size: 13px; color: var(--ink-muted); }
.stat b { color: var(--ink); font-variant-numeric: tabular-nums; }
.toolbar { position: sticky; top: 0; z-index: 5; background: color-mix(in srgb, var(--bg) 90%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); padding: 12px 0; margin-top: 22px; }
.controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
input[type=search], select { background: var(--bg-raised); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; font: inherit; font-size: 14px; }
input[type=search] { flex: 1 1 280px; }
input[type=search]:focus, select:focus { outline: 2px solid var(--accent-soft); border-color: var(--accent); }
.toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--ink-muted); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.chip { border: 1px solid var(--line); background: var(--bg-raised); color: var(--ink-muted); border-radius: 999px; padding: 4px 11px; font-size: 12.5px; cursor: pointer; }
.chip[aria-pressed=true] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); font-weight: 600; }
.count { color: var(--ink-muted); font-size: 13px; margin: 16px 0 4px; font-variant-numeric: tabular-nums; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; margin-top: 10px; }
.card { background: var(--bg-raised); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 17px; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 10px; }
.card h2 { font-size: 16.5px; margin: 0; line-height: 1.35; }
.card .pkg { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; color: var(--ink-muted); word-break: break-all; }
.card p { margin: 0; color: var(--ink-muted); font-size: 13.8px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; }
.badge { font-size: 11.5px; border-radius: 6px; padding: 2px 8px; border: 1px solid var(--line); color: var(--ink-muted); background: var(--bg); }
.badge.ok { border-color: color-mix(in srgb, var(--ok) 45%, var(--line)); color: var(--ok); background: var(--ok-soft); }
.badge.warn { border-color: color-mix(in srgb, var(--warn) 45%, var(--line)); color: var(--warn); background: var(--warn-soft); }
.badge.high { border-color: color-mix(in srgb, var(--high) 45%, var(--line)); color: var(--high); background: var(--high-soft); }
.badge.accent { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); color: var(--accent); background: var(--accent-soft); }
.meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--ink-muted); font-variant-numeric: tabular-nums; }
.install { display: flex; align-items: center; gap: 8px; background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; padding: 6px 8px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
.install code { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: none; border: 0; padding: 0; }
.copy { border: 1px solid var(--line); background: var(--bg-raised); color: var(--ink-muted); border-radius: 6px; padding: 2px 8px; font-size: 11.5px; cursor: pointer; }
.copy:hover { color: var(--accent); border-color: var(--accent); }
.card footer { margin-top: auto; display: flex; justify-content: space-between; gap: 10px; align-items: center; font-size: 13px; }
.empty { padding: 48px 0; text-align: center; color: var(--ink-muted); }
article.review { background: var(--bg-raised); border: 1px solid var(--line); border-radius: var(--radius); padding: 30px 32px; box-shadow: var(--shadow); max-width: 860px; }
article.review h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -.012em; }
article.review h2 { font-size: 17px; margin: 28px 0 8px; }
article.review h3 { font-size: 15px; margin: 20px 0 6px; }
article.review blockquote { margin: 14px 0 20px; padding: 12px 16px; border-left: 3px solid var(--accent); background: var(--accent-soft); border-radius: 0 8px 8px 0; }
article.review blockquote p { margin: 0; }
article.review ul { margin: 8px 0 14px; padding-left: 22px; }
article.review li { margin: 5px 0; }
article.review code, .page code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .9em; background: var(--bg); border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; font-size: 13.5px; margin: 0; }
.facts dt { color: var(--ink-muted); }
.facts dd { margin: 0; word-break: break-word; }
.page { background: var(--bg-raised); border: 1px solid var(--line); border-radius: var(--radius); padding: 28px 30px; box-shadow: var(--shadow); max-width: 860px; }
.page h1 { font-size: 23px; margin: 0 0 6px; }
.page h2 { font-size: 17px; margin: 26px 0 8px; }
.page p, .page li { color: var(--ink-muted); }
.notice { border-left: 3px solid var(--warn); background: var(--warn-soft); padding: 12px 16px; border-radius: 0 8px 8px 0; color: var(--ink); margin: 16px 0; }
.tag-unofficial { font-size: 12px; font-weight: 600; color: var(--warn); background: var(--warn-soft); border: 1px solid color-mix(in srgb, var(--warn) 40%, var(--line)); border-radius: 999px; padding: 2px 10px; margin-left: 10px; vertical-align: middle; }
.disclaimer-strip { margin: 10px 0 0; padding: 9px 13px; background: var(--bg-raised); border: 1px solid var(--line); border-left: 3px solid var(--warn); border-radius: 0 8px 8px 0; font-size: 12.5px; color: var(--ink-muted); }
.disclaimer-strip a { margin-left: 6px; }
.foot-links { margin-top: 4px; }
.scene { background: var(--bg-raised); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px 22px; box-shadow: var(--shadow); margin: 16px 0; }
.scene h2 { margin: 0 0 6px; font-size: 18px; }
.scene .lead { color: var(--ink-muted); margin: 0 0 14px; }
.scene ol, .scene ul { margin: 8px 0 14px; padding-left: 22px; }
.scene li { margin: 6px 0; }
.scene h3 { font-size: 14px; margin: 16px 0 6px; color: var(--ink-muted); text-transform: none; }
.verify-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
.verify-table th, .verify-table td { border-bottom: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }
.verify-table th { color: var(--ink-muted); font-weight: 600; font-size: 12px; }
.verify-table code { font-family: ui-monospace, Consolas, monospace; font-size: .92em; }
.form { display: grid; gap: 12px; margin-top: 16px; }
.form label { display: grid; gap: 6px; font-size: 13.5px; color: var(--ink-muted); }
.form input, .form textarea { background: var(--bg); border: 1px solid var(--line); color: var(--ink); border-radius: 8px; padding: 9px 11px; font: inherit; font-size: 14px; width: 100%; }
.form button { justify-self: start; background: var(--accent); color: #fff; border: 0; border-radius: 9px; padding: 10px 18px; font: inherit; font-weight: 600; cursor: pointer; }
footer.site { border-top: 1px solid var(--line); margin-top: 48px; padding-top: 18px; color: var(--ink-muted); font-size: 12.5px; display: grid; gap: 6px; }
.changelog { display: grid; gap: 14px; margin-top: 18px; }
.changelog section { background: var(--bg-raised); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 20px; box-shadow: var(--shadow); }
.changelog h2 { margin: 0 0 10px; font-size: 16px; }
.changelog ul { margin: 0; padding-left: 20px; }
.changelog li { margin: 6px 0; color: var(--ink-muted); }
.changelog code { font-family: ui-monospace, Consolas, monospace; font-size: .92em; }
@media (max-width: 640px) { .grid { grid-template-columns: 1fr; } article.review, .page { padding: 22px 18px; } h1.title { font-size: 21px; } }
`

// ---------- 客户端 ----------
const APP_JS = `(function () {
  var data = window.__PLUGINS__;
  var state = { query: '', category: '', sort: 'recommend', verifiedOnly: false, rpOnly: false };
  var list = document.getElementById('list');
  if (!list) return;
  var count = document.getElementById('count');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));

  function haystack(p) {
    return [p.name, p.title, p.summary, p.categoryTitle, p.repoUrl, p.license].join(' ').toLowerCase();
  }
  function score(p, words) {
    var text = haystack(p), total = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w) continue;
      var at = text.indexOf(w);
      if (at === -1) return -1;
      total += p.name.toLowerCase().indexOf(w) === 0 ? 6 : (at < 40 ? 3 : 1);
    }
    return total;
  }
  function filtered() {
    var words = state.query.toLowerCase().split(/[\\s,]+/).filter(Boolean);
    var items = data.filter(function (p) {
      if (state.verifiedOnly && !p.verified) return false;
      if (state.rpOnly && !p.rp) return false;
      if (state.category && p.category !== state.category) return false;
      if (words.length && score(p, words) < 0) return false;
      return true;
    });
    items.sort(function (a, b) {
      if (state.sort === 'stars') return (b.stars || 0) - (a.stars || 0);
      if (state.sort === 'updated') return (Date.parse(b.updatedAt || 0) || 0) - (Date.parse(a.updatedAt || 0) || 0);
      if (state.sort === 'downloads') return (b.downloads || 0) - (a.downloads || 0);
      if (state.sort === 'name') return a.name.localeCompare(b.name);
      if (a.reviewed !== b.reviewed) return a.reviewed ? -1 : 1;
      return (b.curationRank || -1) - (a.curationRank || -1);
    });
    return items;
  }
  function fmt(n) { return n === null || n === undefined ? '—' : Number(n).toLocaleString(); }
  function days(p) {
    if (!p.updatedAt) return '—';
    var d = Math.floor((Date.now() - Date.parse(p.updatedAt)) / 86400000);
    if (!isFinite(d)) return '—';
    if (d <= 0) return '今天';
    if (d < 30) return d + ' 天前';
    if (d < 365) return Math.floor(d / 30) + ' 个月前';
    return Math.floor(d / 365) + ' 年前';
  }
  function card(p) {
    var badges = '';
    badges += p.verified
      ? '<span class="badge ok">已核实</span>'
      : '<span class="badge warn">未核实</span>';
    if (p.reviewed) badges += '<span class="badge accent">人工短评</span>';
    if (p.rp) badges += '<span class="badge accent">养鱼</span>';
    badges += '<span class="badge">' + p.categoryTitle + '</span>';
    if (p.risk === 'high') badges += '<span class="badge high">高风险</span>';
    if (p.privacy === 'cloud') badges += '<span class="badge high">🔴 需云端</span>';
    if (p.privacy === 'local') badges += '<span class="badge ok">🟢 纯本地</span>';
    var install = p.install
      ? '<div class="install"><code>' + p.install + '</code><button class="copy" data-copy="' + p.install + '">复制</button></div>'
      : '<div class="install"><code>安装方式见仓库</code></div>';
    var detail = p.hasReview ? 'p/' + p.slug + '.html' : 'p/' + p.slug + '.html';
    return '<div class="card">' +
      '<div><h2><a href="' + detail + '">' + p.title + '</a></h2>' +
      '<div class="pkg">' + p.name + '</div></div>' +
      '<div class="badges">' + badges + '</div>' +
      '<p>' + p.summary + '</p>' +
      '<div class="meta"><span>★ ' + fmt(p.stars) + '</span><span>更新 ' + days(p) + '</span>' +
      (p.downloads === null ? '' : '<span>周下载 ' + fmt(p.downloads) + '</span>') +
      '<span>' + (p.license || '许可未知') + '</span></div>' +
      install +
      '<footer><span>' + (p.version ? 'v' + p.version : '') + '</span>' +
      '<a href="' + detail + '">' + (p.hasReview ? '读短评 →' : '看详情 →') + '</a></footer>' +
    '</div>';
  }
  function render() {
    var items = filtered();
    count.textContent = '共 ' + items.length + ' 个插件' + (state.verifiedOnly ? '（仅已核实）' : '') + (state.rpOnly ? '（仅养鱼相关）' : '');
    list.innerHTML = items.length ? items.map(card).join('') : '<div class="empty">没找到匹配的插件。试试换个关键词，或取消分类筛选。</div>';
  }
  document.getElementById('q').addEventListener('input', function (e) { state.query = e.target.value; render(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
  document.getElementById('verified').addEventListener('change', function (e) { state.verifiedOnly = e.target.checked; render(); });
  document.getElementById('rponly').addEventListener('change', function (e) { state.rpOnly = e.target.checked; render(); });
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      state.category = state.category === chip.dataset.category ? '' : chip.dataset.category;
      chips.forEach(function (other) { other.setAttribute('aria-pressed', String(other.dataset.category === state.category)); });
      render();
    });
  });
  document.addEventListener('click', function (event) {
    var button = event.target.closest('.copy');
    if (!button) return;
    var value = button.dataset.copy;
    var done = function () { button.textContent = '已复制'; setTimeout(function () { button.textContent = '复制'; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(value).then(done, function () {});
    else { var area = document.createElement('textarea'); area.value = value; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); done(); }
  });
  render();
})();
`

const LOGO = `<svg viewBox="0 0 40 40" role="img" aria-label="DSH 插件站"><rect x="2.5" y="2.5" width="35" height="35" rx="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M13 14h9.5a6 6 0 0 1 0 12H13z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="28.5" cy="13.5" r="2.2" fill="currentColor"/></svg>`

function shell({ title, description, body, base = '', nav = true }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DSH 插件站（非官方·第三方）">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<link rel="stylesheet" href="${base}assets/style.css">
</head>
<body>
<div class="wrap">
${nav ? `<header class="top"><div class="brand">${LOGO}<h1 class="title"><a href="${base}index.html" style="color:inherit">DSH 插件站</a><span class="tag-unofficial">非官方 · 第三方</span></h1></div>
<p class="subtitle">非官方 DSH <b>养鱼 / 陪伴向</b>插件核验站：防失忆、防出戏、防隐私泄露。只收录人工真机跑过、能说清坑的插件。</p>
<p class="disclaimer-strip">本站为第三方非官方站点，与 DeepSeek / DeepSeek Harness 官方<b>无关联、无授权、无背书</b>；插件版权归各自作者，收录不代表官方推荐。<a href="${base}rules.html">收录规则</a></p>
<div class="nav"><a href="${base}rp.html"><b>养鱼速查</b></a><a href="${base}index.html">插件目录</a><a href="${base}scenes.html">场景施工图</a><a href="${base}verifications.html">核验记录</a><a href="${base}weekly.html">周报</a><a href="${base}install.html">安装避坑</a><a href="${base}risks.html">风险公告</a><a href="${base}failures.html">失败档案</a><a href="${base}submit.html">提交插件</a><a href="${base}rules.html">规则与声明</a></div></header>` : ''}
${body}
<footer class="site">
  <div><b>非官方声明</b>：本站为第三方非官方 DSH 插件索引与评测站，与 DeepSeek / DeepSeek Harness 官方无关联、无授权、无背书。站名、Logo 均为本站自有，不使用也不并列官方标识。插件名称、描述、许可证等版权归各作者所有；收录不代表官方推荐，判断为独立主观评价。</div>
  <div><b>收费披露</b>：本站目前没有任何赞助、推广位或付费收录，排序不接受付费。若未来出现任何商业合作，会在对应位置显著标注「赞助/推广」，并保持对未付费插件相同的收录与判断标准。</div>
  <div>本站核验基准环境：DSH ${DSH_VERSION} · 数据生成于 ${escapeHtml(stats.builtAt)}。核验结论均标注日期，不构成安装或安全担保；隐私分级为读 README 后的初次判断，未做抓包验证。</div>
  <div class="foot-links"><a href="${base}rules.html">收录规则</a> · <a href="${base}method.html">核验方法</a> · <a href="${base}install.html">安装避坑</a> · <a href="${base}risks.html">风险公告</a> · <a href="${base}changelog.html">更新日志</a> · <a href="${base}takedown.html">下架与投诉</a> · <a href="${base}disclaimer.html">评测免责</a> · <a href="${base}privacy.html">隐私与数据</a> · <a href="${DISCUSSIONS.home}" target="_blank" rel="noreferrer noopener">讨论区</a></div>
</footer>
</div>
<script src="${base}assets/app.js"></script>
</body>
</html>
`
}

// ---------- 首页 ----------
const categoryChips = Object.entries(CATEGORY_TITLES)
  .filter(([id]) => entries.some((entry) => entry.category === id))
  .map(([id, title]) => `<button class="chip" data-category="${id}" aria-pressed="false">${escapeHtml(title)}</button>`)
  .join('')

const clientData = entries.map((entry) => ({
  name: entry.name,
  title: escapeHtml(entry.title),
  summary: escapeHtml(entry.summary.length > 200 ? `${entry.summary.slice(0, 199)}…` : entry.summary),
  slug: entry.slug,
  category: entry.category,
  categoryTitle: CATEGORY_TITLES[entry.category] ?? entry.category,
  stars: entry.stars,
  updatedAt: entry.updatedAt,
  downloads: entry.downloads,
  license: entry.license,
  verified: entry.verified,
  reviewed: Boolean(entry.reviewBody),
  hasReview: Boolean(entry.reviewBody),
  risk: entry.risk,
  privacy: entry.privacy,
  rp: entry.rp,
  curationRank: entry.curationRank,
  version: entry.version,
  install: entry.install,
}))

const homeBody = `<div class="stats">
  <span class="stat">场景施工图 <b>__SCENE_COUNT__</b></span>
  <span class="stat">带人工判断的插件 <b>${stats.reviewed}</b></span>
  <span class="stat">带日期核验记录 <b>__VERIFIED_COUNT__</b></span>
  <span class="stat">已核实可安装 <b>${stats.verified}</b></span>
  <span class="stat">参考目录 <b>${stats.total}</b>（未逐条核验）</span>
</div>
<p class="notice" style="margin-top:16px">养鱼五大专项：<a href="scenes.html#rp-memory">①长期记忆</a> · <a href="scenes.html#rp-slim">②上下文瘦身</a> · <a href="scenes.html#rp-persona">③人设防崩</a> · <a href="scenes.html#rp-privacy">④隐私排雷</a> · <a href="scenes.html#rp-away">⑤离开电脑</a>。加 🟢/🔴 标签的条目，是本站在隐私上做过判断的插件。</p>
<div class="toolbar">
  <div class="controls">
    <input id="q" type="search" placeholder="搜插件名、功能、作者…（可多个关键词）" autocomplete="off">
    <select id="sort" aria-label="排序">
      <option value="recommend">推荐序</option>
      <option value="stars">按 star</option>
      <option value="updated">按最近更新</option>
      <option value="downloads">按周下载</option>
      <option value="name">按名称</option>
    </select>
    <label class="toggle"><input id="verified" type="checkbox"> 只看已核实</label>
    <label class="toggle"><input id="rponly" type="checkbox"> 只看养鱼相关</label>
  </div>
  <div class="chips">${categoryChips}</div>
</div>
<p class="count" id="count"></p>
<div class="grid" id="list"></div>
__JSONLD__
<script>window.__PLUGINS__ = ${JSON.stringify(clientData).replace(/</gu, '\\u003c')};</script>
<script src="assets/app.js"></script>`

// ---------- 详情页 ----------
const detailPages = new Map()
for (const entry of entries) {
  const facts = [
    ['包名 / 仓库', entry.repoUrl ? `<a href="${escapeHtml(entry.repoUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(entry.repoUrl.replace('https://github.com/', ''))}</a>` : escapeHtml(entry.name)],
    ['安装 spec', entry.install ? `<code>${escapeHtml(entry.install)}</code>` : '见仓库 README'],
    ['版本 / 更新', `${escapeHtml(entry.version ?? '未声明')} · ${entry.updatedAt ? escapeHtml(String(entry.updatedAt).slice(0, 10)) : '未知'}`],
    ['Star', entry.stars === null ? '未获取' : Number(entry.stars).toLocaleString()],
    ['周下载', entry.downloads === null ? '未获取' : Number(entry.downloads).toLocaleString()],
    ['许可证', escapeHtml(entry.license ?? '未声明')],
    ['DSH 版本要求', entry.enginesDsh ? `<code>${escapeHtml(entry.enginesDsh)}</code>（声明值，未实测）` : '未声明'],
    ['核实状态', entry.verified ? `已核实：${escapeHtml(entry.verifyNote)}` : `未核实：${escapeHtml(entry.verifyNote)}`],
    ['安装实测', (() => {
      const trial = trialByName.get(entry.name)
      if (!trial) return '未实测'
      if (trial.result === 'installed') return `已装成功 ${escapeHtml(trial.version ?? '')}（${escapeHtml(trial.date)} · DSH ${escapeHtml(trial.dshVersion)}）`
      return `安装失败（${escapeHtml(trial.date)} · DSH ${escapeHtml(trial.dshVersion)}）：${escapeHtml(trial.reason ?? '未知原因')}`
    })()],
    ['链接', [entry.npmUrl ? `<a href="${escapeHtml(entry.npmUrl)}" target="_blank" rel="noreferrer noopener">npm</a>` : '', entry.repoUrl ? `<a href="${escapeHtml(entry.repoUrl)}" target="_blank" rel="noreferrer noopener">GitHub</a>` : '', entry.homepage ? `<a href="${escapeHtml(entry.homepage)}" target="_blank" rel="noreferrer noopener">主页</a>` : ''].filter(Boolean).join(' · ')],
  ].map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join('')

  // 同类推荐：同分类下有判断的其它插件（内链 + 阅读延续）
  const siblings = entries
    .filter((other) => other.reviewBody && other.category === entry.category && other.name !== entry.name)
    .sort((left, right) => (right.curationRank ?? -1) - (left.curationRank ?? -1))
    .slice(0, 4)

  const body = entry.reviewBody
    ? `<div class="page-nav" style="margin-bottom:16px"><a href="../index.html">← 返回目录</a></div>
<article class="review">
  <h1>${escapeHtml(entry.reviewHeading ?? entry.title)}</h1>
  <div class="badges" style="margin:10px 0 18px">
    <span class="badge ok">已核实</span>
    <span class="badge accent">人工短评</span>
    ${entry.risk ? `<span class="badge ${entry.risk === 'high' ? 'high' : entry.risk === 'medium' ? 'warn' : 'ok'}">风险 ${escapeHtml({ low: '低', medium: '中', high: '高' }[entry.risk] ?? entry.risk)}</span>` : ''}
    <span class="badge ${PRIVACY_META[entry.privacy]?.cls ?? ''}">${PRIVACY_META[entry.privacy]?.badge ?? '⚪ 未确认'}</span>
  </div>
  ${renderMarkdown(entry.reviewBody)}
  ${siblings.length ? `<h2>同类插件（同分类已核验）</h2><ul>${siblings.map((other) => `<li><a href="${other.slug}.html"><code>${escapeHtml(other.name)}</code></a> — ${escapeHtml(other.title)}</li>`).join('')}</ul>` : ''}
  <h2>事实卡</h2>
  <dl class="facts">${facts}</dl>
</article>`
    : `<div class="page">
  <div class="page-nav" style="margin-bottom:16px"><a href="../index.html">← 返回目录</a></div>
  <h1>${escapeHtml(entry.title)}</h1>
  <div class="badges" style="margin:10px 0 16px">
    ${entry.verified ? `<span class="badge ok">${entry.source === 'npm' ? '已核实可安装' : '已核实（仓库声明）'}</span>` : '<span class="badge warn">未核实</span>'}
    <span class="badge">${escapeHtml(CATEGORY_TITLES[entry.category] ?? entry.category)}</span>
  </div>
  <p>${escapeHtml(entry.summary)}</p>
  <div class="install" style="margin:16px 0"><code>${escapeHtml(entry.install ?? '见仓库 README')}</code>${entry.install ? `<button class="copy" data-copy="${escapeHtml(entry.install)}">复制</button>` : ''}</div>
  <div class="notice"><strong>这个插件还没有人工短评。</strong>我们只核实了它的元数据${entry.verified ? '与 bundle 声明' : '，安装方式仍需你自行确认'}；适用场景、风险点、替代方案都还没验证。装之前请先看仓库 README 的权限与依赖说明。</div>
  <h2>事实卡</h2>
  <dl class="facts">${facts}</dl>
  <h2>怎么把它变成"有判断"的条目</h2>
  <p>装一次、跑一次，然后把"适合谁 / 解决什么 / 风险点 / 替代品"四问发给本站（见 <a href="../submit.html">提交插件</a>）。我们会核对后写进短评。</p>
</div>`
  detailPages.set(entry.slug, shell({ title: `${entry.title} · DSH 插件站`, description: entry.summary, body, base: '../' }))
}

// ---------- 更新日志 ----------
const recent = entries
  .filter((entry) => entry.updatedAt && daysSince(entry.updatedAt) !== null && daysSince(entry.updatedAt) <= 7)
  .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
const newlyAdded = entries
  .filter((entry) => entry.verified && !entry.reviewBody)
  .slice(0, 40)
const ghStats = github?.byEvidence ?? {}

const changelogBody = `<div class="page">
  <h1>更新日志</h1>
  <p>本站数据每次构建都会刷新。下面是最近 7 天有推送的插件，以及本期核实与判断的进度。</p>
  <div class="stats" style="margin:18px 0">
    <span class="stat">最近 7 天有更新 <b>${recent.length}</b></span>
    <span class="stat">已核实 <b>${stats.verified}</b></span>
    <span class="stat">已写短评 <b>${stats.reviewed}</b></span>
    <span class="stat">构建日 <b>${stats.builtAt}</b></span>
  </div>
  <div class="changelog">
    <section>
      <h2>最近 7 天有推送（${recent.length}）</h2>
      ${recent.length ? `<ul>${recent.slice(0, 60).map((entry) => `<li><a href="p/${entry.slug}.html">${escapeHtml(entry.title)}</a> · <code>${escapeHtml(entry.name)}</code> · ${escapeHtml(String(entry.updatedAt).slice(0, 10))}${entry.version ? ` · v${escapeHtml(entry.version)}` : ''}</li>`).join('')}</ul>` : '<p>最近 7 天没有检测到推送。</p>'}
    </section>
    <section>
      <h2>核实进度</h2>
      <ul>
        <li>GitHub 仓库检查：${stats.githubChecked} 个，排除无关仓库 ${stats.githubRejected} 个</li>
        <li>通过 package.json 声明确认：${ghStats.manifest ?? 0} 个；通过 cordis.patch.yml 确认：${ghStats.patch ?? 0} 个；仅有 README 线索：${ghStats['readme-hint'] ?? 0} 个</li>
        <li>npm 侧确认可安装（dsh.bundle.patch）：${entries.filter((entry) => entry.source === 'npm').length} 个</li>
        <li>人工短评：${stats.reviewed} 个</li>
      </ul>
    </section>
    <section>
      <h2>下一步要补的判断</h2>
      <p>按你的使用场景挑：越是"准备装"的插件，越值得先补短评。没有短评的条目会在详情页明确标注未验证。</p>
    </section>
  </div>
</div>`

// ---------- 提交页 ----------
const submitBody = `<div class="page">
  <h1>提交插件</h1>
  <p>你可以推荐自己的插件，也可以推荐觉得好用的别人的插件。我们只做一件事：<strong>核实它能不能装、装过之后有没有坑</strong>。</p>
  <div class="notice">
    当前版本还没有后端表单服务，提交入口走 GitHub Issue。字段填完整会被优先处理；只给一个名字的会被排到后面。
  </div>
  <form class="form" id="submit-form">
    <label>插件名 / npm 包名<input name="name" placeholder="例如 dsh-remote" required></label>
    <label>仓库地址<input name="repo" placeholder="https://github.com/owner/repo"></label>
    <label>一句话说明<input name="summary" placeholder="它解决什么问题"></label>
    <label>适合谁<input name="fit" placeholder="具体场景，不要写「功能强大」"></label>
    <label>风险点（凭据 / 权限 / 成本 / 依赖）<input name="risk" placeholder="例如：需要写入 SSH 凭据"></label>
    <label>替代品<input name="alt" placeholder="同类插件，或「什么都不装」"></label>
    <button type="submit">生成提交内容</button>
  </form>
  <div id="result" style="display:none;margin-top:16px">
    <p>下面这段可以直接贴到 DSH 社群、GitHub Issue 或发给维护者：</p>
    <textarea id="output" rows="8" style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:10px;font-family:ui-monospace,Consolas,monospace;font-size:13px"></textarea>
    <button class="copy" id="copy-output" style="margin-top:8px">复制这段</button>
  </div>
  <h2>提交之后会发生什么</h2>
  <ul>
    <li>我们会先核实：包是否存在、是否有 dsh 声明、版本与许可证</li>
    <li>然后试装一次，记录测试的 DSH 版本与日期</li>
    <li>通过后进入目录；判断信息不足的，会先标"未核实"上线，不阻塞收录</li>
  </ul>
  <div class="notice">想直接公开讨论？<a href="${DISCUSSIONS.sceneIdeas}" target="_blank" rel="noreferrer noopener"><b>提施工图建议</b></a> · <a href="${DISCUSSIONS.correction}" target="_blank" rel="noreferrer noopener"><b>报核验错误</b></a></div>
  <script>
    document.getElementById('submit-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var form = new FormData(event.target);
      var lines = ['### 插件提交', ''];
      [['name','插件名'],['repo','仓库'],['summary','一句话说明'],['fit','适合谁'],['risk','风险点'],['alt','替代品']].forEach(function (pair) {
        var value = form.get(pair[0]);
        if (value) lines.push('- ' + pair[1] + '：' + value);
      });
      lines.push('', '- 提交时间：' + new Date().toISOString().slice(0, 10));
      var output = document.getElementById('output');
      output.value = lines.join('\\n');
      document.getElementById('result').style.display = 'block';
      output.focus();
    });
    document.getElementById('copy-output').addEventListener('click', function () {
      var button = this;
      navigator.clipboard.writeText(document.getElementById('output').value).then(function () {
        button.textContent = '已复制';
        setTimeout(function () { button.textContent = '复制这段'; }, 1500);
      });
    });
  </script>
</div>`

// ---------- 合规与定位页面 ----------
const REVIEWED = entries.filter((entry) => entry.reviewBody)

const rulesBody = `<div class="page">
  <h1>收录规则与标准</h1>
  <p class="disclaimer-strip" style="margin-bottom:18px">本站为第三方非官方站点，与 DeepSeek / DeepSeek Harness 官方无关联、无授权、无背书。</p>

  <h2>收录门槛（三选一才算"已核实"）</h2>
  <ul>
    <li>npm 包的 <code>package.json</code> 声明了 <code>dsh.bundle.patch</code></li>
    <li>仓库根 <code>package.json</code> 声明了 <code>dsh</code> 字段（bundle / client / profile）</li>
    <li>仓库自带 <code>cordis.patch.yml</code></li>
  </ul>
  <p>只有 README 提到安装方式、拿不到包声明的，可以收录，但必须标「未核实」，不得标「已核实可安装」。</p>

  <h2>判断标准</h2>
  <p>每条人工判断必须回答四问，缺一不发布：</p>
  <ul>
    <li><b>适合谁</b>：人群与具体场景，不写"所有人"</li>
    <li><b>解决什么</b>：写能力，能量化就量化</li>
    <li><b>风险点</b>：至少一条真会出事的（凭据 / 隐私 / 成本 / 权限 / 外部依赖）</li>
    <li><b>替代品</b>：至少两个，包含"什么都不装"</li>
  </ul>

  <h2>排序与收费</h2>
  <p>推荐序由人工判断给出，不接受付费、不接受指定排名。当前站点<b>没有任何赞助、推广位或付费收录</b>。若未来出现商业合作，会在对应位置显著标注「赞助/推广」。</p>

  <h2>引用与转载</h2>
  <p>欢迎媒体、公众号、作者引用本站结论，但请守三条：</p>
  <ul>
    <li><b>带上日期与版本</b>：核验结论只对"某日某版本"成立，转述时请保留，否则会误导读者</li>
    <li><b>不要断章取义</b>：只截"优点"、删掉风险点，等于篡改结论；请至少保留风险点或链回原文</li>
    <li><b>注明来源</b>：写明"来自 DSH 插件站（非官方第三方）"并附页面链接</li>
  </ul>
  <p>整站转载请联系（<a href="${DISCUSSIONS.home}" target="_blank" rel="noreferrer noopener">讨论区</a>）；本站内容为独立评测，插件版权归各作者。</p>

  <h2>为什么我们不按 star 排序</h2>
  <p>因为在 DSH 生态里，star 与"能不能装"几乎不相关：</p>
  <ul>
    <li>实测抓取 <code>topic:dsh-plugin</code> 的前 400 个仓库，<b>164 个根本不是插件</b>（图床、视频下载、逆向工具挂了同一个 topic 蹭曝光）</li>
    <li>star 最高的若干仓库里，有的是"给 Agent 用的技能包"，有的是"套壳客户端"，并不是可安装的 DSH 插件</li>
    <li>下载量可以被搬运与镜像放大，也不能单独代表质量</li>
  </ul>
  <p>所以本站的做法是：<b>先验证它是不是插件、能不能装，再看判断</b>；star 与下载量只作为参考列在卡片上，不参与主排序。</p>

  <h2>不收录</h2>
  <ul>
    <li>要求关闭沙箱 / 审批 / 权限模型才能用的</li>
    <li>收集用户数据但不说明用途与存储位置的</li>
    <li>只有壳、功能与描述不符的</li>
    <li>冒用官方名义但无官方关系的（社区项目会单独标注）</li>
  </ul>

  <h2>命名与视觉</h2>
  <p>站名「DSH 插件站」为描述性名称，页面固定标注「非官方 · 第三方」；站点 Logo 为本站自绘，不使用官方标识，也不与官方标识并列呈现，避免造成关联误认。</p>
</div>`

const takedownBody = `<div class="page">
  <h1>下架与侵权投诉</h1>
  <p class="disclaimer-strip" style="margin-bottom:18px">收到有效投诉后，本站<b>先下架、再核实</b>，不为收录数量拖延。</p>

  <h2>怎么提</h2>
  <p>在仓库提一个 Issue：<a href="https://github.com/qianmokillstar/dsh-plugins/issues/new" target="_blank" rel="noreferrer noopener">新建 Issue</a>，标题以 <code>[下架]</code> 或 <code>[侵权]</code> 开头。</p>

  <h2>需要提供什么</h2>
  <ul>
    <li>涉及的插件名或页面地址</li>
    <li>你的身份：作者本人 / 版权方 / 代理方</li>
    <li>下架理由：版权、商标、事实错误、恶意插件、隐私问题等</li>
    <li>可选的佐证：仓库链接、License 说明、截图</li>
  </ul>

  <h2>处理流程与时限</h2>
  <ol>
    <li>收到投诉：<b>24 小时内</b>先隐藏对应条目或修正页面</li>
    <li>核实：与你确认事实，必要时请插件作者回应</li>
    <li>结论：恢复（并说明修正内容）或永久下架（并在变更记录里留痕）</li>
  </ol>

  <h2>不构成下架理由的情况</h2>
  <ul>
    <li>只是不喜欢负面判断 —— 判断有事实错误会改，但"不好听"本身不是下架理由</li>
    <li>要求删除"替代品"里出现的竞品</li>
    <li>要求只保留优点、去掉风险点</li>
  </ul>
</div>`

const disclaimerBody = `<div class="page">
  <h1>评测免责声明</h1>
  <p class="disclaimer-strip" style="margin-bottom:18px">本站判断为人工主观评价，<b>不构成安装担保或安全审计结论</b>。</p>

  <h2>结论怎么来的</h2>
  <ul>
    <li>阅读插件 README 原文、npm registry 元数据、仓库声明</li>
    <li>核对版本、许可证、发布时间、维护者、权限描述</li>
    <li>目前<b>以文档核验为主</b>；安装实测记录单独标注为「实测」，并在核验记录页注明 DSH 版本与日期</li>
  </ul>

  <h2>结论的有效边界</h2>
  <ul>
    <li>只对<b>核验当日、核验时的那一个版本</b>成立，插件升级后可能失效</li>
    <li>风险分级是读文档后的判断，<b>不是代码审计</b>，不能替代安全审查</li>
    <li>兼容性如果只写了插件声明的 <code>engines.dsh</code>，会标注"声明值、未实测"</li>
    <li>任何"已核实"仅指<b>可安装性</b>，不代表运行正确、不代表无后门</li>
  </ul>

  <h2>变更记录</h2>
  <p>判断更新、纠正与下架都通过仓库提交记录留痕：<a href="https://github.com/qianmokillstar/dsh-plugins/commits/main" target="_blank" rel="noreferrer noopener">查看提交历史</a>。</p>
</div>`

const privacyBody = `<div class="page">
  <h1>隐私与数据说明</h1>

  <h2>本站收集什么</h2>
  <ul>
    <li><b>不收集</b>：不设账号、不写 cookie、不埋统计脚本、不引第三方 CDN 或字体</li>
    <li><b>不收集</b>：不记录你在站内的搜索词或点击行为（搜索完全在浏览器本地完成）</li>
    <li>站点是纯静态文件，托管在 GitHub Pages；访问日志由 GitHub 平台按<a href="https://docs.github.com/site-policy/privacy-policies/github-privacy-statement" target="_blank" rel="noreferrer noopener">其隐私政策</a>处理，本站无法读取</li>
  </ul>

  <h2>数据从哪来</h2>
  <ul>
    <li>npm registry 与 downloads API：包名、版本、发布时间、许可证、下载量</li>
    <li>GitHub API：仓库 star、最近推送、仓库描述、License</li>
    <li>插件 README 原文：只在本地阅读核对，<b>不转载、不入库</b></li>
  </ul>

  <h2>本地另存的东西</h2>
  <p>维护者的本机保留 README 原文副本用于事实核对，已通过 <code>.gitignore</code> 排除，不会出现在公开仓库里。</p>

  <h2>联系</h2>
  <p>数据纠错、隐私相关请求：<a href="https://github.com/qianmokillstar/dsh-plugins/issues/new" target="_blank" rel="noreferrer noopener">提 Issue</a>。</p>
</div>`

const scenes = [
  {
    id: 'rp-memory',
    title: '养鱼①长期记忆：聊到第 50 轮还记得设定',
    lead: '角色扮演最大的劝退点是失忆：聊久了模型忘了人物关系、世界观、你定过的规矩。先解决"记得住"，再谈"聊得深"。',
    steps: [
      ['dsh-prime-memory', '想要全自动就先试它：对话自动压成 L0→L3 四层，每次调用前召回注入。装完先跑三天，进记忆库抽查写进去的东西对不对。'],
      ['dsh-mnemon', '想要"看得见"就选它：工作记忆 / 项目档案 / 长期证据分层，每轮回复下有回合记忆栏，点进去能改。'],
      ['dsh-fish-memory', '想要"会淡忘"就选它：带时间戳、按命中注入，久远设定会越记越淡——适合长线剧情而不是精密设定。'],
      ['meow-memory', '要"人格与偏好分开存"就选它：七层 SQLite 记忆，soul/user 分层，代价是配置门槛最高。'],
      ['memory-eternal', '要"多台机器共享"就选它：本地 SQLite + 可选云同步，热切换不刷新；云同步即内容上云。'],
      ['dsh-plugin-memory', '要"记忆能进 git、能搬走"就选它：markdown + SOUL.md，启动时硬注入。'],
      ['dsh-memory-nebula', '装了几个记忆插件之后，用它看清楚各自记了什么：只读聚合、顺链检索。'],
    ],
    skip: ['设定不多、只聊几轮 —— 直接在 AGENTS.md 里手写人设与世界观，零安装、完全可控'],
    watch: ['自动写入的记忆写错会被反复引用，越用越偏：必须定期抽查删改', '蒸馏与召回通常要调模型，等于对话内容会经过模型服务', '两个都装会重复注入，上下文更早爆'],
  },
  {
    id: 'rp-slim',
    title: '养鱼②上下文瘦身：聊到卡顿怎么救',
    lead: '长对话会把工具输出、日志、命令结果越积越多，最后要么卡、要么贵、要么开始忘事。顺序很重要：先看清楚，再压缩，最后设上限。',
    steps: [
      ['dsh-context', '第一步只装它，看上下文里到底装了什么、哪一类占得最多。它只读不改，先诊断再动手。'],
      ['dsh-live-compact', '第二步压：本机把长工具输出就地收短，压缩前备份原文、备份失败就放弃；默认到 2 万 token 才动手。'],
      ['dsh-token-diet', '第三步兜底：给会话设 Token 预算，到 100% 在下一步请求前停下，避免一晚烧穿。'],
    ],
    skip: ['短会话、或习惯"一到上限就新开会话"的人 —— 新开 + AGENTS.md 比任何压缩都干净'],
    watch: ['压缩不是无损：被压掉的中间细节虽然有备份，但不会再进上下文', '备份会占磁盘，长会话要定期清理', '预算到顶是真停任务，长任务可能卡在半路'],
  },
  {
    id: 'rp-persona',
    title: '养鱼③人设防崩：别让角色越聊越像客服',
    lead: '人设崩通常不是模型变笨，而是设定没有稳定载体：被新消息冲淡、被记忆覆盖、被压缩带走。',
    steps: [
      ['dsh-soul-md', '要"可控"就选它：把角色写成可切换的人设卡（会话级/工作区级），记忆存成 markdown 你自己能打开改。注意它不保证模型真的去更新人设。'],
      ['dsh-prime-memory', '要"自动"就选它：用 L3 画像层自动蒸馏"这个人是谁"，但内容不可精确手改。'],
      ['dsh-liketavern', '要"专业养鱼"就选它：兼容 ST 角色卡与世界书，剧情状态按分支隔离、重试不串味；装法特殊（github: 源）且需 Node ≥24。'],
      ['dsh-fish-soul', '要"她活在 QQ/B站/抖音"就选它：跨平台单角色人格 + 按人记忆；账号风险与隐私面最大，先想清楚再装。'],
    ],
    skip: ['只做单次短对话 —— 开场把设定贴进上下文就够'],
    watch: ['两个都装会重复注入人设，上下文更早爆', '人设文件被插件覆盖是最常见的崩法，改之前先备份', '记忆与人设冲突时通常是记忆赢——需要定期校准'],
  },
  {
    id: 'rp-privacy',
    title: '养鱼④隐私排雷：私密聊天别流出去',
    lead: '角色扮演的内容往往是最私密的。装插件前先问一句：它会把我说的东西发到哪里去？',
    steps: [
      ['dsh-context', '先用它看清上下文里都有什么，再决定哪些插件值得信任（它本身只读本地）。'],
      ['cc-safety-net', '加一道拦截：阻止 Agent 读 .env / SSH 私钥、执行破坏性命令。注意它不是沙箱。'],
    ],
    skip: ['全部用本地模型 + 只装 🟢 插件 —— 风险最低，代价是模型能力'],
    watch: ['🔴 需云端的插件：内容会离开本机（本站已在每条核验里标出）', '桌面自动化类（如 dsh-windows-mcp）会把截图当图片送进对话，屏幕上的一切都在画面里', '视频类插件需要 cookies.txt 这类账号凭据，等于把登录态交出去', '隐私分级是读 README 后的判断，没有抓包验证，别当审计结论'],
  },
  {
    id: 'rp-away',
    title: '养鱼⑤离开电脑：手机接着聊、有事提醒你',
    lead: '躺床上想继续剧情、或者长任务跑着要离开座位——这两件事要分开解决：一个管"能接着聊"，一个管"该回来时叫你"。',
    steps: [
      ['dsh-mobile-plugin', '要接着聊就装它：手机 App 连回你自己电脑上的 DSH，审批与提问也能在手机上点。'],
      ['dsh-notify-me', '只要"叫你回来"就装它：审批/完成时弹通知、响铃；注意只有开了外部转发才会把内容推给第三方。'],
    ],
    skip: ['只是短时间离开 —— 浏览器标签开着就行，不用装'],
    watch: ['手机插件默认走中转隧道，内容会经过第三方；高隐私用局域网直连', '通知转发到 Discord/飞书 等渠道时，标题与摘要会出本机', '两边都装要注意重复打扰'],
  },
  {
    id: 'rp-vibe',
    title: '养鱼⑥氛围与表达：让对话不像"客服回复"',
    lead: '同一段剧情，纯文字和"有表情、有卡片、有场景感"的体验差很远。这一层不改剧情，只改呈现。',
    steps: [
      ['dsh-meme', '加表情：输入框一键发图，AI 按气氛接梗；代价是图片吃上下文。'],
      ['dsh-pet', '加陪伴：一百多个透明动画跟随会话状态，可脱离浏览器住成桌面小窗；吃性能。'],
      ['dsh-dafeiyu', '要"原生置顶窗"选它：随 DSH 启停、显示任务状态与余额；需要 Python/PySide6 环境。'],
      ['dsh-genui', '加结构：把回复变成可点的计算器/表单/图表；与 deep-view 二选一，别都装。'],
      ['deep-view', '加结构：需要"选 A 还是 B""填个参数"时，用可点卡片代替一大段文字。'],
      ['dsh-plugin-wallpaper-engine', '加场景：把壁纸引擎的 Scene/Web/视频做成对话背景，不花 token，但吃性能。'],
    ],
    skip: ['只想要文字沉浸 —— 装饰层会分散注意力，也用不上'],
    watch: ['三类都增加上下文或性能开销，长会话要权衡', '表情包与壁纸素材的版权要自己确认', '装饰装多了排查问题会更难：出 bug 先关装饰层'],
  },
  {
    id: 'remote',
    title: '场景一 · 远程开发：让 Agent 直接在服务器上干活',
    lead: '代码在服务器 / 云主机上，本地只想编辑和发指令。目标是让 Agent 在远端目录里读写、构建、跑测试，而不是本地生成再手动上传。',
    steps: [
      ['dsh-remote', '先装它。远程文件树 + 高亮编辑 + 递归搜索 + 终端 + 只读 Git 差异，一个工作区绑一台主机。装完重启 DSH Web，设置里配 SSH 主机再建远程工作区。'],
      ['@deepseek-harness-tui/dsh-tui', '只在"想住在终端里"时加装。它把会话搬到命令行，和 dsh-remote 不冲突，但两套界面偏好各自独立。'],
    ],
    skip: ['已经有 VS Code Remote 且习惯在编辑器里跑命令 —— 装了反而多一套目录树'],
    watch: ['SSH 密码 / 私钥由插件保存并自动应答，这是最大风险面；多用户机器上不要用', 'Agent 拿到的是远端 shell 能力，先用非生产目录试', 'SSH 通断会同时影响编辑、搜索、终端'],
  },
  {
    id: 'cost',
    title: '场景二 · 成本监控：先知道钱花在哪',
    lead: '同时用 API 和多份 Coding Plan / 订阅，想按会话、按模型、按日期看清消耗，并在超支前收到提醒。',
    steps: [
      ['dsh-cost-meter', '主力选择。会话级费用、模型排行、缓存命中率、套餐额度聚合、预算提醒都在里面；先只配你真正在用的那几家账号。'],
      ['dsh-whale-widget', '只想看余额时的轻量替代：右下角挂一个小鲸鱼，不占主界面。不适合要做月度归因的人。'],
    ],
    skip: ['只用单一订阅、且平台自带账单页面 —— 多装一个会重复采集'],
    watch: ['查订阅额度通常要各家 Cookie / API key / AK-SK，别为了"看得全"把所有账号都填进去', 'API 费用与 Plan 等值费用分开统计，数字准不准取决于你的配置，别直接拿去报销', '历史记录会占本地存储，确认保留范围'],
  },
  {
    id: 'memory',
    title: '场景三 · 记忆管理：让下一次会话不用重新自我介绍',
    lead: '长期在同一个项目上和 Agent 协作，受够了每次会话都从零开始；但也不想把所有内容塞进一个记忆库。',
    steps: [
      ['dsh-mnemon', '结构最讲究的一个：工作记忆 / 项目档案 / 长期证据分层，按问题需要检索；默认本地存储，也能接第三方 Provider。第一周先用默认配置。'],
      ['meow-memory / dsh-fish-memory', '工程化偏好选 meow-memory（七层 SQLite + 反思折叠）；只想记事实、要轻量选 dsh-fish-memory。'],
    ],
    skip: ['项目里已经有 AGENTS.md 且规则不多 —— 先写好约定文件，不够再上记忆插件'],
    watch: ['自动写入的记忆一旦写错会被反复引用，定期抽查删除', '接入第三方 Provider 意味着项目内容离开本机', '配置项很多，第一天上手容易配出自己也看不懂的组合'],
  },
  {
    id: 'search',
    title: '场景四 · 联网搜索：没有官方 key 也要能搜',
    lead: '内置 web_search 依赖 DeepSeek 官方 key；用第三方模型供应商时要么搜不了，要么照样扣官方账户的钱。',
    steps: [
      ['dsh-free-search', '注册多引擎搜索 provider 并自动回退；先只开默认的免费引擎，别开抓页面那 5 个。'],
    ],
    skip: ['已经配好官方 key、且不介意按官方计费 —— 内置能力足够，不必多装一层'],
    watch: ['抓页面引擎（百度/360/搜狗/微信/头条）会把整段出口 IP 打标，默认关闭就别打开', '免 key 用各家接口，商用前自行确认对方条款', '免费引擎会限流改版，结果质量会波动'],
  },
  {
    id: 'desktop',
    title: '场景五 · 桌面自动化：操作没有 API 的软件',
    lead: '内部系统、老客户端、只有界面没有接口的活，只能靠截屏 + 点按 + 输入。',
    steps: [
      ['dsh-windows-mcp', '通过 DSH 自带 MCP 桥接入 Windows-MCP；默认关闭，按会话点亮胶囊才生效。'],
    ],
    skip: ['任务只在浏览器里 —— 用浏览器类工具，权限面小得多'],
    watch: ['注册表读写、进程启停、键鼠输入在同一套授权下，重活先拿测试机试', 'Screenshot 会把屏幕上的一切作为图片送进对话', '依赖 uvx 与上游 Windows-MCP 版本，上游变了工具清单会变'],
  },
  {
    id: 'compare',
    title: '场景六 · 多方案对比：一次拿到几个版本再挑',
    lead: '同一个需求，想要 2–4 种实现并排看，而不是反复"再来一版"。',
    steps: [
      ['dsh-agent-compare', '并行跑 2–4 个版本，回答 / 文件 / 可运行网页并排比较，选定后写理由再继续主对话。'],
    ],
    skip: ['需求本身很明确、只需要一次输出 —— 并行 2–4 路等于 2–4 倍成本'],
    watch: ['token 消耗成倍增加，配合费用统计插件用', '多版内容都会进会话，长会话容易吃满上下文'],
  },
  {
    id: 'archive',
    title: '场景七 · 会话整理：列表越来越长之后',
    lead: '会话上百条以后，侧栏翻不到想要的那一轮；暂时不做的项目舍不得删，又不想天天看到。',
    steps: [
      ['@michengai/dsh-archive-manager', '归档 / 恢复 / 收藏 + 正文全文检索，还能按闲置天数批量归档并撤回。'],
    ],
    skip: ['会话不到 50 条、且不介意侧栏长 —— 内置列表够用'],
    watch: ['"永久删除"是真的永久，先拿不重要的会话试一次', '批量归档会动很多会话，操作前看预览列表', '会读取消息正文建索引'],
  },
  {
    id: 'media',
    title: '场景八 · 让模型"看"视频：分镜与可引用帧',
    lead: '纯文本模型看不了视频；逐帧喂图又贵得离谱。要的是能引用某一格、还能再放大看几秒。',
    steps: [
      ['dsh-video-storyboard', '把视频压成一张带时间戳与台词的宫格图，模型可引用"第 5 格"，再按需放大。'],
    ],
    skip: ['只要两三帧 —— 手动截帧 + 图片工具更省事'],
    watch: ['要自备 ffmpeg、yt-dlp 与 cookies.txt（等于账号凭据）', '宫格图会把画面内容送进对话', '抓站点涉及平台条款，自用与再分发边界自己判断'],
  },
  {
    id: 'appearance',
    title: '场景九 · 视觉定制：把界面换成愿意天天看的',
    lead: '长时间盯界面，配色与留白直接影响状态；团队展示还需要一点统一气质。',
    steps: [
      ['dsh-dream-skin', '8 套预设皮肤 + 壁纸 + 强调色，纯 token 实现，不注入、不改安装包，一键还原。'],
    ],
    skip: ['内置深浅色够用 —— 换肤只是审美，不是功能'],
    watch: ['README 提到维护坐标从 GitHub 迁到 gitcode、暂停"已验证"背书，源码托管状态需自行确认', '壁纸支持外部 URL，用不可信地址有隐私风险', '迭代很快，版本号已到 11.x'],
  },
]

const nameSet = new Set(entries.map((entry) => entry.name))
const slugByName = new Map(entries.map((entry) => [entry.name, entry.slug]))

const scenesBody = `<div class="page" style="border:0;background:none;box-shadow:none;padding:0;max-width:none">
  <h1>场景施工图</h1>
  <p>这里不给"全部插件"，只给<b>按场景装哪几个、按什么顺序、哪些可以跳过、有什么坑</b>。每一条都对应本站有判断的插件；还没写判断的插件不会出现在这里。</p>
  <p class="notice">当前覆盖 ${scenes.length} 个场景，全部基于已审核插件的 README 与核验记录。顺序建议是判断，不是硬性依赖。</p>
  ${scenes.map((scene) => `<div class="scene" id="${escapeHtml(scene.id)}">
    <h2>${escapeHtml(scene.title)}</h2>
    <p class="lead">${escapeHtml(scene.lead)}</p>
    <h3>装什么、按什么顺序</h3>
    <ol>${scene.steps.map(([name, why]) => {
      const slug = slugByName.get(name)
      const label = `<code>${escapeHtml(name)}</code>`
      return `<li>${slug ? `<a href="p/${escapeHtml(slug)}.html">${label}</a>` : label} —— ${escapeHtml(why)}</li>`
    }).join('')}</ol>
    <h3>可以跳过</h3>
    <ul>${scene.skip.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    <h3>权限与冲突注意</h3>
    <ul>${scene.watch.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </div>`).join('')}
  <p>还想要别的场景？<a href="submit.html">提交需求</a>，说明你的工作流和卡点。</p>
</div>`

const verificationsBody = `<div class="page">
  <h1>核验记录</h1>
  <p>每条记录写清：核验日期、DSH 版本、依据、结论。<b>能复现的才写进来</b>。</p>
  <p class="notice">当前 ${REVIEWED.length} 条记录中，<b>${trialInstalled.length} 条已完成安装实测</b>（真装进隔离 profile，记录版本与日期），<b>${launchByName.size} 条有启动核验结论</b>（已加载 ${[...launchByName.values()].filter((item) => item.activation === 'loaded').length} / 待激活 ${[...launchByName.values()].filter((item) => item.activation === 'pending').length} / 组合无报错 ${[...launchByName.values()].filter((item) => item.activation === 'no-error').length} / 不参与组合 ${[...launchByName.values()].filter((item) => item.activation === 'not-composed').length}）。安装成功不代表运行无问题，启动核验也不代表功能正确。具体怎么测的见 <a href="method.html">核验方法</a>。</p>
  <table class="verify-table">
    <thead><tr><th>插件</th><th>隐私</th><th>安装</th><th>启动核验</th><th>核验日期</th><th>DSH 版本</th><th>结论</th><th>风险</th></tr></thead>
    <tbody>
      ${REVIEWED.map((entry) => {
        const trial = trialByName.get(entry.name)
        const launch = launchByName.get(entry.name)
        const evidence = trial
          ? (trial.result === 'installed'
              ? `已装 ${escapeHtml(trial.version ?? '')}`
              : trial.result === 'partial'
                ? `半装 ${escapeHtml(trial.version ?? '')}`
                : '安装失败')
          : '—'
        const activation = launch ? (ACTIVATION_TEXT[launch.activation] ?? launch.activation) : '未验证'
        const verdict = trial
          ? (trial.result === 'installed'
              ? `已装入隔离 profile${launch?.note ? `；${escapeHtml(launch.note)}` : ''}`
              : trial.result === 'partial'
                ? `包已落地但未组合：${escapeHtml(trial.reason ?? '未知原因')}`
                : `安装失败：${escapeHtml(trial.reason ?? '未知')}`)
          : (entry.verified ? '包声明存在，可安装（未实测运行）' : '仅 README 线索，未核实')
        const date = trial ? escapeHtml(trial.date) : '2026-11-16 / 17'
        return `<tr>
        <td><a href="p/${entry.slug}.html"><code>${escapeHtml(entry.name)}</code></a></td>
        <td>${PRIVACY_META[entry.privacy]?.badge ?? '⚪ 未确认'}</td>
        <td>${evidence}</td>
        <td>${escapeHtml(activation)}</td>
        <td>${date}</td>
        <td>${DSH_VERSION}</td>
        <td>${verdict}</td>
        <td>${escapeHtml({ low: '低', medium: '中', high: '高' }[entry.risk] ?? '未评级')}</td>
      </tr>`
      }).join('')}
    </tbody>
  </table>
  ${launchData ? `<h2>启动核验说明（${escapeHtml(launchData.date)} · DSH ${escapeHtml(launchData.dshVersion)}）</h2>
  <p>在一个最小 profile（<code>${escapeHtml(launchData.profile)}</code>）里启动 <code>${escapeHtml(launchData.launch.command)}</code>，结果：${escapeHtml(launchData.launch.result)}。</p>
  <ul>${(launchData.launch.notes ?? []).map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : ''}
  <h2>下一批要补的</h2>
  <ul>
    <li>运行实测：装上之后再启动一次，确认没有启动报错（当前只做安装）</li>
    <li>失败记录同样收录（装不上的原因比"能装"更有价值）</li>
    <li>卸载 / 回滚是否干净</li>
  </ul>
  <div class="notice">发现哪条判断不准、哪个插件装不上？<a href="${DISCUSSIONS.correction}" target="_blank" rel="noreferrer noopener"><b>去 Discussions 纠错</b></a>（带上插件名、版本、DSH 版本、现象）。作者认为记录有误也可以直接说——先改记录再讨论。</div>
</div>`

const risksBody = `<div class="page">
  <h1>风险公告</h1>
  <p>这里列的是<b>装不上、装坏了、或者不建议直接装</b>的插件。负面信息同样要留痕——对读者比"又多一个能装的"更有用。</p>
  <p class="notice">依据：${escapeHtml(riskData?.basis ?? 'README 原文、npm registry 元数据与真机安装结果')}。发现新问题欢迎 <a href="https://github.com/qianmokillstar/dsh-plugins/issues/new" target="_blank" rel="noreferrer noopener">提 Issue</a>。</p>
  <div class="changelog">
    ${(riskData?.items ?? []).map((item) => `<section>
      <h2><code>${escapeHtml(item.name)}</code></h2>
      <p style="margin:6px 0">${item.flags.map((flag) => `<span class="badge ${flag === 'broken-npm' || flag === 'jailbreak' ? 'high' : 'warn'}">${escapeHtml(RISK_FLAG_TEXT[flag] ?? flag)}</span>`).join(' ')}</p>
      <p>${escapeHtml(item.summary)}</p>
      <p style="font-size:13px"><b>证据：</b>${escapeHtml(item.evidence)}</p>
      ${item.note ? `<p style="font-size:13px"><b>注意：</b>${escapeHtml(item.note)}</p>` : ''}
      ${item.repo ? `<p style="font-size:13px"><a href="${escapeHtml(item.repo)}" target="_blank" rel="noreferrer noopener">仓库</a></p>` : ''}
    </section>`).join('')}
  </div>
  <h2>类问题：坏包会污染整个 profile</h2>
  <p>实测发现，一个 tarball 损坏的包（如 npm 上的 <code>dsh-purge@0.0.0-stage</code>）被写进 profile 的 lockfile 后，<b>之后同一 profile 里的所有安装都会重试这个坏包而失败</b>。表现为：明明装的是别的插件，报错却指向那个坏包。</p>
  <p>处理方式：换一个干净的 profile，或删除该 profile 的 <code>node_modules</code> 与 lockfile 后重装。本站后续会在每条核验记录里标注是否遇到这类连带失败。</p>
</div>`

const weeklyDir = join(ROOT, 'content', 'weekly')
const weeklyFiles = (await readdir(weeklyDir).catch(() => [])).filter((file) => file.endsWith('.md')).sort().reverse()
const weeklyBodies = new Map()
for (const file of weeklyFiles) weeklyBodies.set(file, await readFile(join(weeklyDir, file), 'utf8'))
const latestWeekly = weeklyFiles[0]

const weeklyBody = `<div class="page" style="border:0;background:none;box-shadow:none;padding:0;max-width:none">
  <h1>周报</h1>
  <p>每隔一两天对比一次 npm 快照，把"这周涨了什么、掉了什么、哪些插件改了版本或换了许可证"列出来。<b>数据可复核</b>：每期都注明了对比的两份快照日期。</p>
  <p class="notice">周报看的是<b>变化</b>，不是推荐。新上榜 ≠ 值得装，仍然要过 <a href="rules.html">收录规则</a> 与 <a href="verifications.html">核验记录</a>。</p>
  ${latestWeekly ? `<article class="review" style="max-width:none">${renderMarkdown(weeklyBodies.get(latestWeekly))}</article>` : '<p>还没有周报：需要至少两份不同日期的快照。</p>'}
  ${weeklyFiles.length > 1 ? `<h2>往期</h2><ul>${weeklyFiles.slice(1).map((file) => `<li><code>${escapeHtml(file.replace('.md', ''))}</code></li>`).join('')}</ul>` : ''}
</div>`

const installBody = `<div class="page">
  <h1>安装避坑指南</h1>
  <p>这些不是推测，是本站 2026-11-17/18 在隔离 profile 里真装 30+ 个插件踩出来的。</p>

  <h2>一、先分清两种安装源</h2>
  <table class="verify-table">
    <thead><tr><th>来源</th><th>命令</th><th>什么时候用</th></tr></thead>
    <tbody>
      <tr><td>npm 包</td><td><code>dsh plugin --profile &lt;prof&gt; add 包名</code></td><td>包在 npm 上且有正常发布版本</td></tr>
      <tr><td>GitHub 仓库</td><td><code>dsh plugin --profile &lt;prof&gt; add github:owner/repo</code></td><td>npm 上找不到（返回 404）、或 npm 版本是占位包</td></tr>
    </tbody>
  </table>
  <p>实测：养鱼圈里 <code>dsh-purge-community</code>、<code>dsh-purge-safe</code>、<code>dsh-liketavern</code>、<code>gal-view</code> 都<strong>不在 npm</strong>，只能用 github: 装。装之前先在 npm 搜一下包名，搜不到就走 GitHub 源。</p>

  <h2>二、最坑的一种失败：坏包污染整个 profile</h2>
  <div class="notice">
    现象：你明明在装 A 插件，报错却指向 B（例如 <code>dsh-purge-0.0.0-stage.tgz</code> 的 tarball 截断）。而且之后<strong>同一 profile 装什么都失败</strong>。
  </div>
  <p>原因：损坏的包被写进了该 profile 的 lockfile，之后每次 add 都会重试它。</p>
  <ol>
    <li>先确认是哪个包坏了（看报错里的 tarball 文件名）</li>
    <li>在该 profile 里移除它：<code>dsh plugin --profile &lt;prof&gt; remove 坏包名</code></li>
    <li>还不行就删掉该 profile 的 <code>node_modules</code> 与 <code>pnpm-lock.yaml</code> 后重装</li>
    <li>最省事：换一个干净的 profile 重来</li>
  </ol>

  <h2>三、版本不兼容：别乱用 allow-version</h2>
  <p>安装器会拦下与当前 DSH 版本不匹配的插件（例如 <code>billion-context-dsh@0.2.27</code> 对 <code>0.2.2-rc.3</code>）。它会提示你可以用 <code>allow-version</code> 强制安装——<strong>那等于自己承担崩溃与数据丢失风险</strong>，本站不建议，除非你清楚自己在做什么。</p>

  <h2>四、GitHub 源装大仓库会超时（实测数据）</h2>
  <p>用 <code>github:owner/repo</code> 安装时，DSH 会先克隆仓库，速度取决于网络与仓库体积：</p>
  <table class="verify-table">
    <thead><tr><th>插件</th><th>结果</th><th>耗时</th></tr></thead>
    <tbody>
      <tr><td><code>dsh-liketavern</code></td><td>成功 0.5.12</td><td>156 秒</td></tr>
      <tr><td><code>dsh-purge</code>（mmparko）</td><td>成功 1.1.71</td><td>72.8 秒</td></tr>
      <tr><td><code>dsh-tavern</code>（flizzywine）</td><td><b>超时未完成</b></td><td>&gt; 30 分钟</td></tr>
      <tr><td><code>gal-view</code></td><td><b>超时未完成</b></td><td>&gt; 15 分钟</td></tr>
    </tbody>
  </table>
  <p>遇到超时不要急着判断"插件坏了"：先确认是不是网络问题（换个时间、换代理），再决定是否继续。本站把这类记为"超时未完成"，不写成"装不上"。</p>

  <h2>五、装上了但报失败：pnpm 拦截构建脚本</h2>
  <div class="notice">现象：<code>+ 插件名 版本号</code> 明明出现了，但命令最后以 <code>ERR_PNPM_IGNORED_BUILDS</code> 失败退出，提示 <code>Ignored build scripts: protobufjs</code>。</div>
  <p>这不是装不上，而是 <b>pnpm 11 默认不允许依赖执行构建脚本</b>（安全策略）。实测三个插件（<code>@michengai/dsh-im-connect</code>、<code>@tencent-connect/dsh-qqbot</code>、<code>dsh-session-superagent</code>）都因此报了同一个错，但包其实已经落地 <code>node_modules</code>、也写进了 profile 的 <code>dependencies</code>——只是<b>没进入 <code>dsh.profile.bundles</code></b>，所以不会生效。</p>
  <p>本站把这种状态记为「<b>半装</b>」，不算通过、也不算失败。</p>
  <h3>我们试过的三种办法（都失败，如实记录）</h3>
  <ol>
    <li><code>package.json</code> 里加 <code>pnpm.onlyBuiltDependencies</code> —— pnpm 11 直接警告该字段已废弃、被忽略</li>
    <li>写进 <code>pnpm-workspace.yaml</code> 的 <code>onlyBuiltDependencies</code> —— <code>pnpm config get</code> 确实能读到 <code>["protobufjs"]</code>，但安装仍然报 <code>ERR_PNPM_IGNORED_BUILDS</code></li>
    <li>加 <code>--config.onlyBuiltDependencies=protobufjs</code> 显式传参 —— 同样被拦</li>
  </ol>
  <p>结论：这个门只认**交互式**的 <code>pnpm approve-builds</code>（要人逐个确认），没法用配置脚本化绕过。所以本站这三个插件只能记「半装」，不写成成功。</p>
  <p>你要用的话，在 profile 目录里跑 <code>pnpm approve-builds</code>，看清楚是哪个依赖要跑脚本、判断可信后再放行，然后重新 add 一次。</p>

  <h3>另一个坑：手改 profile 的 package.json 别带 BOM</h3>
  <p>实测：用 PowerShell 的 <code>Set-Content -Encoding UTF8</code> 写 <code>package.json</code> 会带 BOM，DSH 读取时直接 <code>SyntaxError: Unexpected token ''</code>，整个 profile 无法安装任何插件。用编辑器保存为「UTF-8 无 BOM」即可。</p>

  <h2>六、怎么确认"真的装上了"</h2>
  <ol>
    <li><code>dsh --profile &lt;prof&gt; --dump-config</code> 里能看到该插件的条目 = 已进入组合</li>
    <li>packages 在 <code>node_modules</code> 里但 dump-config 里没有 = 装了但没被组合（常见于独立 app 类插件）</li>
    <li>启动后侧边栏/设置里没出现入口 = 它可能依赖 <code>webServer</code> 之类的服务，在精简 profile 里会 pending</li>
  </ol>

  <h2>七、测试插件请用独立 profile</h2>
  <p>别在每天用的 profile 里试装来源不明的插件。养成习惯：</p>
  <pre style="background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto"><code>dsh plugin --profile test-only add github:owner/repo</code></pre>
  <p>试完整个 profile 删掉即可，不影响你日常的会话与配置。</p>

  <h2>八、装完先做三件事</h2>
  <ul>
    <li>看它要哪些权限/凭据（README 里的"风险提示""免责声明"章节）</li>
    <li>确认它是否会把内容发到第三方（本站每条核验都标了 🟢/🔴）</li>
    <li>试用时先跑一个不重要的会话，别直接上主号/主档案</li>
  </ul>
</div>`

const methodBody = `<div class="page">
  <h1>核验方法</h1>
  <p>这一页说明每条核验是怎么做出来的、什么算通过、什么不算——**你不需要相信我们，你可以照着复现**。</p>

  <h2>四级核验，逐级加严</h2>
  <table class="verify-table">
    <thead><tr><th>级别</th><th>做了什么</th><th>能证明什么</th><th>不能证明什么</th></tr></thead>
    <tbody>
      <tr><td>① 文档核验</td><td>读 README 原文、npm registry 元数据、仓库声明</td><td>作者声称它做什么、许可证、版本、维护者</td><td>实际能不能装、能不能跑</td></tr>
      <tr><td>② 安装实测</td><td>在<strong>隔离 profile</strong> 里真装一次，记录版本与耗时</td><td>包能解析、能装进 DSH 的插件体系</td><td>装上之后能不能用、有没有副作用</td></tr>
      <tr><td>③ 启动核验</td><td>用最小 profile 启动一次，看是否报错、是否 pending</td><td>它能被组合、启动期不炸</td><td>功能是否正常、隐私行为</td></tr>
      <tr><td>④ 运行实测</td><td>装完真跑一轮具体任务</td><td>这个功能在真实场景下可用</td><td><strong>本站目前尚未系统开展</strong></td></tr>
    </tbody>
  </table>

  <h2>安装实测怎么做的</h2>
  <pre style="background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto"><code># 1. 新建一个只用来测试的 profile（不碰日常 profile）
dsh plugin --profile market-test add 插件名

# 2. 确认它真的进了组合
dsh --profile market-test --dump-config

# 3. 最小启动一次，看有没有 pending / 报错
dsh --profile market-test web --no-open --port 51999</code></pre>
  <p>每条核验记录都写明：<strong>核验日期、DSH 版本、装到的具体版本、结果、失败原因（如果失败）</strong>。这些都在 <a href="verifications.json">verifications.json</a> 里可机器读取，字段定义见 <a href="verifications.schema.json">verifications.schema.json</a>（JSON Schema 2020-12）。</p>
  <p><code>install.result</code> 有四种取值：<code>installed</code>（装进隔离 profile 并进入组合）、<code>partial</code>（包已落地但未进入 profile bundles，例如 pnpm 拦截构建脚本）、<code>failed</code>、<code>not-tested</code>。</p>

  <h2>什么算"通过"，什么不算</h2>
  <ul>
    <li>✅ 算：装成功、dump-config 里出现、启动不报错</li>
    <li>❌ 不算：装成功就写"可用"；启动成功就写"没风险"；README 说得好就写"推荐"</li>
    <li>⚠️ 特别注意：<strong>安装成功 ≠ 功能正确</strong>。站点上所有"已核实"只指可安装性</li>
  </ul>

  <h2>已知局限（请当成风险提示读）</h2>
  <ul>
    <li><strong>没有抓包验证</strong>：隐私分级（🟢/🔴）是读 README 与权限描述后的判断，不是网络层证据</li>
    <li><strong>没有代码审计</strong>：风险分级不等于安全结论，高危插件只标注、不背书</li>
    <li><strong>单一环境</strong>：只在本机 Windows + DSH ${DSH_VERSION} 上测，不覆盖其他平台与旧版本</li>
    <li><strong>网络会影响结果</strong>：GitHub 源安装受网络影响，超时可能被误判成"装不上"（记录里会写耗时）</li>
    <li><strong>只测一个版本</strong>：插件升级后结论可能失效，所以每条都标日期</li>
  </ul>

  <h2>我们踩过的坑（也是你该知道的）</h2>
  <ul>
    <li><strong>坏包污染</strong>：一个 tarball 截断的包写进 lockfile 后，同 profile 之后所有安装都会失败</li>
    <li><strong>并发安装冲突</strong>：同一 profile 同时跑两个安装会互相破坏，必须串行</li>
    <li><strong>看起来一样、其实没装</strong>：包在 node_modules 里但 dump-config 没有 = 装了没被组合</li>
  </ul>
  <p>处理方式写在 <a href="install.html">安装避坑指南</a> 里。</p>

  <div class="notice">发现记录有误？<a href="${DISCUSSIONS.correction}" target="_blank" rel="noreferrer noopener"><b>去 Discussions 纠错</b></a>，带上插件名、版本、现象。</div>
</div>`

const rpGroups = [
  { title: '① 长期记忆', names: ['dsh-mnemon', 'dsh-prime-memory', 'dsh-fish-memory', 'meow-memory', 'memory-eternal', 'dsh-plugin-memory', 'dsh-memory-nebula', 'dsh-loci'] },
  { title: '② 上下文瘦身与限额', names: ['dsh-live-compact', 'dsh-context', 'dsh-token-diet', 'dsh-session-guard'] },
  { title: '③ 人设防崩', names: ['dsh-soul-md', 'dsh-liketavern', 'dsh-fish-soul'] },
  { title: '④ 隐私与权限', names: ['cc-safety-net', 'dsh-perm-gate', 'dsh-windows-mcp', 'dsh-see-now'] },
  { title: '⑤ 离开电脑', names: ['dsh-mobile-plugin', 'ds-harness-remote', 'dsh-notify-me', 'dsh-onebot-qq', 'dsh-bili-scroll'] },
  { title: '⑥ 氛围与表达', names: ['dsh-pet', 'dsh-dafeiyu', 'dsh-meme', 'deep-view', 'dsh-genui', 'dsh-plugin-wallpaper-engine', 'dsh-folia', 'dsh-dream-skin', 'dsh-music-panel', 'dsh-tts-bridge'] },
]

const rpList = rpGroups.map((group) => {
  const items = group.names
    .map((name) => entries.find((entry) => entry.name === name))
    .filter(Boolean)
  return `<section>
    <h2>${escapeHtml(group.title)} · ${items.length} 个</h2>
    <ul>${items.map((entry) => `<li><a href="p/${escapeHtml(entry.slug)}.html"><code>${escapeHtml(entry.name)}</code></a> — ${escapeHtml(entry.summary.slice(0, 70))}${entry.summary.length > 70 ? '…' : ''} <sub>${PRIVACY_META[entry.privacy]?.badge ?? ''}</sub></li>`).join('')}</ul>
  </section>`
}).join('')

const rpBody = `<div class="page" style="border:0;background:none;box-shadow:none;padding:0;max-width:none">
  <h1>养鱼选型速查</h1>
  <p>如果你只想知道"养鱼该装哪几个"，看这一页。每一格都对应站内已经核验过的插件，点进去能看到完整的四问判断与核验日期。</p>
  <p class="notice"><b>最省事的起步组合</b>：<a href="p/dsh-mnemon.html"><code>dsh-mnemon</code></a>（记忆）+ <a href="p/${slugByName.get('dsh-live-compact')}.html"><code>dsh-live-compact</code></a>（压缩）+ <a href="p/cc-safety-net.html"><code>cc-safety-net</code></a>（拦截）。三个都不改宿主结构，装完重启即可。</p>

  <table class="verify-table">
    <thead><tr><th>你要解决什么</th><th>首选</th><th>备选 / 什么时候换</th><th>别装</th></tr></thead>
    <tbody>
      <tr>
        <td>聊久了失忆</td>
        <td><a href="p/dsh-mnemon.html"><code>dsh-mnemon</code></a><br><sub>看得见每轮记忆，能改</sub></td>
        <td><a href="p/dsh-prime-memory.html"><code>dsh-prime-memory</code></a>（要全自动）<br><a href="p/dsh-fish-memory.html"><code>dsh-fish-memory</code></a>（会淡忘）</td>
        <td>同时装三个以上记忆插件，重复注入</td>
      </tr>
      <tr>
        <td>上下文爆掉 / 变卡</td>
        <td><a href="p/${slugByName.get('dsh-live-compact')}.html"><code>dsh-live-compact</code></a><br><sub>本机压缩、先备份</sub></td>
        <td><a href="p/dsh-context.html"><code>dsh-context</code></a>（先看清再动手）<br><a href="p/dsh-token-diet.html"><code>dsh-token-diet</code></a>（预算兜底）</td>
        <td>把 <code>billion-context-dsh</code> 强行装（版本不兼容）</td>
      </tr>
      <tr>
        <td>人设越聊越像客服</td>
        <td><a href="p/dsh-soul-md.html"><code>dsh-soul-md</code></a><br><sub>人设卡可切换、可手改</sub></td>
        <td><a href="p/${slugByName.get('dsh-liketavern')}.html"><code>dsh-liketavern</code></a>（专业养鱼，ST 兼容）<br><a href="p/dsh-plugin-memory.html"><code>dsh-plugin-memory</code></a>（markdown+git）</td>
        <td>人设插件堆三个，互相覆盖</td>
      </tr>
      <tr>
        <td>怕私聊内容泄露</td>
        <td><a href="p/cc-safety-net.html"><code>cc-safety-net</code></a><br><sub>拦危险命令与密钥访问</sub></td>
        <td>只用 🟢 纯本地插件、全部本地模型</td>
        <td>🔴 类插件不看清就装（<a href="verifications.html">核验表</a>里有标记）</td>
      </tr>
      <tr>
        <td>想躺床上接着聊</td>
        <td><a href="p/dsh-mobile-plugin.html"><code>dsh-mobile-plugin</code></a><br><sub>手机连回自己电脑</sub></td>
        <td><a href="p/ds-harness-remote.html"><code>ds-harness-remote</code></a>（要 Agent 远程跑任务）</td>
        <td>用公网隧道还传私密剧情</td>
      </tr>
      <tr>
        <td>界面太"AI 味"</td>
        <td><a href="p/dsh-pet.html"><code>dsh-pet</code></a> 或 <a href="p/dsh-meme.html"><code>dsh-meme</code></a><br><sub>桌宠 / 表情包</sub></td>
        <td><a href="p/deep-view.html"><code>deep-view</code></a>、<a href="p/dsh-genui.html"><code>dsh-genui</code></a>（要可点卡片）</td>
        <td>装饰层全上，排查问题找不到源头</td>
      </tr>
    </tbody>
  </table>

  <h2>30 天试用建议</h2>
  <ol>
    <li><b>第 1 周</b>：只装记忆那一个（mnemon 或 prime-memory），跑满一周，进记忆库抽查写进去得对不对</li>
    <li><b>第 2 周</b>：加 <code>dsh-live-compact</code>，观察压缩后回忆是否变差；顺手用 <code>dsh-context</code> 看上下文组成</li>
    <li><b>第 3 周</b>：人设固化——用 <code>dsh-soul-md</code> 写人设卡，或用 liketavern 的专业流程</li>
    <li><b>第 4 周</b>：才考虑装饰与手机端；此时你已经知道自己真正在意什么</li>
  </ol>

  <h2>三条纪律</h2>
  <ul>
    <li><b>一次只加一个插件</b>，观察两天再加下一个——否则出问题分不清是谁</li>
    <li><b>改动前备份</b>：人设文件、记忆目录、配置都先复制一份</li>
    <li><b>先看隐私灯</b>：🔴 插件会把内容发出去，私密剧情要有心理准备</li>
  </ul>

  <h2>养鱼相关插件全清单（按六件事分组）</h2>
  <div class="changelog">${rpList}</div>

  <div class="notice">想看每个判断的证据？<a href="verifications.html">核验记录</a>里每条都有日期、版本、安装实测结果。发现问题 <a href="${DISCUSSIONS.correction}" target="_blank" rel="noreferrer noopener">去纠错</a>。</div>
</div>`


const partialEntries = [...trialByName.values()].filter((item) => item.result === 'partial')
const failuresBody = `<div class="page">
  <h1>失败档案</h1>
  <p>成功的条目在<a href="verifications.html">核验记录</a>里；这一页专门放<b>没成功或不建议装</b>的：装不上、装上了不生效、克隆超时、版本不兼容、以及不该推荐的类型。</p>
  <p class="notice">负面结论同样要带证据。每条都写了现象、原因与处理方式；<b>没有证据的失败不写进来</b>。</p>

  <h2>一、装上了但不生效（半装）· ${partialEntries.length} 条</h2>
  <p>包在 <code>node_modules</code>、写进了 <code>dependencies</code>，但没进 <code>dsh.profile.bundles</code>，所以不会启动。本站记录为 <code>partial</code>。</p>
  <table class="verify-table">
    <thead><tr><th>插件</th><th>版本</th><th>原因</th></tr></thead>
    <tbody>
      ${partialEntries.map((item) => `<tr><td><code>${escapeHtml(item.name)}</code></td><td>${escapeHtml(item.version ?? '—')}</td><td>${escapeHtml(item.reason ?? '未记录')}</td></tr>`).join('')}
    </tbody>
  </table>
  <p>处理：在 profile 目录跑 <code>pnpm approve-builds</code>，判断依赖是否可信后放行，再重新 add。详见<a href="install.html">安装避坑</a>第五节。</p>

  <h2>二、装不上 / 不建议直接装 · ${(riskData?.items ?? []).length} 条</h2>
  <div class="changelog">
    ${(riskData?.items ?? []).map((item) => `<section>
      <h2><code>${escapeHtml(item.name)}</code></h2>
      <p style="margin:6px 0">${item.flags.map((flag) => `<span class="badge ${flag === 'broken-npm' || flag === 'jailbreak' ? 'high' : 'warn'}">${escapeHtml(RISK_FLAG_TEXT[flag] ?? flag)}</span>`).join(' ')}</p>
      <p>${escapeHtml(item.summary)}</p>
      <p style="font-size:13px"><b>证据：</b>${escapeHtml(item.evidence)}</p>
      ${item.note ? `<p style="font-size:13px"><b>注意：</b>${escapeHtml(item.note)}</p>` : ''}
    </section>`).join('')}
  </div>

  <h2>三、从这些失败里总结的规律</h2>
  <ol>
    <li><b>先看它在不在 npm</b>：返回 404 就只能 <code>github:</code> 装，而 GitHub 源受克隆速度影响，大仓库会超时</li>
    <li><b>坏包会连坐</b>：一个 tarball 截断的包装进 lockfile 后，同 profile 之后装什么都失败，报错却指向那个坏包</li>
    <li><b>pnpm 11 拦构建脚本</b>：这不是装不上，是"半装"；配置白名单三种写法我们都试过、都无效，只能交互式放行</li>
    <li><b>静默跳过最难查</b>：有的插件在版本不满足时直接被内核跳过且不报错（如 <code>dsh-bili-scroll</code> 的 README 自述），表现为"装了跟没装一样"</li>
    <li><b>别用手写脚本改 profile 的 package.json</b>：带 BOM 会让 DSH 解析失败，整个 profile 装不了任何插件</li>
  </ol>

  <div class="notice">你遇到的失败不在这页？<a href="${DISCUSSIONS.correction}" target="_blank" rel="noreferrer noopener">发到讨论区</a>，带上插件名、DSH 版本和完整报错——能复现的我们会复现后写进来。</div>
</div>`

const pageBodies = new Map([
  ['failures.html', { title: '失败档案 · DSH 插件站', description: '装不上、装了不生效、超时、不兼容的插件与证据。', body: failuresBody }],
  ['rp.html', { title: '养鱼选型速查 · DSH 插件站', description: '一页看完：记忆、压缩、人设、隐私、手机、氛围该装什么。', body: rpBody }],
  ['method.html', { title: '核验方法 · DSH 插件站', description: '四级核验怎么做、什么算通过、已知局限与可复现命令。', body: methodBody }],
  ['install.html', { title: '安装避坑指南 · DSH 插件站', description: 'npm 与 GitHub 两种装法、坏包污染、版本不兼容与验证方式。', body: installBody }],
  ['weekly.html', { title: '周报 · DSH 插件站', description: '按快照对比得出的新增、掉榜、版本与许可证变化。', body: weeklyBody }],
  ['rules.html', { title: '收录规则与标准 · DSH 插件站', description: '收录门槛、判断标准、排序与收费说明。', body: rulesBody }],
  ['risks.html', { title: '风险公告 · DSH 插件站', description: '装不上、装坏了、不建议直接装的 DSH 插件，附证据。', body: risksBody }],
  ['takedown.html', { title: '下架与侵权投诉 · DSH 插件站', description: '先下架再核实的投诉处理流程。', body: takedownBody }],
  ['disclaimer.html', { title: '评测免责声明 · DSH 插件站', description: '人工主观评价的边界与有效期。', body: disclaimerBody }],
  ['privacy.html', { title: '隐私与数据说明 · DSH 插件站', description: '本站收集什么、不收集什么、数据从哪来。', body: privacyBody }],
  ['scenes.html', { title: '场景施工图 · DSH 插件站', description: '按场景给出装哪些、按什么顺序、哪些可以跳过。', body: scenesBody }],
  ['verifications.html', { title: '核验记录 · DSH 插件站', description: '带日期与 DSH 版本的公开核验记录。', body: verificationsBody }],
])

// 防御：数据异常时不要发布一个残缺的站点。
const MIN_SITE_ENTRIES = Number(process.env.MIN_SITE_ENTRIES ?? 50)
if (entries.length < MIN_SITE_ENTRIES) {
  console.error(`[abort] 只生成了 ${entries.length} 个条目（阈值 ${MIN_SITE_ENTRIES}），拒绝覆盖 site/。请检查 data/catalog.json 与 data/github.json。`)
  process.exit(2)
}

// ---------- 输出 ----------
await rm(join(SITE, 'p'), { recursive: true, force: true })
await mkdir(join(SITE, 'assets'), { recursive: true })
await mkdir(join(SITE, 'p'), { recursive: true })
const jsonLd = [{
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'DSH 插件站（非官方·第三方）',
  url: `${SITE_URL}/`,
  description: '非官方第三方 DeepSeek Harness 插件索引与人工核验记录：按场景给出该装什么、有什么坑。',
  inLanguage: 'zh-CN',
  isAccessibleForFree: true,
  publisher: { '@type': 'Person', name: 'qianmokillstar' },
}, {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: '已人工核验的 DSH 插件',
  numberOfItems: REVIEWED.length,
  itemListElement: REVIEWED.map((entry, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    url: `${SITE_URL}/p/${entry.slug}.html`,
    name: entry.title,
    description: entry.summary.slice(0, 160),
  })),
}].map((doc) => `<script type="application/ld+json">${JSON.stringify(doc).replace(/</gu, '\\u003c')}</script>`).join('\n')

await writeFile(join(SITE, 'index.html'), shell({
  title: 'DSH 插件站 · 非官方第三方',
  description: '非官方第三方 DSH 插件索引：按场景给出该装什么、有什么坑。',
  body: homeBody
    .replace('__SCENE_COUNT__', String(scenes.length))
    .replace('__VERIFIED_COUNT__', String(REVIEWED.length))
    .replace('__JSONLD__', jsonLd),
}), 'utf8')
for (const [file, def] of pageBodies) await writeFile(join(SITE, file), shell(def), 'utf8')
await writeFile(join(SITE, 'changelog.html'), shell({ title: '更新日志 · DSH 插件站', description: '最近新增、更新与核实进度。', body: changelogBody }), 'utf8')
await writeFile(join(SITE, 'submit.html'), shell({ title: '提交插件 · DSH 插件站', description: '推荐一个 DSH 插件，或补上它的判断信息。', body: submitBody }), 'utf8')
await writeFile(join(SITE, 'assets', 'style.css'), CSS, 'utf8')
await writeFile(join(SITE, 'assets', 'app.js'), APP_JS, 'utf8')
for (const [slug, html] of detailPages) await writeFile(join(SITE, 'p', `${slug}.html`), html, 'utf8')
if (marketIndex) await writeFile(join(SITE, 'index.json'), JSON.stringify(marketIndex, null, 2) + '\n', 'utf8')

// 结构化核验记录：给外部工具读的"质量层"（非官方第三方，带日期与版本）
const verificationDoc = {
  schema: 'dsh-market-verification/1',
  generatedAt: BUILT_AT.toISOString(),
  site: `${SITE_URL}/`,
  disclaimer: '非官方第三方站点，与 DeepSeek / DeepSeek Harness 官方无关联、无授权、无背书。安装成功不代表运行正确，核验结论只对标注日期与版本成立。',
  dshVersion: DSH_VERSION,
  count: REVIEWED.length,
  entries: REVIEWED.map((entry) => {
    const trial = trialByName.get(entry.name)
    const launch = launchByName.get(entry.name)
    return {
      name: entry.name,
      version: entry.version,
      title: entry.title,
      license: entry.license,
      weeklyDownloads: entry.downloads,
      risk: entry.risk,
      privacy: entry.privacy,
      privacyNote: PRIVACY_META[entry.privacy]?.text ?? null,
      verificationDate: trial?.date ?? null,
      dshVersion: trial?.dshVersion ?? DSH_VERSION,
      install: { result: trial?.result ?? 'not-tested', version: trial?.version ?? null },
      activation: launch?.activation ?? 'unknown',
      activationNote: launch?.note ?? null,
      judgment: judgmentOf(entry.reviewBody),
      links: {
        page: `${SITE_URL}/p/${entry.slug}.html`,
        npm: entry.npmUrl,
        repository: entry.repoUrl,
        homepage: entry.homepage,
      },
    }
  }),
}
await writeFile(join(SITE, 'verifications.json'), JSON.stringify(verificationDoc, null, 2) + '\n', 'utf8')

// JSON Schema：让外部工具能校验/消费我们的核验数据
const verificationSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${SITE_URL}/verifications.schema.json`,
  title: 'DSH plugin verification records',
  type: 'object',
  required: ['schema', 'generatedAt', 'entries'],
  properties: {
    schema: { const: 'dsh-market-verification/1' },
    generatedAt: { type: 'string', format: 'date-time' },
    site: { type: 'string', format: 'uri' },
    disclaimer: { type: 'string' },
    dshVersion: { type: 'string' },
    count: { type: 'integer', minimum: 0 },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'install', 'judgment', 'links'],
        properties: {
          name: { type: 'string' },
          version: { type: ['string', 'null'] },
          title: { type: 'string' },
          license: { type: ['string', 'null'] },
          weeklyDownloads: { type: ['integer', 'null'] },
          risk: { enum: ['low', 'medium', 'high', null] },
          privacy: { enum: ['local', 'cloud', 'unknown'] },
          privacyNote: { type: ['string', 'null'] },
          verificationDate: { type: ['string', 'null'], format: 'date' },
          dshVersion: { type: 'string' },
          install: {
            type: 'object',
            required: ['result'],
            properties: {
              result: {
                enum: ['installed', 'partial', 'failed', 'not-tested'],
                description: 'installed=装进隔离 profile 并进入组合；partial=包已落地但未进入 profile bundles（如 pnpm 拦截构建脚本）；failed=安装失败；not-tested=未测',
              },
              version: { type: ['string', 'null'] },
            },
          },
          activation: { enum: ['loaded', 'no-error', 'pending', 'not-composed', 'unknown'] },
          activationNote: { type: ['string', 'null'] },
          judgment: {
            type: 'object',
            properties: {
              fit: { type: ['string', 'null'], description: '适合谁（首条要点）' },
              solves: { type: ['string', 'null'], description: '解决什么' },
              risk: { type: ['string', 'null'], description: '风险点' },
              alternatives: { type: ['string', 'null'], description: '替代品' },
            },
          },
          links: {
            type: 'object',
            properties: {
              page: { type: 'string', format: 'uri' },
              npm: { type: ['string', 'null'] },
              repository: { type: ['string', 'null'] },
              homepage: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
  },
}
await writeFile(join(SITE, 'verifications.schema.json'), JSON.stringify(verificationSchema, null, 2) + '\n', 'utf8')

// sitemap / robots：让搜索引擎能收录施工图与核验记录
const staticPages = ['', 'rp.html', 'scenes.html', 'verifications.html', 'weekly.html', 'install.html', 'method.html', 'risks.html', 'failures.html', 'changelog.html', 'rules.html', 'takedown.html', 'disclaimer.html', 'privacy.html', 'submit.html']
const sitemapUrls = [
  ...staticPages.map((page) => ({ loc: `${SITE_URL}/${page}`, priority: page === '' ? '1.0' : '0.8' })),
  ...entries.map((entry) => ({ loc: `${SITE_URL}/p/${entry.slug}.html`, priority: '0.6' })),
  { loc: `${SITE_URL}/index.json`, priority: '0.7' },
  { loc: `${SITE_URL}/verifications.json`, priority: '0.7' },
  { loc: `${SITE_URL}/verifications.schema.json`, priority: '0.5' },
]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((item) => `  <url><loc>${item.loc}</loc><lastmod>${stats.builtAt}</lastmod><priority>${item.priority}</priority></url>`).join('\n')}
</urlset>
`
await writeFile(join(SITE, 'sitemap.xml'), sitemap, 'utf8')
await writeFile(join(SITE, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, 'utf8')

console.log('站点生成完成 site/')
console.log(`  收录 ${stats.total}（已核实 ${stats.verified}，人工短评 ${stats.reviewed}）`)
console.log(`  详情页 ${detailPages.size} 个`)
console.log(`  GitHub 检查 ${stats.githubChecked} 个仓库，排除噪声 ${stats.githubRejected} 个`)

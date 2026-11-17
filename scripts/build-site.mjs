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
const trialInstalled = (trialData?.items ?? []).filter((item) => item.result === 'installed')
const launchData = await readJson(join(ROOT, 'data', 'launch-test.json'), null)
const launchByName = new Map((launchData?.plugins ?? []).map((item) => [item.name, item]))
const ACTIVATION_TEXT = {
  loaded: '已加载（日志证实）',
  'no-error': '已组合 · 未见报错',
  pending: '待激活（缺 webServer）',
  'not-composed': '独立 app · 未参与组合',
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
    curationRank: review?.curationRank ?? -1,
    reviewBody: undefined,
    reviewHeading: null,
    source: 'github',
  })
}

const reviewed = entries.filter((entry) => entry.reviewBody)
const verified = entries.filter((entry) => entry.verified)
const withStars = entries.filter((entry) => Number.isFinite(entry.stars))

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
  var state = { query: '', category: '', sort: 'recommend', verifiedOnly: false };
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
    badges += '<span class="badge">' + p.categoryTitle + '</span>';
    if (p.risk === 'high') badges += '<span class="badge high">高风险</span>';
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
    count.textContent = '共 ' + items.length + ' 个插件' + (state.verifiedOnly ? '（仅已核实）' : '');
    list.innerHTML = items.length ? items.map(card).join('') : '<div class="empty">没找到匹配的插件。试试换个关键词，或取消分类筛选。</div>';
  }
  document.getElementById('q').addEventListener('input', function (e) { state.query = e.target.value; render(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
  document.getElementById('verified').addEventListener('change', function (e) { state.verifiedOnly = e.target.checked; render(); });
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
<link rel="stylesheet" href="${base}assets/style.css">
</head>
<body>
<div class="wrap">
${nav ? `<header class="top"><div class="brand">${LOGO}<h1 class="title"><a href="${base}index.html" style="color:inherit">DSH 插件站</a><span class="tag-unofficial">非官方 · 第三方</span></h1></div>
<p class="subtitle">搜一个插件，立刻知道它能不能用、适合谁、有什么坑。不卖排名、不接赞助。</p>
<p class="disclaimer-strip">本站为第三方非官方站点，与 DeepSeek / DeepSeek Harness 官方<b>无关联、无授权、无背书</b>；插件版权归各自作者，收录不代表官方推荐。<a href="${base}rules.html">收录规则</a></p>
<div class="nav"><a href="${base}index.html">插件目录</a><a href="${base}scenes.html">场景施工图</a><a href="${base}verifications.html">核验记录</a><a href="${base}changelog.html">更新日志</a><a href="${base}submit.html">提交插件</a><a href="${base}rules.html">规则与声明</a></div></header>` : ''}
${body}
<footer class="site">
  <div><b>非官方声明</b>：本站为第三方非官方 DSH 插件索引与评测站，与 DeepSeek / DeepSeek Harness 官方无关联、无授权、无背书。站名、Logo 均为本站自有，不使用也不并列官方标识。插件名称、描述、许可证等版权归各作者所有；收录不代表官方推荐，判断为独立主观评价。</div>
  <div><b>收费披露</b>：本站目前没有任何赞助、推广位或付费收录，排序不接受付费。若未来出现任何商业合作，会在对应位置显著标注「赞助/推广」，并保持对未付费插件相同的收录与判断标准。</div>
  <div>数据来源：npm registry / downloads API / GitHub API，构建于 ${escapeHtml(stats.builtAt)}（DSH ${DSH_VERSION}）。核验结论均标注日期，不构成安装或安全担保。</div>
  <div class="foot-links"><a href="${base}rules.html">收录规则</a> · <a href="${base}takedown.html">下架与投诉</a> · <a href="${base}disclaimer.html">评测免责</a> · <a href="${base}privacy.html">隐私与数据</a> · <a href="${base}submit.html">提交插件</a></div>
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
  </div>
  <div class="chips">${categoryChips}</div>
</div>
<p class="count" id="count"></p>
<div class="grid" id="list"></div>
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

  const body = entry.reviewBody
    ? `<div class="page-nav" style="margin-bottom:16px"><a href="../index.html">← 返回目录</a></div>
<article class="review">
  <h1>${escapeHtml(entry.reviewHeading ?? entry.title)}</h1>
  <div class="badges" style="margin:10px 0 18px">
    <span class="badge ok">已核实</span>
    <span class="badge accent">人工短评</span>
    ${entry.risk ? `<span class="badge ${entry.risk === 'high' ? 'high' : entry.risk === 'medium' ? 'warn' : 'ok'}">风险 ${escapeHtml({ low: '低', medium: '中', high: '高' }[entry.risk] ?? entry.risk)}</span>` : ''}
  </div>
  ${renderMarkdown(entry.reviewBody)}
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
]

const nameSet = new Set(entries.map((entry) => entry.name))
const slugByName = new Map(entries.map((entry) => [entry.name, entry.slug]))

const scenesBody = `<div class="page" style="border:0;background:none;box-shadow:none;padding:0;max-width:none">
  <h1>场景施工图</h1>
  <p>这里不给"全部插件"，只给<b>按场景装哪几个、按什么顺序、哪些可以跳过、有什么坑</b>。每一条都对应本站有判断的插件；还没写判断的插件不会出现在这里。</p>
  <p class="notice">当前覆盖 ${scenes.length} 个场景，全部基于已审核插件的 README 与核验记录。顺序建议是判断，不是硬性依赖。</p>
  ${scenes.map((scene) => `<div class="scene">
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
  <p class="notice">当前 ${REVIEWED.length} 条记录中，<b>${trialInstalled.length} 条已完成安装实测</b>（真装进隔离 profile，记录版本与日期），<b>${launchByName.size} 条有启动核验结论</b>（已加载 ${[...launchByName.values()].filter((item) => item.activation === 'loaded').length} / 待激活 ${[...launchByName.values()].filter((item) => item.activation === 'pending').length} / 组合无报错 ${[...launchByName.values()].filter((item) => item.activation === 'no-error').length} / 不参与组合 ${[...launchByName.values()].filter((item) => item.activation === 'not-composed').length}）。安装成功不代表运行无问题，启动核验也不代表功能正确。</p>
  <table class="verify-table">
    <thead><tr><th>插件</th><th>安装</th><th>启动核验</th><th>核验日期</th><th>DSH 版本</th><th>结论</th><th>风险</th></tr></thead>
    <tbody>
      ${REVIEWED.map((entry) => {
        const trial = trialByName.get(entry.name)
        const launch = launchByName.get(entry.name)
        const evidence = trial
          ? (trial.result === 'installed' ? `已装 ${escapeHtml(trial.version ?? '')}` : '安装失败')
          : '—'
        const activation = launch ? (ACTIVATION_TEXT[launch.activation] ?? launch.activation) : '未验证'
        const verdict = trial
          ? (trial.result === 'installed'
              ? `已装入隔离 profile${launch?.note ? `；${escapeHtml(launch.note)}` : ''}`
              : `安装失败：${escapeHtml(trial.reason ?? '未知')}`)
          : (entry.verified ? '包声明存在，可安装（未实测运行）' : '仅 README 线索，未核实')
        const date = trial ? escapeHtml(trial.date) : '2026-11-16 / 17'
        return `<tr>
        <td><a href="p/${entry.slug}.html"><code>${escapeHtml(entry.name)}</code></a></td>
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
</div>`

const pageBodies = new Map([
  ['rules.html', { title: '收录规则与标准 · DSH 插件站', description: '收录门槛、判断标准、排序与收费说明。', body: rulesBody }],
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
await writeFile(join(SITE, 'index.html'), shell({ title: 'DSH 插件站 · 非官方第三方', description: '非官方第三方 DSH 插件索引：按场景给出该装什么、有什么坑。', body: homeBody.replace('__SCENE_COUNT__', String(scenes.length)).replace('__VERIFIED_COUNT__', String(REVIEWED.length)) }), 'utf8')
for (const [file, def] of pageBodies) await writeFile(join(SITE, file), shell(def), 'utf8')
await writeFile(join(SITE, 'changelog.html'), shell({ title: '更新日志 · DSH 插件站', description: '最近新增、更新与核实进度。', body: changelogBody }), 'utf8')
await writeFile(join(SITE, 'submit.html'), shell({ title: '提交插件 · DSH 插件站', description: '推荐一个 DSH 插件，或补上它的判断信息。', body: submitBody }), 'utf8')
await writeFile(join(SITE, 'assets', 'style.css'), CSS, 'utf8')
await writeFile(join(SITE, 'assets', 'app.js'), APP_JS, 'utf8')
for (const [slug, html] of detailPages) await writeFile(join(SITE, 'p', `${slug}.html`), html, 'utf8')
if (marketIndex) await writeFile(join(SITE, 'index.json'), JSON.stringify(marketIndex, null, 2) + '\n', 'utf8')

console.log('站点生成完成 site/')
console.log(`  收录 ${stats.total}（已核实 ${stats.verified}，人工短评 ${stats.reviewed}）`)
console.log(`  详情页 ${detailPages.size} 个`)
console.log(`  GitHub 检查 ${stats.githubChecked} 个仓库，排除噪声 ${stats.githubRejected} 个`)

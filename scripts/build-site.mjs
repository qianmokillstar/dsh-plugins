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
${nav ? `<header class="top"><div class="brand">${LOGO}<h1 class="title"><a href="${base}index.html" style="color:inherit">DSH 插件站</a></h1></div>
<p class="subtitle">搜一个插件，立刻知道它能不能用、适合谁、有什么坑。不收钱、不卖排名。</p>
<div class="nav"><a href="${base}index.html">插件目录</a><a href="${base}changelog.html">更新日志</a><a href="${base}submit.html">提交插件</a></div></header>` : ''}
${body}
<footer class="site">
  <div>数据：npm registry / downloads API / GitHub API，构建于 ${escapeHtml(stats.builtAt)}（DSH ${DSH_VERSION}）。</div>
  <div>判断信息来自人工阅读 README 与实测；未实测的条目标注"未核实"，不代表安全担保。收录与排序不接受付费。</div>
  <div>插件名称、描述、许可证等元数据版权归各作者所有；本站判断为独立评论，仅作必要事实引用。</div>
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
  <span class="stat">收录 <b>${stats.total}</b></span>
  <span class="stat">已核实可安装 <b>${stats.verified}</b></span>
  <span class="stat">人工短评 <b>${stats.reviewed}</b></span>
  <span class="stat">GitHub 检查 <b>${stats.githubChecked}</b> 个仓库</span>
  <span class="stat">排除噪声 <b>${stats.githubRejected}</b></span>
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

// ---------- 输出 ----------
await rm(join(SITE, 'p'), { recursive: true, force: true })
await mkdir(join(SITE, 'assets'), { recursive: true })
await mkdir(join(SITE, 'p'), { recursive: true })
await writeFile(join(SITE, 'index.html'), shell({ title: 'DSH 插件站', description: '搜一个插件，立刻知道它能不能用、适合谁、有什么坑。', body: homeBody }), 'utf8')
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

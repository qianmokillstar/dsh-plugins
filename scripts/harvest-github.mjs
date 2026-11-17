#!/usr/bin/env node
/**
 * 从 GitHub 抓取 DSH 插件仓库，并**过滤掉只挂了 topic 的无关项目**。
 *
 * 为什么必须过滤：topic:dsh-plugin 目前有两万多个仓库，大量无关项目（图床、视频下载、
 * 逆向工具）把该 topic 当流量标签。直接收录等于做一个噪声列表。
 *
 * 判定顺序（任一通过即认为是 DSH 插件仓库）：
 *   1. 根 package.json 声明了 dsh 字段（bundle / client / profile）→ manifest
 *   2. 根目录存在 cordis.patch.yml → patch
 *   3. README 里出现 dsh 安装特征（dsh plugin add / dsh.bundle / cordis）→ readme-hint
 *
 * 数据全部来自 GitHub 公开接口；无 token 时用未认证额度（搜索 10 次/分钟，raw 文件不限）。
 *
 * 用法：
 *   node scripts/harvest-github.mjs                 # 默认抓 4 页 × 100 = 400 个仓库
 *   node scripts/harvest-github.mjs --pages=2       # 少抓一点
 *   node scripts/harvest-github.mjs --token=ghp_xxx # 用 token 提高额度（可选）
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, 'data', 'github.json')

function arg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find((value) => value.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

const PAGES = Number(arg('pages', process.env.GITHUB_PAGES ?? 4))
const TOKEN = arg('token', process.env.GITHUB_TOKEN ?? '')
const CONCURRENCY = Number(arg('concurrency', 8))
const MAX_README_BYTES = 24000

const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'dsh-plugin-market-harvester/1.0',
  ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function getJson(url, attempt = 0) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) })
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get('x-ratelimit-reset') ?? 0)
    const waitSeconds = reset ? Math.max(1, reset - Math.floor(Date.now() / 1000)) : 20
    if (attempt < 2) {
      console.warn(`  限流，等待 ${Math.min(waitSeconds, 60)}s 后重试…`)
      await sleep(Math.min(waitSeconds, 60) * 1000)
      return getJson(url, attempt + 1)
    }
    throw new Error(`限流且重试失败（${url}）`)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

async function getText(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': headers['user-agent'] }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    const text = await res.text()
    return text.slice(0, MAX_README_BYTES)
  } catch {
    return null
  }
}

function rawUrl(repo) {
  const branch = repo.default_branch ?? 'main'
  return `https://raw.githubusercontent.com/${repo.full_name}/${branch}`
}

function dshManifest(pkg) {
  if (!pkg || typeof pkg !== 'object') return null
  const dsh = pkg.dsh
  if (!dsh || typeof dsh !== 'object') return null
  const kind = dsh.bundle ? 'bundle' : dsh.client ? 'client' : dsh.profile ? 'profile' : null
  if (!kind) return null
  return {
    kind,
    name: typeof pkg.name === 'string' ? pkg.name : null,
    version: typeof pkg.version === 'string' ? pkg.version : null,
    patch: dsh.bundle?.patch ?? null,
    enginesDsh: pkg.engines?.dsh ?? null,
  }
}

async function inspect(repo) {
  const base = rawUrl(repo)
  let manifest = null
  let source = null

  const pkgText = await getText(`${base}/package.json`)
  if (pkgText) {
    try {
      manifest = dshManifest(JSON.parse(pkgText))
      if (manifest) source = 'manifest'
    } catch {
      // package.json 损坏，忽略
    }
  }

  if (!manifest) {
    const patchText = await getText(`${base}/cordis.patch.yml`)
    if (patchText && /-\s*id:/u.test(patchText)) source = 'patch'
  }

  let readmeHint = null
  if (!manifest && !source) {
    const readme = await getText(`${base}/README.md`) ?? await getText(`${base}/readme.md`)
    if (readme) {
      // 注意：不能把 "dsh-plugin" 这个词当证据——很多无关项目只是挂了个 topic 徽章。
      // 只认真正的安装/配置特征。
      const hit = /dsh\s+plugin\s+(?:add|install)|dsh\.bundle|cordis\.patch/iu.exec(readme)
      if (hit) {
        readmeHint = hit[0]
        source = 'readme-hint'
      }
    }
  }

  return { manifest, source, readmeHint }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      out[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return out
}

console.log(`抓取 GitHub topic:dsh-plugin，共 ${PAGES} 页…`)
const repos = []
for (let page = 1; page <= PAGES; page++) {
  const url = `https://api.github.com/search/repositories?q=topic:dsh-plugin&sort=stars&order=desc&per_page=100&page=${page}`
  const data = await getJson(url)
  if (page === 1) console.log(`  topic 总仓库数（GitHub 报告）：${data.total_count}`)
  repos.push(...(data.items ?? []))
  console.log(`  page ${page}: +${(data.items ?? []).length}（累计 ${repos.length}）`)
  if ((data.items ?? []).length < 100) break
}

const unique = [...new Map(repos.map((repo) => [repo.full_name, repo])).values()]
// 防御：搜索接口限流时会返回 0 条，不能覆盖上一份好数据。
if (unique.length < Number(process.env.MIN_REPOS ?? 100)) {
  console.error(`[abort] 只取到 ${unique.length} 个仓库（阈值 ${process.env.MIN_REPOS ?? 100}），判定为限流或网络异常，保留上一份 github.json 不覆盖。`)
  process.exit(2)
}
console.log(`\n检查 ${unique.length} 个仓库是否真的是 DSH 插件…`)

const checked = await mapLimit(unique, CONCURRENCY, async (repo, index) => {
  const found = await inspect(repo)
  if ((index + 1) % 25 === 0) process.stdout.write(`  已检查 ${index + 1}/${unique.length}\n`)
  return { repo, ...found }
})

const kept = checked.filter((entry) => entry.source)
const rejected = checked.filter((entry) => !entry.source)

/** 官方平台仓库本身不是插件，单独标记，不进插件列表。 */
const OFFICIAL_PLATFORM = new Set(['deepseek-ai/deepseek-harness'])
const platform = kept.filter((entry) => OFFICIAL_PLATFORM.has(entry.repo.full_name))
const pluginsRaw = kept.filter((entry) => !OFFICIAL_PLATFORM.has(entry.repo.full_name))

const plugins = pluginsRaw.map(({ repo, manifest, source, readmeHint }) => ({
  fullName: repo.full_name,
  name: manifest?.name ?? repo.name,
  description: repo.description ?? '',
  url: repo.html_url,
  stars: repo.stargazers_count ?? 0,
  forks: repo.forks_count ?? 0,
  openIssues: repo.open_issues_count ?? 0,
  pushedAt: repo.pushed_at ?? null,
  createdAt: repo.created_at ?? null,
  license: repo.license?.spdx_id ?? null,
  topics: repo.topics ?? [],
  homepage: repo.homepage ?? null,
  defaultBranch: repo.default_branch ?? null,
  archived: Boolean(repo.archived),
  evidence: source,
  dsh: manifest,
  readmeHint,
  install: manifest?.name && manifest?.version ? `${manifest.name}@${manifest.version}` : null,
})).sort((left, right) => right.stars - left.stars)

const document = {
  schema: 1,
  harvestedAt: new Date().toISOString(),
  source: 'GitHub search API (topic:dsh-plugin) + raw.githubusercontent.com',
  authenticated: Boolean(TOKEN),
  searchedRepos: unique.length,
  keptRepos: plugins.length,
  rejectedRepos: rejected.length,
  officialPlatform: platform.map(({ repo }) => ({
    fullName: repo.full_name,
    stars: repo.stargazers_count ?? 0,
    reason: '官方平台仓库，不是插件',
  })),
  byEvidence: {
    manifest: plugins.filter((plugin) => plugin.evidence === 'manifest').length,
    patch: plugins.filter((plugin) => plugin.evidence === 'patch').length,
    'readme-hint': plugins.filter((plugin) => plugin.evidence === 'readme-hint').length,
  },
  plugins,
  rejected: rejected.map(({ repo }) => ({
    fullName: repo.full_name,
    stars: repo.stargazers_count ?? 0,
    description: repo.description ?? '',
    reason: '未发现 dsh 包声明 / cordis.patch.yml / README 安装特征',
  })),
}

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, JSON.stringify(document, null, 2) + '\n', 'utf8')

console.log(`\n写入 data/github.json`)
console.log(`  检查 ${document.searchedRepos} 个仓库`)
console.log(`  认定为 DSH 插件 ${document.keptRepos} 个（manifest ${document.byEvidence.manifest} / patch ${document.byEvidence.patch} / README 线索 ${document.byEvidence['readme-hint']}）`)
console.log(`  排除噪声 ${document.rejectedRepos} 个`)
console.log(`\n前 10（按 star）：`)
for (const plugin of plugins.slice(0, 10)) {
  console.log(`  ${String(plugin.stars).padStart(7)}  ${plugin.fullName}  [${plugin.evidence}]`)
}

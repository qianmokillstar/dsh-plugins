#!/usr/bin/env node
/**
 * 采集 DSH 插件生态真实数据（npm registry）。
 *
 * 只做读取与落盘，不做任何主观判断：
 *   - 搜索层：npm search API，按多个关键词取候选池
 *   - 详情层：registry 文档，判定是否为可安装 bundle（package.json#dsh.bundle.patch）
 *   - 热度层：npm downloads point API（最近一周）
 *
 * 输出：data/catalog.json（含采集时间与来源 URL，便于复核）
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, 'data', 'catalog.json')

const SEARCH_TEXTS = [
  'keywords:dsh-plugin',
  'keywords:deepseek-harness',
  'keywords:dsh',
  'dsh-plugin',
]
const SEARCH_PAGES = Number(process.env.HARVEST_PAGES ?? 2) // 每关键词页数（每页 250）
const DETAIL_LIMIT = Number(process.env.HARVEST_DETAILS ?? 140) // 需要抓 registry 详情的前 N 个
const CONCURRENCY = Number(process.env.HARVEST_CONCURRENCY ?? 8)

const ENV_TAG = /(^|[-_])dsh([-_]|$)|deepseek-harness/i

async function getJson(url, { timeout = 20000 } = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers: { 'user-agent': 'dsh-plugin-market-harvester/1.0' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

function isDshPackage(p) {
  const kw = (p.keywords ?? []).map((k) => String(k).toLowerCase())
  if (kw.includes('dsh-plugin') || kw.includes('deepseek-harness') || kw.includes('dsh')) return true
  if (ENV_TAG.test(p.name)) return true
  if (/deepseek harness/i.test(p.description ?? '')) return true
  return false
}

async function searchPool() {
  const pool = new Map()
  for (const text of SEARCH_TEXTS) {
    for (let page = 0; page < SEARCH_PAGES; page++) {
      const from = page * 250
      const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(text)}&size=250&from=${from}`
      let data
      try {
        data = await getJson(url)
      } catch (error) {
        console.warn(`搜索失败 ${text} page=${page}: ${error.message}`)
        continue
      }
      for (const obj of data.objects ?? []) {
        const p = obj.package
        if (!p?.name || !isDshPackage(p)) continue
        const prev = pool.get(p.name)
        const entry = {
          name: p.name,
          version: p.version,
          description: p.description ?? '',
          keywords: p.keywords ?? [],
          date: p.date,
          license: p.license,
          homepage: p.links?.homepage,
          repository: p.links?.repository,
          npm: p.links?.npm ?? `https://www.npmjs.com/package/${p.name}`,
          maintainers: (p.maintainers ?? []).map((m) => m.username),
          weeklyDownloads: obj.downloads?.weekly ?? 0,
          monthlyDownloads: obj.downloads?.monthly ?? 0,
          dependents: obj.dependents ?? 0,
          updated: obj.updated,
        }
        if (!prev || entry.weeklyDownloads > prev.weeklyDownloads) pool.set(p.name, entry)
      }
      process.stdout.write(`搜索 ${text} page=${page}: 池 ${pool.size}\n`)
    }
  }
  return pool
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

async function detail(entry) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(entry.name).replace('%40', '@')}`
  const doc = await getJson(url, { timeout: 30000 })
  const tags = doc['dist-tags'] ?? {}
  const versions = Object.keys(doc.versions ?? {})
  const latest = tags.latest ?? versions.at(-1)
  const manifest = doc.versions?.[latest] ?? {}
  const bundle = manifest.dsh?.bundle
  const patch = bundle?.patch
  return {
    ...entry,
    version: latest,
    distTags: tags,
    versionCount: versions.length,
    allVersions: versions.slice(-40),
    publishTime: doc.time?.[latest],
    created: doc.time?.created,
    dshBundle: Boolean(patch),
    dshBundlePatch: Array.isArray(patch) ? patch.join(', ') : patch ?? null,
    dshEngines: manifest.engines?.dsh ?? null,
    dshClient: Boolean(manifest.dsh?.client),
    repoUrl: doc.repository?.url ?? entry.repository ?? null,
    repoDir: doc.repository?.directory ?? null,
    installsFromRegistry: true,
    registryUrl: 'https://registry.npmjs.org',
  }
}

const startedAt = new Date().toISOString()
console.log('开始采集…')
const pool = await searchPool()
const ranked = [...pool.values()].sort((a, b) => b.weeklyDownloads - a.weeklyDownloads)
console.log(`候选池 ${ranked.length} 个，热度前 ${DETAIL_LIMIT} 个进入详情抓取`)

const top = ranked.slice(0, DETAIL_LIMIT)
const detailed = await mapLimit(top, CONCURRENCY, async (entry, index) => {
  try {
    const value = await detail(entry)
    if ((index + 1) % 20 === 0) process.stdout.write(`  详情 ${index + 1}/${top.length}\n`)
    return value
  } catch (error) {
    console.warn(`详情失败 ${entry.name}: ${error.message}`)
    return { ...entry, detailError: error.message }
  }
})

const bundles = detailed.filter((p) => p.dshBundle)
const catalog = {
  schema: 1,
  harvestedAt: startedAt,
  source: 'npm registry search + registry documents + downloads API',
  queries: SEARCH_TEXTS,
  searchPagesPerQuery: SEARCH_PAGES,
  totals: {
    pool: ranked.length,
    detailed: detailed.length,
    bundles: bundles.length,
  },
  plugins: detailed.sort((a, b) => b.weeklyDownloads - a.weeklyDownloads),
}

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, JSON.stringify(catalog, null, 2) + '\n', 'utf8')
console.log(`\n写入 ${OUT}`)
console.log(`候选 ${catalog.totals.pool} / 详情 ${catalog.totals.detailed} / 可安装 bundle ${catalog.totals.bundles}`)

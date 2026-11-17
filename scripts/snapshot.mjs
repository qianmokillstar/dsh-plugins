#!/usr/bin/env node
/**
 * 每日快照：把一次采集结果压缩后落成 data/history/YYYY-MM-DD.json。
 *
 * 为什么需要它：单份 catalog.json 只能回答"现在谁最热"，回答不了"这周谁涨了、
 * 谁是新上榜、谁改了许可证"。有了按日期的快照才能做差集，周榜与安全预警才成立。
 *
 * 用法：
 *   node scripts/snapshot.mjs                    # 用现有 data/catalog.json
 *   node scripts/snapshot.mjs --from=path.json   # 指定采集文件
 *   node scripts/snapshot.mjs --date=2026-11-16  # 指定快照日期（默认今天）
 *
 * 同一天重复运行只覆盖、不追加。
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const HISTORY = join(ROOT, 'data', 'history')

function arg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find((value) => value.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

function dayStamp(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

const date = arg('date', dayStamp())
if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
  console.error(`日期格式应为 YYYY-MM-DD，收到：${date}`)
  process.exit(1)
}

const sourcePath = arg('from', join(ROOT, 'data', 'catalog.json'))
let catalog
try {
  catalog = JSON.parse(await readFile(sourcePath, 'utf8'))
} catch (error) {
  console.error(`读取采集文件失败：${sourcePath}`)
  console.error(String(error?.message ?? error))
  process.exit(1)
}

const plugins = (catalog.plugins ?? [])
  .filter((plugin) => plugin.name)
  .map((plugin) => ({
    name: plugin.name,
    version: plugin.version ?? null,
    license: plugin.license ?? null,
    weeklyDownloads: plugin.weeklyDownloads ?? 0,
    publishTime: plugin.publishTime ?? null,
    maintainer: plugin.maintainers?.[0] ?? null,
    bundle: Boolean(plugin.dshBundle),
  }))
  .sort((left, right) => left.name.localeCompare(right.name))

const snapshot = {
  schema: 1,
  date,
  harvestedAt: catalog.harvestedAt ?? null,
  source: catalog.source ?? null,
  totals: {
    plugins: plugins.length,
    bundles: plugins.filter((plugin) => plugin.bundle).length,
    pool: catalog.totals?.pool ?? null,
  },
  plugins,
}

await mkdir(HISTORY, { recursive: true })
const target = join(HISTORY, `${date}.json`)
const existed = await readFile(target, 'utf8').then(() => true).catch(() => false)
await writeFile(target, JSON.stringify(snapshot, null, 2) + '\n', 'utf8')

const files = (await readdir(HISTORY)).filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/u.test(file)).sort()
await writeFile(join(HISTORY, 'index.json'), JSON.stringify({ schema: 1, dates: files.map((file) => file.slice(0, 10)) }, null, 2) + '\n', 'utf8')

console.log(`${existed ? '覆盖' : '新建'}快照 data/history/${date}.json`)
console.log(`  插件 ${snapshot.totals.plugins} 个（可安装 ${snapshot.totals.bundles}）`)
console.log(`  已有快照 ${files.length} 份：${files.map((file) => file.slice(0, 10)).join(', ')}`)
if (files.length < 2) console.log('  提示：周报需要至少 2 个不同日期的快照，明后天再跑一次就能出第一期。')

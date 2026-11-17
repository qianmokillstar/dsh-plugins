#!/usr/bin/env node
/**
 * 周报草稿：对比两份历史快照，产出"新上榜 / 掉榜 / 版本变更 / 许可证变更 / 维护者变更 / 下载涨跌"。
 *
 * 这是"列表 → 判断"那一步的数据基础：周榜与安全预警都从这里长出来。
 *
 * 用法：
 *   node scripts/weekly.mjs                       # 最近两份快照
 *   node scripts/weekly.mjs --from=2026-11-16 --to=2026-11-23
 *
 * 输出：content/weekly/YYYY-MM-DD_to_YYYY-MM-DD.md + 终端摘要
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const HISTORY = join(ROOT, 'data', 'history')
const OUT = join(ROOT, 'content', 'weekly')

function arg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find((value) => value.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

const files = (await readdir(HISTORY).catch(() => []))
  .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/u.test(file))
  .sort()
const dates = files.map((file) => file.slice(0, 10))

if (dates.length < 2) {
  console.log(`已有快照 ${dates.length} 份${dates.length ? `（${dates.join(', ')}）` : ''}。`)
  console.log('周报需要 2 份不同日期的快照。')
  console.log('下一步：明天再跑一次 `node scripts/snapshot.mjs`（或 refresh.cmd），然后重跑本脚本。')
  process.exit(0)
}

const fromDate = arg('from', dates.at(-2))
const toDate = arg('to', dates.at(-1))
if (!dates.includes(fromDate) || !dates.includes(toDate)) {
  console.error(`快照不存在。可选日期：${dates.join(', ')}`)
  process.exit(1)
}

const load = async (date) => JSON.parse(await readFile(join(HISTORY, `${date}.json`), 'utf8'))
const before = await load(fromDate)
const after = await load(toDate)
const mapOf = (snapshot) => new Map(snapshot.plugins.map((plugin) => [plugin.name, plugin]))
const oldMap = mapOf(before)
const newMap = mapOf(after)

const added = after.plugins.filter((plugin) => !oldMap.has(plugin.name))
const removed = before.plugins.filter((plugin) => !newMap.has(plugin.name))
const changed = []
for (const plugin of after.plugins) {
  const previous = oldMap.get(plugin.name)
  if (!previous) continue
  const findings = []
  if (previous.version !== plugin.version) findings.push({ kind: '版本', before: previous.version, after: plugin.version })
  if (previous.license !== plugin.license) findings.push({ kind: '许可证', before: previous.license, after: plugin.license })
  if (previous.maintainer !== plugin.maintainer) findings.push({ kind: '维护者', before: previous.maintainer, after: plugin.maintainer })
  if (findings.length) changed.push({ plugin, findings })
}

const deltas = after.plugins
  .map((plugin) => {
    const previous = oldMap.get(plugin.name)
    if (!previous) return null
    const delta = plugin.weeklyDownloads - previous.weeklyDownloads
    const ratio = previous.weeklyDownloads > 0 ? delta / previous.weeklyDownloads : null
    return { plugin, delta, ratio }
  })
  .filter(Boolean)
  .sort((left, right) => right.delta - left.delta)

const risers = deltas.filter((entry) => entry.delta > 0).slice(0, 10)
const fallers = deltas.filter((entry) => entry.delta < 0).slice(-10).reverse()
const fmt = (value) => Number(value ?? 0).toLocaleString('en-US')

const lines = [
  `# DSH 插件市场周报 · ${fromDate} → ${toDate}`,
  '',
  `> 数据来自 npm registry 与 downloads API 的两份快照对比。快照覆盖 ${before.plugins.length} → ${after.plugins.length} 个插件。`,
  '',
  `## 本周新上榜（${added.length}）`,
  '',
  ...(added.length
    ? added
      .sort((left, right) => right.weeklyDownloads - left.weeklyDownloads)
      .map((plugin) => `- \`${plugin.name}\`${plugin.version ? ` v${plugin.version}` : ''} · 周下载 ${fmt(plugin.weeklyDownloads)}${plugin.bundle ? '' : ' · 非 bundle'}`)
    : ['- 无']),
  '',
  `## 掉出采样（${removed.length}）`,
  '',
  ...(removed.length ? removed.map((plugin) => `- \`${plugin.name}\`（原周下载 ${fmt(plugin.weeklyDownloads)}）`) : ['- 无']),
  '',
  `## 值得复核的变更（${changed.length}）`,
  '',
  ...(changed.length
    ? changed.map(({ plugin, findings }) => `- \`${plugin.name}\`：${findings.map((finding) => `${finding.kind} ${finding.before} → ${finding.after}`).join('；')}`)
    : ['- 无']),
  '',
  '## 下载量涨幅前十',
  '',
  '| 插件 | 周下载 | 变化 |',
  '|---|---:|---:|',
  ...risers.map((entry) => `| \`${entry.plugin.name}\` | ${fmt(entry.plugin.weeklyDownloads)} | +${fmt(entry.delta)}${entry.ratio === null ? '' : ` (${(entry.ratio * 100).toFixed(1)}%)`} |`),
  '',
  '## 下载量跌幅前十',
  '',
  '| 插件 | 周下载 | 变化 |',
  '|---|---:|---:|',
  ...fallers.map((entry) => `| \`${entry.plugin.name}\` | ${fmt(entry.plugin.weeklyDownloads)} | ${fmt(entry.delta)}${entry.ratio === null ? '' : ` (${(entry.ratio * 100).toFixed(1)}%)`} |`),
  '',
  '## 编辑提示',
  '',
  '- 版本跳变（尤其 0.x 大跳）默认按"可能破坏兼容"处理，写进正文前先看 CHANGELOG。',
  '- 许可证或维护者变更一律进安全预警，不看下载量大小。',
  '- 新上榜不等于值得推荐：先过 `docs/CRITERIA.md` 的收录门槛。',
  '',
  `<!-- 生成于 ${new Date().toISOString()}，基于 ${fromDate} 与 ${toDate} 两份快照 -->`,
  '',
]

await mkdir(OUT, { recursive: true })
const target = join(OUT, `${fromDate}_to_${toDate}.md`)
await writeFile(target, lines.join('\n'), 'utf8')

console.log(`周报草稿已写入 content/weekly/${fromDate}_to_${toDate}.md`)
console.log(`  新上榜 ${added.length} · 掉出 ${removed.length} · 变更 ${changed.length}`)
for (const entry of risers.slice(0, 3)) console.log(`  涨幅: ${entry.plugin.name} +${fmt(entry.delta)}`)
for (const { plugin, findings } of changed.slice(0, 3)) console.log(`  变更: ${plugin.name} — ${findings.map((finding) => finding.kind).join('/')}`)

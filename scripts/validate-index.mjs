#!/usr/bin/env node
/**
 * 用 DSH 自带的官方校验器校验 market/index.json（format 1）。
 * 必须用 DSH 的 Electron 以 ELECTRON_RUN_AS_NODE=1 运行，否则读不进 app.asar。
 *
 * 用法：dsh-verify.cmd  （见 scripts/verify.cmd）
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const INDEX_URL = process.env.MARKET_INDEX_URL ?? 'http://127.0.0.1:51888/index.json'

const installed = process.env.DSH_INSTALL_DIR
if (!installed) {
  console.error('缺少环境变量 DSH_INSTALL_DIR（DSH 的 shell 会自动设置）。')
  console.error('手动运行时请指向 dsh 包目录，例如：<...>/node_modules/@deepseek-ai/dsh')
  process.exit(2)
}
const validatorPath = join(installed, '..', 'dsh-plugin-market-index', 'lib', 'index.js')

const raw = await readFile(join(ROOT, 'market', 'index.json'), 'utf8')
let document
try {
  document = JSON.parse(raw)
} catch (error) {
  console.error(`market/index.json 不是合法 JSON: ${error.message}`)
  process.exit(1)
}

let mod
try {
  mod = await import(pathToFileURL(validatorPath).href)
} catch (error) {
  console.error(`无法加载 DSH 校验器 ${validatorPath}`)
  console.error('请用 DSH 自带 Electron 运行：scripts/verify.cmd')
  console.error(String(error?.message ?? error))
  process.exit(2)
}

const { parseMarketIndex, marketInstallTarget, MarketIndexError } = mod

try {
  const index = parseMarketIndex(document, INDEX_URL)
  const reviewed = index.plugins.filter((plugin) => plugin.metadata.labels.includes('reviewed')).length
  console.log('校验通过 ✓')
  console.log(`  索引标题: ${typeof index.title === 'string' ? index.title : index.title.zh ?? index.title.en}`)
  console.log(`  插件数: ${index.plugins.length}`)
  console.log(`  人工审核: ${reviewed}`)
  console.log(`  分类声明: ${Object.keys(index.metadata.categories).length}`)
  console.log(`  标签声明: ${Object.keys(index.metadata.labels).length}`)
  console.log('\n前 5 条安装 spec：')
  for (const plugin of index.plugins.slice(0, 5)) {
    const version = plugin.versions[0]
    const target = marketInstallTarget(plugin.name, version)
    console.log(`  ${plugin.name} -> ${target.spec}`)
  }
} catch (error) {
  if (error instanceof MarketIndexError) {
    console.error(`校验失败 ✗ ${error.path} ${error.reason}`)
    process.exit(1)
  }
  throw error
}

#!/usr/bin/env node
/**
 * 安装实测：把已审核插件真的装进隔离 profile（默认 market-test），记录结果。
 *
 * 为什么单独开 profile：不污染日常使用的 desktop profile；试装只验证
 * 「包能解析、能装进 DSH 的插件体系」，不代表运行无问题。
 *
 * 用法：
 *   node scripts/trial-install.mjs                 # 跑 data/curated.json 里全部条目
 *   node scripts/trial-install.mjs --only=dsh-mnemon
 *   node scripts/trial-install.mjs --profile=market-test2
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, 'data', 'trial-install.json')
const PER_PACKAGE_TIMEOUT_MS = Number(process.env.TRIAL_TIMEOUT_MS ?? 240000)

function arg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find((value) => value.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

const PROFILE = arg('profile', 'market-test')
const ONLY = arg('only', '')

const NODE = process.env.DSH_NODE_EXECUTABLE
const INSTALL_DIR = process.env.DSH_INSTALL_DIR
if (!NODE || !INSTALL_DIR) {
  console.error('需要 DSH_NODE_EXECUTABLE 与 DSH_INSTALL_DIR（DSH 的 shell 会自动设置）')
  process.exit(2)
}
const BIN = join(INSTALL_DIR, 'lib', 'bin.js')

const curated = JSON.parse(await readFile(join(ROOT, 'data', 'curated.json'), 'utf8'))
const targets = ONLY
  ? curated.items.filter((item) => item.name === ONLY)
  : curated.items

if (targets.length === 0) {
  console.error(ONLY ? `curated.json 里没有 ${ONLY}` : '没有待测条目')
  process.exit(2)
}

function runInstall(name) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(NODE, [BIN, 'plugin', `--profile=${PROFILE}`, 'add', name], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve({ ok: false, reason: 'timeout', seconds: Math.round((Date.now() - started) / 1000), output: (stdout + stderr).slice(-800) })
    }, PER_PACKAGE_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (code) => {
      clearTimeout(timer)
      const text = stdout + stderr
      const installed = /\+\s+(\S+)\s+(\d+\.\d+\.\d+\S*)/.exec(stdout)
      resolve({
        ok: code === 0,
        code,
        version: installed?.[2] ?? null,
        resolvedName: installed?.[1] ?? name,
        seconds: Math.round((Date.now() - started) / 1000),
        output: text.slice(-800),
      })
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, reason: error.message, seconds: Math.round((Date.now() - started) / 1000), output: '' })
    })
  })
}

let previous = { items: [] }
try { previous = JSON.parse(await readFile(OUT, 'utf8')) } catch { /* 首次运行 */ }
const byName = new Map(previous.items.map((item) => [item.name, item]))

const dshVersion = process.env.DSH_VERSION ?? '0.2.2-rc.3'
console.log(`隔离 profile: ${PROFILE}  ·  待测 ${targets.length} 个  ·  DSH ${dshVersion}`)

for (const [index, item] of targets.entries()) {
  process.stdout.write(`[${index + 1}/${targets.length}] ${item.name} … `)
  const result = await runInstall(item.name)
  byName.set(item.name, {
    name: item.name,
    profile: PROFILE,
    dshVersion,
    date: new Date().toISOString().slice(0, 10),
    result: result.ok ? 'installed' : 'failed',
    version: result.version,
    seconds: result.seconds,
    reason: result.ok ? null : (result.reason ?? `exit ${result.code}`),
    logTail: result.output,
  })
  console.log(result.ok ? `OK ${result.version ?? ''} (${result.seconds}s)` : `FAIL (${result.reason ?? result.code})`)

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify({ schema: 1, updatedAt: new Date().toISOString(), profile: PROFILE, dshVersion, items: [...byName.values()] }, null, 2) + '\n', 'utf8')
}

const items = [...byName.values()]
const ok = items.filter((item) => item.result === 'installed').length
console.log(`\n写入 data/trial-install.json：成功 ${ok} / 共 ${items.length}`)

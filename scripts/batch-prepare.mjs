#!/usr/bin/env node
/**
 * 批次准备：为一批候选插件抓 README + 在隔离 profile 里真装。
 *
 * 输出：
 *   data/readmes/<name>.md      待审 README 原文（本地核对用，不入库）
 *   data/batch-prepare.json     每个插件的抓取与安装结果（版本、耗时、失败原因）
 *
 * 用法：
 *   node scripts/batch-prepare.mjs --names=dsh-context,dsh-ops,cc-safety-net
 *   node scripts/batch-prepare.mjs --names-file=data/batch2-names.txt
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const README_DIR = join(ROOT, 'data', 'readmes')
const OUT = join(ROOT, 'data', 'batch-prepare.json')
const PROFILE = process.env.BATCH_PROFILE ?? 'market-test'
const INSTALL_TIMEOUT = Number(process.env.BATCH_TIMEOUT_MS ?? 300000)

const NODE = process.env.DSH_NODE_EXECUTABLE
const INSTALL_DIR = process.env.DSH_INSTALL_DIR

function arg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find((value) => value.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

let names = []
const inline = arg('names', '')
if (inline) names = inline.split(',').map((value) => value.trim()).filter(Boolean)
const namesFile = arg('names-file', '')
if (namesFile) {
  const text = await readFile(join(ROOT, namesFile), 'utf8')
  names = names.concat(text.split(/\r?\n/u).map((value) => value.trim()).filter((value) => value && !value.startsWith('#')))
}
names = [...new Set(names)]
if (names.length === 0) { console.error('没有候选：用 --names= 或 --names-file='); process.exit(2) }

const slug = (name) => name.replace(/^@/u, '').replace(/\//gu, '__')

async function fetchReadme(name) {
  const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}`, {
    headers: { 'user-agent': 'dsh-plugin-market-batcher/1.0' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`registry HTTP ${res.status}`)
  const doc = await res.json()
  const latest = doc['dist-tags']?.latest
  const readme = doc.readme ?? ''
  const license = doc.license ?? null
  const time = doc.time?.[latest] ?? null
  const maintainers = (doc.maintainers ?? []).map((m) => m.username)
  await mkdir(README_DIR, { recursive: true })
  await writeFile(
    join(README_DIR, `${slug(name)}.md`),
    `<!-- source: https://registry.npmjs.org/${name} -->\n<!-- latest: ${latest} -->\n\n${readme}\n`,
    'utf8',
  )
  return { latest, readmeBytes: Buffer.byteLength(readme, 'utf8'), license, publishTime: time, maintainers }
}

function install(name) {
  return new Promise((resolve) => {
    if (!NODE || !INSTALL_DIR) return resolve({ ok: false, reason: 'missing DSH env' })
    const started = Date.now()
    const child = spawn(NODE, [join(INSTALL_DIR, 'lib', 'bin.js'), 'plugin', `--profile=${PROFILE}`, 'add', name], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
    })
    let out = ''
    const timer = setTimeout(() => { child.kill(); resolve({ ok: false, reason: 'timeout', seconds: Math.round((Date.now() - started) / 1000) }) }, INSTALL_TIMEOUT)
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { out += chunk })
    child.on('close', (code) => {
      clearTimeout(timer)
      const installed = /\+\s+(\S+)\s+(\d+\.\d+\.\d+\S*)/.exec(out)
      resolve({ ok: code === 0, reason: code === 0 ? null : `exit ${code}`, version: installed?.[2] ?? null, seconds: Math.round((Date.now() - started) / 1000), logTail: out.slice(-400) })
    })
    child.on('error', (error) => { clearTimeout(timer); resolve({ ok: false, reason: error.message }) })
  })
}

const results = []
for (const [index, name] of names.entries()) {
  process.stdout.write(`[${index + 1}/${names.length}] ${name} … `)
  const record = { name, date: new Date().toISOString().slice(0, 10), dshVersion: '0.2.2-rc.3' }
  try {
    Object.assign(record, await fetchReadme(name))
    process.stdout.write(`README ${Math.round(record.readmeBytes / 1024)}KB · `)
  } catch (error) {
    record.readmeError = error.message
    process.stdout.write(`README 失败(${error.message}) · `)
  }
  const installed = await install(name)
  Object.assign(record, { install: installed })
  console.log(installed.ok ? `装 OK ${installed.version ?? ''} (${installed.seconds}s)` : `装 FAIL ${installed.reason}`)
  results.push(record)
  await writeFile(OUT, JSON.stringify({ schema: 1, updatedAt: new Date().toISOString(), profile: PROFILE, items: results }, null, 2) + '\n', 'utf8')
}

const ok = results.filter((item) => item.install?.ok).length
console.log(`\n写入 data/batch-prepare.json：装成功 ${ok} / ${results.length}`)

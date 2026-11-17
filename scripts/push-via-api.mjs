#!/usr/bin/env node
/**
 * 通过 GitHub API 推送当前 HEAD 的完整文件树。
 *
 * 为什么需要它：这台机器解析 github.com 到一个传输极慢的节点，git push 会超时；
 * 而 api.github.com 正常。改用 Git Data API（blob → tree → commit → ref）绕开 git 传输层。
 *
 * 用法：
 *   GITHUB_TOKEN=xxx node scripts/push-via-api.mjs --owner=xxx --repo=yyy --message="..."
 *   GITHUB_TOKEN=xxx node scripts/push-via-api.mjs --owner=xxx --repo=yyy --message="..." --dry
 */
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

function arg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find((value) => value.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

const TOKEN = process.env.GITHUB_TOKEN
const OWNER = arg('owner')
const REPO = arg('repo')
const BRANCH = arg('branch', 'main')
const MESSAGE = arg('message', 'chore: sync from local')
const DRY = process.argv.includes('--dry')

if (!TOKEN) { console.error('缺少 GITHUB_TOKEN'); process.exit(1) }
if (!OWNER || !REPO) { console.error('需要 --owner= 与 --repo='); process.exit(1) }

const API = 'https://api.github.com'
const headers = {
  authorization: `Bearer ${TOKEN}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'dsh-plugin-market-publisher',
  'content-type': 'application/json',
}

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

// 只推送 git 跟踪的文件（site/ 等产物已在 .gitignore 中）
const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((file) => !file.startsWith('site/'))

console.log(`待推送文件 ${tracked.length} 个`)

if (DRY) {
  for (const file of tracked) console.log(`  ${file}`)
  process.exit(0)
}

const ref = await call('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`)
const baseSha = ref.object.sha
const baseCommit = await call('GET', `/repos/${OWNER}/${REPO}/git/commits/${baseSha}`)
console.log(`基线提交 ${baseSha.slice(0, 7)}（${baseCommit.message.split('\n')[0]}）`)

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  let done = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      out[index] = await fn(items[index])
      done += 1
      if (done % 10 === 0) process.stdout.write(`  blob ${done}/${items.length}\n`)
    }
  })
  await Promise.all(workers)
  return out
}

const blobs = await mapLimit(tracked, 5, async (file) => {
  const content = await readFile(join(ROOT, file))
  const created = await call('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
    content: content.toString('base64'),
    encoding: 'base64',
  })
  return { path: file, mode: '100644', type: 'blob', sha: created.sha }
})

const tree = await call('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree: blobs })
console.log(`新树 ${tree.sha.slice(0, 7)}（${blobs.length} 个条目）`)

const commit = await call('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
  message: MESSAGE,
  tree: tree.sha,
  parents: [baseSha],
})
console.log(`新提交 ${commit.sha.slice(0, 7)}`)

await call('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false })
console.log(`已更新 ${BRANCH} -> ${commit.sha.slice(0, 7)}`)
console.log(`https://github.com/${OWNER}/${REPO}/commit/${commit.sha}`)

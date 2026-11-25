#!/usr/bin/env node
/**
 * 从 GitHub 拉取仓库快照覆盖本地（绕开 git 传输层）。
 *
 * 背景：本机访问 github.com 的 git 端口经常被重置，但 api.github.com 正常。
 * 本站用 API 推送提交，本地 git 会与远端分叉；这个脚本用 API 的 tarball 把本地文件同步回远端状态。
 *
 * 用法：
 *   GITHUB_TOKEN=xxx node scripts/sync-from-remote.mjs --owner=qianmokillstar --repo=dsh-plugins [--branch=main] [--dry]
 *
 * 行为：
 *   1. 下载 tarball 到临时目录并解压
 *   2. 覆盖本地受管文件（排除 .git / node_modules / site / data/readmes）
 *   3. 删除本地存在但远端没有的受管文件
 *   4. 本地 git 提交一次，使工作区与远端一致
 */
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, readdir, stat, copyFile, mkdir } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const arg = (name, fallback) => {
  const prefix = `--${name}=`
  const found = process.argv.find((value) => value.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}
const TOKEN = process.env.GITHUB_TOKEN
const OWNER = arg('owner')
const REPO = arg('repo')
const BRANCH = arg('branch', 'main')
const DRY = process.argv.includes('--dry')
if (!TOKEN || !OWNER || !REPO) {
  console.error('需要 GITHUB_TOKEN / --owner= / --repo=')
  process.exit(2)
}

// 不同步/不删除的路径（本地专属）
const EXCLUDE_TOP = new Set(['.git', 'node_modules', 'site'])
const EXCLUDE_PREFIX = ['data/readmes/']

const isManaged = (file) => {
  const top = file.split('/')[0]
  if (EXCLUDE_TOP.has(top)) return false
  return !EXCLUDE_PREFIX.some((prefix) => file.startsWith(prefix))
}

async function walk(dir, base = dir, out = []) {
  for (const name of await readdir(dir)) {
    const full = join(dir, name)
    const info = await stat(full)
    if (info.isDirectory()) await walk(full, base, out)
    else out.push(relative(base, full).replace(/\\/gu, '/'))
  }
  return out
}

const work = await mkdtemp(join(tmpdir(), 'dsh-sync-'))
const tarball = join(work, 'repo.tar.gz')
console.log(`下载 ${OWNER}/${REPO}@${BRANCH} 快照…`)
const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/tarball/${BRANCH}`, {
  headers: { authorization: `Bearer ${TOKEN}`, 'user-agent': 'dsh-market' },
  redirect: 'follow',
  signal: AbortSignal.timeout(240000),
})
if (!res.ok) {
  console.error('下载失败:', res.status, (await res.text()).slice(0, 200))
  process.exit(1)
}
await pipeline(res.body, createWriteStream(tarball))
console.log('下载完成，解压…')
const extractDir = join(work, 'extract')
await mkdir(extractDir, { recursive: true })
execFileSync('tar', ['-xzf', tarball, '-C', extractDir], { stdio: 'inherit' })
const entries = await readdir(extractDir)
if (entries.length !== 1) {
  console.error('解压结果异常:', entries)
  process.exit(1)
}
const snapshot = join(extractDir, entries[0])
const remoteFiles = (await walk(snapshot)).filter(isManaged)
console.log(`快照含 ${remoteFiles.length} 个受管文件`)

if (DRY) {
  for (const file of remoteFiles.slice(0, 40)) console.log('  ' + file)
  await rm(work, { recursive: true, force: true })
  process.exit(0)
}

for (const file of remoteFiles) {
  const target = join(ROOT, file)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(join(snapshot, file), target)
}

const remoteSet = new Set(remoteFiles)
const localFiles = (await walk(ROOT)).filter(isManaged)
const stale = localFiles.filter((file) => !remoteSet.has(file))
let removed = 0
for (const file of stale) {
  // 只删除被 git 跟踪的文件，避免误删本地临时脚本
  try {
    execFileSync('git', ['-C', ROOT, 'ls-files', '--error-unmatch', file], { stdio: 'ignore' })
  } catch {
    continue
  }
  await rm(join(ROOT, file), { force: true })
  removed++
}
console.log(`覆盖 ${remoteFiles.length} 个文件，删除本地多余 ${removed} 个（仅限被跟踪文件）`)

try {
  execFileSync('git', ['-C', ROOT, 'add', '-A'], { stdio: 'inherit' })
  execFileSync('git', ['-C', ROOT, 'commit', '-m', 'sync: align working tree with remote snapshot'], { stdio: 'inherit' })
} catch {
  console.log('git 提交跳过（可能没有变化）')
}
await rm(work, { recursive: true, force: true })
console.log('同步完成')

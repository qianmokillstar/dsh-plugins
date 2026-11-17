#!/usr/bin/env node
/**
 * 零依赖静态服务：把 site/ 以 http 暴露给 DSH 的插件市场服务读取。
 *
 * 为什么需要它：DSH 只接受 http(s) 的索引 URL（拒绝 file://），所以 E 盘上的
 * 市场目录必须由一个本地 HTTP 服务提供，索引地址形如
 *   http://127.0.0.1:51888/index.json
 */
import { createServer } from 'node:http'
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(dirname(fileURLToPath(import.meta.url))), 'site')
const PROJECT = resolve(ROOT, '..')
const PORT = Number(process.env.MARKET_PORT ?? process.argv[2] ?? 51888)
const HOST = process.env.MARKET_HOST ?? '127.0.0.1'

// —— 每日自更新 ——
// 服务常驻时，到点自己跑一遍 refresh（采集 → 快照 → 重建索引与站点），
// 不需要任何系统计划任务权限。同一天只跑一次，记录在 data/.last-auto-refresh。
const AUTO_REFRESH = process.env.MARKET_AUTO_REFRESH !== '0'
const REFRESH_HOUR = Number(process.env.MARKET_REFRESH_HOUR ?? 9)
const REFRESH_MINUTE = Number(process.env.MARKET_REFRESH_MINUTE ?? 30)
const AUTO_STAMP = join(PROJECT, 'data', '.last-auto-refresh')

function dayStamp(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

async function lastAutoRefresh() {
  try {
    return (await readFile(AUTO_STAMP, 'utf8')).trim()
  } catch {
    return ''
  }
}

async function refreshOnce(reason) {
  if (process.platform !== 'win32') return
  const today = dayStamp()
  if (await lastAutoRefresh() === today) return
  await mkdir(dirname(AUTO_STAMP), { recursive: true })
  // 先占位再启动，避免并发检查重复触发。
  await writeFile(AUTO_STAMP, today, 'utf8')
  const child = spawn('cmd.exe', ['/c', join(PROJECT, 'scripts', 'refresh.cmd')], {
    detached: true,
    stdio: 'ignore',
    cwd: PROJECT,
    env: { ...process.env, MARKET_NO_OPEN: '1' },
  })
  child.unref()
  console.log(`[auto] ${reason}：已在后台启动刷新（${today}），完成后站点与索引自动更新`)
}

function scheduleAutoRefresh() {
  if (!AUTO_REFRESH || process.platform !== 'win32') return
  const check = () => {
    const now = new Date()
    if (now.getHours() < REFRESH_HOUR) return
    if (now.getHours() === REFRESH_HOUR && now.getMinutes() < REFRESH_MINUTE) return
    refreshOnce('每日补充采集').catch((error) => console.warn(`[auto] 刷新启动失败：${error.message}`))
  }
  setTimeout(check, 3000)
  setInterval(check, 5 * 60 * 1000)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function resolveSafe(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0])
  const relative = normalize(decoded).replace(/^([/\\])+/, '')
  const target = resolve(join(ROOT, relative === '' ? 'index.html' : relative))
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null
  return target
}

const server = createServer(async (request, response) => {
  const target = resolveSafe(request.url ?? '/')
  if (target === null) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('forbidden')
    return
  }
  try {
    let file = target
    const info = await stat(file)
    if (info.isDirectory()) file = join(file, 'index.html')
    const body = await readFile(file)
    response.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    })
    response.end(body)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('not found')
  }
})

server.listen(PORT, HOST, () => {
  const base = `http://${HOST}:${String(PORT)}`
  console.log(`DSH 插件市场已启动`)
  console.log(`  站点:  ${base}/`)
  console.log(`  索引:  ${base}/index.json`)
  console.log(`  根目录: ${ROOT}`)
  console.log(AUTO_REFRESH
    ? `  自更新: 每天 ${String(REFRESH_HOUR).padStart(2, '0')}:${String(REFRESH_MINUTE).padStart(2, '0')} 后首次检查时刷新（MARKET_AUTO_REFRESH=0 关闭）`
    : '  自更新: 已关闭（MARKET_AUTO_REFRESH=0）')
  console.log('  在 DSH 的 设置 → 插件 → 发现 中把上面的索引地址加入索引源。Ctrl+C 停止。')
  scheduleAutoRefresh()
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}

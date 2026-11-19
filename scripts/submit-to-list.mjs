#!/usr/bin/env node
/**
 * 向 awesome-deepseek-harness 提交收录 PR。
 * 规则（来自该仓库 contributing.md）：
 *   - 链到仓库本体，一句话事实描述
 *   - 中英两份 README 必须在同一个 PR 内更新
 *   - PR 标题格式：docs: add <repo>
 *
 * 用法：GITHUB_TOKEN=xxx node scripts/submit-to-list.mjs [--apply]
 */
const TOKEN = process.env.GITHUB_TOKEN
const APPLY = process.argv.includes('--apply')
const UPSTREAM_OWNER = '0xsline'
const UPSTREAM_REPO = 'awesome-deepseek-harness'
const FORK_OWNER = 'qianmokillstar'
const BRANCH = 'docs/add-dsh-plugins-index'

const J = {
  authorization: `Bearer ${TOKEN}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'dsh-market',
  'content-type': 'application/json',
}
const api = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com${path}`, { headers: J, ...init })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
  return { status: res.status, json }
}

const ANCHOR_EN = '- [westtrade/dsh-plugin-showcase](https://github.com/westtrade/deepseek-harness-plugins/tree/main/dsh-plugin-showcase)'
const ANCHOR_ZH = ANCHOR_EN
const ENTRY_EN = '- [qianmokillstar/dsh-plugins](https://github.com/qianmokillstar/dsh-plugins) - Unofficial third-party DSH plugin verification index: 55 hand-tested install records with version, risk and privacy labels, an error-diagnosis page for failed installs, a JSON feed with schema, and embeddable verification badges for plugin authors.'
const ENTRY_ZH = '- [qianmokillstar/dsh-plugins](https://github.com/qianmokillstar/dsh-plugins) - 非官方第三方 DSH 插件核验索引：55 条真机装机记录（版本 / 风险 / 隐私分级），附装不上时的报错诊断页、带 schema 的 JSON 数据源与可嵌入 README 的核验徽章。'

async function getFile(file) {
  const meta = await api(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/contents/${file}`)
  if (meta.status !== 200) throw new Error(`读取 ${file} 失败: ${meta.status}`)
  const content = Buffer.from(meta.json.content, 'base64').toString('utf8')
  return { sha: meta.json.sha, content }
}

function insertEntry(content, anchor, entry, label) {
  if (content.includes('qianmokillstar/dsh-plugins')) return { changed: false, content, reason: '已存在' }
  const lines = content.split('\n')
  const idx = lines.findIndex((line) => line.startsWith(anchor))
  if (idx < 0) throw new Error(`${label} 未找到锚点行`)
  lines.splice(idx + 1, 0, entry)
  return { changed: true, content: lines.join('\n') }
}

const files = {}
for (const [file, anchor, entry] of [
  ['README.md', ANCHOR_EN, ENTRY_EN],
  ['README.zh-CN.md', ANCHOR_ZH, ENTRY_ZH],
]) {
  const { sha, content } = await getFile(file)
  const result = insertEntry(content, anchor, entry, file)
  files[file] = { sha, content: result.content, changed: result.changed, reason: result.reason }
  console.log(`${file}: ${result.changed ? '将新增一行' : '跳过（' + result.reason + '）'}`)
}

for (const [file, data] of Object.entries(files)) {
  if (!data.changed) continue
  const preview = data.content.split('\n').find((line) => line.includes('qianmokillstar/dsh-plugins'))
  console.log(`  预览 ${file}: ${preview.slice(0, 120)}…`)
}

if (!APPLY) {
  console.log('\n[dry-run] 加 --apply 才会真正 fork + 提交 PR')
  process.exit(0)
}

// 1) fork（已存在则复用）
let fork = await api(`/repos/${FORK_OWNER}/${UPSTREAM_REPO}`)
if (fork.status !== 200) {
  console.log('创建 fork…')
  const created = await api(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/forks`, { method: 'POST', body: '{}' })
  if (![202, 200].includes(created.status)) throw new Error(`fork 失败: ${created.status} ${JSON.stringify(created.json).slice(0, 200)}`)
} else {
  console.log('已存在 fork，复用')
}

// 2) 等 fork 可读
let ready = false
for (let i = 0; i < 30; i++) {
  const probe = await api(`/repos/${FORK_OWNER}/${UPSTREAM_REPO}`)
  if (probe.status === 200) { ready = true; break }
  await new Promise((resolve) => setTimeout(resolve, 3000))
}
if (!ready) throw new Error('fork 未就绪，稍后重试')

// 3) 从上游 main 建分支
const upstreamRef = await api(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/git/ref/heads/main`)
const baseSha = upstreamRef.json.object.sha
const existing = await api(`/repos/${FORK_OWNER}/${UPSTREAM_REPO}/git/ref/heads/${BRANCH}`)
if (existing.status === 200) {
  console.log(`分支 ${BRANCH} 已存在，强制更新到上游 main`)
  await api(`/repos/${FORK_OWNER}/${UPSTREAM_REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: baseSha, force: true }),
  })
} else {
  const created = await api(`/repos/${FORK_OWNER}/${UPSTREAM_REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: baseSha }),
  })
  if (![201, 200].includes(created.status)) throw new Error(`建分支失败: ${created.status} ${JSON.stringify(created.json).slice(0, 200)}`)
  console.log(`已建分支 ${BRANCH} @ ${baseSha.slice(0, 7)}`)
}

// 4) 写文件
for (const [file, data] of Object.entries(files)) {
  if (!data.changed) continue
  const put = await api(`/repos/${FORK_OWNER}/${UPSTREAM_REPO}/contents/${file}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `docs: add qianmokillstar/dsh-plugins to ${file}`,
      content: Buffer.from(data.content, 'utf8').toString('base64'),
      sha: data.sha,
      branch: BRANCH,
    }),
  })
  if (![200, 201].includes(put.status)) throw new Error(`写入 ${file} 失败: ${put.status} ${JSON.stringify(put.json).slice(0, 200)}`)
  console.log(`已写入 ${file}`)
}

// 5) 开 PR
const prBody = `Adds a hand-curated, non-official plugin verification index to **Plugin Ecosystem & Development**.

- Links to the repository: https://github.com/qianmokillstar/dsh-plugins
- One-line, factual description; no badges or screenshots inside the entry
- Both \`README.md\` and \`README.zh-CN.md\` updated in this PR

What it is: a third-party index that records hand-tested installs of DSH plugins (version, install result, risk and privacy labels), plus an install-failure diagnosis page, a JSON feed with a JSON Schema, and embeddable verification badges that authors can put in their README. It is **not** affiliated with DeepSeek or DSH.

Happy to reword the description to match the list's tone, or drop the entry if it does not fit the curated scope.`

const pr = await api(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls`, {
  method: 'POST',
  body: JSON.stringify({
    title: 'docs: add qianmokillstar/dsh-plugins',
    head: `${FORK_OWNER}:${BRANCH}`,
    base: 'main',
    body: prBody,
    maintainer_can_modify: true,
  }),
})
if (![201, 200].includes(pr.status)) throw new Error(`开 PR 失败: ${pr.status} ${JSON.stringify(pr.json).slice(0, 300)}`)
console.log('\nPR 已提交:', pr.json.html_url)

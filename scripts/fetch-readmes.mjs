#!/usr/bin/env node
/**
 * 抓取待审核插件的 README 原文到 data/readmes/，供人工/AI 阅读后写评测。
 * 只落盘原文并记录来源，不改写内容。
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT_DIR = join(ROOT, 'data', 'readmes')

/** 第一批人工审核候选（阶段一：10 篇短评）。 */
export const CANDIDATES = [
  'dsh-cost-meter',
  'dsh-remote',
  'dsh-free-search',
  'dsh-mnemon',
  'dsh-agent-compare',
  'dsh-windows-mcp',
  '@michengai/dsh-archive-manager',
  'dsh-video-storyboard',
  '@deepseek-harness-tui/dsh-tui',
  'dsh-dream-skin',
]

function fileName(name) {
  return name.replace(/^@/, '').replace(/\//g, '__') + '.md'
}

async function getJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { 'user-agent': 'dsh-plugin-market-harvester/1.0' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

await mkdir(OUT_DIR, { recursive: true })
const index = []
for (const name of CANDIDATES) {
  try {
    const doc = await getJson(`https://registry.npmjs.org/${name.replace('/', '%2F')}`)
    const latest = doc['dist-tags']?.latest
    const readme = doc.readme ?? ''
    const file = join(OUT_DIR, fileName(name))
    const header = [
      `<!-- source: https://registry.npmjs.org/${name} -->`,
      `<!-- name: ${name} -->`,
      `<!-- latest: ${latest} -->`,
      `<!-- readme-bytes: ${Buffer.byteLength(readme, 'utf8')} -->`,
      '',
    ].join('\n')
    await writeFile(file, header + readme + '\n', 'utf8')
    index.push({
      name,
      latest,
      license: doc.license ?? null,
      repository: doc.repository ?? null,
      homepage: doc.homepage ?? null,
      maintainers: (doc.maintainers ?? []).map((m) => m.username),
      readmeBytes: Buffer.byteLength(readme, 'utf8'),
      file: `data/readmes/${fileName(name)}`,
      fetchedAt: new Date().toISOString(),
      source: `https://registry.npmjs.org/${name}`,
    })
    console.log(`OK ${name} (${Buffer.byteLength(readme, 'utf8')} B)`)
  } catch (error) {
    index.push({ name, error: error.message, fetchedAt: new Date().toISOString() })
    console.warn(`FAIL ${name}: ${error.message}`)
  }
}
await writeFile(join(ROOT, 'data', 'readmes-index.json'), JSON.stringify({ schema: 1, entries: index }, null, 2) + '\n', 'utf8')
console.log(`\n完成 ${index.filter((e) => !e.error).length}/${CANDIDATES.length}`)

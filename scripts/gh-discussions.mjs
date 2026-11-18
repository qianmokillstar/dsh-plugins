#!/usr/bin/env node
/**
 * 配置 GitHub Discussions：
 *   1. 把欢迎帖改成正式说明并置顶
 *   2. 建两条入口讨论（核验纠错 / 施工图建议），放在 Q&A 与 Ideas 分类
 *
 * 需要一个有 repo 权限的 token：GITHUB_TOKEN=xxx node scripts/gh-discussions.mjs --owner= --repo=
 */
const TOKEN = process.env.GITHUB_TOKEN
const arg = (name, fallback) => {
  const prefix = `--${name}=`
  const found = process.argv.find((value) => value.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}
const OWNER = arg('owner')
const REPO = arg('repo')
if (!TOKEN || !OWNER || !REPO) {
  console.error('需要 GITHUB_TOKEN / --owner= / --repo=')
  process.exit(2)
}

async function graphql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'user-agent': 'dsh-market' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

const WELCOME = `## 这是什么

**非官方第三方 DSH 插件索引站**的讨论区：只收录人工真机跑过、能说清"适合谁 / 有什么坑"的插件。
与 DeepSeek / DeepSeek Harness 官方**无关联、无授权、无背书**。

- 站点：https://qianmokillstar.github.io/dsh-plugins/
- 核验记录：https://qianmokillstar.github.io/dsh-plugins/verifications.html
- 施工图：https://qianmokillstar.github.io/dsh-plugins/scenes.html
- 结构化数据：https://qianmokillstar.github.io/dsh-plugins/verifications.json

## 判断标准（四问）

每条核验必须回答：**适合谁 / 解决什么 / 风险点 / 替代品（含"什么都不装"）**。
风险点写不出"真会出事"的，不收。

## 隐私分级

🟢 纯本地 · 🔴 需云端 · ⚪ 未确认。这是读 README 与权限描述后的判断，**没有抓包验证**，别当安全审计。

## 两个反馈入口

- **核验纠错（Q&A）**：哪个判断不准、哪个插件装不上/装坏了、版本变了结论失效
- **施工图建议（Ideas）**：想要哪个场景的装机顺序

提交时请带上：插件名、DSH 版本、你遇到的现象。能复现的优先处理。

## 下架与投诉

作者不希望被收录、或认为记录有误：在本仓库提 Issue（标题以 \`[下架]\` / \`[侵权]\` 开头），**先下架再核实**，24 小时内响应。

## 一条硬规则

不卖排名、不接赞助、不收费收录。所有渠道统一带"非官方第三方"。`

const data = await graphql(`
  query ($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      id
      hasDiscussionsEnabled
      discussionCategories(first: 20) { nodes { id name } }
      discussions(first: 5, orderBy: { field: CREATED_AT, direction: DESC }) {
        nodes { id number title category { name } }
      }
    }
  }
`, { owner: OWNER, repo: REPO })

const repository = data.repository
console.log('Discussions enabled:', repository.hasDiscussionsEnabled)
const categories = repository.discussionCategories.nodes
console.log('分类:', categories.map((category) => category.name).join(' / '))
const pick = (names) => categories.find((category) => names.includes(category.name))?.id

const existing = repository.discussions.nodes
const welcome = existing[0]
if (welcome) {
  await graphql(`
    mutation ($id: ID!, $body: String!) {
      updateDiscussion(input: { discussionId: $id, body: $body }) { discussion { number title } }
    }
  `, { id: welcome.id, body: WELCOME })
  console.log(`已改写欢迎帖 #${welcome.number}`)
  try {
    await graphql(`mutation ($id: ID!) { pinDiscussion(input: { discussionId: $id }) { clientMutationId } }`, { id: welcome.id })
    console.log('已置顶')
  } catch (error) {
    console.log('置顶失败（可能已置顶或权限不足）:', error.message.slice(0, 120))
  }
}

async function ensureDiscussion(categoryNames, title, body) {
  const categoryId = pick(categoryNames)
  if (!categoryId) { console.log(`跳过「${title}」：没有 ${categoryNames.join('/')} 分类`); return }
  if (existing.some((item) => item.title === title)) { console.log(`已存在：${title}`); return }
  const created = await graphql(`
    mutation ($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
      createDiscussion(input: { repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body }) {
        discussion { number url }
      }
    }
  `, { repositoryId: repository.id, categoryId, title, body })
  console.log(`已创建 #${created.createDiscussion.discussion.number} ${title}`)
}

await ensureDiscussion(['Q&A', '问答', 'General'], '核验纠错 · 哪个判断不准 / 哪个装不上', `在这里反馈核验记录的错误。请带上：

1. 插件名与版本
2. 你的 DSH 版本
3. 现象（装不上 / 装上没入口 / 行为不符 / 结论过时）

能复现的优先改。作者认为记录有误也可以直接说，**先改记录再讨论**。`)

await ensureDiscussion(['Ideas', '想法', 'General'], '施工图建议 · 想要哪个场景', `想要哪个使用场景的装机顺序与避坑？说明你的工作流和卡点，我们会排进施工图。

已覆盖场景见：https://qianmokillstar.github.io/dsh-plugins/scenes.html`)

console.log('完成')

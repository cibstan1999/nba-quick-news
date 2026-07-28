# AGENTS.md

## 项目目标

NBA Quick News 是一个小而精的中文 NBA 快讯产品。优先保证事实准确、中文自然、更新稳定和快速浏览体验，不追求新闻数量，不做复杂门户。

## 当前架构

以仓库实际代码为准：

```text
RealGM RSS
-> Cloudflare Worker 标准化并生成 newsId
-> 可选 Jina Reader 正文提取
-> Workers AI（Qwen 主模型 + JSON fallback）
-> 本地事实与中文质量检查
-> Workers KV
-> GET /data/news.json
-> Vite vanilla JavaScript 前端
```

- Workers KV 是唯一生产内容源。
- `public/data/` 当前没有受版本控制的 `news.json`，不得重新建立第二套数据链路。
- 生产 AI 使用 Cloudflare Workers AI，不是 GitHub Models。
- Cloudflare Cron 每 30 分钟刷新；GitHub Actions 不负责抓 RSS。
- GitHub Pages 和 Cloudflare 静态部署共享同一套前端，均读取 Worker API。

## 核心文件职责

- `cloudflare-worker/src/index.js`：RSS 抓取、Jina 正文提取、队列调度、Workers AI 调用、KV 读写、HTTP 路由和刷新状态。
- `cloudflare-worker/src/pipeline.js`：纯数据逻辑，包括 `newsId`、分类、重要度、实体词典、Prompt、事实提取、中文清洗、质量检查、重试和公开数据生成。
- `cloudflare-worker/tests/`：队列、事实校验、传闻语气、AI 解析、缓存和 Worker 流程的确定性测试；测试不得调用真实 AI。
- `cloudflare-worker/wrangler.jsonc`：现有 Worker、Cron、KV、AI 绑定和非敏感运行参数的唯一配置。
- `src/main.js`：只负责读取 Worker API、浏览器缓存、搜索、分类、今日速览、加载更多和安全渲染。
- `src/style.css`：现有响应式、暗色模式和信息层级。
- `scripts/build.mjs`：在 GitHub Pages 与根路径部署之间选择 Vite base。
- `.github/workflows/deploy-pages.yml`：构建并部署 GitHub Pages。
- `.github/workflows/update-news.yml`：验证 Worker 管线和前端构建，不抓取新闻。
- `README.md`、`package.json`：架构说明、命令和依赖契约。

## 稳定边界

- 不随意更换 RealGM RSS、Worker 路由、KV key、绑定名、Cron、部署路径或 AI 模型。
- 不创建、替换或删除 Cloudflare Worker、KV、AI 绑定等现有资源，除非用户明确批准迁移。
- 不改变现有 `news.json` 字段含义；新增字段应保持向后兼容并配套测试。
- 不让前端合并静态 JSON、Worker 数据或其他内容源。
- 不覆盖、删除或暂存用户已有改动和未知未跟踪文件。当前 `fetch-realgm.ts` 是未跟踪的 GitHub HTML 页面，不属于项目源代码。
- `REFRESH_TOKEN` 等秘密只能存于 Cloudflare Secret 或本地忽略文件；不得写入代码、配置、文档、日志或命令。
- 现有公开域名可保留；新增或替换 API 地址应使用构建环境配置，不再散落硬编码。

## 中文新闻质量

- 所有内容只能基于英文原题、RSS 摘要和通过校验的正文证据。
- 必须保留明确出现的球员、球队、合同年限、金额、比分和主要交易资产。
- 传闻、接触、潜在下家和预计行为必须使用“据报道”“可能”“有意”“正在考虑”等语气。
- 分析和观点必须明确标注为分析、观点或预测，不能写成已确认事实。
- 使用常见中文球队名和词典内标准球员译名；无可靠译名时保留完整英文姓名，不自行音译。
- 禁止半中半英语法、低信息模板、营销号措辞、标题与摘要重复及不受证据支持的细节。
- 失败时保持 `pending/rejected/failed` 并等待重试；不合格内容不得进入首页。没有摘要优于错误摘要。

## AI 使用规则

- Workers AI 是增强编辑层，RSS 抓取、旧内容保留和公开 API 不得因单条 AI 失败而中断。
- 只读取结构化工具调用或严格 JSON；不得把 reasoning、思考过程或普通文本当作新闻内容。
- Qwen 和 fallback 结果必须经过同一套事实、语言、分类、置信度和传闻语气检查。
- 已 `accepted` 且 `sourceHash` 未变化的新闻不得重复调用 AI。
- `rejected/failed` 使用 `retryCount`、`nextRetryAt` 和冷却策略，单条失败不得阻塞后续新闻。
- 不得无上限提高 `AI_MAX_ITEMS_PER_RUN`。
- GitHub Models 当前不在生产链路。未来若明确批准接入，只能作为服务端可关闭的适配器，并复用相同缓存、状态和质量检查；不得由前端调用，也不得成为更新成功的必要条件。

## 数据与缓存约定

- KV key：`news:catalog:v1`、`news:item:<newsId>`、`news.json`。
- AI 状态：`pending`、`processing`、`accepted`、`rejected`、`failed`。
- 公开根字段保持 `schemaVersion`、`pipelineVersion`、`source`、`feed`、`updatedAt`、`lastFetchStatus`、`highlights`、`items`。
- 核心新闻字段包括 `newsId`、`sourceHash`、原始证据、URL、发布时间、分类、重要度、`eventKey`、中文编辑字段、AI 元数据和状态。
- `PIPELINE_VERSION`、`sourceHash` 或字段契约变更必须设计迁移和重新排队测试，不能静默复用旧摘要。
- 浏览器 `localStorage` 只保存最后一次成功的 Worker payload，不能成为编辑或生产数据源。
- Workers KV 为最终一致性存储，部署或刷新后允许短暂传播延迟，不应立即误判为写入失败。[Cloudflare KV 一致性说明](https://developers.cloudflare.com/kv/concepts/how-kv-works/)

## 前端原则

- 前端只读取公开 Worker API，不包含 AI token、刷新 token 或 AI 调用逻辑。
- 保留搜索、分类、今日速览、加载更多、更新状态、浏览器缓存、移动端和暗色模式。
- 只展示 `accepted` 内容；摘要不合格或非中文时隐藏。
- 所有动态文本必须转义；外部链接保留安全的 `target` 和 `rel`；图片保留 `alt`。
- UI 修改必须同时检查桌面端和 375px 手机端，不为局部问题复制第二套渲染逻辑。

## 修改前流程

1. 运行 `git status --short --branch`、`git diff`、`git diff --cached` 和最近提交日志。
2. 阅读本文件、README、package.json 及所有受影响模块和测试。
3. 从 RSS 证据到 Worker、KV、公开 JSON、前端完整追踪问题，先确认根因。
4. 明确修改范围、数据兼容性、失败路径、回滚方式和验收样例。
5. 复杂任务先进入 Plan mode；未经批准不实施、不提交、不推送、不部署。
6. 实施时保持改动小而可回滚，并为修复添加针对性回归测试。

## 验证命令

```bash
npm ci
npm test
npm run build
npm run build:cloudflare
node --check src/main.js
node --check cloudflare-worker/src/index.js
node --check cloudflare-worker/src/pipeline.js
git diff --check
npx wrangler deploy --dry-run --config cloudflare-worker/wrangler.jsonc
```

Worker 获批部署后检查 `/health` 和 `/data/news.json` 的 `pipelineVersion`、状态、队列、AI 统计、更新时间及中文样例；调用 `/refresh` 时不得输出 Secret。

## 当前风险与维护优先级

- P0：修复 `/refresh` 在缺少 `REFRESH_TOKEN` 时的 fail-open 行为，并增加鉴权测试。
- P0：确认已验收新闻的 `sourceHash` 变化会重新进入队列并清除旧编辑结果。
- P1：让健康状态区分“本轮成功”和“仍有 rejected backlog”，明确 `updatedAt` 的固定语义。
- P1：增加 RSS 全失败、fallback 拒绝、重试冷却、Jina 失败和前端缓存回退测试。
- P2：将前端 Worker URL 改为可配置构建变量，同时保持现有部署兼容。
- P3：可靠性稳定后再优化重点新闻排序、词典覆盖和摘要通过率。

## 汇报格式

每次完成后说明：根因、实际修改文件、行为或数据契约变化、测试和构建结果、提交 hash、推送/部署状态、线上验证结果、剩余风险。没有运行的检查必须明确说明。

## 禁止事项

禁止编造新闻、降低质量门槛换取通过率、展示 reasoning、提交 Secret、前端调用 AI、恢复双数据源、无界调用模型、随意改 RSS、重置 KV、创建重复 Cloudflare 资源、强制覆盖 Git 历史、批量暂存未知文件或顺手重构无关代码。

## 必须先进入 Plan Mode 的情况

涉及数据源、公开 schema、KV key、迁移、AI 模型或 Prompt 大改、质量门槛、队列与重试、Cloudflare 资源、Cron、部署流程、主要依赖升级，或同时跨 Worker、数据和前端多个层级时，必须先检查并提交决策完整的计划。

本轮获批后只新增根目录 `AGENTS.md`，不修改运行时代码；P0 风险另开小任务逐项实施。

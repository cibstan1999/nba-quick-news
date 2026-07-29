# Phase 1 Integration B: Minimum Evidence Cover

> 部分基线：仅使用冻结的 9 条样本，缺少 injury 和 game 类型，不代表完整六分类生产验证。

## 结论

Minimum Evidence Cover 达到本轮验收线：

- Evidence Inventory：9/9
- Critical anchors：70/70（100%）
- Required facts：40/40（100%）
- Attribution：6/6（100%）
- 核心数字：8/8（100%）
- 无关 evidence：0
- 内部标记泄漏：0
- 严重事实错误：0
- certainty / negation 错误：0
- Gate 漏检：0
- 人工可接受：8/9
- 中文自然度：3.50/5
- oneLine 重复：0
- AI 请求：0
- 生产 KV 写入：0

因此已经具备重新评估 Stage 1 AI 必要性的条件。当前证据选择和事实生成不再依赖 Qwen；唯一失败样本属于现有 interview composer 的表达能力，不是 evidence cover 缺失。

## 关系模型

`Mandatory Anchor Manifest` 不再把所有相关 evidence 都直接设为必选。每个 anchor 保存：

```json
{
  "anchorId": "anchor-type-value",
  "type": "entity | number | attribution | modality | negation | core-relation",
  "value": "...",
  "candidateEvidenceIds": ["..."],
  "priority": "critical | important",
  "reason": "..."
}
```

一个 anchor 可以由多条 evidence 支持；`candidateEvidenceIds` 只是候选。最终追踪链为：

```text
evidenceId
-> deduplicated factId
-> titleFactId / summaryFactId / oneLineFactId
-> composer usedFactIds
```

## 选择算法

1. 固定加入第一条标题核心 evidence。
2. 计算尚未覆盖的 critical anchors。
3. 按 core relation、核心数字、否定、modality、attribution 和主题实体计算正向分。
4. 对背景、宣传、内部标记、过长文本和无关实体施加惩罚。
5. 每轮选取覆盖未覆盖关键锚点得分最高的 evidence。
6. 使用 inventory 顺序和 evidenceId 作稳定 tie-break，确保相同输入得到相同结果。
7. 默认最多 4 条；只有独立关键锚点无法覆盖时才可增加，硬上限为 6。
8. 超过硬上限仍有 critical anchor 未覆盖时返回 `minimum-evidence-cover-incomplete` 和缺失 anchor IDs。
9. Facts 生成前按事件关系、实体和信息增量确定性去重；重复标题和摘要保留信息更完整的一条。

## 九条结果

### TR-01

- selectedEvidenceIds：`title-1`, `summary-2`, `summary-4`
- Facts：3 -> 2
- 标题：据 Shams Charania 报道，热火、掘金和骑士对德玛尔·德罗赞有意
- 摘要：据 Shams Charania 报道，热火、掘金和骑士对德玛尔·德罗赞有意；德玛尔·德罗赞与国王的 2674 万美元合同中仅有 1000 万美元受保障。
- oneLine：德玛尔·德罗赞与国王的 2674 万美元合同中仅有 1000 万美元受保障。
- Gate / 人工：accepted / accept
- 自然度：4/5

### TR-02

- selectedEvidenceIds：`title-1`, `summary-3`, `summary-4`, `summary-5`
- Facts：4 -> 3
- 标题：热火正关注引进克莱·汤普森，但克莱·汤普森是否会离开独行侠尚不清楚
- 摘要：热火正关注引进克莱·汤普森，但克莱·汤普森是否会离开独行侠尚不清楚；克莱·汤普森与独行侠合同最后一年价值 1750 万美元；目前尚不清楚球员或球队是否有意商议买断。
- oneLine：克莱·汤普森与独行侠合同最后一年价值 1750 万美元。
- Gate / 人工：accepted / accept
- 自然度：4/5

### TR-03

- selectedEvidenceIds：`title-1`, `summary-3`, `summary-4`, `summary-6`
- Facts：4 -> 3
- 标题：奇才和独行侠均无意交易安东尼·戴维斯和凯里·欧文
- 摘要：奇才和独行侠均无意交易安东尼·戴维斯和凯里·欧文；勒布朗·詹姆斯及其经纪人 Rich Paul 未要求球队必须交易得到安东尼·戴维斯或凯里·欧文；安东尼·戴维斯和凯里·欧文预计将分别随奇才和独行侠开始新赛季。
- oneLine：安东尼·戴维斯和凯里·欧文预计将分别随奇才和独行侠开始新赛季。
- Gate / 人工：accepted / accept
- 自然度：4/5

### SG-01

- selectedEvidenceIds：`title-1`, `summary-1`, `summary-2`
- Facts：3 -> 2
- 标题：掘金匹配雷霆为斯潘塞·琼斯提供的 2 年 1200 万美元报价合同
- 摘要：掘金匹配雷霆为斯潘塞·琼斯提供的 2 年 1200 万美元报价合同；掘金将留住斯潘塞·琼斯，后者上赛季已成为球队重要轮换球员。
- oneLine：掘金将留住斯潘塞·琼斯，后者上赛季已成为球队重要轮换球员。
- Gate / 人工：accepted / accept
- 自然度：4/5

### SG-02

- selectedEvidenceIds：`title-1`, `summary-2`
- Facts：2 -> 2
- 标题：德雷蒙德·格林预计以 2800 万美元与勇士续约
- 摘要：德雷蒙德·格林预计以 2800 万美元与勇士续约；德雷蒙德·格林预计以接近 2800 万美元球员选项的金额续约。
- oneLine：德雷蒙德·格林预计以接近 2800 万美元球员选项的金额续约。
- Gate / 人工：accepted / accept
- 自然度：3/5

### SG-03

- selectedEvidenceIds：`title-1`, `summary-1`, `summary-2`
- Facts：3 -> 2
- 标题：火箭签下前锋朱利安·菲利普斯
- 摘要：火箭签下前锋朱利安·菲利普斯；合同条款未披露，朱利安·菲利普斯很可能签下 1 年 250 万美元老将底薪合同。
- oneLine：合同条款未披露，朱利安·菲利普斯很可能签下 1 年 250 万美元老将底薪合同。
- Gate / 人工：accepted / accept
- 自然度：4/5

### IN-01

- selectedEvidenceIds：`title-1`, `summary-1`, `summary-6`
- Facts：3 -> 2
- 标题：斯蒂芬·库里就勒布朗·詹姆斯、76 人 和勇士表达了个人观点
- 摘要：斯蒂芬·库里就勒布朗·詹姆斯、76 人 和勇士表达了个人观点；斯蒂芬·库里就吉米·巴特勒、勒布朗·詹姆斯和勇士表达了个人观点。
- oneLine：斯蒂芬·库里就吉米·巴特勒、勒布朗·詹姆斯和勇士表达了个人观点。
- Gate / 人工：rejected / reject
- 自然度：2/5
- 归因：evidence、关键议题和 attribution 均完整；现有采访模板无法自然表达“伤病影响了勇士判断”，Gate 正确拒绝，不属于最小证据集合缺口。

### AN-01

- selectedEvidenceIds：`title-1`, `summary-4`, `summary-6`, `summary-8`
- Facts：4 -> 4
- 标题：RealGM 分析认为勇士和斯蒂芬·库里相关议题
- 摘要：RealGM 分析认为勇士和斯蒂芬·库里相关议题；Tim Kawakami 节目讨论斯蒂芬·库里和 Tim Kawakami 相关议题；文章 节目讨论，勇士的重点是为斯蒂芬·库里退役后的阵容建设做准备；文章 节目讨论勇士和斯蒂芬·库里相关议题。
- oneLine：Tim Kawakami 节目讨论斯蒂芬·库里和 Tim Kawakami 相关议题。
- Gate / 人工：accepted / accept
- 自然度：3/5

### AN-02

- selectedEvidenceIds：`title-1`, `summary-1`, `summary-2`
- Facts：3 -> 2
- 标题：RealGM 分析认为勒布朗·詹姆斯加盟 76 人的设想
- 摘要：RealGM 分析认为勒布朗·詹姆斯加盟 76 人的设想；文章 节目讨论这一设想是否是争取胜利的最佳机会，以及 76 人在东部的竞争力。
- oneLine：文章 节目讨论这一设想是否是争取胜利的最佳机会，以及 76 人在东部的竞争力。
- Gate / 人工：accepted / accept
- 自然度：3.5/5

## 与 Optional Stage 1 的关系

上一轮 Qwen optional selection 9 次均返回空数组，没有增加编辑价值。本轮 deterministic minimum cover 在 0 次 AI 请求下达到全部事实安全指标，并将 evidence 集合稳定压缩到每条 2–4 条。

下一步可以重新评估 Stage 1 AI 是否应移除；本报告不重新启用 Qwen optional selection，也不改变生产路径。

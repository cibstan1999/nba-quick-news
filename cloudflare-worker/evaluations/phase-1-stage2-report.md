# Phase 1 Stage 2 Editorial Evaluation

> **Partial frozen baseline: 9/18 samples. Injury and game samples are absent. Stage 1 Facts were frozen locally and were not regenerated during this evaluation.**

## Constraint Convergence Checkpoint

The final Stage 2 convergence code now derives one deterministic
`editorialConstraints` object from the frozen Facts and passes the same object to
the prompt and the Gate. It covers required attribution, core numbers, analysis
markers, weak certainty, forbidden claims, and prioritized oneLine facts.

Deterministic regression tests pass for TR-01, TR-02, TR-03, SG-01, SG-02, SG-03,
IN-01, AN-01, and AN-02. The Gate also rejects reordered low-value oneLine copy and
unexpected ordinary English tokens while allowing verified names and abbreviations.

The new prompt could not be regenerated against remote Workers AI in this
checkpoint because the execution environment blocked the remote dry-run before the
local Worker started. No alternate samples or generated substitutes were used.
Therefore the metrics below remain the previous real Qwen baseline and must not be
presented as results from the converged prompt.

Offline revalidation of those previous nine outputs with the converged Gate found:

- required core-number coverage: `7/8` (`87.5%`);
- attribution errors: `1`;
- unexpected English-token errors: `1`;
- exact or low-value title/oneLine duplicates: `5/9`;
- Stage 1 requests, Llama fallback calls, and production KV writes: `0`.

Production canary eligibility remains **pending a fresh nine-sample Stage 2-only
Workers AI run**. No production mode, deployment, or KV record was changed.

## Decision

- Stage 2 final JSON parse target (`>= 8/9`): **met, 9/9**
- Serious factual errors: **0**
- Certainty escalation: **0**
- Negation loss: **0**
- Gate false negatives: **0**
- Human acceptable target (`>= 7/9`): **met, 7/9**
- Average Chinese naturalness target (`>= 4/5`): **met, 4.0/5**
- Exact title/oneLine duplicates target (`0`): **not met, 4/9**
- Attribution or analysis-modality omissions target (`0`): **not met, 2**
- Required numeric coverage: **not met, 7/8**
- Llama fallback calls: **0**
- Stage 1 requests: **0**
- Production KV writes: **0**
- Ready for production canary: **No**

The frozen-Fact Stage 2 path is structurally stable and did not introduce a severe
fact error in this cohort. It is not ready for a production canary because oneLine
independence remains unreliable, required attribution is not consistently carried
into every field, and one core contract amount was omitted.

## Frozen Input Boundary

The Stage 2 request received only:

- validated internal Facts;
- deterministic certainty, polarity, attribution, entities, and numbers;
- deterministic `mustNotClaim` and core-fact selection;
- canonical display names;
- source and publication timestamp;
- Chinese editorial rules.

It did not receive the original article body, RSS summary, Stage 1 reasoning,
single-stage copy, rejected evidence, or Llama output. The ignored local input file
contains no article text.

## Gate Changes

- `Oklahoma City` is excluded from person candidates in city/team context.
- `Taxpayer MLE`, the mid-level exception, and second-apron terms are classified as
  league or salary context rather than people.
- Stage 2 required coverage is derived from core Facts. Secondary cap-space figures
  remain allowed evidence but are not automatically mandatory.
- Chinese contract durations such as `两年` and `一年期` are normalized for exact
  fact comparison.
- A confirmed signing and a likely contract detail can coexist without the confirmed
  transaction being misread as a certainty escalation.
- Interview attribution is allowed through the frozen Fact attribution, while an
  unverified entity remains forbidden.
- The debug-only Stage 2 path is protected by the existing refresh Secret, requires
  `dryRun: true`, skips Stage 1, and never persists data.

## Results

| ID | Type | Parse | Gate | Human | Effort | Naturalness | oneLine duplicate | Main finding |
|---|---|---|---|---|---|---:|---|---|
| TR-01 | trade rumor | Pass | Reject | Accept | minor_edit | 5 | Yes | Accurate multi-team interest and money; omitted `RealGM` attribution and repeated the title. |
| TR-02 | trade rumor | Pass | Reject | Reject | rewrite | 3 | No | Natural Chinese improved, but the required `$17.5M` contract amount was omitted. |
| TR-03 | trade rumor | Pass | Reject | Accept | minor_edit | 4 | Yes | Negation and no-trade status were preserved; oneLine repeated the title. |
| SG-01 | signing | Pass | Reject | Accept | minor_edit | 5 | Yes | Correct two-year, `$12M` offer-sheet match; oneLine repeated the title. |
| SG-02 | signing | Pass | Reject | Accept | minor_edit | 4 | Yes | Expected status and `$28M` were preserved; oneLine repeated the title. |
| SG-03 | signing | Pass | Accept | Accept | publish | 5 | No | Confirmed signing and likely one-year, `$2.5M` terms were kept separate. |
| IN-01 | interview | Pass | Accept | Accept | publish | 4 | No | Curry remained the speaker and his conditional view was preserved. |
| AN-01 | analysis | Pass | Reject | Reject | rewrite | 2 | No | Summary retained RealGM attribution, but raw `reportedly` leaked and oneLine stated the analysis too definitively. |
| AN-02 | analysis | Pass | Accept | Accept | publish | 4 | No | Dunc'd On attribution and analytical framing were preserved. |

## Editorial Output

### TR-01

- Title: `德玛尔·德罗赞成自由市场焦点，热火、掘金、骑士有意`
- Summary: `德玛尔·德罗赞成为自由市场最受关注的球员，热火、掘金和骑士均对他表示兴趣。此前他与国王的合同部分保障金额为1000万美元，总薪资为2674万美元。`
- oneLine: `德玛尔·德罗赞成自由市场焦点，热火、掘金、骑士有意。`
- Gate: `title-oneline-duplicate`, `editorial-attribution-missing`

### TR-02

- Title: `热火欲引进克莱·汤普森`
- Summary: `热火队在常规赛前需要填补多个阵容空缺，目前正关注引进克莱·汤普森，但尚不清楚他是否会与独行侠队达成买断。`
- oneLine: `热火队有意引进克莱·汤普森，但其与独行侠队的合同情况尚不明确。`
- Gate: `missing-key-facts`, `editorial-missing-verified-facts`

### TR-03

- Title: `詹姆斯与代理未施压球队交易戴维斯与欧文`
- Summary: `据报道，詹姆斯及其代理理查德·保罗未要求球队必须交易戴维斯或欧文以获得NBA历史得分王。目前，戴维斯和欧文所在的奇才和独行侠均无意交易两人。`
- oneLine: `詹姆斯与代理未施压球队交易戴维斯与欧文`
- Gate: `title-oneline-duplicate`

### SG-01

- Title: `掘金匹配雷霆报价，签下斯潘塞·琼斯`
- Summary: `掘金匹配斯潘塞·琼斯与雷霆签下的两年1200万美元报价，将保留这位上赛季重要轮换球员。`
- oneLine: `掘金匹配雷霆报价，签下斯潘塞·琼斯。`
- Gate: `title-oneline-duplicate`

### SG-02

- Title: `德雷蒙德·格林预计与勇士队续约2800万美元`
- Summary: `据消息，德雷蒙德·格林预计将以接近2800万美元的薪资与勇士队续约。目前尚未确认具体细节。`
- oneLine: `德雷蒙德·格林预计与勇士队续约2800万美元`
- Gate: `title-oneline-duplicate`

### SG-03

- Title: `火箭签下前锋朱利安·菲利普斯`
- Summary: `休斯顿火箭队已确认签下前锋朱利安·菲利普斯，合同细节未披露，但据估计为一年期老将底薪250万美元。`
- oneLine: `火箭队签下朱利安·菲利普斯，合同预计为一年期老将底薪250万美元。`
- Gate: accepted

### IN-01

- Title: `斯蒂芬·库里谈詹姆斯选择球队`
- Summary: `斯蒂芬·库里表示，他不会提前设想任何事情，因为有很多变数。他原本希望詹姆斯选择勇士队。`
- oneLine: `库里称不会提前设想，因变数多且希望詹姆斯加盟勇士。`
- Gate: accepted

### AN-01

- Title: `勇士队或尝试签下詹姆斯`
- Summary: `据RealGM报道，勇士队希望在今夏签下勒布朗·詹姆斯，但他们的重点 reportedly 是为斯蒂芬·库里退役后打造阵容。`
- oneLine: `勇士队或尝试签下詹姆斯，但重点是为库里退役后做准备。`
- Gate: `unsafe-summary`, `analysis-presented-as-fact`

### AN-02

- Title: `勒布朗·詹姆斯加盟76人引发热议`
- Summary: `据Dunc'd On分析，勒布朗·詹姆斯表示加盟76人是最佳夺冠机会，引发对球队实力的讨论。`
- oneLine: `勒布朗·詹姆斯加盟76人，Dunc'd On分析其夺冠机会。`
- Gate: accepted

## Metrics

| Metric | Result |
|---|---:|
| First-attempt JSON parsed | 9/9 |
| Retry parsed | 0 |
| Stage 2 requests | 9 |
| Average requests per sample | 1.0 |
| Gate accepted | 3/9 |
| Human acceptable | 7/9 |
| Direct publish | 3/9 |
| Minor edit | 4/9 |
| Rewrite | 2/9 |
| Serious fact errors | 0 |
| Certainty escalations | 0 |
| Negation losses | 0 |
| Gate false negatives | 0 |
| Gate false positives | 0 |
| Exact title/oneLine duplicates | 4/9 |
| Average Chinese naturalness | 4.0/5 |
| Llama fallback calls | 0 |
| Stage 1 requests | 0 |
| Production writes | 0 |

## Canary Assessment

The implementation meets the structural parse, fact-safety, and human-acceptability
thresholds on this partial cohort. It fails the production canary threshold because
the oneLine duplicate count is non-zero, attribution/modality is not preserved in
all required fields, and required numeric coverage is below 100%.

No production mode, Worker deployment, KV record, public payload, or frontend was
changed by this evaluation.

# Phase 0.5 Single-Stage Qwen3 Quality Baseline

> **部分基线：仅 9/18 条样本，缺少 injury 和 game 类型，不代表完整六分类评估。**

## Decision

**No-Go**

The single-stage pipeline is operationally stable, and the current Gate prevented every human-rejected sample from being published. However, the evaluated Qwen copy did not reach the quality threshold required to move on:

- Human-acceptable output: **5/9 (55.6%)**, below the 75% target.
- Directly publishable output: **1/9 (11.1%)**.
- Average Chinese naturalness: **3.44/5**, below the 4/5 target.
- Serious factual or source-meaning errors: **2**.
- Rumor/expectation certainty errors: **1**.
- Key-entity accuracy: **7/9 (77.8%)**, below the 100% target.
- `oneLineZh` exactly repeated the title in **9/9 (100%)** samples.
- Injury and game coverage could not be evaluated because the current KV catalog contained no such stories.

This result supports remaining in Phase 0.5. It does not authorize Phase 1 or any production change.

## Scope And Safety

- Production catalog snapshot: 36 current `news:item` records.
- RSS source represented in the snapshot: RealGM.
- Frozen sample count: 9.
- Target sample count: 18.
- Frozen baseline SHA-256: `CAEA3CD4F65F3F2FA38102448E103C52E0831F9DD706C2F0587A84037E00719B`.
- Qwen model: `@cf/qwen/qwen3-30b-a3b-fp8`.
- Pipeline: `editorial-pipeline-v4`.
- Production KV writes: 0.
- Accepted records were read and revalidated locally; AI was not called again.
- Six rejected records were processed through `POST /debug/reprocess`.
- Every rejected request used `dryRun: true`.
- Every debug response returned `persisted: false`.
- No `retryCount`, `processedAt`, `nextRetryAt`, or `aiStatus` value was written.
- Full Jina text is retained only in `phase-0.5-results.local.json`; it is not copied into this report.
- The pipeline does not persist historical `articleTextUsed`. For stored accepted items, current Jina text was collected for review but cannot be proven byte-identical to the original AI input.

## Sample Availability

| Test type | Target | Available | Result |
|---|---:|---:|---|
| Trade/free-agency rumor | 3 | 3 | Complete |
| Signing | 3 | 3 | Complete |
| Interview | 3 | 1 | Short by 2 |
| Injury | 3 | 0 | Short by 3 |
| Game | 3 | 0 | Short by 3 |
| Analysis | 3 | 2 | Short by 1 |
| **Total** | **18** | **9** | **Short by 9** |

The current catalog is an offseason wiretap set. No ordinary reports were reclassified as injury, game, interview, or analysis merely to fill quotas.

## Frozen Samples

| ID | Type | Previous status | Original title | Selection reason |
|---|---|---|---|---|
| TR-01 | Trade/rumor | rejected | DeMar DeRozan Receiving Interest From Heat, Nuggets, Cavaliers | Newest distinct multi-team interest report; known prior Gate false positive |
| TR-02 | Trade/rumor | accepted | Heat Waiting On Klay Thompson Before Filling Out Roster | Accepted Qwen rumor with unresolved buyout and salary context |
| TR-03 | Trade/rumor | rejected | Wizards, Mavericks Had No Interest In Trading Anthony Davis, Kyrie Irving | Negative trade report testing “no interest” and expected-status language |
| SG-01 | Signing | rejected | Nuggets Matching Spencer Jones Offer Sheet From Thunder | Offer-sheet match with direction, years and money |
| SG-02 | Signing | accepted | Draymond Green Expected To Re-Sign With Warriors For $28M | Expected re-signing where amount and completion remain uncertain |
| SG-03 | Signing | accepted | Julian Phillips, Rockets Sign Contract | Confirmed signing with undisclosed terms and reported estimates |
| IN-01 | Interview | rejected | Stephen Curry On LeBron James' Decision: 'You Don't Envision Anything Until It Happens' | Only current article primarily centered on a named speaker's comments |
| AN-01 | Analysis | rejected | Warriors Focused On Building Team For After Stephen Curry Retires | Forward-looking roster analysis with named attribution |
| AN-02 | Analysis | rejected | Dunc'd On: LeBron James to Philly + Summer League Prospects: OKC, CHA, DET, TOR, SAS | Multi-topic podcast item with open questions and no supplied conclusions |

SG-03 and AN-02 were marked evidence-limited before model output was reviewed.

## Human Fact Baseline

### TR-01

- Required: DeMar DeRozan is drawing interest from Miami, Denver and Cleveland.
- Attribution: Shams Charania on NBA Today.
- Evidence also contains a $10 million partial guarantee from a $26.74 million Sacramento contract.
- Forbidden: any signing or confirmed destination.

### TR-02

- Required: Miami is focused on Klay Thompson but his departure from Dallas is unresolved.
- Evidence: $17.5 million remains in the final contract year; no buyout interest is known.
- Forbidden: Thompson joined Miami or Dallas agreed to a buyout.

### TR-03

- Required: Washington had no interest in trading Anthony Davis; Dallas had no interest in trading Kyrie Irving.
- Required: LeBron James and Rich Paul did not demand either trade.
- Certainty: Davis and Irving were only expected to begin the season with their current teams.
- Forbidden: either trade occurred or their future status is guaranteed.

### SG-01

- Required: Denver matched Oklahoma City's offer sheet and retained Spencer Jones.
- Required: two years and $12 million.
- Forbidden: Jones joined Oklahoma City.

### SG-02

- Required: Draymond Green was expected to re-sign with Golden State.
- Required: the expected figure was close to $28 million.
- Forbidden: completed signing or an exact finalized amount.

### SG-03

- Required: Houston signed Julian Phillips.
- Required: terms were not disclosed.
- Estimated only: one year and a $2.5 million veteran minimum.
- Forbidden: presenting estimated terms as confirmed.

### IN-01

- Speaker: Stephen Curry.
- Subject: LeBron James choosing Philadelphia rather than Golden State.
- Required context: Curry said injuries to Jimmy Butler and Moses Moody changed the Warriors' outlook.
- Forbidden: unattributed opinions or unreported transactions.

### AN-01

- Attribution: Tim Kawakami discussing Joe Lacob and the Warriors.
- Required: reported interest in building the post-Curry roster.
- Required qualification: Golden State was still considering short-term moves around Curry.
- Forbidden: Curry has announced retirement or the Warriors have stopped trying to contend.

### AN-02

- Attribution: Nate Duncan and Danny Leroux on Dunc'd On.
- Required: analysis of LeBron James joining Philadelphia and the Sixers' fit.
- Required: review of Summer League prospects from five teams.
- Forbidden: inventing answers to the episode's open questions or prospect conclusions absent from the RSS evidence.

## Qwen Output And Review

### TR-01

- Qwen title: `德玛尔·德罗赞受到热火、掘金、骑士关注`
- Qwen summary: `德玛尔·德罗赞目前是市场上最显著的自由球员，热火、掘金和骑士均对他表示兴趣。`
- oneLine: identical to title.
- Gate: accepted.
- Human: accept with minor edit.
- Notes: factually safe; “最显著的自由球员” has a clear machine-translation feel and useful attribution/context is omitted.

### TR-02

- Qwen title: `热火等待克莱·汤普森决定`
- Qwen summary: `热火正在等待克莱·汤普森的决定，同时考虑其他球员。`
- oneLine: identical to title.
- Gate: accepted.
- Human: accept with minor edit.
- Notes: safe but too shallow; Dallas, the unresolved buyout and $17.5 million context are missing.

### TR-03

- Qwen title: `奇才、独行侠无意交易戴维斯、欧文`
- Qwen summary: `据报道，詹姆斯未要求球队交易戴维斯或欧文，两人将留在奇才和独行侠。`
- oneLine: identical to title.
- Primary Qwen was rejected; JSON fallback was also rejected.
- Final reasons: `missing-key-facts`.
- Human: reject and rewrite.
- Zero-tolerance issue: “expected to start the season” became the definite “两人将留在”.
- Gate outcome was correct, but the reported reason did not identify the actual certainty error.

### SG-01

- Qwen title: `斯潘塞·琼斯加盟掘金`
- Qwen summary: `斯潘塞·琼斯与掘金签约2年1200万美元，掘金匹配雷霆报价。`
- oneLine: identical to title.
- Gate: accepted.
- Human: accept with minor edit.
- Notes: all required contract facts are present; “加盟掘金” is imprecise because Denver retained Jones by matching.

### SG-02

- Qwen title: `德雷蒙德·格林预计与勇士队续约2800 万美元`
- Qwen summary: `据称德雷蒙德·格林将与勇士队续约，合同金额约为2800 万美元。此前勇士队未能签下勒布朗·詹姆斯，现将重点转向续约格林。`
- oneLine: identical to title.
- Gate: accepted.
- Human: accept with minor edit.
- Notes: “预计/据称/约为” preserve uncertainty. Title spacing and exact-amount reading need a small edit.

### SG-03

- Qwen title: `Julian Phillips 与火箭签约`
- Qwen summary: `Julian Phillips 与火箭签约，据称签下一年合同，金额为 250 万美元。他此前曾效力公牛和森林狼。`
- oneLine: identical to title.
- Gate: accepted.
- Human: publish.
- Notes: confirmed signing and estimated terms are correctly distinguished.

### IN-01

- Qwen title: `斯蒂芬·库里谈勒布朗·詹姆斯决定`
- Qwen summary: `斯蒂�·库里谈到勒布朗·詹姆斯选择76人而非勇士，表示‘你不会在事情发生前设想任何事’。`
- oneLine: identical to title.
- Primary Qwen was rejected; JSON fallback was also rejected.
- Final reasons: `added-facts`, `missing-key-facts`, `category-conflict`.
- Human: reject and rewrite.
- Zero-tolerance issue: the speaker's name contains a replacement character and cannot be published.

### AN-01

- Qwen title: `勇士队聚焦库里的退役后球队建设`
- Qwen summary: `勇士队被曝将重点放在库里退役后的球队建设上，而非短期补强。资深记者蒂姆·卡瓦卡米透露，球队老板拉博布希望打造一支在库里之后仍能成功的队伍。`
- oneLine: identical to title.
- Primary Qwen was rejected; JSON fallback was also rejected.
- Final reasons: `missing-key-facts`, `analysis-as-fact`.
- Human: reject and rewrite.
- Zero-tolerance issues: the source meaning is reversed by “而非短期补强”; Joe Lacob's name is rendered incorrectly.

### AN-02

- Qwen title: `勒布朗·詹姆斯加盟76人`
- Qwen summary: `勒布朗·詹姆斯宣布加盟76人，他称这是夺冠的最佳机会。76人队目前阵容包括恩比德、泰瑞斯·马西、VJ·埃奇科姆和杰伦·布朗。`
- oneLine: identical to title.
- Primary Qwen was rejected; JSON fallback was also rejected.
- Final reason: `missing-key-facts`.
- Human: reject and rewrite.
- Notes: Qwen summarizes the underlying transaction instead of the podcast analysis and omits the Summer League review. The fallback added an unsupported sentence, but Gate rejected it.

## Overall Metrics

| Metric | Result | Target | Status |
|---|---:|---:|---|
| Qwen parseable output | 9/9, 100% | >=95% | Pass |
| Gate accepted | 5/9, 55.6% | Diagnostic | — |
| Human acceptable | 5/9, 55.6% | >=75% | Fail |
| Direct publish | 1/9, 11.1% | Diagnostic | — |
| Minor edit | 4/9, 44.4% | Diagnostic | — |
| Rewrite | 4/9, 44.4% | Diagnostic | — |
| Gate false positives | 0/9 | <=10% | Pass in sampled types |
| Gate false negatives | 0/9 | 0 preferred | Pass in sampled types |
| Serious fact/source errors | 2 | 0 | Fail |
| Rumor certainty errors | 1 | 0 | Fail |
| Key-entity accuracy | 7/9, 77.8% | 100% | Fail |
| Chinese naturalness | 3.44/5 | >=4/5 | Fail |
| Mean key-fact coverage | 72.2% | Diagnostic | — |
| oneLine exact-title repetition | 9/9, 100% | Low preferred | Fail |

Numeric handling:

- Eight explicit money/term facts were present across the selected source evidence.
- Five were retained in Qwen output: **62.5% retention**.
- All five rendered values were numerically correct: **100% value accuracy**.
- Omitted values were mostly background in rumor articles, but TR-02 lost useful contract context.

## Metrics By Type

| Type | N | Human acceptable | Publish | Rewrite | Naturalness | Fact coverage | Entity accuracy | Exact oneLine repeat |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Trade/rumor | 3 | 66.7% | 0% | 33.3% | 3.67 | 66.7% | 100% | 100% |
| Signing | 3 | 100% | 33.3% | 0% | 4.00 | 93.3% | 100% | 100% |
| Interview | 1 | 0% | 0% | 100% | 1.00 | 65.0% | 0% | 100% |
| Injury | 0 | Not evaluated | — | — | — | — | — | — |
| Game | 0 | Not evaluated | — | — | — | — | — | — |
| Analysis | 2 | 0% | 0% | 100% | 3.50 | 52.5% | 50% | 100% |

Signing is the only currently reliable type in this sample. Interview and analysis are below usable quality, although the small and incomplete sample prevents population-level claims.

## Gate Audit

### Decision-level false positives

None in the nine available samples. Every Gate-rejected item was also rejected by human review.

### Decision-level false negatives

None in the nine available samples. Every Gate-accepted item was judged publishable or safe with a minor edit.

### Reason-level false diagnostics

The final decision was correct, but diagnostics were unreliable in four rejected samples:

- TR-03: Chinese surnames “戴维斯/欧文” were reported as missing full player entities; the real editorial problem was certainty strengthening.
- IN-01: `You Don't Envision Anything` was parsed as a person, while Moses Moody was reported as an added player despite appearing in the source.
- AN-01: Chinese “库里” did not satisfy the required `Stephen Curry` entity.
- AN-02: `Summer League Prospects` was parsed as a player entity.

These are not counted as Gate false positives because the corresponding copy had independent human-rejection reasons.

## AI Requests And Usage

- Rejected dry-run samples: 6.
- Primary Qwen requests: 6.
- JSON fallback requests after Qwen rejection: 4.
- Total observed AI requests: 10.
- Average observed requests per rejected dry-run: 1.67.
- Qwen retries caused by empty content, length stop or invalid JSON: 0.
- Stored accepted records do not retain original request counts.
- Token and neuron usage are not exposed by the current debug result and were not estimated.
- No second AI pass was performed after sample replacement; previous `persisted=false` results were reused locally.

## Representative Good Case

SG-03 is the strongest result. It clearly states the confirmed Rockets signing while keeping the reported one-year, $2.5 million terms uncertain. It is concise, readable and factually disciplined.

SG-01 also demonstrates that the single-stage model can preserve contract length, amount and offer-sheet direction in one sentence, although the title needs a small transaction-language correction.

## Representative Failures

- TR-03: a reported expectation became a definite future outcome.
- IN-01: a key player name was corrupted at the character level.
- AN-01: the summary reversed a source qualification and mistranslated Joe Lacob's name.
- AN-02: the model summarized the news event rather than the analysis article; the fallback then invented an unsupported sentence, which Gate blocked.

## Final Assessment

The single-stage system has reached **JSON and workflow stability**, but not a reusable editorial-quality baseline:

1. Signing copy is generally safe and information-rich.
2. Rumor copy can still strengthen uncertain outcomes.
3. Interview copy can fail on basic entity rendering.
4. Analysis copy can lose attribution, reverse qualifications, or summarize the underlying event instead of the article.
5. `oneLineZh` is currently a title alias rather than an independent editorial field.
6. Gate decisions were safe in this limited set, but reason-level entity diagnostics remain noisy.
7. Injury and game behavior remains unknown.

**Conclusion: No-Go.** Remain in Phase 0.5 until the zero-tolerance failures are resolved and a later frozen sample includes injury and game stories. Do not begin Phase 1 automatically.

# Phase 1 Two-Stage Frozen-Sample Evaluation

> **Partial baseline: 9/18 frozen samples. Injury and game samples are absent, so this is not a complete six-category evaluation.**

## Decision

- **Phase 1 implementation:** Complete behind an inactive mode switch.
- **Frozen-sample threshold:** Fail.
- **Production canary:** Not enabled.
- **Production deployment:** Not performed.
- **Current production path:** Existing single-stage pipeline remains unchanged.

The two-stage control flow works as designed, but the current Qwen fact extraction output is not stable enough for a production canary. Only one of nine frozen samples reached Stage 2, and no sample passed the final Gate. The implementation therefore remains available only behind `EDITORIAL_PIPELINE_MODE`, whose committed default is `single`.

## Versions And Modes

- Pipeline: `editorial-pipeline-v5-two-stage`
- Fact extraction: `fact-v1-qwen3`
- Editorial generation: `editorial-v1-qwen3`
- Modes:
  - `single`: current production behavior
  - `phase1-canary`: at most one new pending item
  - `phase1`: explicit full Phase 1 processing

Invalid or missing mode values resolve to `single`. Phase 1 uses Qwen for both stages and never invokes the Llama JSON fallback. Each stage retries once only after a structural response failure.

## Safety And Scope

- The same nine frozen `newsId` values and unchanged Phase 0.5 evidence were used.
- Every evaluation request used `POST /debug/reprocess` with `dryRun: true`.
- Accepted records were evaluated only through the explicit debug-only `evaluateAccepted` path.
- Production KV writes: **0**.
- No accepted record was migrated, requeued, overwritten, or persisted.
- The public `news.json` contract and KV keys were not changed.
- Full article evidence and the debug token remain only in ignored local material.
- Llama fallback calls: **0**.

## Aggregate Results

| Metric | Result |
|---|---:|
| Frozen samples | 9 |
| Fact JSON parsed | 6/9 (66.7%) |
| Fact JSON validated | 1/9 (11.1%) |
| Stage 2 skipped | 8/9 |
| Editorial JSON parsed | 1/1 |
| Final accepted | 0/9 |
| Total AI requests | 14 |
| Stage 1 requests | 13 |
| Stage 2 requests | 1 |
| Average requests per sample | 1.56 |
| Llama fallback calls | 0 |
| Production writes | 0 |

The Stage 1 Gate prevented uncertain, unsupported, or structurally invalid fact objects from reaching Chinese generation. This is the intended safety behavior, but the extraction pass rate is too low for canary use.

## Frozen Sample Results

| ID | Type | Requests | Last stage | Decision | Main reasons |
|---|---|---:|---|---|---|
| TR-01 | trade rumor | 1 | fact validation | rejected | certainty, evidence, attribution |
| TR-02 | trade rumor | 1 | fact validation | rejected | certainty, evidence |
| TR-03 | trade rumor | 2 | fact extraction | rejected | request/structure failure |
| SG-01 | signing | 2 | final Gate | rejected | missing verified facts |
| SG-02 | signing | 1 | fact validation | rejected | certainty |
| SG-03 | signing | 2 | fact validation | rejected | certainty, evidence |
| IN-01 | interview | 2 | fact extraction | rejected | invalid JSON |
| AN-01 | analysis | 1 | fact validation | rejected | certainty, entity, evidence |
| AN-02 | analysis | 2 | fact extraction | rejected | invalid JSON |

## Stage 1 Findings

1. **Certainty enums were unstable.** Five parsed samples used a stronger or different certainty level than the deterministic evidence inference allowed. Reported interest, expectation, and analysis were common failure points.
2. **Evidence snippets were not consistently exact or sufficient.** Several claims used partial snippets that did not support every entity or number in the structured claim.
3. **Attribution was incomplete.** TR-01 contained reported claims whose attribution was absent.
4. **Structural reliability was below target.** Three samples still failed to yield usable Fact JSON after the permitted retry.
5. **Entity matching exposed a deterministic edge case.** AN-01 emitted `Joe Lacob`, while the source wording did not contain that exact contiguous form. The conservative validator rejected it.

No Stage 1 failure was hidden by fallback or converted into an accepted Chinese draft.

## Stage 2 Finding

Only SG-01 reached Stage 2. Qwen produced:

- Title: `掘金匹配雷霆报价，签下斯潘塞·琼斯`
- Summary: `掘金匹配了斯潘塞·琼斯与雷霆签下的两年1200万美元的报价合同，将保留这位上赛季重要轮换球员。`
- One line: `掘金匹配雷霆报价，成功签下斯潘塞·琼斯。`

The draft retained the two-year, $12 million core transaction, and the one-line field did not exactly copy the title. The final Gate rejected it because the legacy evidence checker:

- treated `Oklahoma City` and `Taxpayer MLE` as player-like facts; and
- required the short editorial summary to repeat secondary salary-cap amounts.

This is a Gate false positive, not permission to relax the Gate during this evaluation. The sample remains rejected.

## Phase 0.6 Comparison

| Metric | Phase 0.6 single stage | Phase 1 frozen run |
|---|---:|---:|
| Human-acceptable output | 5/9 | 0/9 reached accepted output |
| Directly publishable output | 1/9 | 0/9 |
| AI requests | 6 for six rejected dry-runs | 14 for nine two-stage dry-runs |
| Llama fallback calls | 0 | 0 |
| oneLine exact-title repetition | 9/9 | 0/1 generated draft |
| Severe facts reaching accepted output | blocked after prerequisite Gate | 0; no output accepted |
| Gate leaks | 0 | 0 |

Phase 1 saves Stage 2 requests when Fact JSON is unsafe: eight editorial calls were skipped. That cost control is useful. It does not compensate for the current 11.1% fact-validation rate.

## Canary Threshold

| Requirement | Result |
|---|---|
| Severe fact errors: 0 | No accepted leak, but extraction quality is unstable |
| Certainty errors: 0 | Fail; five fact-validation mismatches |
| Negation errors: 0 | Pass in observed outputs |
| Number/entity accuracy: 100% | Not demonstrated |
| Gate leaks: 0 | Pass |
| Human acceptable: at least 7/9 | Fail; 0/9 accepted |
| Average naturalness: at least 4/5 | Not cohort-scorable; one generated draft was approximately 4/5 |
| oneLine exact-title repetition: 0 | Pass for the only generated draft |
| Llama fallback: 0 | Pass |

## Final Assessment

The architectural separation is implemented and safety-oriented:

```text
English evidence
-> Qwen Fact JSON
-> deterministic fact validation
-> Qwen Chinese editorial JSON
-> existing Quality Gate plus Fact JSON checks
-> accepted or rejected
```

The frozen threshold nevertheless fails decisively. `phase1-canary` and `phase1` must remain disabled in production. The next approved task should focus narrowly on the Stage 1 contract and model conformance, then rerun the same frozen samples. It must not bypass exact evidence, certainty, attribution, or final editorial checks to raise the acceptance rate.

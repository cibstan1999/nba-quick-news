# Phase 0.6 Safety Retest

> **部分基线：仅 9/18 条样本，缺少 injury 和 game 类型，不代表完整六分类评估。**

## Decisions

- **Phase 0.6 engineering fix: Pass**
- **Single-stage Qwen3 content quality: No-Go**

Phase 0.6 achieved its scoped safety goals: a parsed Qwen candidate is no longer rewritten by Llama after a Gate rejection, invalid Unicode receives a deterministic hard-rejection reason, Joe Lacob has an evidence-scoped display-name normalization, and the tested editorial phrases no longer become player entities.

The single-stage content decision remains No-Go. Qwen primary still strengthened an expected status into a definite outcome in TR-03 and reversed a source qualification in AN-01. The current certainty Gate did not reject TR-03, so the content pipeline is not yet safe enough to treat accepted status as equivalent to editor approval.

## Safety And Scope

- The same nine frozen `newsId` values and unchanged human fact baselines from Phase 0.5 were used.
- Three previously accepted records were read and revalidated without an AI call.
- Six rejected records were processed through `POST /debug/reprocess`.
- Every request used `dryRun: true` and every response returned `persisted: false`.
- Production KV writes: 0.
- Qwen primary Prompt, model, KV schema, public `news.json`, retry cooldown, frontend, oneLine behavior and `pipelineVersion` were unchanged.
- Full Jina evidence remains only in the ignored local results file.

## Before And After

| Metric | Phase 0.5 | Phase 0.6 |
|---|---:|---:|
| Gate-rejection fallback calls | 4 | 0 |
| AI requests across six rejected dry-runs | 10 | 6 |
| Average requests per rejected dry-run | 1.67 | 1.00 |
| Qwen primary serious fact/source errors | 2 | 2 |
| Rumor or prediction certainty errors | 1 | 1 |
| Raw model entity accuracy | 7/9 | 7/9 |
| Entity accuracy after deterministic normalization | 7/9 | 8/9 |
| Raw Unicode-damaged drafts | 1 | 1 |
| Unicode-damaged drafts accepted | 0 | 0 |
| False editorial person entities in final diagnostics | 2 | 0 |
| Decision-level Gate false positives | 0 | 0 |
| Decision-level Gate false negatives | 0 | 1 |
| Reason-level Gate errors | 4 | 2 |
| Human-acceptable output | 5/9 | 5/9 |
| Directly publishable output | 1/9 | 1/9 |
| Average Chinese naturalness | 3.44/5 | 3.56/5 |
| oneLine exactly repeats title | 9/9 | 9/9 |

The new Gate false negative is not a regression caused by removing fallback. TR-03 already contained the same certainty error in Phase 0.5, but an unrelated false missing-entity diagnostic happened to reject it. Once that false entity requirement disappeared, the pre-existing certainty weakness became visible.

## Frozen Sample Results

| ID | Stage reviewed | Gate | Human | Key result |
|---|---|---|---|---|
| TR-01 | Qwen primary | accepted | accept, minor edit | Accurate three-team interest report; attribution and contract context omitted |
| TR-02 | stored Qwen primary | accepted | accept, minor edit | Safe but omits Dallas, buyout uncertainty and $17.5M context |
| TR-03 | Qwen primary | accepted | reject, rewrite | “Expected to start the season” again became the definite “will remain” |
| SG-01 | Qwen primary | accepted | accept, minor edit | Years, amount and offer-sheet match preserved; title transaction verb remains imprecise |
| SG-02 | stored Qwen primary | accepted | accept, minor edit | Expected status and approximate $28M amount preserved |
| SG-03 | stored Qwen primary | accepted | publish | Confirmed signing and reported estimate correctly separated |
| IN-01 | Qwen primary | rejected | reject, rewrite | U+FFFD caught with `unicode-replacement-character`; fallback not invoked |
| AN-01 | Qwen primary | rejected | reject, rewrite | Source qualification still reversed; Joe Lacob is normalized only in the validated value |
| AN-02 | Qwen primary | rejected | reject, rewrite | Still treats a podcast analysis as a transaction brief; no fallback fabrication remains |

## Phase 0.6 Engineering Checks

### Fallback

All six dry-run Qwen responses were parseable on the first request. Each result stayed at `stage: qwen-primary`, used one request, and had no fallback stage. Unit coverage separately confirms that empty, length-stopped, invalid, schema-incomplete and request-error responses may still use structural fallback after the permitted retry path.

### Unicode

IN-01 again contained U+FFFD in Stephen Curry's name. The final reasons included:

```text
unicode-replacement-character
unsafe-summary
category-conflict
```

The damaged draft was rejected without fallback. Deterministic tests also cover title, summary, tags, category, optional oneLine, lone high/low surrogates, valid Chinese and emoji.

### Person Names

Joe Lacob is represented in a non-player display-name layer. The known bad output is normalized to `乔·拉科布` only when the English evidence contains `Joe Lacob`; unrelated `拉博布` text is not globally rewritten. `Joe Lacob` is not emitted as a player fact.

### False Entities

`Summer League Prospects`, `You Don't Envision Anything`, `Until It Happens`, `Final Score`, `Key Takeaways`, `Trade Analysis`, `Injury Report` and `Free Agency Rumors` no longer become people. Unknown plausible names, `Jr.`, `III` and hyphenated names remain supported.

## Remaining Gate Problems

1. TR-03 shows a true false negative: the presence of `据报道` currently satisfies the rumor-language check even though a later clause upgrades an expectation to a definite future outcome.
2. AN-01 still reports `Stephen Curry` as missing when the Chinese copy uses only `库里`. This is a reason-level alias problem, but the article also has an independent human-rejection reason.

These issues were intentionally not fixed in Phase 0.6 because the approved scope prohibited changing the certainty Gate, Prompt or broader entity semantics.

## Final Assessment

### A. Phase 0.6 Engineering Fix: Pass

The unsafe semantic fallback path is gone, structural fallback remains covered, invalid Unicode is deterministically blocked, the Joe Lacob mapping is evidence-scoped, and the targeted false entities are removed without disabling unknown-person recognition.

### B. Single-Stage Content Quality: No-Go

Human acceptance remains 55.6%, direct publication remains 11.1%, and two serious Qwen primary meaning errors remain. Most importantly, one certainty-strengthening error now passes the Gate.

The next safe task should first close the narrow certainty-Gate false negative and the `库里` alias diagnostic with deterministic tests. Prompt experimentation alone may improve style, but source-meaning reversal and certainty preservation are stronger candidates for the planned Phase 1 separation between fact extraction and Chinese editorial generation. This report does not authorize Phase 1.

# Phase 1 Prerequisite Safety Patch Retest

> **部分基线：仅使用原冻结 9/18 条样本，缺少 injury 和 game 类型，不代表完整六分类评估。**

## Scope

- Production commit: `caa9904`
- Worker version: `936ffc79-5706-4233-b092-b11f61de26e8`
- Model and Prompt: unchanged
- Pipeline version: unchanged (`editorial-pipeline-v4`)
- Frozen sample IDs and human fact baselines: unchanged
- Rejected samples used `POST /debug/reprocess` with `dryRun: true`
- Production KV writes: 0

## Safety Results

| Check | Before | After |
|---|---:|---:|
| Gate-rejection fallback calls | 0 | 0 |
| AI requests across six rejected samples | 6 | 6 |
| Gate false negatives | 1 | 0 |
| Stephen Curry false missing-entity diagnostics | 1 | 0 |
| Persisted debug responses | 0 | 0 |
| oneLine equal to title | 9/9 | 9/9 |

The accepted sample count remained 5/9. This patch was intended to improve
Gate correctness, not model output or acceptance rate.

## Frozen Sample Decisions

| ID | Gate | Human review | Key result |
|---|---|---|---|
| TR-01 | accepted | accept, minor edit | Interest remains uncertain; no destination is claimed |
| TR-02 | accepted | accept, minor edit | Stored result remains conservative but shallow |
| TR-03 | rejected | reject, rewrite | `expected` status was again changed to definite wording; Gate now adds `certainty-escalation` |
| SG-01 | accepted | accept, minor edit | Contract years, amount and offer-sheet match are present |
| SG-02 | accepted | accept, minor edit | Stored result preserves reported status and approximate amount |
| SG-03 | accepted | publish | Stored confirmed signing remains safe |
| IN-01 | rejected | accept, minor edit | Current Qwen copy is factually usable, but an unrelated possessive-name/category diagnostic rejects it |
| AN-01 | rejected | reject, rewrite | `库里` now satisfies Stephen Curry; the source qualification is still distorted and the analysis Gate rejects it |
| AN-02 | rejected | reject, rewrite | Copy omits the podcast-analysis and prospect-review framing; category conflict still blocks it |

## Required Regression Outcomes

### Certainty

The frozen TR-03 output included:

```text
戴维斯和欧文将留在奇才和独行侠
```

The source only says their opening-season status is expected. The result now
receives:

```text
certainty-escalation
source-expected:stay->output-definite:stay
```

The previous Gate false negative is closed. Unit tests additionally cover
`could`, `may`, `likely to`, `interested in`, `considering`, `exploring`,
`leaning toward`, `reportedly`, `not expected to`, `no indication`, and
`has not decided`, plus confirmed signing and completed-trade controls.

### Person Alias

`Stephen Curry`, `Steph Curry`, `斯蒂芬·库里`, and evidence-disambiguated
`库里` resolve to `stephen-curry`. `Seth Curry` and `Dell Curry` remain
separate canonical entities. Ambiguous evidence containing more than one
Curry does not resolve the short name.

AN-01 no longer reports `player:stephen-curry` as missing when its Chinese
copy uses only `库里`.

### Remaining Unsafe Model Output

AN-01 still changes the source's balance between short-term contention and
post-Curry planning. It remains rejected with:

```text
analysis-as-fact
analysis-presented-as-fact
```

The patch therefore improves Gate safety without presenting Qwen's semantic
distortion as acceptable.

## Conclusion

- Phase 1 prerequisite safety patch: **Pass**
- Single-stage content quality: **No-Go**

The certainty leak identified in Phase 0.6 is closed, and the Curry alias
false missing-entity reason is removed. The remaining content failures are
model-understanding problems rather than reasons to continue expanding the
single-stage pipeline.

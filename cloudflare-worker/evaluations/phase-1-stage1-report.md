# Phase 1 Stage 1 Simplification Evaluation

> **Partial frozen baseline: 9/18 samples. Injury and game samples are absent. This is a Stage 1-only dry-run and does not evaluate Stage 2 quality.**

## Decision

- Stage 1 JSON parse target (`>= 8/9`): **met, 8/9**
- Stage 1 validation target (`>= 7/9`): **not met, 2/9**
- Severe unsupported fact in a generated candidate: **1, rejected by the Gate**
- Llama fallback calls: **0**
- Stage 2 calls: **0**
- Production KV writes: **0**
- Ready for Stage 2 integration: **No**

The simplified schema materially improved structural reliability, but Qwen still selected the wrong evidence field, assigned stronger or incorrect certainty, misused polarity, and omitted required attribution. The factual Gate correctly stopped these candidates. No further Stage 1 tuning or Stage 2 work was performed after this failed threshold.

## Schema Change

Before (`fact-v1-qwen3`):

```json
{
  "storyType": "rumor",
  "sourceCertainty": "possible",
  "attribution": [],
  "entities": [],
  "numbers": [],
  "claims": [
    {
      "subject": "",
      "predicate": "",
      "object": "",
      "polarity": "positive",
      "certainty": "possible",
      "attribution": "",
      "evidence": []
    }
  ],
  "mustNotClaim": []
}
```

After (`fact-v2-qwen3-simple`):

```json
{
  "storyType": "trade_rumor",
  "facts": [
    {
      "id": "fact-1",
      "factText": "English normalized factual statement",
      "certainty": "confirmed",
      "polarity": "positive",
      "attribution": "",
      "sourceField": "title",
      "evidenceQuote": "exact short quote copied from the source field"
    }
  ],
  "mustNotClaim": []
}
```

The new contract removes article-level certainty, entity/number duplication, and subject/predicate/object claims. Certainty is attached to each fact. Evidence validation uses normalized, case-insensitive substring matching against the declared source field. Numbers and entities remain strict.

## Aggregate Results

| Metric | Result |
|---|---:|
| Frozen samples | 9 |
| First-attempt JSON parsed | 8/9 |
| Retry recovered JSON | 0/1 |
| Final JSON parsed | 8/9 |
| Stage 1 validated | 2/9 |
| Stage 1 requests | 10 |
| Average Stage 1 requests | 1.11 |
| Stage 2 requests | 0 |
| Llama fallback calls | 0 |
| Production writes | 0 |
| Facts with certainty mismatch | 7 across 4 samples |
| Evidence quotes not found | 3 |
| Missing attributions | 5 |
| Number mismatches | 0 |
| Entity mismatches | 1 |
| Polarity/negation mismatches | 1 |

## Frozen Sample Results

| ID | Type | Requests | Parsed | Validated | Failure attribution |
|---|---|---:|---|---|---|
| TR-01 | trade rumor | 2 | No | No | Both Qwen responses remained invalid JSON after the allowed retry. |
| TR-02 | trade rumor | 1 | Yes | No | Interest in Klay Thompson was labeled `reported`; the quoted evidence supports `possible`. |
| TR-03 | trade rumor | 1 | Yes | Yes | Exact evidence, negative trade-interest wording, and expected season-start status were preserved. |
| SG-01 | signing | 1 | Yes | No | Qwen used negative polarity for a salary-cap consequence without grammatical negation. |
| SG-02 | signing | 1 | Yes | Yes | The expected re-signing language and the `$28 million` figure were preserved. |
| SG-03 | signing | 1 | Yes | No | A sentence from the RSS summary was incorrectly declared as title evidence. |
| IN-01 | interview | 1 | Yes | No | One unsupported event was added, three opinion statements were labeled `reported`, speaker attribution was empty, and one player entity was not supported by the selected evidence. |
| AN-01 | analysis | 1 | Yes | No | One quote was not found, two possible/analytical statements were labeled `reported`, and one analytical claim lacked attribution. |
| AN-02 | analysis | 1 | Yes | No | A speaker statement was labeled `reported` instead of `opinion` and had no attribution. |

## Safety Findings

- Exact evidence matching caught the unsupported IN-01 statement rather than allowing it into Stage 2.
- The validator preserved `expected`, `likely`, `possible`, and `opinion` distinctions; it did not collapse them into `confirmed`.
- No amount, contract year, score, or trade asset mismatch was observed in this partial cohort.
- No rejected Stage 1 result invoked Llama or another rewriting fallback.
- All requests used the debug reprocess path with `dryRun: true`; Stage 2 was explicitly disabled.
- The ignored local results contain only the frozen evaluation material and are not part of this report.

## Threshold Assessment

Structural simplification succeeded, improving final parseability from `6/9` to `8/9` and reducing Stage 1 requests from `13` to `10`. Validation improved only from `1/9` to `2/9`, far below the required `7/9`.

The remaining failures are not a Stage 2 problem. They occur before Chinese generation and include one unsupported event, seven certainty mismatches, five missing attributions, three source-field/evidence mismatches, and one polarity error. Stage 2 integration must remain paused.

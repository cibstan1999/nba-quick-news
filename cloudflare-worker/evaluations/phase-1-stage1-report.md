# Phase 1 Evidence-First Stage 1 Evaluation

> **Partial frozen baseline: 9/18 samples. Injury and game samples are absent. This is a Stage 1-only dry-run and does not evaluate Stage 2 quality.**

## Decision

- Final JSON parse target (`>= 8/9`): **met, 9/9**
- Evidence location target (`>= 8/9`): **met, 9/9**
- Stage 1 validation target (`>= 7/9`): **met, 9/9**
- Certainty escalation: **0**
- Negation loss: **0**
- Unsupported events: **0**
- Number or entity mismatches: **0**
- Llama fallback calls: **0**
- Stage 2 calls: **0**
- Production KV writes: **0**
- Ready for Stage 2 integration: **Yes**

The AI now selects exact source excerpts only. Deterministic code locates each quote and derives story type, certainty, polarity, attribution, entities, numbers, and `mustNotClaim`. No Stage 2 code or prompt was changed.

## AI Schema

```json
{
  "evidenceItems": [
    {
      "id": "evidence-1",
      "evidenceQuote": "exact English substring copied from the supplied source",
      "attributionName": "",
      "attributionQuote": ""
    }
  ]
}
```

`attributionName` and `attributionQuote` normalize to empty strings when the model omits these optional values. Extra model-owned labels such as `sourceField`, `certainty`, and `polarity` remain schema errors.

## Deterministic Fact Generation

- Source location checks `originalTitle`, RSS summary, then article text.
- Matching is limited to Unicode normalization, smart quote and dash normalization, whitespace folding, and case-insensitive substring comparison.
- `certainty` comes from the verified quote: `confirmed`, `expected`, `likely`, `possible`, `interest`, or `opinion`.
- `polarity` comes from explicit English negation.
- `reported` identifies attribution and does not override interest or possibility.
- Interview and analysis records require at least one verified attribution.
- Attribution can come from the model's exact pair, an exact `NAME said` structure, an interview title, an identified program title, or an explicit report cue plus source metadata.
- Bare `per game` is not treated as an attribution cue.
- Entities and numbers are extracted only from verified evidence and its located source field.
- `mustNotClaim` is generated from verified modality and negation.

## Aggregate Results

The remote dry-run produced 8/9 first-attempt parses. TR-01 required the existing single Qwen retry and then parsed, producing 9/9 final parseability. The same nine extracted evidence payloads were revalidated locally after the final deterministic attribution consistency fix.

| Metric | Result |
|---|---:|
| Frozen samples | 9 |
| First-attempt JSON parsed | 8/9 |
| Retry recovered JSON | 1/1 |
| Final JSON parsed | 9/9 |
| Evidence located | 9/9 |
| Stage 1 validated | 9/9 |
| Stage 1 requests | 10 |
| Average Stage 1 requests | 1.11 |
| Stage 2 requests | 0 |
| Llama fallback calls | 0 |
| Production writes | 0 |
| Certainty mismatches | 0 |
| Polarity mismatches | 0 |
| Attribution mismatches after final revalidation | 0 |
| Unsupported events | 0 |
| Number mismatches | 0 |
| Entity mismatches | 0 |

## Frozen Sample Results

| ID | Type | Requests | Final parse | Evidence | Final validation | Notes |
|---|---|---:|---|---|---|---|
| TR-01 | trade rumor | 2 | Pass | Pass | Pass | Retry recovered valid evidence; interest remained non-confirmed. |
| TR-02 | trade rumor | 1 | Pass | Pass | Pass | Klay Thompson interest and uncertainty were derived by code. |
| TR-03 | trade rumor | 1 | Pass | Pass | Pass | Negative trade interest and expected status were preserved. |
| SG-01 | signing | 1 | Pass | Pass | Pass | Offer-sheet years, money, and cap facts remained exact. |
| SG-02 | signing | 1 | Pass | Pass | Pass | Expected re-signing and `$28 million` remained non-confirmed. |
| SG-03 | signing | 1 | Pass | Pass | Pass | RSS evidence was auto-located; `per game` no longer caused false attribution. |
| IN-01 | interview | 1 | Pass | Pass | Pass | Stephen Curry attribution came from the exact interview title. |
| AN-01 | analysis | 1 | Pass | Pass | Pass | The explicit `reportedly` item supplies verified RealGM attribution. |
| AN-02 | analysis | 1 | Pass | Pass | Pass | `Dunc'd On:` supplies verified program attribution; questions remain opinion. |

## Safety Notes

- No semantic paraphrase was accepted as evidence.
- Missing or invalid attribution quotes still fail.
- Analysis or interview records with no verified attribution still fail.
- Unsupported model events cannot form internal Facts.
- The Qwen retry remains structural only; there is no Llama fallback in Phase 1.
- The Stage 1-only endpoint returned `pending` after successful validation and never invoked Stage 2.
- The local result file remains ignored and is not committed.

## Threshold Assessment

Evidence-first extraction meets the minimum condition for Stage 2 integration on this partial frozen cohort. This is not a production readiness decision and does not measure Chinese editorial quality. The next task may integrate the existing Stage 2 against these verified Facts, using the same frozen samples and without weakening the Fact Gate.

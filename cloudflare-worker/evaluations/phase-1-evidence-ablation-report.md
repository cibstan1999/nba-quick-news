# Phase 1 Stage 1 Evidence Ablation

> Partial baseline: 9/18 frozen samples. Injury and game are not represented, so this is not a complete six-category production evaluation.

## Question

Does Qwen optional-evidence selection add enough editorial value after deterministic code has already selected mandatory evidence?

The experiment compared:

- **A, mandatory-only:** deterministic inventory and manifest, mandatory facts, deterministic composer, current quality Gate. No AI request.
- **B, qwen-optional:** the same pipeline plus one Qwen request that may select only optional evidence IDs. No retry, Llama fallback, constrained polish, or KV write.

## Result

**Decision: Mandatory Manifest Not Ready**

Mandatory-only did not meet the safety/usefulness prerequisite for judging whether Stage 1 AI can be removed. Qwen returned an empty optional selection for all nine samples, so B produced exactly the same drafts as A while using nine additional AI requests.

## Aggregate Metrics

| Metric | Mandatory-only | Qwen-optional |
| --- | ---: | ---: |
| Evidence Inventory success | 9/9 | 9/9 |
| Mandatory anchors covered | 214/229 (93.4%) | 214/229 (93.4%) |
| Required facts covered | 74/79 (93.7%) | 74/79 (93.7%) |
| Required attributions covered | 11/11 (100%) | 11/11 (100%) |
| Required numbers covered | 42/42 (100%) | 42/42 (100%) |
| Gate accepted | 0/9 | 0/9 |
| Human accepted | 0/9 | 0/9 |
| Publish without editing | 0/9 | 0/9 |
| Rewrite required | 9/9 | 9/9 |
| Average Chinese naturalness | 1.44/5 | 1.44/5 |
| Severe fact errors | 0 | 0 |
| Certainty errors | 0 | 0 |
| Negation errors | 0 | 0 |
| Low-value oneLine duplicates | 2 | 2 |
| Average generated facts | 6.78 | 6.78 |
| Stage 1 AI requests | 0 | 9 |

Qwen optional-selection results:

- Successful JSON selections: 9/9
- Empty selections: 9/9
- Selected optional evidence IDs: 0
- Fallbacks: 0
- Samples improved: 0
- Samples with no editorial value added: 9
- Samples made worse: 0
- Llama calls: 0
- Production KV writes: 0

## Sample Results

Because every Qwen selection was empty, the A and B outputs were identical for every sample.

| Sample | Mandatory / optional evidence | Composer result | Gate / human result |
| --- | --- | --- | --- |
| TR-01 | 5 / 2 | Repeats the DeMar DeRozan interest report and forces unrelated LeBron background into the summary. | Gate rejected; rewrite |
| TR-02 | 5 / 6 | Preserves the Klay Thompson rumor and $17.5M, but forces secondary roster context into a vague closing sentence. | Gate rejected; rewrite |
| TR-03 | 3 / 4 | Composer cannot produce a non-duplicative oneLine from the mandatory plan. | Gate rejected; rewrite |
| SG-01 | 5 / 2 | Repeats the offer-sheet fact, emits an undefined slot, and duplicates the oneLine. | Gate rejected; rewrite |
| SG-02 | 6 / 1 | Preserves the expected $28M extension, but mandatory background creates vague filler and an undefined attribution. | Gate rejected; rewrite |
| SG-03 | 3 / 3 | Renders an internal source marker as visible copy and repeats a low-information oneLine. | Gate rejected; rewrite |
| IN-01 | 7 / 10 | Too many mandatory fragments create repeated vague opinion sentences and an English possessive fragment. | Gate rejected; rewrite |
| AN-01 | 10 / 0 | Nearly every analysis sentence is mandatory, producing a long draft with malformed source labels. | Gate rejected; rewrite |
| AN-02 | 17 / 0 | The full multi-topic program description is mandatory and overwhelms the intended LeBron/76ers analysis. | Gate rejected; rewrite |

## Manifest Gaps

The failure is upstream of Qwen optional selection:

1. Summary evidence sharing title entities is promoted too aggressively, including repeated restatements and unrelated background.
2. Analysis and opinion records promote too many source/attribution and relation anchors, making nearly the entire source summary mandatory.
3. Every detected number in mandatory evidence becomes a required output number, including background statistics that are not central to the story.
4. Title evidence and a more precise summary sentence can both become required facts, forcing duplicate statements into the composer.
5. Internal source markers and weak generic relations can become facts even when they have no publishable Chinese realization.
6. Over-complete manifests can leave the composer with no distinct fact for oneLine, while still missing a small number of anchors in actual output.

These findings do not justify weakening coverage validation. The next integration step should refine how the deterministic Manifest distinguishes core, explanatory, duplicate, and background evidence before reconsidering Stage 1 AI.

## Cost Comparison

- Mandatory-only: 0 AI requests.
- Qwen-optional: 9 AI requests, one per sample.
- Net editorial improvement: 0 samples.

The optional selector degraded safely to mandatory-only in design tests, but the real run shows no benefit on this partial baseline.

## Reproducibility And Safety

- The same nine frozen inputs and human baselines were used.
- Qwen could return only `selectedOptionalEvidenceIds`.
- Unknown IDs, mandatory IDs, duplicates, invalid JSON, and request errors are handled deterministically.
- The local evaluation Worker has no KV binding.
- Checkpoints, raw results, and human score files use `*.local.json` and remain ignored.
- No constrained polish, Stage 1 retry, Llama fallback, deployment, or production KV write occurred.

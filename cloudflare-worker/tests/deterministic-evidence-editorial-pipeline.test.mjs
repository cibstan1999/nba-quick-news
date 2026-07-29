import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  DETERMINISTIC_EDITORIAL_PIPELINE,
  runDeterministicEvidenceEditorialPipeline
} from '../src/deterministic-evidence-editorial-pipeline.js';

const baseline = JSON.parse(
  fs.readFileSync(
    new URL('../evaluations/phase-0.5-baseline.json', import.meta.url),
    'utf8'
  )
);

test('deterministic editorial candidate path processes all frozen samples without Stage 1 AI', async () => {
  for (const sample of baseline.samples) {
    const result = await runDeterministicEvidenceEditorialPipeline({
      record: sample,
      articleText: sample.articleTextUsed || '',
      storyType: sample.testType,
      enablePolish: false
    });

    assert.equal(result.ok, true, `${sample.sampleId}:${result.failureStage}`);
    assert.equal(result.pipeline, DETERMINISTIC_EDITORIAL_PIPELINE);
    assert.equal(result.legacyStage1Used, false);
    assert.equal(result.optionalEvidenceSelectionUsed, false);
    assert.equal(result.counters.stage1AiRequests, 0);
    assert.equal(result.counters.polishAiRequests, 0);
    assert.equal(result.counters.llamaRequests, 0);
    assert.equal(result.counters.productionWrites, 0);
    assert.equal(result.statuses.evidenceInventoryStatus.status, 'success');
    assert.equal(result.statuses.minimumEvidenceCoverStatus.status, 'success');
    assert.equal(result.statuses.deterministicFactStatus.status, 'success');
    assert.equal(result.statuses.composerStatus.status, 'success');
    assert.equal(result.statuses.polishStatus.status, 'skipped');
    assert.equal(result.statuses.finalGateStatus.status, 'accepted');
    assert.equal(result.publicationDecision, 'review_required');
    assert.equal(result.coverage.ok, true);
    assert.equal(result.composerGate.ok, true);
  }
});

test('IN-01 deterministic path covers both the player decision and injury outlook', async () => {
  const sample = baseline.samples.find((entry) => entry.sampleId === 'IN-01');
  const result = await runDeterministicEvidenceEditorialPipeline({
    record: sample,
    storyType: sample.testType,
    enablePolish: false
  });

  assert.equal(result.ok, true);
  assert.match(
    result.final.summaryZh,
    /斯蒂芬·库里谈到勒布朗·詹姆斯加盟 76 人而非勇士一事/
  );
  assert.match(
    result.final.summaryZh,
    /吉米·巴特勒等人的伤病是影响勇士前景的重要因素/
  );
  assert.match(
    result.final.oneLineZh,
    /伤病是影响勇士前景的重要因素/
  );
  assert.deepEqual(
    result.final.usedFactIds.summary,
    result.factPlan.summaryFactIds
  );
});

test('constrained polish is called at most once and safely falls back to the composer', async () => {
  const sample = baseline.samples.find((entry) => entry.sampleId === 'TR-01');
  let requests = 0;
  const result = await runDeterministicEvidenceEditorialPipeline({
    record: sample,
    storyType: sample.testType,
    enablePolish: true,
    invokePolish: async () => {
      requests += 1;
      return { response: 'not valid JSON' };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(requests, 1);
  assert.equal(result.counters.stage1AiRequests, 0);
  assert.equal(result.counters.polishAiRequests, 1);
  assert.equal(result.counters.llamaRequests, 0);
  assert.equal(result.adoptedPolish, false);
  assert.equal(result.polishFallbackReason, 'polish-invalid-json');
  assert.deepEqual(result.final, result.composition);
  assert.equal(result.statuses.polishStatus.status, 'fallback');
  assert.equal(result.statuses.finalGateStatus.status, 'accepted');
  assert.equal(result.publicationDecision, 'review_required');
});

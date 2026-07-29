import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  evaluateMinimumEvidenceCover,
  summarizeMinimumEvidenceResults
} from '../evaluations/minimum-evidence-cover.js';
import {
  buildEvidenceInventory,
  selectMinimumEvidenceSet
} from '../src/evidence-coverage.js';

const baseline = JSON.parse(
  fs.readFileSync(
    new URL('../evaluations/phase-0.5-baseline.json', import.meta.url),
    'utf8'
  )
);

const expectedEvidenceIds = {
  'TR-01': ['title-1', 'summary-2', 'summary-4'],
  'TR-02': ['title-1', 'summary-3', 'summary-4', 'summary-5'],
  'TR-03': ['title-1', 'summary-3', 'summary-4', 'summary-6'],
  'SG-01': ['title-1', 'summary-1', 'summary-2'],
  'SG-02': ['title-1', 'summary-2'],
  'SG-03': ['title-1', 'summary-1', 'summary-2'],
  'IN-01': ['title-1', 'summary-1', 'summary-6'],
  'AN-01': ['title-1', 'summary-4', 'summary-6', 'summary-8'],
  'AN-02': ['title-1', 'summary-1', 'summary-2']
};

test('minimum evidence cover is stable for all nine frozen samples', () => {
  for (const sample of baseline.samples) {
    const first = evaluateMinimumEvidenceCover(sample);
    const second = evaluateMinimumEvidenceCover(sample);
    assert.deepEqual(
      first.selectedEvidenceIds,
      expectedEvidenceIds[sample.sampleId],
      sample.sampleId
    );
    assert.deepEqual(second.selectedEvidenceIds, first.selectedEvidenceIds);
    assert.deepEqual(first.uncoveredAnchorIds, []);
    assert.equal(first.coverage.ok, true);
    assert.equal(
      first.coverage.coveredCriticalAnchors,
      first.coverage.criticalAnchors
    );
    assert.equal(
      first.coverage.coveredRequiredFacts,
      first.coverage.requiredFacts
    );
    assert.equal(first.irrelevantEvidenceCount, 0);
    assert.equal(first.internalMarkerLeakCount, 0);
    assert.equal(first.oneLineDuplicate, false);
    assert.equal(first.aiRequests, 0);
    assert.equal(first.productionWrites, 0);
  }
});

test('frozen regressions exclude unrelated and internal evidence', () => {
  assert.equal(expectedEvidenceIds['TR-01'].includes('summary-5'), false);
  assert.equal(expectedEvidenceIds['TR-02'].includes('summary-8'), false);
  assert.equal(expectedEvidenceIds['SG-01'].includes('summary-3'), false);
  assert.equal(expectedEvidenceIds['SG-02'].includes('summary-6'), false);
  assert.equal(expectedEvidenceIds['AN-01'].includes('article-1'), false);
  assert.equal(expectedEvidenceIds['AN-02'].includes('title-2'), false);
});

test('minimum cover rejects a manifest with an uncovered critical anchor', () => {
  const inventory = buildEvidenceInventory({
    source: 'RealGM',
    storyType: 'signing',
    originalTitle: 'Lakers Sign Example Player',
    originalSummary: 'The Lakers signed Example Player.'
  });
  const result = selectMinimumEvidenceSet(inventory, {
    storyType: 'signing',
    titleEvidenceIds: ['title-1'],
    mandatoryEvidenceIds: ['title-1'],
    mandatoryAnchors: [{
      anchorId: 'anchor-number-missing',
      type: 'number',
      value: 'money:usd-million:99',
      candidateEvidenceIds: ['summary-99'],
      priority: 'critical',
      reason: 'core-number'
    }],
    optionalEvidenceIds: inventory
      .filter((item) => item.evidenceId !== 'title-1')
      .map((item) => item.evidenceId)
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['minimum-evidence-cover-incomplete']);
  assert.deepEqual(result.uncoveredAnchorIds, ['anchor-number-missing']);
});

test('nine-sample aggregate keeps deterministic safety targets', () => {
  const scores = {
    'TR-01': { humanDecision: 'accept', editorEffort: 'publish', chineseNaturalness: 4 },
    'TR-02': { humanDecision: 'accept', editorEffort: 'minor_edit', chineseNaturalness: 4 },
    'TR-03': { humanDecision: 'accept', editorEffort: 'minor_edit', chineseNaturalness: 4 },
    'SG-01': { humanDecision: 'accept', editorEffort: 'publish', chineseNaturalness: 4 },
    'SG-02': { humanDecision: 'accept', editorEffort: 'minor_edit', chineseNaturalness: 3 },
    'SG-03': { humanDecision: 'accept', editorEffort: 'publish', chineseNaturalness: 4 },
    'IN-01': { humanDecision: 'reject', editorEffort: 'rewrite', chineseNaturalness: 2 },
    'AN-01': { humanDecision: 'accept', editorEffort: 'minor_edit', chineseNaturalness: 3 },
    'AN-02': { humanDecision: 'accept', editorEffort: 'minor_edit', chineseNaturalness: 3.5 }
  };
  const results = baseline.samples.map((sample) => (
    evaluateMinimumEvidenceCover(sample, scores[sample.sampleId])
  ));
  const metrics = summarizeMinimumEvidenceResults(results);

  assert.equal(metrics.inventorySuccess, 9);
  assert.equal(metrics.coveredCriticalAnchors, metrics.criticalAnchors);
  assert.equal(metrics.coveredRequiredFacts, metrics.requiredFacts);
  assert.equal(metrics.coveredAttributions, metrics.requiredAttributions);
  assert.equal(metrics.coveredNumbers, metrics.requiredNumbers);
  assert.equal(metrics.irrelevantEvidence, 0);
  assert.equal(metrics.internalMarkerLeaks, 0);
  assert.equal(metrics.severeFactErrors, 0);
  assert.equal(metrics.certaintyErrors, 0);
  assert.equal(metrics.negationErrors, 0);
  assert.equal(metrics.gateFalseNegatives, 0);
  assert.equal(metrics.humanAccepted, 8);
  assert.equal(metrics.chineseNaturalness, 3.5);
  assert.equal(metrics.oneLineDuplicates, 0);
  assert.equal(metrics.aiRequests, 0);
  assert.equal(metrics.productionWrites, 0);
});

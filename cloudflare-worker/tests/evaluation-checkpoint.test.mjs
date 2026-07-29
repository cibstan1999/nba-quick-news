import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createEvaluationCheckpoint,
  getCompletedSampleResult,
  loadEvaluationCheckpoint,
  markSampleCompleted,
  markSampleFailed,
  markSampleStarted,
  saveEvaluationCheckpoint,
  shouldResumeCompletedSample,
  summarizeCheckpointRequests
} from '../evaluations/evaluation-checkpoint.mjs';

test('evaluation checkpoint saves each completed sample atomically and resumes it', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nba-eval-checkpoint-'));
  const filePath = path.join(directory, 'phase-1-checkpoint.local.json');
  const sample = {
    sampleId: 'TR-01',
    newsId: 'news-1',
    sourceHash: 'hash-1'
  };
  const checkpoint = createEvaluationCheckpoint({
    evaluation: 'phase-1-stage1',
    baseline: 'baseline.json'
  });

  markSampleStarted(checkpoint, sample, {
    stage: 'stage1',
    requestKind: 'formal',
    now: '2026-07-29T00:00:00.000Z'
  });
  markSampleCompleted(checkpoint, sample, { accepted: true }, {
    stage: 'stage1',
    requestKind: 'formal',
    requestCount: 1,
    now: '2026-07-29T00:00:01.000Z'
  });
  await saveEvaluationCheckpoint(filePath, checkpoint);

  const loaded = await loadEvaluationCheckpoint(filePath, {
    evaluation: 'phase-1-stage1',
    baseline: 'baseline.json'
  });
  assert.equal(shouldResumeCompletedSample(loaded, sample), true);
  assert.deepEqual(getCompletedSampleResult(loaded, sample), { accepted: true });
  await assert.rejects(fs.access(`${filePath}.tmp`));
});

test('failed samples remain retryable and do not block completed samples', () => {
  const completed = {
    sampleId: 'TR-01',
    newsId: 'news-1',
    sourceHash: 'hash-1'
  };
  const failed = {
    sampleId: 'AN-01',
    newsId: 'news-2',
    sourceHash: 'hash-2'
  };
  const checkpoint = createEvaluationCheckpoint({
    evaluation: 'phase-1-stage1',
    baseline: 'baseline.json'
  });
  markSampleStarted(checkpoint, completed, { stage: 'stage1' });
  markSampleCompleted(checkpoint, completed, { accepted: true }, {
    stage: 'stage1',
    requestKind: 'formal',
    requestCount: 1
  });
  markSampleStarted(checkpoint, failed, {
    stage: 'stage1',
    requestKind: 'diagnostic'
  });
  markSampleFailed(checkpoint, failed, new Error('sample failed'), {
    stage: 'stage1',
    requestKind: 'diagnostic',
    requestCount: 2
  });

  assert.equal(shouldResumeCompletedSample(checkpoint, completed), true);
  assert.equal(shouldResumeCompletedSample(checkpoint, failed), false);
  assert.deepEqual(summarizeCheckpointRequests(checkpoint), {
    formal: 1,
    diagnostic: 2
  });
});

test('checkpoint invalidates completed results when sourceHash changes', () => {
  const sample = {
    sampleId: 'TR-01',
    newsId: 'news-1',
    sourceHash: 'hash-1'
  };
  const checkpoint = createEvaluationCheckpoint({
    evaluation: 'phase-1-stage1',
    baseline: 'baseline.json'
  });
  markSampleCompleted(checkpoint, sample, { accepted: true }, {
    stage: 'stage1',
    requestCount: 1
  });

  assert.equal(
    shouldResumeCompletedSample(checkpoint, { ...sample, sourceHash: 'hash-2' }),
    false
  );
});

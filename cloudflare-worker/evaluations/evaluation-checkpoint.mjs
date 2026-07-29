import fs from 'node:fs/promises';

export async function loadEvaluationCheckpoint(
  filePath,
  { evaluation, baseline }
) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (parsed.evaluation !== evaluation || parsed.baseline !== baseline) {
      return createEvaluationCheckpoint({ evaluation, baseline });
    }
    return normalizeCheckpoint(parsed, { evaluation, baseline });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createEvaluationCheckpoint({ evaluation, baseline });
    }
    throw error;
  }
}

export function createEvaluationCheckpoint({ evaluation, baseline }) {
  return {
    evaluation,
    baseline,
    updatedAt: null,
    samples: {}
  };
}

export function shouldResumeCompletedSample(checkpoint, sample) {
  const entry = checkpoint?.samples?.[sample.sampleId];
  return Boolean(
    entry?.status === 'completed' &&
    entry.newsId === sample.newsId &&
    entry.sourceHash === sample.sourceHash &&
    entry.result
  );
}

export function getCompletedSampleResult(checkpoint, sample) {
  return shouldResumeCompletedSample(checkpoint, sample)
    ? checkpoint.samples[sample.sampleId].result
    : null;
}

export function markSampleStarted(
  checkpoint,
  sample,
  { stage, requestKind = 'formal', now = new Date().toISOString() }
) {
  checkpoint.samples[sample.sampleId] = {
    sampleId: sample.sampleId,
    newsId: sample.newsId,
    sourceHash: sample.sourceHash,
    status: 'running',
    stage,
    requestKind: normalizeRequestKind(requestKind),
    startedAt: now,
    completedAt: null,
    failedAt: null,
    requestCounts: { formal: 0, diagnostic: 0 },
    result: null,
    error: null
  };
  checkpoint.updatedAt = now;
  return checkpoint.samples[sample.sampleId];
}

export function markSampleCompleted(
  checkpoint,
  sample,
  result,
  {
    stage,
    requestKind = 'formal',
    requestCount = 0,
    now = new Date().toISOString()
  }
) {
  const entry = checkpoint.samples[sample.sampleId] ||
    markSampleStarted(checkpoint, sample, { stage, requestKind, now });
  entry.status = 'completed';
  entry.stage = stage;
  entry.requestKind = normalizeRequestKind(requestKind);
  entry.completedAt = now;
  entry.failedAt = null;
  entry.requestCounts = addRequestCount(
    entry.requestCounts,
    requestKind,
    requestCount
  );
  entry.result = result;
  entry.error = null;
  checkpoint.updatedAt = now;
  return entry;
}

export function markSampleFailed(
  checkpoint,
  sample,
  error,
  {
    stage,
    requestKind = 'formal',
    requestCount = 0,
    now = new Date().toISOString()
  }
) {
  const entry = checkpoint.samples[sample.sampleId] ||
    markSampleStarted(checkpoint, sample, { stage, requestKind, now });
  entry.status = 'failed';
  entry.stage = stage;
  entry.requestKind = normalizeRequestKind(requestKind);
  entry.failedAt = now;
  entry.completedAt = null;
  entry.requestCounts = addRequestCount(
    entry.requestCounts,
    requestKind,
    requestCount
  );
  entry.result = null;
  entry.error = sanitizeCheckpointError(error);
  checkpoint.updatedAt = now;
  return entry;
}

export function summarizeCheckpointRequests(checkpoint) {
  return Object.values(checkpoint?.samples || {}).reduce(
    (totals, entry) => ({
      formal: totals.formal + Number(entry.requestCounts?.formal || 0),
      diagnostic: totals.diagnostic + Number(entry.requestCounts?.diagnostic || 0)
    }),
    { formal: 0, diagnostic: 0 }
  );
}

export async function saveEvaluationCheckpoint(filePath, checkpoint) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(checkpoint, null, 2)}\n`,
    'utf8'
  );
  await fs.rename(temporaryPath, filePath);
}

function normalizeCheckpoint(value, { evaluation, baseline }) {
  return {
    evaluation,
    baseline,
    updatedAt: value.updatedAt || null,
    samples: value.samples && typeof value.samples === 'object'
      ? value.samples
      : {}
  };
}

function normalizeRequestKind(value) {
  return value === 'diagnostic' ? 'diagnostic' : 'formal';
}

function addRequestCount(current, requestKind, requestCount) {
  const counts = {
    formal: Number(current?.formal || 0),
    diagnostic: Number(current?.diagnostic || 0)
  };
  counts[normalizeRequestKind(requestKind)] += Math.max(
    0,
    Number(requestCount || 0)
  );
  return counts;
}

function sanitizeCheckpointError(error) {
  const message = error instanceof Error ? error.message : String(error || 'unknown error');
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: message.slice(0, 500)
  };
}

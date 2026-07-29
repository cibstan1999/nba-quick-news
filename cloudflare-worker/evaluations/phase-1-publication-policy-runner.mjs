import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { materializePayload } from '../src/pipeline.js';
import { decidePhase1Publication } from '../src/publication-policy.js';

const evaluationDir = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(
  evaluationDir,
  'phase-1-integration-c-results.local.json'
);
const outputPath = path.join(
  evaluationDir,
  'phase-1-publication-policy-results.local.json'
);
const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const results = input.results.map((result) => {
  const publication = decidePhase1Publication(result);
  return {
    sampleId: result.sampleId,
    newsId: result.newsId,
    adoptedPolish: result.adoptedPolish,
    usedComposerFallback: result.usedComposerFallback,
    polishFallbackReason: result.polishFallbackReason,
    finalGateDecision: result.finalGateDecision,
    publicationDecision: publication.decision,
    publicationReasons: publication.reasons,
    editorEffort: result.editorEffort,
    chineseNaturalness: result.chineseNaturalness,
    coverage: result.coverage,
    rejectionReasons: result.rejectionReasons,
    stage1AiRequests: result.stage1AiRequests,
    polishAiRequests: result.polishAiRequests,
    llamaRequests: result.llamaRequests,
    productionWrites: result.productionWrites,
    final: result.final
  };
});
const now = new Date().toISOString();
const materialized = materializePayload(
  results.map(toAcceptedRecord),
  { status: 'success', checkedAt: now, updatedAt: now },
  now
);
const publicNewsIds = new Set(materialized.items.map((item) => item.newsId));
const publish = results.filter((result) => (
  result.publicationDecision === 'publish'
));
const review = results.filter((result) => (
  result.publicationDecision === 'review_required'
));
const rejected = results.filter((result) => (
  result.publicationDecision === 'reject'
));
const metrics = {
  sampleCount: results.length,
  publish: publish.length,
  reviewRequired: review.length,
  reject: rejected.length,
  publishDirectlyPublishable: publish.filter(
    (result) => result.editorEffort === 'publish'
  ).length,
  publishDirectPublishRate: ratio(
    publish.filter((result) => result.editorEffort === 'publish').length,
    publish.length
  ),
  publishChineseNaturalness: average(
    publish.map((result) => result.chineseNaturalness)
  ),
  publishRequiredFactsCoverage: aggregateCoverage(
    publish,
    'coveredRequiredFacts',
    'requiredFacts'
  ),
  publishAttributionCoverage: aggregateCoverage(
    publish,
    'coveredAttributions',
    'requiredAttributions'
  ),
  publishNumberCoverage: aggregateCoverage(
    publish,
    'coveredNumbers',
    'requiredNumbers'
  ),
  publishSafetyFailures: publish.filter(
    (result) => result.rejectionReasons.length > 0
  ).length,
  reviewRequiredPublicCount: review.filter(
    (result) => publicNewsIds.has(result.newsId)
  ).length,
  rejectedPublicCount: rejected.filter(
    (result) => publicNewsIds.has(result.newsId)
  ).length,
  gateMisses: results.filter(
    (result) => (
      result.finalGateDecision === 'accepted' &&
      result.editorEffort === 'rewrite'
    )
  ).length,
  llamaRequests: sum(results, 'llamaRequests'),
  productionWrites: sum(results, 'productionWrites')
};
const report = {
  evaluation: 'phase-1-conservative-publication-policy',
  sourceEvaluation: input.evaluation,
  generatedAt: now,
  partialBaselineNotice:
    'Partial 9-sample baseline. Injury and game are not represented.',
  results,
  metrics
};

await atomicWriteJson(outputPath, report);

for (const result of results) {
  console.log(
    `${result.sampleId}: ${result.publicationDecision}` +
    ` (polish=${result.adoptedPolish ? 'adopted' : 'fallback'},` +
    ` human=${result.editorEffort})`
  );
}
console.log(JSON.stringify(metrics, null, 2));

function toAcceptedRecord(result) {
  return {
    newsId: result.newsId,
    source: 'RealGM',
    feed: 'https://basketball.realgm.com/rss/wiretap/15/0.xml',
    url: `https://example.com/${result.newsId}`,
    originalTitle: `${result.sampleId} original title`,
    originalSummary: `${result.sampleId} original summary`,
    category: '其他',
    storyType: 'other',
    expectedFactLevel: 'analysis',
    importance: 1,
    eventKey: result.newsId,
    publishedAt: now,
    processedAt: now,
    aiStatus: 'accepted',
    publicationDecision: result.publicationDecision,
    editorial: {
      ...result.final,
      categoryZh: '其他',
      tagsZh: [],
      confidence: 1,
      factLevel: 'analysis',
      editorSource: 'deterministic-composer+workers-ai-polish',
      model: 'evaluation',
      generatedAt: now
    }
  };
}

function aggregateCoverage(results, coveredKey, requiredKey) {
  const covered = results.reduce(
    (total, result) => total + Number(result.coverage?.[coveredKey] || 0),
    0
  );
  const required = results.reduce(
    (total, result) => total + Number(result.coverage?.[requiredKey] || 0),
    0
  );
  return {
    covered,
    required,
    rate: ratio(covered, required)
  };
}

function average(values) {
  const numbers = values
    .map(Number)
    .filter((value) => Number.isFinite(value));
  return numbers.length
    ? Number((
        numbers.reduce((total, value) => total + value, 0) / numbers.length
      ).toFixed(2))
    : null;
}

function ratio(value, total) {
  return total ? Number((value / total).toFixed(4)) : 1;
}

function sum(results, key) {
  return results.reduce(
    (total, result) => total + Number(result[key] || 0),
    0
  );
}

async function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
  await fs.rename(temporaryPath, filePath);
}

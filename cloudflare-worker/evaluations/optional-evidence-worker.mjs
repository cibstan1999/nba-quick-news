import {
  buildOptionalEvidenceSelectionPrompt,
  buildOptionalEvidenceSelectionRequest,
  normalizeOptionalSelectionModelResponse
} from './evidence-ablation.js';

export default {
  async fetch(request, env) {
    if (env.EXPERIMENT_MODE !== 'true') {
      return json({ error: 'Experiment mode is disabled.' }, 404);
    }
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return json({
        ok: true,
        experiment: 'optional-evidence-ablation',
        kvBound: false
      });
    }
    if (url.pathname !== '/select' || request.method !== 'POST') {
      return json({ error: 'Not found.' }, 404);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'A JSON body is required.' }, 400);
    }
    if (body?.dryRun !== true) {
      return json({ error: 'dryRun must be true.' }, 400);
    }
    const context = body?.context;
    if (!isExperimentContext(context)) {
      return json({ error: 'A valid evidence context is required.' }, 400);
    }

    const model = env.AI_MODEL || '@cf/qwen/qwen3-30b-a3b-fp8';
    const prompt = buildOptionalEvidenceSelectionPrompt(context);
    try {
      const response = await env.AI.run(
        model,
        buildOptionalEvidenceSelectionRequest(prompt)
      );
      return json({
        ok: true,
        dryRun: true,
        persisted: false,
        model,
        ...normalizeOptionalSelectionModelResponse(response, context),
        stage1AiRequests: 1,
        llamaFallbackCalls: 0,
        productionWrites: 0
      });
    } catch (error) {
      return json({
        ok: true,
        dryRun: true,
        persisted: false,
        model,
        optionalSelectionStatus: 'fallback',
        selectedOptionalEvidenceIds: [],
        ignoredEvidenceIds: [],
        invalidEvidenceIds: [],
        optionalSelectionFallbackReason: 'optional-selection-request-failed',
        diagnostic: String(error?.message || 'Workers AI request failed.').slice(0, 300),
        stage1AiRequests: 1,
        llamaFallbackCalls: 0,
        productionWrites: 0
      });
    }
  }
};

function isExperimentContext(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.storyType === 'string' &&
    Array.isArray(value.inventory) &&
    value.manifest &&
    Array.isArray(value.manifest.mandatoryEvidenceIds) &&
    Array.isArray(value.manifest.optionalEvidenceIds)
  );
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

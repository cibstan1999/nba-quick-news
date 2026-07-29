import {
  buildConstrainedPolishPrompt,
  buildConstrainedPolishRequest,
  createConstrainedPolishPackage,
  normalizeConstrainedPolishResponse,
  restoreConstrainedPolish,
  validateConstrainedPlaceholderOutput
} from '../src/constrained-editorial-polish.js';
import {
  composeDeterministicEditorial,
  validateDeterministicEditorialComposition
} from '../src/deterministic-editorial.js';
import {
  buildEditorialFactPlan,
  validateFrozenFactExtraction
} from '../src/pipeline.js';

export default {
  async fetch(request, env) {
    if (env.EXPERIMENT_MODE !== 'true') {
      return json({ error: 'Experiment mode is disabled.' }, 404);
    }
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return json({ ok: true, experiment: 'constrained-polish', kvBound: false });
    }
    if (url.pathname !== '/polish' || request.method !== 'POST') {
      return json({ error: 'Not found.' }, 404);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'A JSON body is required.' }, 400);
    }
    if (body?.dryRun !== true) return json({ error: 'dryRun must be true.' }, 400);

    const frozen = validateFrozenFactExtraction(body?.factExtraction);
    if (!frozen.ok) {
      return json({
        error: 'A valid frozen factExtraction is required.',
        rejectionReasons: frozen.reasons
      }, 400);
    }

    const record = {
      newsId: body?.newsId || 'news_constrained_polish',
      source: body?.source || 'RealGM',
      publishedAt: body?.publishedAt || '',
      originalTitle: '',
      originalSummary: ''
    };
    const factPlan = buildEditorialFactPlan(frozen.value);
    let composer;
    let deterministicGate;
    let polishPackage;
    try {
      composer = composeDeterministicEditorial(frozen.value, { factPlan });
      deterministicGate = validateDeterministicEditorialComposition(
        composer,
        record,
        frozen.value
      );
      if (!deterministicGate.ok) {
        return json({
          error: 'Deterministic baseline failed its quality gate.',
          rejectionReasons: deterministicGate.reasons
        }, 422);
      }
      polishPackage = createConstrainedPolishPackage(composer, frozen.value, { factPlan });
    } catch (error) {
      return json({ error: error?.message || 'Unable to create polish package.' }, 422);
    }

    const model = env.AI_MODEL || '@cf/qwen/qwen3-30b-a3b-fp8';
    let normalized;
    try {
      const prompt = buildConstrainedPolishPrompt(polishPackage);
      const response = await env.AI.run(model, buildConstrainedPolishRequest(prompt));
      normalized = normalizeConstrainedPolishResponse(response);
    } catch (error) {
      return json({
        ok: true,
        dryRun: true,
        persisted: false,
        model,
        aiRequests: 1,
        composer,
        lockedDraft: polishPackage.lockedDraft,
        polishedDraft: null,
        final: composer,
        adoptedPolish: false,
        usedFallback: true,
        polishFallbackReason: 'polish-request-failed',
        diagnostic: error?.message || 'Workers AI request failed.',
        productionWrites: 0,
        llamaFallbackCalls: 0,
        stage1Requests: 0
      });
    }

    if (!normalized.parsed) {
      return json(fallbackPayload({
        composer,
        polishPackage,
        model,
        reason: normalized.failureReason,
        polishedDraft: null
      }));
    }

    const placeholderValidation = validateConstrainedPlaceholderOutput(
      polishPackage,
      normalized.parsed
    );
    if (!placeholderValidation.ok) {
      return json(fallbackPayload({
        composer,
        polishPackage,
        model,
        reason: placeholderValidation.reasons[0],
        polishedDraft: normalized.parsed,
        placeholderValidation
      }));
    }

    const restoredDraft = restoreConstrainedPolish(polishPackage, normalized.parsed);
    const lockedSurfaceBaseline = restoreConstrainedPolish(
      polishPackage,
      polishPackage.lockedDraft
    );
    if (!hasMaterialPolish(lockedSurfaceBaseline, restoredDraft)) {
      return json(fallbackPayload({
        composer,
        polishPackage,
        model,
        reason: 'polish-no-material-change',
        polishedDraft: normalized.parsed,
        restoredDraft,
        placeholderValidation
      }));
    }
    const gateValidation = validateDeterministicEditorialComposition(
      restoredDraft,
      record,
      frozen.value
    );
    if (!gateValidation.ok) {
      return json(fallbackPayload({
        composer,
        polishPackage,
        model,
        reason: `polish-gate-rejected:${gateValidation.reasons[0] || 'unknown'}`,
        polishedDraft: normalized.parsed,
        restoredDraft,
        placeholderValidation,
        gateValidation
      }));
    }

    return json({
      ok: true,
      dryRun: true,
      persisted: false,
      model,
      aiRequests: 1,
      composer,
      lockedDraft: polishPackage.lockedDraft,
      polishedDraft: normalized.parsed,
      restoredDraft,
      final: restoredDraft,
      adoptedPolish: true,
      usedFallback: false,
      polishFallbackReason: null,
      placeholderValidation,
      gateValidation: compactGate(gateValidation),
      factPlan,
      productionWrites: 0,
      llamaFallbackCalls: 0,
      stage1Requests: 0
    });
  }
};

function fallbackPayload({
  composer,
  polishPackage,
  model,
  reason,
  polishedDraft,
  restoredDraft = null,
  placeholderValidation = null,
  gateValidation = null
}) {
  return {
    ok: true,
    dryRun: true,
    persisted: false,
    model,
    aiRequests: 1,
    composer,
    lockedDraft: polishPackage.lockedDraft,
    polishedDraft,
    restoredDraft,
    final: composer,
    adoptedPolish: false,
    usedFallback: true,
    polishFallbackReason: reason,
    placeholderValidation,
    gateValidation: gateValidation ? compactGate(gateValidation) : null,
    factPlan: polishPackage.factPlan,
    productionWrites: 0,
    llamaFallbackCalls: 0,
    stage1Requests: 0
  };
}

function compactGate(validation) {
  return {
    ok: Boolean(validation?.ok),
    reasons: [...(validation?.reasons || [])],
    addedFacts: [...(validation?.details?.addedFacts || [])],
    missingFacts: [...(validation?.details?.missingFacts || [])],
    unsafeFragments: [...(validation?.details?.unsafeFragments || [])]
  };
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

function hasMaterialPolish(original, polished) {
  return ['titleZh', 'summaryZh', 'oneLineZh'].some((field) => (
    comparable(original?.[field]) !== comparable(polished?.[field])
  ));
}

function comparable(value) {
  return String(value || '')
    .replace(/[\s，。！？、:：；;'"“”‘’（）()\-]/g, '')
    .toLowerCase();
}

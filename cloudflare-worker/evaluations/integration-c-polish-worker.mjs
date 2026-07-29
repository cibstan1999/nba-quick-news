export default {
  async fetch(request, env) {
    if (env.EXPERIMENT_MODE !== 'true') {
      return json({ error: 'Experiment mode is disabled.' }, 404);
    }
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return json({
        ok: true,
        experiment: 'integration-c-polish-invoker',
        kvBound: false
      });
    }
    if (url.pathname !== '/invoke' || request.method !== 'POST') {
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
    if (!isAllowedPolishRequest(body?.request)) {
      return json({ error: 'A valid constrained polish request is required.' }, 400);
    }

    const model = env.AI_MODEL || '@cf/qwen/qwen3-30b-a3b-fp8';
    try {
      const response = await env.AI.run(model, body.request);
      return json({
        ok: true,
        dryRun: true,
        persisted: false,
        model,
        response,
        stage1Requests: 0,
        llamaFallbackCalls: 0,
        productionWrites: 0
      });
    } catch (error) {
      return json({
        error: error?.message || 'Workers AI request failed.',
        dryRun: true,
        persisted: false,
        model,
        stage1Requests: 0,
        llamaFallbackCalls: 0,
        productionWrites: 0
      }, 502);
    }
  }
};

function isAllowedPolishRequest(value) {
  if (!value || typeof value !== 'object') return false;
  if (!Array.isArray(value.messages) || value.messages.length !== 2) return false;
  if (value.messages.some((message) => (
    !['system', 'user'].includes(message?.role) ||
    typeof message?.content !== 'string' ||
    !message.content.trim()
  ))) return false;
  if (value.stream !== false) return false;
  const maxTokens = Number(value.max_tokens);
  return Number.isFinite(maxTokens) && maxTokens > 0 && maxTokens <= 1600;
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

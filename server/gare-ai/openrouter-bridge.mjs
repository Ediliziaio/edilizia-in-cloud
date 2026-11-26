import { randomUUID } from 'node:crypto';

const publicActions = new Set(['filtri', 'analizza', 'analisi_operativa', 'rispondi', 'bozza', 'confronta', 'compila']);

export async function callGareBridge(ctx, body, signal) {
  const secret = ctx?.config?.aiBridgeSecret;
  if (!secret || !ctx?.token) throw Error('Collegamento OpenRouter Gare non configurato.');
  const response = await fetch(new URL('/functions/v1/gare-pilot-ai', ctx.config.API_URL), {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      apikey: ctx.config.ANON_KEY,
      'X-Gare-AI-Key': secret,
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(105_000)]) : AbortSignal.timeout(body ? 105_000 : 5_000),
    redirect: 'error',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw Object.assign(Error(result?.error || 'Collegamento OpenRouter Gare non disponibile.'), { status: response.status });
  }
  return result;
}

export async function inferOpenRouter(ctx, { action, model, messages, schema, deep }, signal) {
  if (!publicActions.has(action)) throw Error('Questo controllo usa dati del fascicolo riservato. Usa il motore privato o il percorso manuale.');
  return callGareBridge(ctx, { action, model, messages, schema, deep, requestId: randomUUID() }, signal);
}

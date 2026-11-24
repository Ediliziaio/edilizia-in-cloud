const actions = new Set(['filtri', 'analizza', 'analisi_operativa', 'rispondi', 'bozza', 'confronta', 'compila']);
const maxBodyBytes = 130_000;

export const pilotCompanyId = 'd2000000-0000-4000-a000-000000000002';

type Message = { role: 'system' | 'user'; content: string };
type JsonObject = Record<string, unknown>;
export type AiRequest = {
  model: string;
  messages: Message[];
  max_tokens: number;
  temperature: number;
  response_format: { type: 'json_schema'; json_schema: { name: string; strict: true; schema: JsonObject } };
  provider: { data_collection: 'deny'; zdr: true; require_parameters: true; max_price?: { prompt: number; completion: number } };
  timeoutMs: number;
};
export type AiResult = {
  content: string | null;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number };
  cost_usd: number;
  cost_is_estimated: boolean;
  generation_id?: string | null;
  finish_reason: string;
  latency_ms: number;
};

interface Bridge {
  secret: string;
  model: string;
  profile: 'free' | 'credits';
  authorize: (jwt: string) => Promise<boolean>;
  credit: (estimatedTokens: number) => Promise<boolean>;
  complete: (input: AiRequest) => Promise<AiResult>;
  record: (result: AiResult, requestId: string) => Promise<boolean>;
}

function response(status: number, body: JsonObject) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function bridgeModel(profile: string, model: string) {
  if (profile === 'free') {
    return model === 'openrouter/free' || /^[a-z0-9._-]+\/[a-z0-9._-]+:free$/i.test(model);
  }
  return profile === 'credits' && /^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(model) && model !== 'openrouter/free';
}

function sameSecret(expected: string, actual: string) {
  if (!/^[a-f0-9]{64}$/.test(expected) || actual.length !== 64) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return difference === 0;
}

function object(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function payload(request: Request): Promise<unknown> {
  if (Number(request.headers.get('Content-Length')) > maxBodyBytes) throw Error('Richiesta troppo grande');
  const reader = request.body?.getReader();
  if (!reader) throw Error('Corpo mancante');
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBodyBytes) {
      await reader.cancel();
      throw Error('Richiesta troppo grande');
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

export function createGareAiHandler(bridge: Bridge) {
  return async (request: Request) => {
    if (!sameSecret(bridge.secret, request.headers.get('x-gare-ai-key') ?? '')) return response(403, { error: 'Accesso non consentito.' });
    const token = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
    if (!token) return response(401, { error: 'Sessione richiesta.' });
    const authorized = await bridge.authorize(token).catch(() => false);
    if (!authorized) return response(403, { error: 'Pilota Gare non abilitato per questa sessione.' });
    if (!bridgeModel(bridge.profile, bridge.model)) return response(503, { error: 'Modello OpenRouter non configurato.' });
    if (request.method === 'GET') return response(200, { model: bridge.model, profile: bridge.profile });
    if (request.method !== 'POST') return response(405, { error: 'Metodo non consentito.' });

    let input: unknown;
    try {
      input = await payload(request);
    } catch {
      return response(400, { error: 'Richiesta AI non valida o troppo grande.' });
    }
    if (!object(input) || typeof input.action !== 'string' || !actions.has(input.action) ||
        input.model !== bridge.model || typeof input.requestId !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.requestId) ||
        !Array.isArray(input.messages) || input.messages.length !== 2 ||
        !input.messages.every((m, i) => object(m) && m.role === (i === 0 ? 'system' : 'user') &&
          typeof m.content === 'string' && m.content.length <= 42_000) ||
        !object(input.schema) || input.schema.type !== 'object' || JSON.stringify(input.schema).length > 15_000 ||
        typeof input.deep !== 'boolean') {
      return response(400, { error: 'Azione, modello o dati AI non validi.' });
    }

    const messages = input.messages as Message[];
    const maxTokens = input.deep ? 4096 : 2500;
    if (bridge.profile === 'credits') {
      try {
        const estimate = Math.ceil(messages.reduce((size, m) => size + m.content.length, 0) / 3) + maxTokens;
        if (!await bridge.credit(estimate)) return response(402, { error: 'Credito AI insufficiente o non verificabile.' });
      } catch {
        return response(503, { error: 'Verifica del borsellino AI non disponibile.' });
      }
    }

    let result: AiResult;
    try {
      result = await bridge.complete({
        model: bridge.model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.1,
        response_format: { type: 'json_schema', json_schema: { name: input.action, strict: true, schema: input.schema } },
        provider: {
          data_collection: 'deny',
          zdr: true,
          require_parameters: true,
          ...(bridge.profile === 'free' ? { max_price: { prompt: 0, completion: 0 } } : {}),
        },
        timeoutMs: 95_000,
      });
    } catch (error) {
      const status = object(error) && (error.statusCode ?? error.status);
      if (status === 429) return response(429, { error: 'Limite OpenRouter raggiunto. Riprova più tardi.' });
      return response(503, { error: 'OpenRouter indisponibile per il modello e le condizioni configurate.' });
    }

    if (bridge.profile === 'free') {
      if (result.cost_is_estimated || result.cost_usd !== 0) return response(503, { error: 'Costo zero non verificato per la risposta OpenRouter.' });
    } else {
      const recorded = await bridge.record(result, input.requestId).catch(() => false);
      if (!recorded) return response(503, { error: 'Consumo AI non confermato dal borsellino. Verifica il registro prima di riprovare.' });
    }
    return response(200, {
      content: result.content,
      model: result.model,
      finish_reason: result.finish_reason,
      usage: {
        input_tokens: result.usage.prompt_tokens,
        output_tokens: result.usage.completion_tokens,
        duration_ms: result.latency_ms,
        model: result.model,
        cost_usd: result.cost_usd,
        cost_is_estimated: result.cost_is_estimated,
      },
    });
  };
}

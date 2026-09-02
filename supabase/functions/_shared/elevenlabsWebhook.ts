/**
 * elevenlabsWebhook — i contratti REALI di ElevenLabs, in un posto solo.
 *
 * IL GUASTO CHE QUESTO FILE ESISTE PER EVITARE
 * --------------------------------------------
 * Quattro funzioni (post-call, call-init, webhook e tool degli agenti interni)
 * pretendevano un header `xi-signature` con l'HMAC del solo body. ElevenLabs
 * non manda quell'header: il post-call arriva con `elevenlabs-signature:
 * t=<unix>,v0=<hex>` calcolato su "<t>.<body>" (fonte: SDK ufficiale,
 * src/wrapper/webhooks.ts), e il webhook di inizio chiamata NON e' firmato
 * affatto. Risultato: anche con il secret configurato, ogni webhook vero
 * sarebbe stato rifiutato con 401 — e le chiamate non sarebbero mai state
 * fatturate.
 *
 * Qui si accettano ENTRAMBI i formati (quello vero e quello legacy, che il
 * nostro sweeper usa per ri-postare le conversazioni riconciliate), e si
 * normalizza il payload post-call reale nella forma piatta che il codice
 * interno gia' conosce.
 */

const TOLLERANZA_SECONDI = 30 * 60; // come l'SDK ufficiale

function confrontoCostante(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type EsitoFirma =
  | { ok: true; schema: "elevenlabs" | "legacy" }
  | { ok: false; status: 401 | 503; motivo: string };

/**
 * Verifica la firma di un webhook ElevenLabs sul body grezzo.
 * - `elevenlabs-signature: t=<unix>,v0=<hex>` su "<t>.<rawBody>" (formato vero)
 * - `xi-signature: <hex>` su rawBody (formato legacy, usato dallo sweeper)
 */
export async function verificaFirmaElevenLabs(req: Request, rawBody: string): Promise<EsitoFirma> {
  const secret = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
  if (!secret) return { ok: false, status: 503, motivo: "ELEVENLABS_WEBHOOK_SECRET non configurato" };

  const reale = req.headers.get("elevenlabs-signature");
  if (reale) {
    const parti = reale.split(",").map((p) => p.trim());
    const t = parti.find((p) => p.startsWith("t="))?.slice(2);
    const v0 = parti.find((p) => p.startsWith("v0="))?.slice(3);
    if (!t || !v0) return { ok: false, status: 401, motivo: "firma malformata" };
    const eta = Date.now() / 1000 - Number(t);
    if (!Number.isFinite(eta) || eta > TOLLERANZA_SECONDI || eta < -TOLLERANZA_SECONDI) {
      return { ok: false, status: 401, motivo: "timestamp fuori tolleranza" };
    }
    const attesa = await hmacHex(secret, `${t}.${rawBody}`);
    return confrontoCostante(v0, attesa)
      ? { ok: true, schema: "elevenlabs" }
      : { ok: false, status: 401, motivo: "firma non valida" };
  }

  const legacy = req.headers.get("xi-signature");
  if (legacy) {
    const attesa = await hmacHex(secret, rawBody);
    return confrontoCostante(legacy, attesa)
      ? { ok: true, schema: "legacy" }
      : { ok: false, status: 401, motivo: "firma legacy non valida" };
  }

  return { ok: false, status: 401, motivo: "nessuna firma" };
}

/** Chiave derivata per azienda: la stessa formula del proxy negli URL dei tool. */
export async function chiaveDerivataAzienda(companyId: string): Promise<string | null> {
  const secret = Deno.env.get("AGENT_TOOLS_SECRET") || Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
  if (!secret) return null;
  return hmacHex(secret, `agent-tools:${companyId}`);
}

/**
 * Per gli endpoint che ElevenLabs chiama SENZA firmare (inizio chiamata, tool
 * in chiamata): la credenziale viaggia nell'URL, come ?key=<chiave>. Vale il
 * master secret oppure la chiave derivata dell'azienda dell'agente.
 */
export async function chiaveUrlValida(req: Request, companyId: string | null): Promise<boolean> {
  const secret = Deno.env.get("AGENT_TOOLS_SECRET") || Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
  if (!secret) return false;
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!key) return false;
  if (confrontoCostante(key, secret)) return true;
  if (!companyId) return false;
  const derivata = await hmacHex(secret, `agent-tools:${companyId}`);
  return confrontoCostante(key, derivata);
}

export interface PostCallPiatto {
  agent_id: string | null;
  conversation_id: string | null;
  duration_seconds: number;
  messages_count: number;
  status: string;
  tool_calls: Array<{ tool_name: string; parameters: Record<string, unknown> }>;
  transcript: Array<{ role?: string; message?: string }>;
  metadata: Record<string, unknown>;
  summary: string | null;
}

/**
 * Il payload vero e' `{ type: "post_call_transcription", data: {...} }`; il
 * codice interno (e lo sweeper) lavorano sulla forma piatta. Qui si traduce.
 * Gli eventi `post_call_audio` (e altri) non portano nulla da fatturare:
 * `ignora: true`, da rispondere 200 e basta.
 */
export function normalizzaPostCall(body: Record<string, unknown>): { ignora: true } | { ignora: false; piatto: PostCallPiatto } {
  const tipo = String(body.type ?? "");
  if (tipo && tipo !== "post_call_transcription") return { ignora: true };

  if (!tipo) {
    // Forma piatta (sweeper / chiamanti interni): passa cosi' com'e'.
    return {
      ignora: false,
      piatto: {
        agent_id: (body.agent_id as string) ?? null,
        conversation_id: (body.conversation_id as string) ?? null,
        duration_seconds: Number(body.duration_seconds ?? 0),
        messages_count: Number(body.messages_count ?? 0),
        status: String(body.status ?? "completed"),
        tool_calls: (body.tool_calls as PostCallPiatto["tool_calls"]) ?? [],
        transcript: (body.transcript as PostCallPiatto["transcript"]) ?? [],
        metadata: (body.metadata as Record<string, unknown>) ?? {},
        summary: (body.summary as string) ?? null,
      },
    };
  }

  const d = (body.data ?? {}) as Record<string, unknown>;
  const trascrizione = (d.transcript as Array<Record<string, unknown>>) ?? [];
  const meta = (d.metadata as Record<string, unknown>) ?? {};
  const analisi = (d.analysis as Record<string, unknown>) ?? {};
  const init = (d.conversation_initiation_client_data as Record<string, unknown>) ?? {};
  const dyn = (init.dynamic_variables as Record<string, unknown>) ?? {};
  const telefonia = (meta.phone_call as Record<string, unknown>) ?? {};

  // I tool usati durante la chiamata stanno turno per turno nel transcript.
  const toolCalls: PostCallPiatto["tool_calls"] = [];
  for (const turno of trascrizione) {
    for (const tc of (turno.tool_calls as Array<Record<string, unknown>>) ?? []) {
      const nome = String(tc.tool_name ?? tc.name ?? "");
      if (!nome) continue;
      let params: Record<string, unknown> = {};
      const raw = tc.params_as_json ?? tc.parameters ?? tc.params;
      if (typeof raw === "string") { try { params = JSON.parse(raw); } catch { /* lascia vuoto */ } }
      else if (raw && typeof raw === "object") params = raw as Record<string, unknown>;
      toolCalls.push({ tool_name: nome, parameters: params });
    }
  }

  const direzione = String(dyn.system__call_direction ?? telefonia.direction ?? "inbound");
  const chiamante = (dyn.system__caller_id ?? telefonia.external_number ?? telefonia.caller_id ?? null) as string | null;
  const chiamato = (dyn.system__called_number ?? telefonia.agent_number ?? null) as string | null;
  const statoEl = String(d.status ?? "done").toLowerCase();

  return {
    ignora: false,
    piatto: {
      agent_id: (d.agent_id as string) ?? null,
      conversation_id: (d.conversation_id as string) ?? null,
      duration_seconds: Number(meta.call_duration_secs ?? 0),
      messages_count: trascrizione.length,
      status: statoEl === "done" ? "completed" : statoEl === "failed" ? "failed" : "completed",
      tool_calls: toolCalls,
      transcript: trascrizione.map((t) => ({ role: t.role as string | undefined, message: t.message as string | undefined })),
      metadata: {
        call_direction: direzione,
        caller_phone: chiamante,
        called_phone: chiamato,
        elevenlabs_status: statoEl,
        call_successful: analisi.call_successful ?? null,
        cost_credits: meta.cost ?? null,
        event_timestamp: body.event_timestamp ?? null,
      },
      summary: (analisi.transcript_summary as string) ?? null,
    },
  };
}

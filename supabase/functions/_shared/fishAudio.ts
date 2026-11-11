/** Fish Audio adapter. No database access or credentials in client bundles.
 * Contract: https://docs.fish.audio/api-reference/openapi.json (2026-11-10).
 * Deliberately exposes reads and a short voice preview; call/import builders
 * return requests for review, without provisioning numbers or ringing phones.
 */
const FISH_API = "https://api.fish.audio";

export class FishAudioError extends Error {
  status: number;
  constructor(status: number) {
    const messages: Record<number, string> = {
      401: "Chiave Fish Audio non valida.",
      402: "Credito Fish Audio insufficiente per questa operazione.",
      403: "La chiave Fish Audio non ha accesso a questa risorsa.",
      404: "Risorsa Fish Audio non trovata.",
      429: "Limite Fish Audio raggiunto. Riprova più tardi.",
    };
    super(messages[status] ?? `Fish Audio non disponibile (HTTP ${status}).`);
    this.name = "FishAudioError";
    this.status = status;
  }
}

export interface FishAgent {
  agent_id: string;
  workspace_id: string;
  name: string;
  status: string;
  publication_state: string;
}
export interface FishPhoneNumber {
  phone_number_id: string;
  workspace_id: string;
  phone_number: string;
  provider: string;
  agent_id: string | null;
  status: string;
  supports_outbound?: boolean;
}
interface FishPage {
  has_more: boolean;
  next_cursor?: string | null;
  [key: string]: unknown;
}

export class FishAudioClient {
  #key: string;
  #fetch: typeof fetch;
  constructor(apiKey: string, fetcher: typeof fetch = fetch) {
    if (!apiKey.trim()) throw new Error("Imposta FISH_API_KEY nel file locale .env.fish.local.");
    this.#key = apiKey.trim();
    this.#fetch = fetcher;
  }

  async #request(path: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await this.#fetch(FISH_API + path, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${this.#key}` },
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      });
    } catch {
      // Never echo upstream error text: it may contain headers or credentials.
      throw new Error("Connessione a Fish Audio non riuscita o scaduta.");
    }
    if (!response.ok) throw new FishAudioError(response.status);
    return response;
  }

  async #list<T>(path: string, field: string): Promise<T[]> {
    const rows: T[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const data = await (await this.#request(path + query)).json().catch(() => {
        throw new Error("Risposta Fish Audio non riconosciuta.");
      }) as FishPage;
      if (!Array.isArray(data[field]) || typeof data.has_more !== "boolean") {
        throw new Error("Risposta Fish Audio non riconosciuta.");
      }
      rows.push(...data[field] as T[]);
      if (!data.has_more) return rows;
      if (typeof data.next_cursor !== "string" || !data.next_cursor || seen.has(data.next_cursor)) break;
      cursor = data.next_cursor;
      seen.add(cursor);
    }
    throw new Error("Elenco Fish Audio incompleto: paginazione non conclusa. Non usarlo per sincronizzare i dati.");
  }

  listAgents() { return this.#list<FishAgent>("/v1/agent/agents", "agents"); }
  listPhoneNumbers() { return this.#list<FishPhoneNumber>("/v1/agent/phone-numbers", "phone_numbers"); }

  async listOwnVoices() {
    const voices: { id: string; name: string; languages: string[] }[] = [];
    for (let page = 1; page <= 20; page++) {
      const data = await (await this.#request(`/model?self=true&page_size=100&page_number=${page}`)).json();
      if (!Array.isArray(data.items) || typeof data.total !== "number") throw new Error("Elenco voci Fish non riconosciuto.");
      for (const item of data.items) if (typeof item._id === "string" || typeof item.id === "string") voices.push({ id: item._id || item.id, name: item.title || "Voce personale", languages: Array.isArray(item.languages) ? item.languages : [] });
      if (data.has_more === false || (data.has_more !== true && (page * 100 >= data.total || data.items.length < 100))) return voices;
    }
    throw new Error("Elenco voci incompleto: aggiorna prima di scegliere una voce.");
  }

  async agentRequest(path: string, method = "GET", body?: unknown, headers?: Record<string, string>): Promise<any> {
    if (!path.startsWith("/v1/agent/") || path.includes("..")) throw new Error("Percorso Fish non valido.");
    const response = await this.#request(path, { method, headers: { "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (response.status === 204) return {};
    return response.json().catch(() => { throw new Error("Risposta Fish Audio non riconosciuta."); });
  }

  async previewSpeech(text: string, voiceId?: string, model = "s2.1-pro-free", options: {speed?:number;language?:string} = {}): Promise<ArrayBuffer> {
    if (!text.trim() || text.length > 500) throw new Error("Inserisci da 1 a 500 caratteri per la prova voce.");
    if (!/^[a-z0-9.-]+$/i.test(model)) throw new Error("Modello Fish Audio non valido.");
    if(options.speed!==undefined && (!Number.isFinite(options.speed) || options.speed<0.5 || options.speed>2))throw new Error("Velocità della voce non valida.");
    if(options.language!==undefined && !/^[A-Za-z0-9_-]{1,35}$/.test(options.language))throw new Error("Lingua della voce non valida.");
    const response = await this.#request("/v1/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", model },
      body: JSON.stringify({ text: text.trim(), format: "mp3", latency: "balanced", ...(voiceId ? { reference_id: voiceId } : {}), ...(options.speed!==undefined?{prosody:{speed:options.speed}}:{}), ...(options.language?{language:options.language}:{}) }),
    });
    const audio = await response.arrayBuffer();
    if (!audio.byteLength || audio.byteLength > 8 * 1024 * 1024) throw new Error("Audio di prova non valido.");
    return audio;
  }
}

/** Requires an explicit international number. Preserves the leading 0 in +39 landlines. */
export function fishPhone(raw: string): string {
  const number = raw.replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{6,14}$/.test(number)) throw new Error("Usa il numero internazionale completo, per esempio +39 seguito dal numero.");
  return number;
}

/** Keep this key stable on every retry of the SAME call. A builder never dials. */
export function buildFishOutboundRequest(input: {
  agentId: string; phoneNumberId: string; toNumber: string;
  idempotencyKey: string; companyId: string; variables?: Record<string, string>;
}) {
  if (![input.agentId, input.phoneNumberId, input.companyId].every(s => typeof s === "string" && s.trim())) {
    throw new Error("Servono agente, numero Fish e azienda.");
  }
  if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(input.idempotencyKey)) throw new Error("Serve una chiave di idempotenza stabile da 8 a 128 caratteri.");
  if (input.variables && (Object.keys(input.variables).length > 500 || Object.values(input.variables).some(v => typeof v !== "string"))) {
    throw new Error("Le variabili della chiamata devono essere stringhe (massimo 500).");
  }
  return {
    method: "POST" as const,
    url: FISH_API + "/v1/agent/phone-calls",
    headers: { "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
    body: {
      agent_id: input.agentId, phone_number_id: input.phoneNumberId,
      to_number: fishPhone(input.toNumber),
      metadata: { company_id: input.companyId },
      ...(input.variables ? { dynamic_variables: input.variables } : {}),
    },
  };
}

/** SIP credentials must be filled server-side, never embedded in an exported plan. */
export function buildFishSipPlan(number: string, agentId?: string, outboundHost?: string) {
  if (outboundHost && !/^(?!-)[a-z0-9.-]+(?::\d{1,5})?$/i.test(outboundHost)) {
    throw new Error("Indica il solo host SIP dell'operatore, senza sip:, percorso o credenziali.");
  }
  return {
    method: "POST" as const, url: FISH_API + "/v1/agent/phone-numbers",
    body: {
      provider: "sip", phone_number: fishPhone(number), label: "Numero aziendale esistente",
      ...(agentId ? { agent_id: agentId } : {}),
      ...(outboundHost ? { termination_uri: outboundHost, termination_transport: "tcp" } : {}),
    },
    readyToSubmit: false,
    requiredBeforeSubmit: [
      "Verificare proprietà del numero e supporto SIP con l'operatore.",
      "Configurare almeno un fattore di autenticazione inbound: SIP digest o IP autorizzati.",
      "Configurare il routing presso l'operatore verso l'endpoint SIP indicato da Fish.",
      ...(outboundHost ? ["Completare l'autenticazione di termination secondo l'operatore."] : ["Per chiamate in uscita e trasferimenti assistiti serve anche la termination SIP."]),
      "Verificare l'agente pubblicato e provare entrata, uscita e fallback su una linea di test.",
    ],
  };
}

/** Verify RAW bytes before parsing JSON. Scheme: t=unix,v1=hex HMAC-SHA256. */
export async function verifyFishWebhook(rawBody: Uint8Array, header: string | null, secret: string, nowSeconds = Date.now() / 1000): Promise<boolean> {
  if (!secret || !header || !Number.isFinite(nowSeconds)) return false;
  const parts = header.split(",").map(p => {
    const [name, value = ""] = p.trim().split("=", 2);
    return [name, value] as [string, string];
  });
  if (parts.filter(p => p[0] === "t").length !== 1 || parts.filter(p => p[0] === "v1").length !== 1) return false;
  const values = new Map(parts);
  const timestamp = values.get("t") ?? "";
  const signature = values.get("v1") ?? "";
  if (!/^\d+$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature) || Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const message = new Uint8Array(prefix.length + rawBody.length);
  message.set(prefix); message.set(rawBody, prefix.length);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = Uint8Array.from(signature.match(/../g)!, h => parseInt(h, 16));
  return crypto.subtle.verify("HMAC", key, bytes, message);
}

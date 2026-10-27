// Salt Edge V6 AIS only. https://docs.saltedge.com/v6/
export const SALTEDGE_API = "https://www.saltedge.com/api/v6";
export class SaltEdgeError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export function saltId(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,30}$/.test(value)) throw new SaltEdgeError("InvalidProviderId");
  return value;
}
export async function sha256(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), b => b.toString(16).padStart(2, "0")).join("");
}
function pemBytes(pem: string) {
  return Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), c => c.charCodeAt(0));
}
function base64(bytes: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
export async function importSaltKey(pem: string, privateKey: boolean) {
  return crypto.subtle.importKey(privateKey ? "pkcs8" : "spki", pemBytes(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, privateKey ? ["sign"] : ["verify"]);
}
export interface SaltConfig { appId: string; secret: string; privateKey: string; mode: "pending" | "test"; accessType: "client" | "partner"; origin: string; webhookBase: string }
export function saltConfiguration(env: (name: string) => string | undefined, companyId: string): SaltConfig {
  const allowed = (env("SALTEDGE_BETA_COMPANY_IDS") ?? "").split(",").map(s => s.trim());
  if (!allowed.includes(companyId)) throw new SaltEdgeError("BetaNotEnabled", 403);
  const mode = env("SALTEDGE_MODE") ?? "pending";
  if (mode !== "pending" && mode !== "test") throw new SaltEdgeError("BetaModeRequired", 503);
  const appId = env("SALTEDGE_APP_ID"), secret = env("SALTEDGE_SECRET"), privateKey = env("SALTEDGE_PRIVATE_KEY");
  const accessType = env("SALTEDGE_ACCESS_TYPE");
  const origin = env("SALTEDGE_APP_ORIGIN"), webhookBase = env("SALTEDGE_WEBHOOK_BASE_URL");
  if (!appId || !secret || !privateKey || !origin || !webhookBase || (accessType !== "client" && accessType !== "partner")) throw new SaltEdgeError("NotConfigured", 503);
  const u = new URL(origin), callback = new URL(webhookBase);
  if (u.origin !== origin || (u.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(u.hostname)) || callback.protocol !== "https:") throw new SaltEdgeError("InvalidConfiguration", 503);
  return { appId, secret, privateKey: privateKey.replace(/\\n/g, "\n"), mode, accessType, origin, webhookBase: webhookBase.replace(/\/$/, "") };
}
export function saltWidgetUrl(value: unknown): string {
  if (typeof value !== "string") throw new SaltEdgeError("InvalidWidgetUrl");
  const u = new URL(value);
  if (u.origin !== "https://www.saltedge.com" || u.username || u.password) throw new SaltEdgeError("InvalidWidgetUrl");
  return u.href;
}
export function saltReturnUrl(origin: string, path: unknown, state: string) {
  const valid = ["/azienda/impostazioni/integrazioni", "/azienda/tesoreria"];
  const u = new URL(typeof path === "string" && valid.includes(path) ? path : valid[0], origin);
  u.searchParams.set("bank_provider", "saltedge"); u.searchParams.set("se_state", state);
  return u.href;
}
export class SaltEdgeClient {
  private key?: Promise<CryptoKey>;
  constructor(private config: SaltConfig, private fetcher: typeof fetch = fetch) {}
  get accessType() { return this.config.accessType; }
  get mode() { return this.config.mode; }
  async request<T = Record<string, unknown>>(path: string, method = "GET", data?: unknown): Promise<{ data: T; meta?: { next_id?: string | null } }> {
    if (!/^\/(customers|connections|accounts|transactions|consents)(?:[/?]|$)/.test(path) || path.includes("..") || path.includes("#")) throw new SaltEdgeError("InvalidApiPath");
    const url = SALTEDGE_API + path;
    const body = data === undefined ? "" : JSON.stringify({ data });
    const expires = String(Math.floor(Date.now() / 1000) + 60);
    this.key ??= importSaltKey(this.config.privateKey, true).catch(() => { throw new SaltEdgeError("InvalidSigningKey", 503); });
    const signature = base64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await this.key, new TextEncoder().encode(`${expires}|${method}|${url}|${body}`)));
    const response = await this.fetcher(url, { method, redirect: "error", signal: AbortSignal.timeout(15000), headers: {
      Accept: "application/json", "Content-Type": "application/json", "App-id": this.config.appId, Secret: this.config.secret,
      "Expires-at": expires, Signature: signature,
    }, ...(body ? { body } : {}) });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.error || !result || !("data" in result)) {
      console.error("saltedge upstream request failed", { status: response.status, contentType: response.headers.get("content-type"), responseFields: result && typeof result === "object" ? Object.keys(result) : [] });
      if (response.status === 403 && response.headers.get("content-type")?.includes("text/html")) throw new SaltEdgeError("UpstreamRequestRejected", 502);
      throw new SaltEdgeError(typeof result?.error?.class === "string" ? result.error.class : "ProviderUnavailable", response.status === 429 ? 429 : 502);
    }
    return result;
  }
  async list<T>(path: string): Promise<T[]> {
    const rows: T[] = [], seen = new Set<string>();
    let next: string | null = null;
    for (let page = 0; page < 100; page++) {
      const suffix: string = `${path.includes("?") ? "&" : "?"}per_page=100${next ? `&from_id=${saltId(next)}` : ""}`;
      const r: { data: T[]; meta?: { next_id?: string | null } } = await this.request<T[]>(path + suffix);
      if (!Array.isArray(r.data)) throw new SaltEdgeError("InvalidProviderResponse");
      rows.push(...r.data); next = r.meta?.next_id ?? null;
      if (!next) return rows;
      if (seen.has(next)) throw new SaltEdgeError("InvalidPagination");
      seen.add(next);
    }
    throw new SaltEdgeError("ImportTooLarge");
  }
}
export interface SaltConnection { id: string; customer_id: string; status: string; provider_code: string; provider_name: string; country_code: string; next_refresh_possible_at?: string | null; last_consent_id?: string; last_attempt?: { finished?: boolean; custom_fields?: { eic_session_id?: string } } }
export interface SaltAccount { id: string; connection_id: string; name: string; currency_code: string; balance: number; updated_at?: string; extra?: { iban?: string; client_name?: string; status?: string } }
export interface SaltTransaction { id: string; account_id: string; amount: number; currency_code: string; made_on: string; status: string; duplicated?: boolean; description?: string; extra?: { payer?: string; payee?: string; creditor_iban?: string; debtor_iban?: string; reference_number?: string } }
export function saltTransaction(t: SaltTransaction, remoteAccount: string, companyId: string, accountId: string) {
  saltId(t.id);
  if (t.account_id !== remoteAccount || !Number.isFinite(t.amount) || !/^\d{4}-\d{2}-\d{2}$/.test(t.made_on) || !/^[A-Z]{3}$/.test(t.currency_code)) throw new SaltEdgeError("InvalidTransaction");
  if (t.duplicated || t.status !== "posted") return null;
  return { company_id: companyId, account_id: accountId, external_transaction_id: `se:${remoteAccount}:${t.id}`,
    booking_date: t.made_on, value_date: null, amount: t.amount, currency: t.currency_code, description: t.description ?? null,
    transaction_type: t.amount < 0 ? "debit" : "credit", status: "booked",
    creditor_name: t.extra?.payee ?? null, debtor_name: t.extra?.payer ?? null,
    creditor_iban: t.extra?.creditor_iban ?? null, debtor_iban: t.extra?.debtor_iban ?? null,
    reference: t.extra?.reference_number ?? null, metadata: { ...t, provider: "saltedge" }, synced_at: new Date().toISOString() };
}
export const SALTEDGE_CALLBACK_KEY_V6 = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8qxSS5BmftHK/eyW+o98
NR89TyDmz1V8e6yyFdoMPddEYN4Bcidkk2whoJEc/T/AKghHQ9Nq+DuebnRYYcSJ
YT99VbR1PpIw2R9i8z+DZ79hoizy6z+rwxGANnJOr5BDF5HUKJ8uKS9yGRieojFv
Y9j+rxH6Fj6P90bO4d2igYYspKVoI3Zb3hWS0LrWN+JXAaW9qcOmQPTgO0WG0MUK
gB3NNMfN7gMIkl3chbaULiEgVciP2qZTIGb1b7IDr5+fA9oVVGaXiybdieGHIa4J
S7JNTf0JjWrIKd2DaczKULnghqNQsnoCu+S8BurEOJR5EN1BBfQBPlbSh+ru1zgZ
AQIDAQAB
-----END PUBLIC KEY-----`;
export async function verifySaltCallbackSignature(url: string, raw: string, signature: string | null, version: string | null, pem = SALTEDGE_CALLBACK_KEY_V6): Promise<boolean> {
  if (!signature || version !== "6.0" || raw.length > 65536 || signature.length > 2048) return false;
  try { return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", await importSaltKey(pem, false), Uint8Array.from(atob(signature), c => c.charCodeAt(0)), new TextEncoder().encode(`${url}|${raw}`)); } catch { return false; }
}
export async function saltBody(req: Request) {
  if (!req.body) return "";
  const reader = req.body.getReader(); const decoder = new TextDecoder(); let size = 0, raw = "";
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new SaltEdgeError("PayloadTooLarge", 413); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    return raw + decoder.decode();
  } finally { reader.releaseLock(); }
}
export function saltPublicError(error: unknown) {
  const code = error instanceof SaltEdgeError ? error.code : "Unavailable";
  const messages: Record<string, string> = {
    BetaNotEnabled: "La beta Salt Edge non e' abilitata per questa azienda.", NotConfigured: "Collegamento Salt Edge da configurare sul server.",
    InvalidSigningKey: "La chiave di firma Salt Edge non e' valida. Verifica il formato PEM nei segreti del backend.",
    UpstreamRequestRejected: "Salt Edge ha rifiutato la richiesta. Verifica il dominio HTTPS di ritorno e la configurazione con il fornitore.",
    BetaModeRequired: "La beta consente solo Pending o Test, non la produzione.", ClientPending: "Account Salt Edge Pending: sono disponibili solo banche simulate.",
    AispConsentExpired: "Consenso scaduto: ricollega la banca.", AispConsentRevoked: "Consenso revocato: ricollega la banca.",
    Busy: "Operazione bancaria gia' in corso. Riprova fra poco.", MigrationRequired: "Questo IBAN e' gia' presente nel precedente connettore. Serve una migrazione controllata, senza duplicare i saldi.",
    RefreshNotAvailable: "La banca non consente ancora un nuovo aggiornamento. Riprova dopo l'intervallo previsto.",
    DifferentConsentOwner: "Il consenso va rinnovato dall'utente che ha collegato questa banca.",
    NoAccounts: "Nessun conto disponibile per questo consenso. Verifica la selezione nella banca e riprova.",
  };
  return { error: messages[code] ?? "Operazione bancaria non completata. Riprova o verifica il collegamento.", code };
}

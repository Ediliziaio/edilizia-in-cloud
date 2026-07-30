// supabase/functions/_shared/billingAdapter.ts
// Sistema di sola integrazione/monitoraggio — nessuna logica di creazione fatture

// ── TIPI COMUNI ────────────────────────────────────────────────

export type BillingProvider =
  | "fattureincloud"
  | "fattura24"
  | "aruba"
  | "invoicetronic"
  | "itala"
  | "acube"
  | "standalone";

// Capacità per-provider. I provider "puri SDI" espongono SOLO lo stato di
// trasmissione (inviata/consegnata/scartata), NON lo stato di pagamento: quello
// esiste solo nei provider che sono anche gestionali completi. L'import e la UI
// usano questo flag per non mostrare/derivare un "pagato" inesistente.
export const PROVIDER_CAPABILITIES: Record<string, { supportsPaymentStatus: boolean; label: string }> = {
  fattureincloud: { supportsPaymentStatus: true, label: "Fatture in Cloud" },
  fattura24: { supportsPaymentStatus: true, label: "Fattura24" },
  aruba: { supportsPaymentStatus: false, label: "Aruba" },
  invoicetronic: { supportsPaymentStatus: false, label: "Invoicetronic" },
  itala: { supportsPaymentStatus: false, label: "ITALA (fattura-elettronica-api.it)" },
  acube: { supportsPaymentStatus: false, label: "A-Cube" },
  standalone: { supportsPaymentStatus: false, label: "Standalone" },
};

export interface ProviderStatusResult {
  success: boolean;
  internalStatus: "draft" | "issued" | "sent" | "delivered" | "paid" | "cancelled";
  externalStatus?: string;
  sdiId?: string;
  error?: string;
}

// ── INTERFACCIA COMUNE (solo lettura/monitoraggio) ─────────────

export interface BillingProviderAdapter {
  provider: BillingProvider;
  testConnection(): Promise<{ success: boolean; companyName?: string; error?: string }>;
  fetchStatus(externalId: string): Promise<ProviderStatusResult>;
}

// ── ADAPTER 1: FATTURE IN CLOUD ────────────────────────────────

export class FattureInCloudAdapter implements BillingProviderAdapter {
  provider: BillingProvider = "fattureincloud";
  private token: string;
  private ficCompanyId: string;

  constructor(token: string, ficCompanyId: string) {
    this.token = token;
    this.ficCompanyId = ficCompanyId;
  }

  private get base() { return `https://api-v2.fattureincloud.it/c/${this.ficCompanyId}`; }
  private get h() { return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }; }

  async testConnection() {
    try {
      const r = await fetch("https://api-v2.fattureincloud.it/user/companies", { headers: this.h });
      if (!r.ok) return { success: false, error: `HTTP ${r.status}` };
      const d = await r.json();
      const co = d?.data?.companies?.find((c: Record<string, unknown>) => c.id?.toString() === this.ficCompanyId);
      return { success: true, companyName: co?.name as string };
    } catch (e) { return { success: false, error: String(e) }; }
  }

  async fetchStatus(externalId: string): Promise<ProviderStatusResult> {
    const r = await fetch(`${this.base}/issued_documents/${externalId}`, { headers: this.h });
    if (!r.ok) return { success: false, internalStatus: "sent", error: `HTTP ${r.status}` };
    const d = await r.json();
    const map: Record<string, ProviderStatusResult["internalStatus"]> = {
      ok: "delivered", sending: "sent", not_sent: "issued", error: "issued",
    };
    return {
      success: true,
      internalStatus: map[d.data?.status] || "sent",
      externalStatus: d.data?.status,
      sdiId: d.data?.ei_data?.sdi_id?.toString(),
    };
  }
}

// ── ADAPTER 2: FATTURA24 ───────────────────────────────────────

export class Fattura24Adapter implements BillingProviderAdapter {
  provider: BillingProvider = "fattura24";
  private apiKey: string;
  private base = "https://www.fattura24.com/api/v0";

  constructor(apiKey: string) { this.apiKey = apiKey; }

  async testConnection() {
    try {
      const r = await fetch(`${this.base}/getCustomers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: this.apiKey, limit: 1 }),
      });
      if (!r.ok) return { success: false, error: `HTTP ${r.status}` };
      const d = await r.json();
      if (d.error) return { success: false, error: d.error };
      return { success: true, companyName: "Account Fattura24" };
    } catch (e) { return { success: false, error: String(e) }; }
  }

  async fetchStatus(externalId: string): Promise<ProviderStatusResult> {
    try {
      const r = await fetch(`${this.base}/getDocument`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: this.apiKey, docId: externalId }),
      });
      if (!r.ok) return { success: false, internalStatus: "issued", error: `HTTP ${r.status}` };
      const d = await r.json();
      const doc = d.document || d;
      const isPaid = doc.paid === true || doc.paymentStatus === "paid";
      return {
        success: true,
        internalStatus: isPaid ? "paid" : "issued",
        externalStatus: doc.paymentStatus || (isPaid ? "paid" : "issued"),
      };
    } catch (e) {
      return { success: false, internalStatus: "issued", error: String(e) };
    }
  }
}

// ── ADAPTER 3: ARUBA FATTURAZIONE ELETTRONICA ─────────────────
// API REST verificata su doc ufficiale (fatturazioneelettronica.aruba.it/apidoc).
// Auth = OAuth2 password grant (user+password dell'account Aruba) → access_token
// 30 min + refresh_token. ⚠️ /auth/signin è limitato a 1 richiesta/minuto: il token
// VA cachato e rinnovato col refresh, mai re-signin a ogni chiamata.
// Lista emesse = GET /services/invoice/out/findByUsername (paginata, NO importi).

export const ARUBA_AUTH = (demo = false) =>
  demo ? "https://demoauth.fatturazioneelettronica.aruba.it" : "https://auth.fatturazioneelettronica.aruba.it";
export const ARUBA_WS = (demo = false) =>
  demo ? "https://demows.fatturazioneelettronica.aruba.it" : "https://ws.fatturazioneelettronica.aruba.it";

export interface ArubaToken {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // secondi (tipicamente 1800)
}

// Mappa stato Aruba (stringa) → stato interno. Aruba espone solo lo stato SDI
// (nessuno stato di pagamento): vedi PROVIDER_CAPABILITIES.supportsPaymentStatus=false.
export const ARUBA_STATUS_MAP: Record<string, ProviderStatusResult["internalStatus"]> = {
  "Presa in carico": "sent",        // 1 — accettata da Aruba, in lavorazione
  "Errore elaborazione": "issued",  // 2 — errore in elaborazione
  "Inviata": "sent",                // 3 — trasmessa a SDI
  "Scartata": "issued",             // 4 — scartata da SDI (NS)
  "Non consegnata": "sent",         // 5 — SDI non ha potuto consegnare (ritenta)
  "Recapito impossibile": "delivered", // 6 — MC: depositata nel cassetto fiscale
  "Consegnata": "delivered",        // 7 — consegnata (RC)
  "Accettata": "delivered",         // 8 — accettata dal destinatario (PA)
  "Rifiutata": "issued",            // 9 — rifiutata dal destinatario (PA)
  "Decorrenza termini": "delivered", // 10 — DT (PA)
};

/**
 * Traduce i messaggi di Aruba in qualcosa su cui l'utente possa agire.
 * Aruba risponde con frasi come "Errore deleghe utente", corrette dal suo punto
 * di vista e inutili dal nostro: chi le legge non sa se ha sbagliato password,
 * se gli manca un servizio o se deve chiamare l'assistenza. Il messaggio
 * originale resta in coda, serve quando si apre un ticket con loro.
 */
export function spiegaErroreAruba(e: unknown): string {
  const raw = String(e instanceof Error ? e.message : e);
  const t = raw.toLowerCase();
  const coda = ` (messaggio di Aruba: "${raw.slice(0, 160)}")`;

  if (t.includes("delegh")) {
    return "Questa utenza non ha deleghe attive su nessuna azienda. Di solito significa che il servizio " +
      "Fatturazione Elettronica non e' ancora attivo sull'account, oppure che l'utenza e' un sub-utente " +
      "a cui non e' stata assegnata la delega sulla partita IVA. Si sistema dal pannello Aruba." + coda;
  }
  if (t.includes("credenziali non valide") || t.includes("invalid_grant") || t.includes("http 401")) {
    return "Utenza o password non riconosciute. Attenzione: servono le credenziali del pannello " +
      "Fatturazione Elettronica (nella forma XXXXXX_YYYY), non l'email e la password dell'area clienti Aruba." + coda;
  }
  if (t.includes("limite 1/min") || t.includes("429")) {
    return "Aruba consente un solo tentativo di accesso al minuto. Aspetta sessanta secondi e riprova." + coda;
  }
  if (t.includes("http 403")) {
    return "Aruba ha rifiutato la richiesta: l'accesso alle API non risulta abilitato su questa utenza. " +
      "Va attivato dal pannello Aruba, nella sezione dedicata ai servizi web." + coda;
  }
  if (t.includes("http 5")) {
    return "I server di Aruba hanno risposto con un errore momentaneo. Non dipende dai dati inseriti: riprova piu' tardi." + coda;
  }
  return raw;
}

export async function arubaSignin(username: string, password: string, demo = false): Promise<ArubaToken> {
  const r = await fetch(`${ARUBA_AUTH(demo)}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ grant_type: "password", username, password }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(r.status === 429
      ? "Aruba: troppe richieste di login (limite 1/min). Riprova tra un minuto."
      : `Aruba signin HTTP ${r.status}${t ? ` — ${t.slice(0, 120)}` : ""}`);
  }
  const d = await r.json();
  if (!d.access_token) throw new Error("Aruba: credenziali non valide");
  return { access_token: d.access_token, refresh_token: d.refresh_token, expires_in: d.expires_in ?? 1800 };
}

export async function arubaRefresh(refresh_token: string, demo = false): Promise<ArubaToken> {
  const r = await fetch(`${ARUBA_AUTH(demo)}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token }),
  });
  if (!r.ok) throw new Error(`Aruba refresh HTTP ${r.status}`);
  const d = await r.json();
  if (!d.access_token) throw new Error("Aruba: refresh token non valido");
  return { access_token: d.access_token, refresh_token: d.refresh_token || refresh_token, expires_in: d.expires_in ?? 1800 };
}

export async function arubaFindByUsername(
  token: string,
  username: string,
  opts: { page?: number; size?: number; startDate?: string; endDate?: string; demo?: boolean } = {},
): Promise<{ errorCode?: string; content?: Record<string, unknown>[]; totalPages?: number; totalElements?: number }> {
  const qs = new URLSearchParams({
    username,
    page: String(opts.page ?? 1),
    size: String(Math.min(opts.size ?? 50, 100)),
  });
  if (opts.startDate) qs.set("startDate", opts.startDate);
  if (opts.endDate) qs.set("endDate", opts.endDate);
  const r = await fetch(`${ARUBA_WS(opts.demo)}/services/invoice/out/findByUsername?${qs}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(r.status === 429 ? "Aruba: limite richieste superato (12/min)." : `Aruba list HTTP ${r.status}`);
  const d = await r.json();
  if (d.errorCode && d.errorCode !== "0000") throw new Error(`Aruba: ${d.errorDescription || d.errorCode}`);
  return d;
}

/**
 * Fatture RICEVUTE (cassetto SDI) — endpoint speculare a /out/findByUsername:
 * GET /services/invoice/in/findByUsername. Stessa forma di risposta della lista
 * emesse (content[] con filename/idSdi/invoices[]), ma il controparte è `sender`
 * (il FORNITORE che ha emesso verso di noi). Come per le emesse, la lista NON
 * espone gli importi (servirebbe l'XML p7m): importiamo header + anagrafica.
 */
export async function arubaFindInByUsername(
  token: string,
  username: string,
  opts: { page?: number; size?: number; startDate?: string; endDate?: string; demo?: boolean } = {},
): Promise<{ errorCode?: string; content?: Record<string, unknown>[]; totalPages?: number; totalElements?: number }> {
  const qs = new URLSearchParams({
    username,
    page: String(opts.page ?? 1),
    size: String(Math.min(opts.size ?? 50, 100)),
  });
  if (opts.startDate) qs.set("startDate", opts.startDate);
  if (opts.endDate) qs.set("endDate", opts.endDate);
  const r = await fetch(`${ARUBA_WS(opts.demo)}/services/invoice/in/findByUsername?${qs}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(r.status === 429 ? "Aruba: limite richieste superato (12/min)." : `Aruba list ricevute HTTP ${r.status}`);
  const d = await r.json();
  if (d.errorCode && d.errorCode !== "0000") throw new Error(`Aruba ricevute: ${d.errorDescription || d.errorCode}`);
  return d;
}

export class ArubaAdapter implements BillingProviderAdapter {
  provider: BillingProvider = "aruba";
  private username: string;
  private password: string;
  private demo: boolean;
  private cachedToken?: string;
  /** Popolato dopo testConnection(): permette al chiamante di persistere il token
   *  ottenuto nel signin di test, evitando un secondo signin (limite 1/min). */
  lastToken?: ArubaToken;

  constructor(username: string, password: string, opts: { accessToken?: string; demo?: boolean } = {}) {
    this.username = username;
    this.password = password;
    this.cachedToken = opts.accessToken;
    this.demo = opts.demo ?? false;
  }

  private async token(): Promise<string> {
    if (this.cachedToken) return this.cachedToken;
    const t = await arubaSignin(this.username, this.password, this.demo);
    this.lastToken = t;
    this.cachedToken = t.access_token;
    return t.access_token;
  }

  async testConnection() {
    // Il collegamento fa DUE passi e prima li confondeva in un errore solo: il
    // cliente leggeva il messaggio grezzo di Aruba (es. "Errore deleghe utente")
    // senza sapere se era colpa della password o della configurazione del suo
    // account. Ora si sa sempre quale passo e' saltato, e i messaggi noti di
    // Aruba diventano istruzioni.
    let token: string;
    try {
      const t = await arubaSignin(this.username, this.password, this.demo);
      this.lastToken = t;
      this.cachedToken = t.access_token;
      token = t.access_token;
    } catch (e) {
      return { success: false, error: `Accesso ad Aruba non riuscito. ${spiegaErroreAruba(e)}` };
    }
    try {
      const list = await arubaFindByUsername(token, this.username, { size: 1, demo: this.demo });
      const name = (list.content?.[0]?.sender as Record<string, unknown> | undefined)?.description as string | undefined;
      return { success: true, companyName: name || "Account Aruba" };
    } catch (e) {
      // Qui l'utenza e la password sono GIA' state accettate: il problema non
      // sono le credenziali ma cosa quell'utenza e' autorizzata a fare.
      return {
        success: false,
        error: `Credenziali corrette, ma l'utenza non riesce a leggere le fatture. ${spiegaErroreAruba(e)}`,
      };
    }
  }

  async fetchStatus(externalId: string): Promise<ProviderStatusResult> {
    try {
      const token = await this.token();
      const r = await fetch(`${ARUBA_WS(this.demo)}/services/invoice/out/${externalId}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!r.ok) return { success: false, internalStatus: "sent", error: `HTTP ${r.status}` };
      const d = await r.json();
      // Il dettaglio può tornare come singolo oggetto o dentro content[]; lo stato sta in invoices[].status.
      const node = (d.content?.[0] ?? d) as Record<string, any>;
      const statusStr = node?.invoices?.[0]?.status ?? node?.status;
      return {
        success: true,
        internalStatus: ARUBA_STATUS_MAP[statusStr] || "issued",
        externalStatus: statusStr,
        sdiId: node?.idSdi?.toString(),
      };
    } catch (e) {
      return { success: false, internalStatus: "sent", error: String(e instanceof Error ? e.message : e) };
    }
  }
}

// ── ADAPTER 4: INVOICETRONIC ───────────────────────────────────

export class InvoicetronicAdapter implements BillingProviderAdapter {
  provider: BillingProvider = "invoicetronic";
  private apiKey: string;
  private base = "https://api.invoicetronic.com/invoice/v1";

  constructor(apiKey: string) { this.apiKey = apiKey; }
  private get h() { return { "x-api-key": this.apiKey, "Content-Type": "application/json" }; }

  async testConnection() {
    try {
      const r = await fetch(`${this.base}/company`, { headers: this.h });
      if (!r.ok) return { success: false, error: `HTTP ${r.status}` };
      const d = await r.json();
      return { success: true, companyName: d?.name || "Account Invoicetronic" };
    } catch (e) { return { success: false, error: String(e) }; }
  }

  async fetchStatus(externalId: string): Promise<ProviderStatusResult> {
    const r = await fetch(`${this.base}/send/${externalId}`, { headers: this.h });
    if (!r.ok) return { success: false, internalStatus: "sent" };
    const d = await r.json();
    const map: Record<string, ProviderStatusResult["internalStatus"]> = {
      Delivered: "delivered", Sent: "sent", Pending: "sent",
      Error: "issued", Paid: "paid", Accepted: "delivered",
    };
    return { success: true, internalStatus: map[d.status] || "issued", externalStatus: d.status, sdiId: d.sdi_id?.toString() };
  }
}

// ── ADAPTER 5: ITALA (fattura-elettronica-api.it) ─────────────
// Intermediario SDI accreditato. Auth: Bearer token (o Basic) per-account.
// Listing: GET /fatture (paginato). Stato singolo: GET /fatture/{id} → sdi_stato.
// Solo stato SDI (nessuno stato pagamento).

export class ItalaAdapter implements BillingProviderAdapter {
  provider: BillingProvider = "itala";
  private token: string;
  private base = "https://fattura-elettronica-api.it/ws2.0/prod";

  constructor(bearerToken: string) { this.token = bearerToken; }
  private get h() { return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }; }

  async testConnection() {
    try {
      const r = await fetch(`${this.base}/fatture?per_page=1`, { headers: this.h });
      if (!r.ok) return { success: false, error: `HTTP ${r.status}` };
      return { success: true, companyName: "Account ITALA" };
    } catch (e) { return { success: false, error: String(e) }; }
  }

  async fetchStatus(externalId: string): Promise<ProviderStatusResult> {
    const r = await fetch(`${this.base}/fatture/${externalId}`, { headers: this.h });
    if (!r.ok) return { success: false, internalStatus: "sent", error: `HTTP ${r.status}` };
    const d = await r.json();
    // Enum sdi_stato (privati): INVI/PREN inviata, CONS consegnata, ERRO/NONC scartata.
    // PA: ACCE accettata, RIFI rifiutata, DECO decorrenza termini.
    const map: Record<string, ProviderStatusResult["internalStatus"]> = {
      INVI: "sent", PREN: "sent", CONS: "delivered", ERRO: "issued", NONC: "issued",
      ACCE: "delivered", RIFI: "issued", DECO: "delivered",
    };
    return {
      success: true,
      internalStatus: map[d.sdi_stato] || "issued",
      externalStatus: d.sdi_stato,
      sdiId: d.sdi_identificativo?.toString(),
    };
  }
}

// ── ADAPTER 6: A-CUBE (acubeapi.com) ──────────────────────────
// BETA. Auth verificata (doc ufficiale): login email/password → JWT 24h su host
// "common"; le risorse gov-it stanno su un host separato. ⚠️ Host risorse gov-it e
// nomi-campo per-fattura NON verificati (doc reference JS-rendered): testConnection
// valida PRIMA host+credenziali, così un host errato fallisce subito invece di
// importare dati sbagliati. Stato SDI nel campo `marking`. Nessuno stato pagamento.

export const ACUBE_AUTH = (demo = false) =>
  demo ? "https://common-sandbox.api.acubeapi.com" : "https://common.api.acubeapi.com";
// Host risorse gov-it (Italia) — DA VALIDARE sullo swagger sandbox (api-sandbox.acubeapi.com/docs.html).
export const ACUBE_API = (demo = false) =>
  demo ? "https://api-sandbox.acubeapi.com" : "https://api.acubeapi.com";

export const ACUBE_MARKING_MAP: Record<string, ProviderStatusResult["internalStatus"]> = {
  waiting: "sent", quarantena: "sent", sent: "sent", "invoice-error": "issued",
  received: "delivered", rejected: "issued", delivered: "delivered",
  "delivered-pa": "delivered", "not-delivered": "delivered", "deadline-terms": "delivered",
};

export async function acubeLogin(email: string, password: string, demo = false): Promise<string> {
  const r = await fetch(`${ACUBE_AUTH(demo)}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(r.status === 401 ? "A-Cube: credenziali non valide" : `A-Cube login HTTP ${r.status}`);
  const d = await r.json();
  if (!d.token) throw new Error("A-Cube: token non ricevuto");
  return d.token as string;
}

export async function acubeListInvoices(
  token: string,
  opts: { page?: number; itemsPerPage?: number; demo?: boolean } = {},
): Promise<Record<string, any>> {
  const qs = new URLSearchParams({
    page: String(opts.page ?? 1),
    itemsPerPage: String(Math.min(opts.itemsPerPage ?? 100, 100)),
  });
  const r = await fetch(`${ACUBE_API(opts.demo)}/invoices?${qs}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/ld+json" },
  });
  if (!r.ok) throw new Error(`A-Cube list HTTP ${r.status}`);
  return await r.json();
}

export class AcubeAdapter implements BillingProviderAdapter {
  provider: BillingProvider = "acube";
  private email: string;
  private password: string;
  private demo: boolean;
  private cachedToken?: string;
  /** Token JWT (24h) ottenuto nel login: il chiamante lo persiste per riusarlo. */
  lastToken?: string;

  constructor(email: string, password: string, opts: { accessToken?: string; demo?: boolean } = {}) {
    this.email = email;
    this.password = password;
    this.cachedToken = opts.accessToken;
    this.demo = opts.demo ?? false;
  }

  private async token(): Promise<string> {
    if (this.cachedToken) return this.cachedToken;
    const t = await acubeLogin(this.email, this.password, this.demo);
    this.lastToken = t;
    this.cachedToken = t;
    return t;
  }

  async testConnection() {
    try {
      const t = await acubeLogin(this.email, this.password, this.demo);
      this.lastToken = t;
      this.cachedToken = t;
      // Valida l'host risorse: se è errato/non raggiungibile, fallisce QUI (niente import sbagliato).
      await acubeListInvoices(t, { itemsPerPage: 1, demo: this.demo });
      return { success: true, companyName: "Account A-Cube" };
    } catch (e) { return { success: false, error: String(e instanceof Error ? e.message : e) }; }
  }

  async fetchStatus(externalId: string): Promise<ProviderStatusResult> {
    try {
      const token = await this.token();
      const r = await fetch(`${ACUBE_API(this.demo)}/invoices/${externalId}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!r.ok) return { success: false, internalStatus: "sent", error: `HTTP ${r.status}` };
      const d = await r.json();
      const marking = d?.marking;
      return { success: true, internalStatus: ACUBE_MARKING_MAP[marking] || "issued", externalStatus: marking };
    } catch (e) {
      return { success: false, internalStatus: "sent", error: String(e instanceof Error ? e.message : e) };
    }
  }
}

// ── ADAPTER 7: STANDALONE ─────────────────────────────────────

export class StandaloneAdapter implements BillingProviderAdapter {
  provider: BillingProvider = "standalone";
  async testConnection() { return { success: true, companyName: "Modalità Standalone" }; }
  async fetchStatus(_id: string): Promise<ProviderStatusResult> {
    return { success: true, internalStatus: "issued", externalStatus: "local_only" };
  }
}

// ── FACTORY ───────────────────────────────────────────────────

export function createAdapter(integration: {
  provider: string;
  access_token?: string | null;
  api_key?: string | null;
  company_external_id?: string | null;
}): BillingProviderAdapter {
  switch (integration.provider as BillingProvider) {
    case "fattureincloud":
      if (!integration.access_token || !integration.company_external_id)
        throw new Error("FIC: access_token e company_external_id richiesti");
      return new FattureInCloudAdapter(integration.access_token, integration.company_external_id);
    case "fattura24":
      if (!integration.api_key) throw new Error("Fattura24: api_key richiesta");
      return new Fattura24Adapter(integration.api_key);
    case "aruba":
      // Aruba: company_external_id = username, api_key = password (account Aruba FE).
      if (!integration.company_external_id || !integration.api_key)
        throw new Error("Aruba: username e password richiesti");
      return new ArubaAdapter(integration.company_external_id, integration.api_key, {
        accessToken: integration.access_token || undefined,
      });
    case "invoicetronic":
      if (!integration.api_key) throw new Error("Invoicetronic: api_key richiesta");
      return new InvoicetronicAdapter(integration.api_key);
    case "itala":
      if (!integration.api_key) throw new Error("ITALA: bearer token richiesto");
      return new ItalaAdapter(integration.api_key);
    case "acube":
      // A-Cube: company_external_id = email, api_key = password.
      if (!integration.company_external_id || !integration.api_key)
        throw new Error("A-Cube: email e password richieste");
      return new AcubeAdapter(integration.company_external_id, integration.api_key, {
        accessToken: integration.access_token || undefined,
      });
    default:
      return new StandaloneAdapter();
  }
}

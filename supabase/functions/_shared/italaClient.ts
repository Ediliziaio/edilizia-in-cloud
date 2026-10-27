import { providerId, type MassiveInput } from "./billingMassive.ts";
import { utf8ToBase64 } from "./base64.ts";

export interface ItalaCredentials { client_id: string; client_secret: string; environment: "test" | "prod" }
export type ItalaInvoice = Record<string, unknown> & { id: number; partita_iva?: string; ricezione?: number; sdi_fattura_xml?: string; sdi_fattura_base64?: string; sdi_nome_file?: string; sdi_identificativo?: number; sdi_stato?: string };
export interface MassiveRequest extends Partial<MassiveInput> {
  id: number; stato: string; file_richiesta?: string; num_documenti?: number; messaggio?: string;
}
/** Backwards compatible with accounts configured using a temporary Bearer token. */
export function readItalaCredentials(secret: string): ItalaCredentials | string {
  if (!secret?.trim()) throw new Error("Collega prima Fattura Elettronica API.");
  if (!secret.startsWith("{")) return secret;
  const c = JSON.parse(secret) as ItalaCredentials;
  if (!c.client_id || !c.client_secret || !["test", "prod"].includes(c.environment)) throw new Error("Credenziali API incomplete.");
  if (c.client_id.includes(":")) throw new Error("Client ID non valido.");
  return c;
}
export class ItalaClient {
  readonly environment: "test" | "prod";
  private authorization: string;
  private readonly base: string;
  constructor(secret: string, private readonly fetcher: typeof fetch = fetch) {
    const c = readItalaCredentials(secret);
    this.environment = typeof c === "string" ? "prod" : c.environment;
    this.base = `https://fattura-elettronica-api.it/ws2.0/${this.environment}`;
    this.authorization = typeof c === "string" ? `Bearer ${c}` : `Basic ${utf8ToBase64(`${c.client_id}:${c.client_secret}`)}`;
  }
  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    // Never follow provider-supplied Link URLs with credentials attached.
    if (!/^\/[a-z0-9/?=&_.%-]+$/i.test(path)) throw new Error("Percorso API non valido.");
    const r = await this.fetcher(`${this.base}${path}`, {
      method, headers: { Authorization: this.authorization, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(45_000),
    });
    if (r.status === 401 || r.status === 403) throw new Error("Credenziali Fattura Elettronica API non valide o permessi insufficienti. Verifica Client ID e Client Secret nella scheda personale.");
    const data = await r.json().catch(() => { throw new Error("Risposta del provider non leggibile."); }) as Record<string, unknown>;
    // Do not reflect provider errors: they can contain credentials or XML.
    if (!r.ok || (data && !Array.isArray(data) && data.error)) throw new Error(`Fattura Elettronica API: operazione non riuscita (HTTP ${r.status}). Controlla l'esito sul portale del provider.`);
    return data as T;
  }
  async invoicePage(vat: string, page: number, perPage = 100, dates?: { date_from?: string; date_to?: string }): Promise<ItalaInvoice[]> {
    const q = new URLSearchParams({ partita_iva: vat, page: String(page), per_page: String(perPage), unread: "false" });
    if (dates?.date_from) q.set("date_from", dates.date_from);
    if (dates?.date_to) q.set("date_to", dates.date_to);
    const rows = await this.request<ItalaInvoice[]>(`/fatture?${q}`);
    if (!Array.isArray(rows)) throw new Error("Elenco fatture del provider non valido.");
    for (const row of rows) {
      if (!row) throw new Error("Elenco fatture del provider non valido.");
      if (String(row.ricezione) === "0") row.ricezione = 0; else if (String(row.ricezione) === "1") row.ricezione = 1;
    }
    if (rows.some(r => !r || !r.id || (r.ricezione !== 0 && r.ricezione !== 1) || (r.partita_iva && r.partita_iva.replace(/^IT/i, "") !== vat))) {
      throw new Error("Il provider ha restituito documenti senza direzione o partita IVA verificabile. Importazione interrotta.");
    }
    return rows;
  }
  async listRequests(vat: string, page = 1): Promise<MassiveRequest[]> {
    const rows = await this.request<MassiveRequest[]>(`/richieste-massive?partita_iva=${vat}&per_page=100&page=${page}`);
    if (!Array.isArray(rows)) throw new Error("Elenco richieste del provider non valido.");
    return rows.filter(r => r.partita_iva?.replace(/^IT/i, "") === vat);
  }
  async ownedInvoice(id: unknown, vat: string): Promise<ItalaInvoice> {
    const number = providerId(id);
    const q = new URLSearchParams({ partita_iva: vat, id_from: String(number), id_to: String(number), unread: "false" });
    const rows = await this.request<ItalaInvoice[]>(`/fatture?${q}`);
    if (!Array.isArray(rows) || rows.length !== 1 || String(rows[0]?.id) !== String(number)) throw new Error("Fattura non appartenente a questa azienda.");
    return rows[0];
  }
  async ownedRequest(id: unknown, vat: string): Promise<MassiveRequest> {
    const result = await this.request<MassiveRequest>(`/richieste-massive/${providerId(id)}`);
    if (result.partita_iva?.replace(/^IT/i, "") !== vat) throw new Error("Richiesta non appartenente a questa azienda.");
    return result;
  }
  async create(input: MassiveInput): Promise<{ id: number; file_richiesta: string }> {
    return this.request("/richieste-massive", "POST", input);
  }
}

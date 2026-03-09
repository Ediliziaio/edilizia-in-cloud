// supabase/functions/_shared/billingAdapter.ts
// Sistema di sola integrazione/monitoraggio — nessuna logica di creazione fatture

// ── TIPI COMUNI ────────────────────────────────────────────────

export type BillingProvider =
  | "fattureincloud"
  | "fattura24"
  | "aruba"
  | "invoicetronic"
  | "standalone";

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

  private get base() { return `https://api.fattureincloud.it/v2/c/${this.ficCompanyId}`; }
  private get h() { return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }; }

  async testConnection() {
    try {
      const r = await fetch("https://api.fattureincloud.it/v2/user/companies", { headers: this.h });
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

  async fetchStatus(_id: string): Promise<ProviderStatusResult> {
    return { success: true, internalStatus: "sent", externalStatus: "unknown" };
  }
}

// ── ADAPTER 3: ARUBA FATTURAZIONE ELETTRONICA ─────────────────

export class ArubaAdapter implements BillingProviderAdapter {
  provider: BillingProvider = "aruba";
  private token: string;
  private base = "https://fatturazioneelettronica.aruba.it/v1";

  constructor(bearerToken: string) { this.token = bearerToken; }
  private get h() { return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }; }

  async testConnection() {
    try {
      const r = await fetch(`${this.base}/info`, { headers: this.h });
      if (!r.ok) return { success: false, error: `HTTP ${r.status}` };
      const d = await r.json();
      return { success: true, companyName: d?.company?.name || "Account Aruba" };
    } catch (e) { return { success: false, error: String(e) }; }
  }

  async fetchStatus(externalId: string): Promise<ProviderStatusResult> {
    const r = await fetch(`${this.base}/documents/${externalId}`, { headers: this.h });
    if (!r.ok) return { success: false, internalStatus: "sent", error: `HTTP ${r.status}` };
    const d = await r.json();
    const map: Record<string, ProviderStatusResult["internalStatus"]> = {
      CONSEGNATA: "delivered", INVIATA: "sent", IN_ELABORAZIONE: "sent",
      ERRORE: "issued", SCARTATA: "issued",
    };
    return { success: true, internalStatus: map[d.status] || "sent", externalStatus: d.status, sdiId: d.sdiId?.toString() };
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
      Delivered: "delivered", Sent: "sent", Pending: "sent", Error: "issued",
    };
    return { success: true, internalStatus: map[d.status] || "sent", externalStatus: d.status, sdiId: d.sdi_id?.toString() };
  }
}

// ── ADAPTER 5: STANDALONE ─────────────────────────────────────

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
      if (!integration.api_key) throw new Error("Aruba: bearer token richiesto");
      return new ArubaAdapter(integration.api_key);
    case "invoicetronic":
      if (!integration.api_key) throw new Error("Invoicetronic: api_key richiesta");
      return new InvoicetronicAdapter(integration.api_key);
    default:
      return new StandaloneAdapter();
  }
}

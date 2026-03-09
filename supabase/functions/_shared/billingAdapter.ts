// supabase/functions/_shared/billingAdapter.ts

// ── TIPI COMUNI ────────────────────────────────────────────────

export type BillingProvider =
  | "fattureincloud"
  | "fattura24"
  | "aruba"
  | "invoicetronic"
  | "standalone";

export interface ProviderInvoiceData {
  documentType: "invoice" | "credit_note" | "proforma";
  number: number;
  date: string;
  dueDate?: string;
  client: {
    name: string;
    vatNumber?: string;
    fiscalCode?: string;
    address?: string;
    city?: string;
    zip?: string;
    country?: string;
    sdiCode?: string;
    pec?: string;
  };
  lines: Array<{
    description: string;
    productCode?: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    discountPercent?: number;
    taxRate: number;
    taxNature?: string;
  }>;
  paymentMethod?: string;
  iban?: string;
  notes?: string;
  footerText?: string;
}

export interface ProviderSyncResult {
  success: boolean;
  externalId?: string;
  externalStatus?: string;
  sdiId?: string;
  error?: string;
  rawResponse?: unknown;
}

export interface ProviderStatusResult {
  success: boolean;
  internalStatus: "draft" | "issued" | "sent" | "delivered" | "paid" | "cancelled";
  externalStatus?: string;
  sdiId?: string;
  error?: string;
}

// ── INTERFACCIA COMUNE ─────────────────────────────────────────

export interface BillingProviderAdapter {
  provider: BillingProvider;
  testConnection(): Promise<{ success: boolean; companyName?: string; error?: string }>;
  pushInvoice(invoice: ProviderInvoiceData): Promise<ProviderSyncResult>;
  fetchStatus(externalId: string): Promise<ProviderStatusResult>;
  cancelInvoice(externalId: string): Promise<{ success: boolean; error?: string }>;
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
      const co = d?.data?.companies?.find((c: Record<string,unknown>) => c.id?.toString() === this.ficCompanyId);
      return { success: true, companyName: co?.name as string };
    } catch (e) { return { success: false, error: String(e) }; }
  }

  async pushInvoice(inv: ProviderInvoiceData): Promise<ProviderSyncResult> {
    const payload = {
      data: {
        type: inv.documentType === "credit_note" ? "credit_note" : "invoice",
        number: { value: inv.number },
        date: inv.date,
        client: {
          name: inv.client.name,
          vat_number: inv.client.vatNumber,
          fiscal_code: inv.client.fiscalCode,
          address_street: inv.client.address,
          address_city: inv.client.city,
          address_postal_code: inv.client.zip,
          address_country: inv.client.country || "IT",
          e_invoice: !!(inv.client.pec || inv.client.sdiCode),
          ei_code: inv.client.sdiCode,
          certified_email: inv.client.pec,
        },
        items_list: inv.lines.map(l => ({
          name: l.description,
          product_id: null,
          qty: l.quantity,
          measure: l.unit || "pz",
          net_price: l.unitPrice,
          discount: l.discountPercent || 0,
          vat: { value: l.taxRate },
        })),
        payment_method: { name: inv.paymentMethod || "Bonifico Bancario" },
        notes: inv.notes,
      },
    };
    const r = await fetch(`${this.base}/issued_documents`, {
      method: "POST", headers: this.h, body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) return { success: false, error: JSON.stringify(d), rawResponse: d };
    return { success: true, externalId: d.data?.id?.toString(), externalStatus: d.data?.status, rawResponse: d };
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

  async cancelInvoice(_id: string) {
    return { success: false, error: "FIC: emetti una nota di credito per annullare" };
  }
}

// ── ADAPTER 2: FATTURA24 ───────────────────────────────────────

export class Fattura24Adapter implements BillingProviderAdapter {
  provider: BillingProvider = "fattura24";
  private apiKey: string;
  private base = "https://www.fattura24.com/api/v0";
  private h = { "Content-Type": "application/json" };

  constructor(apiKey: string) { this.apiKey = apiKey; }

  async testConnection() {
    try {
      const r = await fetch(`${this.base}/getCustomers`, {
        method: "POST", headers: this.h,
        body: JSON.stringify({ apiKey: this.apiKey, limit: 1 }),
      });
      if (!r.ok) return { success: false, error: `HTTP ${r.status}` };
      const d = await r.json();
      if (d.error) return { success: false, error: d.error };
      return { success: true, companyName: "Account Fattura24" };
    } catch (e) { return { success: false, error: String(e) }; }
  }

  async pushInvoice(inv: ProviderInvoiceData): Promise<ProviderSyncResult> {
    const payload = {
      apiKey: this.apiKey,
      document: {
        documentType: inv.documentType === "credit_note" ? "NC" : "FT",
        name: inv.client.name,
        vat: inv.client.vatNumber || "",
        fiscalCode: inv.client.fiscalCode || "",
        address: inv.client.address || "",
        city: inv.client.city || "",
        cap: inv.client.zip || "",
        country: inv.client.country || "IT",
        documentDate: inv.date,
        sdiCode: inv.client.sdiCode || "0000000",
        pec: inv.client.pec || "",
        rows: inv.lines.map(l => ({
          description: l.description,
          qty: l.quantity,
          price: l.unitPrice,
          discount: l.discountPercent || 0,
          vatCode: `${l.taxRate}%`,
          um: l.unit || "pz",
        })),
        paymentMethod: inv.paymentMethod || "Bonifico Bancario",
        iban: inv.iban || "",
        footerNotes: inv.notes || "",
      },
    };
    const r = await fetch(`${this.base}/saveDocument`, {
      method: "POST", headers: this.h, body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok || d.error) return { success: false, error: d.error || `HTTP ${r.status}`, rawResponse: d };
    return { success: true, externalId: d.docId?.toString(), externalStatus: "sent", rawResponse: d };
  }

  async fetchStatus(_id: string): Promise<ProviderStatusResult> {
    return { success: true, internalStatus: "sent", externalStatus: "unknown" };
  }

  async cancelInvoice(externalId: string) {
    const r = await fetch(`${this.base}/deleteDocument`, {
      method: "POST", headers: this.h,
      body: JSON.stringify({ apiKey: this.apiKey, docId: externalId }),
    });
    const d = await r.json();
    return { success: r.ok && !d.error, error: d.error };
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

  async pushInvoice(inv: ProviderInvoiceData): Promise<ProviderSyncResult> {
    const linesByRate = inv.lines.reduce((acc: Record<number, number[]>, l) => {
      const net = l.quantity * l.unitPrice * (1 - (l.discountPercent || 0) / 100);
      if (!acc[l.taxRate]) acc[l.taxRate] = [];
      acc[l.taxRate].push(net);
      return acc;
    }, {});

    const payload = {
      FatturaElettronicaHeader: {
        DatiTrasmissione: {
          CodiceDestinatario: inv.client.sdiCode || "0000000",
          PECDestinatario: inv.client.pec,
        },
        CessionarioCommittente: {
          DatiAnagrafici: {
            Anagrafica: { Denominazione: inv.client.name },
            IdFiscaleIVA: inv.client.vatNumber
              ? { IdPaese: "IT", IdCodice: inv.client.vatNumber } : undefined,
            CodiceFiscale: inv.client.fiscalCode,
          },
          Sede: {
            Indirizzo: inv.client.address || "N/A",
            CAP: inv.client.zip || "00000",
            Comune: inv.client.city || "N/A",
            Nazione: inv.client.country || "IT",
          },
        },
      },
      FatturaElettronicaBody: {
        DatiGenerali: {
          DatiGeneraliDocumento: {
            TipoDocumento: inv.documentType === "credit_note" ? "TD04" : "TD01",
            Data: inv.date,
            Numero: inv.number.toString(),
          },
        },
        DatiBeniServizi: {
          DettaglioLinee: inv.lines.map((l, i) => ({
            NumeroLinea: i + 1,
            Descrizione: l.description,
            Quantita: l.quantity,
            UnitaMisura: l.unit || "PZ",
            PrezzoUnitario: l.unitPrice,
            ScontoMaggiorazione: l.discountPercent
              ? { Tipo: "SC", Percentuale: l.discountPercent } : undefined,
            PrezzoTotale: l.quantity * l.unitPrice * (1 - (l.discountPercent || 0) / 100),
            AliquotaIVA: l.taxRate,
            Natura: l.taxNature,
          })),
          DatiRiepilogo: Object.entries(linesByRate).map(([rate, amounts]) => ({
            AliquotaIVA: Number(rate),
            ImponibileImporto: amounts.reduce((a, b) => a + b, 0),
            Imposta: (amounts.reduce((a, b) => a + b, 0) * Number(rate)) / 100,
          })),
        },
        DatiPagamento: {
          CondizioniPagamento: "TP02",
          DettaglioPagamento: {
            ModalitaPagamento: "MP05",
            DataScadenzaPagamento: inv.dueDate,
            ImportoPagamento: inv.lines.reduce((sum, l) => {
              const net = l.quantity * l.unitPrice * (1 - (l.discountPercent || 0) / 100);
              return sum + net + (net * l.taxRate) / 100;
            }, 0),
            IBAN: inv.iban,
          },
        },
      },
    };

    const r = await fetch(`${this.base}/documents/send`, {
      method: "POST", headers: this.h, body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) return { success: false, error: JSON.stringify(d), rawResponse: d };
    return { success: true, externalId: d.documentId?.toString(), externalStatus: d.status || "sending", rawResponse: d };
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

  async cancelInvoice(_id: string) {
    return { success: false, error: "Aruba: annullamento non supportato via API" };
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

  async pushInvoice(inv: ProviderInvoiceData): Promise<ProviderSyncResult> {
    const payload = {
      cessionario_committente: {
        denominazione: inv.client.name,
        partita_iva: inv.client.vatNumber,
        codice_fiscale: inv.client.fiscalCode,
        indirizzo: inv.client.address,
        cap: inv.client.zip,
        comune: inv.client.city,
        nazione: inv.client.country || "IT",
      },
      dati_generali_documento: {
        tipo_documento: inv.documentType === "credit_note" ? "TD04" : "TD01",
        data: inv.date,
        numero: inv.number.toString(),
      },
      dettaglio_linee: inv.lines.map((l, i) => ({
        numero_linea: i + 1,
        descrizione: l.description,
        quantita: l.quantity,
        unita_misura: l.unit || "PZ",
        prezzo_unitario: l.unitPrice,
        sconto_percentuale: l.discountPercent,
        aliquota_iva: l.taxRate,
        natura: l.taxNature,
      })),
      dati_pagamento: {
        condizioni_pagamento: "TP02",
        dettaglio_pagamento: {
          modalita_pagamento: "MP05",
          data_scadenza_pagamento: inv.dueDate,
          iban: inv.iban,
        },
      },
      codice_destinatario: inv.client.sdiCode || "0000000",
      pec_destinatario: inv.client.pec,
    };
    const r = await fetch(`${this.base}/send`, {
      method: "POST", headers: this.h, body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) return { success: false, error: JSON.stringify(d), rawResponse: d };
    return { success: true, externalId: d.id?.toString(), externalStatus: d.status, rawResponse: d };
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

  async cancelInvoice(externalId: string) {
    const r = await fetch(`${this.base}/send/${externalId}`, { method: "DELETE", headers: this.h });
    return { success: r.ok, error: r.ok ? undefined : `HTTP ${r.status}` };
  }
}

// ── ADAPTER 5: STANDALONE ─────────────────────────────────────

export class StandaloneAdapter implements BillingProviderAdapter {
  provider: BillingProvider = "standalone";
  async testConnection() { return { success: true, companyName: "Modalità Standalone" }; }
  async pushInvoice(_inv: ProviderInvoiceData): Promise<ProviderSyncResult> {
    return { success: true, externalId: `standalone-${Date.now()}`, externalStatus: "local_only" };
  }
  async fetchStatus(_id: string): Promise<ProviderStatusResult> {
    return { success: true, internalStatus: "issued", externalStatus: "local_only" };
  }
  async cancelInvoice(_id: string) { return { success: true }; }
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

// ── HELPER: mappa invoice DB → ProviderInvoiceData ─────────────

export function mapInvoiceToProviderData(invoice: Record<string, unknown>): ProviderInvoiceData {
  const lines = (invoice.invoice_lines as Array<Record<string, unknown>>) || [];
  return {
    documentType: invoice.document_type as "invoice" | "credit_note" | "proforma",
    number: invoice.progressive_number as number,
    date: invoice.issue_date as string,
    dueDate: invoice.due_date as string | undefined,
    client: {
      name: invoice.client_company_name as string,
      vatNumber: invoice.client_vat_number as string | undefined,
      fiscalCode: invoice.client_fiscal_code as string | undefined,
      address: invoice.client_address as string | undefined,
      city: invoice.client_city as string | undefined,
      zip: invoice.client_zip as string | undefined,
      country: (invoice.client_country as string) || "IT",
      sdiCode: invoice.client_sdi_code as string | undefined,
      pec: invoice.client_pec as string | undefined,
    },
    lines: lines.map(l => ({
      description: l.description as string,
      productCode: l.product_code as string | undefined,
      quantity: l.quantity as number,
      unit: l.unit as string | undefined,
      unitPrice: l.unit_price as number,
      discountPercent: l.discount_percent as number | undefined,
      taxRate: l.tax_rate as number,
      taxNature: l.tax_nature as string | undefined,
    })),
    paymentMethod: invoice.payment_method as string | undefined,
    iban: invoice.bank_iban as string | undefined,
    notes: invoice.notes as string | undefined,
    footerText: invoice.footer_text as string | undefined,
  };
}

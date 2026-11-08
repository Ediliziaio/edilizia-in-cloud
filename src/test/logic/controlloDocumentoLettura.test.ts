import { beforeEach, describe, expect, it, vi } from "vitest";
import { DbFinto, denoFinto } from "../helpers/dbFinto";

const ai = vi.hoisted(() => ({ risposta: { righe: [] as unknown[] } as unknown, chiamate: [] as string[], ko: false }));

vi.mock("../../../supabase/functions/_shared/headers.ts", () => ({
  errorResponse: (msg: string, status: number) => new Response(JSON.stringify({ error: msg }), { status }),
  jsonResponse: (d: unknown, status: number) => new Response(JSON.stringify(d), { status }),
}));
vi.mock("../../../supabase/functions/_shared/auth.ts", () => ({ requireCompanyAccess: async (): Promise<void> => {} }));
vi.mock("../../../supabase/functions/_shared/ai-provider/directApi.ts", () => ({ chargeAndLogDirect: async (): Promise<void> => {}, estimateTokenCostUsd: () => 0.01 }));
vi.mock("../../../supabase/functions/_shared/ai-provider/billing.ts", () => ({ precallCheck: async () => ({ allow: true }) }));
vi.mock("../../../supabase/functions/_shared/directAiLedger.ts", () => ({ buildStableAiIdempotencyKey: async () => "k" }));
vi.mock("../../../supabase/functions/_shared/claudeProxy.ts", () => ({
  hasClaudeProvider: () => true,
  claudeMessages: async (body: { system: string; messages: Array<{ content: Array<{ text?: string }> }> }) => {
    ai.chiamate.push(body.system + JSON.stringify(body.messages.map((m) => m.content.map((c) => c.text ?? ""))));
    if (ai.ko) return new Response("guasto", { status: 500 });
    return new Response(JSON.stringify({ usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "text", text: JSON.stringify(ai.risposta) }] }), { status: 200 });
  },
}));

const pdf = (t: string) => btoa(t);
const giusta = { riferimento: "Cucina", descrizione: "Finestra PVC 2 ante", quantita: 1, larghezza_mm: 1200, altezza_mm: 1400, colore: "bianco", apertura: "anta ribalta", materiale: "PVC", prezzo_unitario: 700, confidenza: 95 };

function nuovoDb() {
  const db = new DbFinto({
    purchase_orders: [{ id: "po", company_id: "az", supplier_id: "s1", expected_delivery_date: "2026-12-01" }],
    purchase_order_items: [{ id: "r1", purchase_order_id: "po", description: "Finestra PVC 2 ante — Cucina", sku: null, quantity: 1, unit_of_measure: "pz", unit_price: 700, discount_percent: 0, price_pending: false, riferimento: "Cucina", misure: { larghezza: 1200, altezza: 1400 }, colore: "bianco", apertura: "Anta ribalta", misure_testo: "PVC", rfq_item_id: "v1", sort_order: 0 }],
    supplier_rfq_items: [{ id: "v1", rfq_id: "rfq" }],
    supplier_rfq_suppliers: [{ id: "rs", company_id: "az", rfq_id: "rfq", supplier_id: "s1", email_inbox_id: null }],
    controlli_documento_fornitore: [],
    company_acquisti_impostazioni: [{ company_id: "az", conferma_tolleranza_mm: 5 }],
    ai_model_usage_log: [],
    email_attachments: [{ id: "a1", inbox_id: "m1", filename: "x.pdf", mime_type: "application/pdf", storage_path: "p", size_bytes: 10 }],
    email_inbox: [{ id: "m1", company_id: "az", purchase_order_id: "altro" }],
  });
  db.rispostaRpc.has_permission_for_company = true;
  db.rifiuta = (tabella, riga) => {
    if (tabella !== "controlli_documento_fornitore") return null;
    const doppia = db.righe(tabella).some((r) => r.file_hash === riga.file_hash && r.tipo === riga.tipo && r.purchase_order_id === riga.purchase_order_id && r.rfq_supplier_id === riga.rfq_supplier_id);
    return doppia ? { message: "duplicate key", code: "23505" } : null;
  };
  return db;
}

async function modulo() {
  const percorso = "../../../supabase/functions/verify-purchase-order/controlloDocumento.ts";
  return await import(/* @vite-ignore */ percorso) as { controllaDocumento: (b: unknown, u: string, d: unknown, c: Record<string, string>) => Promise<Response> };
}
const corpo = async (r: Response) => ({ status: r.status, ...(await r.json()) });

describe("il controllo del documento nella funzione", () => {
  let db: DbFinto;
  const chiedi = async (extra: Record<string, unknown> = {}) => {
    const { controllaDocumento } = await modulo();
    return corpo(await controllaDocumento({ tipo: "conferma", purchase_order_id: "po", document_base64: pdf("documento"), file_nome: "c.pdf", ...extra }, "u", db.client, {}));
  };
  beforeEach(() => {
    vi.stubGlobal("Deno", denoFinto({}).deno);
    ai.chiamate = []; ai.ko = false; ai.risposta = { righe: [giusta] };
    db = nuovoDb();
  });

  it("documento giusto: verde, e l'AI non vede cosa abbiamo chiesto", async () => {
    const r = await chiedi();
    expect(r.esito).toBe("verde");
    expect(ai.chiamate[0]).not.toContain("1400");
    expect(ai.chiamate[0]).not.toContain("Finestra PVC");
    const riga = db.righe("controlli_documento_fornitore")[0];
    expect(riga.stato).toBe("letto");
    expect(riga.file_path).toContain("order-attachments/az/controlli-fornitore/");
  });

  it("documento con errore: rosso", async () => {
    ai.risposta = { righe: [{ ...giusta, altezza_mm: 1500 }] };
    expect((await chiedi()).esito).toBe("rosso");
  });

  it("consegna oltre la data chiesta: riga gialla in più", async () => {
    ai.risposta = { righe: [giusta], data_consegna: "2026-12-20" };
    const r = await chiedi();
    expect(r.esito).toBe("giallo");
    expect((db.righe("controlli_documento_fornitore")[0].righe as Array<{ chiave: string }>).map((x) => x.chiave)).toContain("consegna");
  });

  it("lo stesso file due volte: riconosciuto, l'AI non legge di nuovo", async () => {
    await chiedi();
    const r = await chiedi();
    expect(r.gia_caricato).toBe(true);
    expect(ai.chiamate).toHaveLength(1);
    expect(db.righe("controlli_documento_fornitore")).toHaveLength(1);
  });

  it("due schede insieme: una sola lettura", async () => {
    const [a, b] = await Promise.all([chiedi(), chiedi()]);
    expect(ai.chiamate).toHaveLength(1);
    expect([200, 409]).toContain(b.status);
    expect(a.status).toBe(200);
    expect(db.righe("controlli_documento_fornitore")).toHaveLength(1);
  });

  it("lettura fallita: non resta niente e si può riprovare", async () => {
    ai.ko = true;
    const { controllaDocumento } = await modulo();
    await expect(controllaDocumento({ tipo: "conferma", purchase_order_id: "po", document_base64: pdf("x") }, "u", db.client, {})).rejects.toBeInstanceOf(Response);
    expect(db.righe("controlli_documento_fornitore")).toHaveLength(0);
  });

  it("conferma uguale all'offerta già controllata: non si rilegge", async () => {
    const { controllaDocumento } = await modulo();
    await controllaDocumento({ tipo: "offerta", rfq_supplier_id: "rs", document_base64: pdf("stesso") }, "u", db.client, {});
    db.righe("supplier_rfq_items")[0].descrizione = "Finestra PVC 2 ante";
    const offerta = db.righe("controlli_documento_fornitore")[0];
    offerta.esito = "verde"; offerta.stato = "letto";
    ai.chiamate = [];
    const r = await chiedi({ document_base64: pdf("stesso") });
    expect(ai.chiamate).toHaveLength(0);
    expect(r.status).toBe(200);
  });

  it("un allegato di un altro ordine non si usa", async () => {
    expect((await chiedi({ document_base64: undefined, email_attachment_id: "a1" })).status).toBe(403);
  });

  it("senza permesso acquisti non legge", async () => {
    db.rispostaRpc.has_permission_for_company = false;
    expect((await chiedi()).status).toBe(403);
    expect(ai.chiamate).toHaveLength(0);
  });
});

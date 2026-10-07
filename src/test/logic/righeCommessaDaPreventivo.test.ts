/**
 * Preventivo → commessa: le due strade («Converti in Cantiere» e «Crea commessa
 * (rivedi)») producono le STESSE righe.
 *
 * «Rivedi» (useQuotePrefill) aveva la sua copia del conto e divergeva: copiava le
 * righe opzionali (non vendute), perdeva lo sconto di riga, e lasciava passare le
 * quantità decimali (85,5 m²), che create_order_atomic (`::integer`) rifiuta: la
 * creazione di tutta la commessa falliva con «invalid input syntax for type integer».
 * Ora le due strade usano la stessa funzione (righeCommessaDaPreventivo).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo, denoFinto, type Riga } from "../helpers/edgeFinto";
import { righePreventivoPerCommessa } from "@/hooks/useQuotePrefill";
import { righeCommessaDaPreventivo } from "../../../supabase/functions/_shared/righeCommessaDaPreventivo";

const condiviso = vi.hoisted(() => ({ db: null as unknown as DbMinimo, gestore: null as null | ((req: Request) => Promise<Response>) }));

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => condiviso.db }));
vi.mock("../../../supabase/functions/_shared/auth.ts", () => ({
  requireAuth: async () => ({ userId: "u-1", supabaseAdmin: condiviso.db }),
  requireCompanyAccess: async () => ({ companyId: "c-1" }),
}));

const riga = (extra: Riga = {}): Riga => ({
  id: "r", item_category: "prodotto", name: "Voce", description: null, quantity: 1, unit_price: 100, discount_percent: 0, vat_rate: 22,
  unit_of_measure: "pz", prezzo_acquisto: 60, is_optional: false, family_id: null, axis_selections: null, misura_x: null, misura_y: null, ...extra,
});

describe("righeCommessaDaPreventivo", () => {
  it("restano fuori note, subtotali, righe «Sconto», opzionali e righe a quantità 0", () => {
    const r = righeCommessaDaPreventivo([
      riga({ name: "Finestra" }), riga({ item_category: "nota", name: "Nota" }), riga({ item_category: "subtotale", name: "Sub" }),
      riga({ item_category: "sconto", name: "Sconto", unit_price: -50 }), riga({ name: "Opzione", is_optional: true }),
      riga({ name: "Niente", quantity: 0 }), riga({ name: "Posa", item_category: "posa" }),
    ]);
    expect(r.map((x) => x.name)).toEqual(["Finestra", "Posa"]);
  });

  it("lo sconto di riga viaggia con la riga", () => {
    const [r] = righeCommessaDaPreventivo([riga({ quantity: 4, unit_price: 850, discount_percent: 5 })]);
    expect(r).toMatchObject({ quantity: 4, unit_price: 850, discount_percent: 5, purchase_price: 60, vat_rate: 22 });
  });

  it("quantità decimale: 1 × il totale della riga, con la quantità vera in descrizione; i conti restano esatti", () => {
    const [r] = righeCommessaDaPreventivo([
      riga({ name: "Intonaco", quantity: 85.5, unit_price: 24, prezzo_acquisto: 11.5, unit_of_measure: "m²", description: "Civile" }),
    ]);
    expect(r.quantity).toBe(1);
    expect(r.unit_price).toBe(2052); // 85,5 × 24
    expect(r.purchase_price).toBe(983.25); // 85,5 × 11,50
    expect(r.description).toBe("85,5 m² × 24,00 € — Civile");
  });

  it("quantità mancante o rotta vale 1; intera resta com'è", () => {
    expect(righeCommessaDaPreventivo([riga({ quantity: null })])[0].quantity).toBe(1);
    expect(righeCommessaDaPreventivo([riga({ quantity: "boh" })])[0].quantity).toBe(1);
    expect(righeCommessaDaPreventivo([riga({ quantity: 7 })])[0].quantity).toBe(7);
  });

  it("riga su misura: famiglia, assi, misure e «da rilevare»; senza famiglia niente di tutto questo", () => {
    const [su, senza] = righeCommessaDaPreventivo([
      riga({ family_id: "fam-1", axis_selections: { colore: "bianco" }, misura_x: 1200, misura_y: 1400 }),
      riga({ misura_x: 1200, misura_y: 1400 }),
    ]);
    expect(su).toMatchObject({ family_id: "fam-1", axis_selections: { colore: "bianco" }, misure_preventivo: { larghezza: 1200, altezza: 1400 }, measure_status: "da_rilevare" });
    expect(senza).toMatchObject({ family_id: null, axis_selections: null, misure_preventivo: null, measure_status: null });
  });

  it("prezzo mancante resta mancante (null), il costo mancante vale 0", () => {
    const [r] = righeCommessaDaPreventivo([riga({ unit_price: null, prezzo_acquisto: null })]);
    expect(r.unit_price).toBeNull();
    expect(r.purchase_price).toBe(0);
  });
});

describe("«Crea commessa (rivedi)» e «Converti in Cantiere»: stesse righe", () => {
  const preventivoRighe = [
    riga({ name: "Finestra PVC", quantity: 4, unit_price: 850, discount_percent: 5, vat_rate: 10, family_id: "fam-1", axis_selections: { colore: "bianco" }, misura_x: 1200, misura_y: 1400 }),
    riga({ name: "Posa", item_category: "posa", quantity: 4, unit_price: 90, vat_rate: 10, prezzo_acquisto: 40 }),
    riga({ name: "Intonaco", quantity: 85.5, unit_price: 24, unit_of_measure: "m²", prezzo_acquisto: 11.5 }),
    riga({ name: "Zanzariera (opzione)", quantity: 2, unit_price: 120, is_optional: true }),
    riga({ item_category: "nota", name: "Nota interna" }),
  ];

  it("la strada «rivedi» dà le righe giuste: niente opzionali, sconto di riga, decimali a 1 × totale", () => {
    const items = righePreventivoPerCommessa(preventivoRighe);
    expect(items.map((i) => i.name)).toEqual(["Finestra PVC", "Posa", "Intonaco"]);
    expect(items[0]).toMatchObject({ quantity: 4, unit_price: 850, discount_percent: 5, vat_rate: 10, status: "da_ordinare", position: 0, measure_status: "da_rilevare" });
    expect(items[2]).toMatchObject({ quantity: 1, unit_price: 2052, purchase_price: 983.25 });
    // Quello che CreateOrder manda a create_order_atomic: tutte le quantità sono intere.
    expect(items.every((i) => Number.isInteger(i.quantity))).toBe(true);
  });

  describe("la conversione automatica", () => {
    beforeEach(() => {
      condiviso.db = new DbMinimo();
      condiviso.db.rpcs.has_permission_for_company = () => true;
      condiviso.db.tabelle.quotes = [{
        id: "q-1", company_id: "c-1", status: "accettata", quote_number: "OFF-2026-042", title: "Serramenti", source: null,
        subtotal: 6000, discount_amount: 0, vat_amount: 760, total: 6760, prezzo_manuale: null, payment_phases: [], contact_id: null, opportunity_id: null,
        client_name: "Mario Rossi", client_email: null, client_phone: null, client_company: null, client_address: null, notes: null,
        indirizzo_lavori: null, tipo_lavoro: null,
      }];
      condiviso.db.tabelle.quote_items = preventivoRighe.map((r, i) => ({ ...r, id: `r${i}`, quote_id: "q-1", sort_order: i }));
      condiviso.gestore = null;
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it("scrive in order_items le stesse righe della strada «rivedi»", async () => {
      vi.resetModules();
      const deno = denoFinto({ SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "service" });
      vi.stubGlobal("Deno", deno.finto);
      const percorso = "../../../supabase/functions/converti-preventivo-cantiere/index.ts";
      await import(/* @vite-ignore */ percorso);
      const r = await deno.gestore()!(new Request("http://x/functions/v1/converti-preventivo-cantiere", {
        method: "POST", headers: { "content-type": "application/json", authorization: "Bearer prova" }, body: JSON.stringify({ quote_id: "q-1" }),
      }));
      const esito = await r.json() as { success?: boolean; order_id?: string; avviso?: string | null };
      expect(esito.success).toBe(true);
      expect(esito.avviso).toBeNull();
      const scritto = condiviso.db.scritture.find((s) => s.tabella === "order_items")!.dati as Array<Record<string, unknown>>;
      const senzaOrdine = scritto.map(({ order_id: _o, ...resto }) => resto);
      expect(senzaOrdine).toEqual(righePreventivoPerCommessa(preventivoRighe).map((i) => ({
        // L'edge scrive null dove la pagina lascia il campo vuoto.
        name: i.name, description: i.description ?? null, quantity: i.quantity, status: i.status, position: i.position,
        unit_price: i.unit_price ?? null, purchase_price: i.purchase_price, vat_rate: i.vat_rate ?? null, discount_percent: i.discount_percent ?? null,
        family_id: i.family_id ?? null, axis_selections: i.axis_selections ?? null, misure_preventivo: i.misure_preventivo ?? null, measure_status: i.measure_status ?? null,
      })));
      // Il preventivo risulta convertito e la commessa ha l'imponibile.
      expect(condiviso.db.tabelle.quotes[0].status).toBe("convertita");
      expect(condiviso.db.tabelle.orders[0]).toMatchObject({ total_amount: 6000, quote_id: "q-1" });
    });
  });
});

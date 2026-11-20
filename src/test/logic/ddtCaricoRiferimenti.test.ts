import { describe, expect, it } from "vitest";
import { buildDdtCarico, ordiniDaRiferimentoDdt, type OrdinePerCaricoDdt } from "../../../supabase/functions/_shared/ddtCarico.ts";

const fornitore = "fornitore";
const ordine = (campi: Partial<OrdinePerCaricoDdt> = {}): OrdinePerCaricoDdt => ({
  id: "ordine", supplier_id: fornitore, supplier_reference: "CF-1635",
  oda_number: "ODA-2026-0039", issue_date: "2026-10-01", status: "parziale", ...campi,
});

describe("riferimenti della bolla", () => {
  it("cerca l'intero riferimento per lo stesso fornitore e rispetta la data", () => {
    const ordini = [
      ordine({ id: "parziale", oda_number: "ODA-2026-00390" }),
      ordine({ id: "fornitore-errato", supplier_id: "altro" }),
      ordine({ id: "anno-errato", oda_number: "ODA-2025-0039", issue_date: "2025-10-01" }),
      ordine({ id: "finito", status: "ricevuto" }),
      ordine({ id: "futuro", issue_date: "2026-11-10" }),
      ordine(),
    ];
    expect(ordiniDaRiferimentoDdt("Rif. Vs ordine ODA-2026-0039", "2026-11-03", fornitore, ordini)
      .map(x => x.id)).toEqual(["ordine"]);
  });

  it("riconosce la conferma del fornitore e conserva i candidati duplicati per la verifica", () => {
    const ordini = [ordine(), ordine({ id: "altro", oda_number: "ODA-2026-0040" })];
    expect(ordiniDaRiferimentoDdt("CF-1635", "2026-11-03", fornitore, ordini)).toHaveLength(2);
    expect(ordiniDaRiferimentoDdt("NO.ORD.", "2026-11-03", fornitore, ordini)).toEqual([]);
  });
});

function database() {
  type Riga = Record<string, unknown>;
  const tabelle: Record<string, Riga[]> = {
    suppliers: [{ id: fornitore, company_id: "azienda", name: "Fornitore prova" }],
    purchase_orders: [{ ...ordine(), company_id: "azienda" }],
    purchase_order_items: [{
      id: "articolo", purchase_order_id: "ordine", sku: "MAT001", description: "Materiale",
      quantity: 100, quantity_received: 60, unit_of_measure: "PZ",
    }],
  };
  const client = {
    from(tabella: string) {
      let dati = [...(tabelle[tabella] ?? [])];
      let salvata: Riga | null = null;
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { dati = dati.filter(x => x[k] === v); return q; },
        ilike: (k: string, v: string) => { dati = dati.filter(x => x[k] === v); return q; },
        in: (k: string, v: unknown[]) => { dati = dati.filter(x => v.includes(x[k])); return q; },
        order: () => q,
        range: (da: number, a: number) => { dati = dati.slice(da, a + 1); return q; },
        limit: (n: number) => { dati = dati.slice(0, n); return q; },
        delete: () => q,
        insert: (riga: Riga) => { salvata = riga; return q; },
        single: async (): Promise<{ data: Riga | null; error: null }> => ({ data: salvata, error: null }),
        then: (fn: (v: { data: Riga[]; error: null }) => void) => fn({ data: dati, error: null }),
      };
      return q;
    },
  };
  return client as unknown as Parameters<typeof buildDdtCarico>[0];
}

const prepara = (riferimento?: string, unita = "PZ") => buildDdtCarico(database(), {
  id: "documento", company_id: "azienda", email_id: null, fornitore_match_id: fornitore,
  campi: {
    data: { valore: "2026-11-03" }, riferimento_ordine: { valore: riferimento },
    fornitore_ragione_sociale: { valore: "Fornitore prova" },
    righe: [{ descrizione: "Materiale", codice: "MAT001", qta: 50, unita_misura: unita }],
  },
}, null);

it("usa il residuo e segnala 10 pezzi in eccesso", async () => {
  const r = await prepara("ODA-2026-0039");
  expect(r).toMatchObject({ ok: true, ordine_collegato: true, carico: {
    fornitore_match_id: fornitore, purchase_order_id: "ordine",
    righe: [{ qta_residua: 40, qta_bolla: 50, scostamento: 10, po_item_id: "articolo" }],
  } });
});

it("lascia liberi i DDT che non citano l'ordine e spiega il riferimento mancante", async () => {
  const senza = await prepara();
  expect(senza).toMatchObject({ ok: true, ordine_collegato: false, carico: { purchase_order_id: null } });
  const sconosciuto = await prepara("ODA-2026-0040");
  expect(sconosciuto).toMatchObject({
    ok: true, ordine_collegato: false, avviso_ordine: expect.stringContaining("non trovato"),
  });
});

it("un prodotto con un'unità diversa rimane da verificare", async () => {
  const r = await prepara("ODA-2026-0039", "KG");
  expect(r).toMatchObject({ ok: true, carico: { righe: [
    { po_item_id: null, note: expect.stringContaining("da verificare") },
    { qta_residua: 40, qta_bolla: 0 },
  ] } });
});

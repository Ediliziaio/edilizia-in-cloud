// La catena di una fattura lato server (ai-fattura-classify, prima dell'AI): carica dal database solo i
// documenti dell'azienda della fattura e porta alla commessa, oppure al conflitto. Database finto.
import { describe, expect, it } from "vitest";
import { catenaDellaFattura } from "../../../supabase/functions/_shared/catenaFatturaServer.ts";
import { commessaFinale } from "../../../supabase/functions/_shared/regolePrimaDellAi.ts";

type Tabelle = Record<string, Array<Record<string, unknown>>>;

/** Il minimo di PostgREST che serve: from().select().eq().is().limit(), filtri applicati davvero. */
function dbFinto(tabelle: Tabelle) {
  const lette: string[] = [];
  return {
    lette,
    from(nome: string) {
      lette.push(nome);
      let righe = [...(tabelle[nome] ?? [])];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((righe = righe.filter((r) => r[c] === v)), q),
        is: (c: string, v: unknown) => ((righe = righe.filter((r) => (r[c] ?? null) === v)), q),
        neq: (c: string, v: unknown) => ((righe = righe.filter((r) => r[c] !== v)), q),
        limit: () => q,
        then: (ok: (x: { data: unknown[]; error: null }) => unknown) => ok({ data: righe, error: null }),
      };
      return q;
    },
  };
}

const AZ = "az", ALTRA = "altra", FORN = "forn";
const xml = (inner: string, causale = "") =>
  `<FatturaElettronica><FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento>${causale ? `<Causale>${causale}</Causale>` : ""}</DatiGeneraliDocumento>${inner}</DatiGenerali><DatiBeniServizi><DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Cemento</Descrizione><PrezzoTotale>100.00</PrezzoTotale></DettaglioLinee></DatiBeniServizi></FatturaElettronicaBody></FatturaElettronica>`;
const tabelle: Tabelle = {
  orders: [
    { id: "c-A", company_id: AZ, order_code: "25000068", indirizzo_lavori: "Via Roma 12, Milano", deleted_at: null },
    { id: "c-B", company_id: AZ, order_code: "26B01", indirizzo_lavori: "Via Verdi 4, Monza", deleted_at: null },
    { id: "c-X", company_id: ALTRA, order_code: "99999999", indirizzo_lavori: null, deleted_at: null },
  ],
  ddt_ricezione: [
    { id: "d1", company_id: AZ, supplier_id: FORN, numero_ddt: "1068", data_ricezione: "2026-09-08", purchase_order_id: "o1", order_id: null, warehouse_id: null },
    { id: "dx", company_id: ALTRA, supplier_id: FORN, numero_ddt: "1068", data_ricezione: "2026-09-08", purchase_order_id: null, order_id: "c-X", warehouse_id: null },
  ],
  purchase_orders: [{ id: "o1", company_id: AZ, supplier_id: FORN, oda_number: "ODA-2026-0039", supplier_reference: null, issue_date: "2026-09-01", order_id: "c-A", delivery_warehouse_id: null }],
  ddt_ordini_acquisto: [],
};
const fattura = (x: string, over = {}) => ({ id: "f", company_id: AZ, fornitore_id: FORN, data_fattura: "2026-09-30", xml_raw: x, ...over });

describe("catena della fattura lato server", () => {
  it("DDT → ordine → commessa, col percorso come motivo; mai i documenti di un'altra azienda", async () => {
    const r = await catenaDellaFattura(dbFinto(tabelle), fattura(xml("<DatiDDT><NumeroDDT>1068</NumeroDDT><DataDDT>2026-09-07</DataDDT></DatiDDT>")));
    expect(r.conflitto).toBeNull();
    expect(r.commessa).toEqual({ order_id: "c-A", motivo: "catena: DDT 1068 del 2026-09-08 → ordine ODA-2026-0039" });
  });

  it("l'ordine dice una commessa, l'indirizzo un'altra: conflitto, nessuna commessa", async () => {
    const r = await catenaDellaFattura(dbFinto(tabelle), fattura(xml("<DatiOrdineAcquisto><IdDocumento>ODA-2026-0039</IdDocumento></DatiOrdineAcquisto>", "Consegna Via Verdi 4 Monza")));
    expect(r.commessa).toBeNull();
    expect(r.conflitto).toMatch(/ordine ODA-2026-0039/);
    expect(commessaFinale(null, { orderId: "c-B", confidenza: 0.9 }, { conflitto: r.conflitto! })).toMatchObject({ orderId: null, confidenza: 0 });
  });

  it("senza riferimenti a documenti non legge bolle né ordini", async () => {
    const db = dbFinto(tabelle);
    const r = await catenaDellaFattura(db, fattura(xml("")));
    expect(r.commessa).toBeNull();
    expect(db.lette).toEqual(["orders"]);
  });

  it("senza XML non fa niente", async () => {
    expect((await catenaDellaFattura(dbFinto(tabelle), fattura("", { xml_raw: null }))).saltata).toBe("fattura senza XML");
  });

  it("solo l'indirizzo del cantiere (indizio) non basta: nessuna commessa come regola; un ordine annullato non conta", async () => {
    const r = await catenaDellaFattura(dbFinto(tabelle), fattura(xml("", "Consegna Via Verdi 4 Monza")));
    expect(r.catena?.esito).toBe("proposta");
    expect(r.commessa).toBeNull();
    const annullato = { ...tabelle, purchase_orders: [{ ...tabelle.purchase_orders[0], status: "annullato" }] };
    const a = await catenaDellaFattura(dbFinto(annullato), fattura(xml("<DatiOrdineAcquisto><IdDocumento>ODA-2026-0039</IdDocumento></DatiOrdineAcquisto>")));
    expect(a.commessa).toBeNull();
  });

  it("magazzino: niente commessa (il costo lo porta il prelievo)", async () => {
    const t = { ...tabelle, purchase_orders: [{ ...tabelle.purchase_orders[0], order_id: null as string | null, delivery_warehouse_id: "mag" }] };
    const r = await catenaDellaFattura(dbFinto(t), fattura(xml("<DatiOrdineAcquisto><IdDocumento>ODA-2026-0039</IdDocumento></DatiOrdineAcquisto>")));
    expect(r.commessa).toBeNull();
    expect(r.catena?.allocazioni[0].destinazione).toEqual({ tipo: "magazzino", id: "mag" });
  });
});

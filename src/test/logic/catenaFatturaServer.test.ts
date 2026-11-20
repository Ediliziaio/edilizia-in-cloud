// La catena di una fattura lato server (ai-fattura-classify, prima dell'AI): carica dal database solo i
// documenti dell'azienda della fattura e porta alla commessa, oppure al conflitto. Database finto.
import { describe, expect, it, vi } from "vitest";
import { catenaDellaFattura } from "../../../supabase/functions/_shared/catenaFatturaServer.ts";
import { verificaRiferimentiRicevuta } from "../../../supabase/functions/_shared/commessaFatturaRegole.ts";
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
        not: (c: string, _op: string, v: unknown) => ((righe = righe.filter((r) => (r[c] ?? null) !== v)), q),
        in: (c: string, vs: unknown[]) => ((righe = righe.filter((r) => vs.includes(r[c]))), q),
        limit: () => q,
        maybeSingle: () => ({ then: (ok: (x: { data: unknown; error: null }) => unknown) => ok({ data: righe[0] ?? null, error: null }) }),
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
  purchase_orders: [{ id: "o1", company_id: AZ, supplier_id: FORN, oda_number: "ODA-2026-0039", supplier_reference: null, issue_date: "2026-09-01", order_id: "c-A", delivery_warehouse_id: null, status: "inviato" }],
  ddt_ordini_acquisto: [],
};
const fattura = (x: string, over = {}) => ({ id: "f", company_id: AZ, fornitore_id: FORN, data_fattura: "2026-09-30", xml_raw: x, ...over });

describe("catena della fattura lato server", () => {
  it("all'ingresso registra il riferimento certo senza cambiare la lettura né chiamare un modello", async () => {
    const appenaRicevuta = {
      ...fattura(xml("", "Riferimento ordine d'acquisto ODA-2026-0039")),
      stato: "non_letta", aggancio_oda_manuale: false,
    };
    const dati = dbFinto(tabelle);
    const aggiornaQuery = {
      eq: (_c: string, _v: unknown) => aggiornaQuery,
      or: async (_filtro: string): Promise<{ error: null }> => ({ error: null }),
    };
    const aggiorna = vi.fn((_campi: Record<string, unknown>) => aggiornaQuery);
    const rpc = vi.fn(async (_nome: string, _args: Record<string, unknown>): Promise<{ error: null; data: null }> => ({
      error: null, data: null,
    }));
    const invoke = vi.fn();
    const query = {
      select: (_campi: string) => query,
      eq: (_c: string, _v: unknown) => query,
      maybeSingle: async () => ({ error: null as null, data: appenaRicevuta }),
      update: aggiorna,
    };
    await verificaRiferimentiRicevuta({
      from: (tabella: string) => tabella === "fatture_ricevute" ? query : dati.from(tabella),
      rpc, functions: { invoke },
    }, AZ, appenaRicevuta.id);
    expect(rpc.mock.calls.map(([nome]) => nome)).toEqual(["commessa_da_codici", "acquisti_commessa_della_fattura"]);
    expect(rpc).toHaveBeenCalledWith("acquisti_commessa_della_fattura", expect.objectContaining({
      p_fattura: "f", p_order: "c-A", p_esito: "automatico",
    }));
    expect(aggiorna).toHaveBeenCalledWith({
      order_id_suggerito: "c-A", order_match_confidenza: 1,
      order_suggerito_motivo: expect.stringContaining("ODA-2026-0039"),
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("un ordine scritto soltanto nella causale carica l’ODA dello stesso fornitore",async()=>{
    const r=await catenaDellaFattura(dbFinto(tabelle),fattura(xml('',"Riferimento ordine d'acquisto ODA-2026-0039")));
    expect(r.commessa?.order_id).toBe('c-A');
  });
  it("il DDT citato nella causale segue la catena verso la commessa",async()=>{
    const r=await catenaDellaFattura(dbFinto(tabelle),fattura(xml('',"DDT n. 1068 del 07/09/2026")));
    expect(r.commessa?.order_id).toBe('c-A');
  });
  it("il cliente dà una proposta da confermare, con il riferimento leggibile",async()=>{
    const nomi={...tabelle,orders:tabelle.orders.map(c=>({...c,client_name:c.id==='c-A'?'Mario Rossi':null,client_company:c.id==='c-B'?'Edil Beta S.r.l.':null}))};
    const r=await catenaDellaFattura(dbFinto(nomi),fattura(xml('',"Cliente EDIL BETA SRL")));
    expect(r.commessa).toBeNull();expect(r.proposta).toEqual({order_id:'c-B',motivo:'Da confermare: cliente Edil Beta S.r.l.'});
  });
  it("due cantieri dello stesso cliente bloccano la scelta automatica",async()=>{
    const nomi={...tabelle,orders:tabelle.orders.map(c=>({...c,client_name:'Mario Rossi'}))};
    const r=await catenaDellaFattura(dbFinto(nomi),fattura(xml('',"Fornitura per Mario Rossi")));
    expect(r.commessa).toBeNull();expect(r.proposta).toBeUndefined();expect(r.conflitto).toContain('Più commesse');
  });
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

  describe("contratti di subappalto", () => {
    const SUB = "sub-1", SUB2 = "sub-2";
    const conContratti: Tabelle = {
      ...tabelle,
      suppliers: [{ id: FORN, company_id: AZ, subappaltatore_id: SUB }],
      contratti_subappalto: [
        { id: "k1", company_id: AZ, subappaltatore_id: SUB, numero_contratto: "SUB-2026-007", data_stipula: "2026-03-01", order_id: "c-B", stato: "attivo" },
        { id: "k2", company_id: AZ, subappaltatore_id: SUB2, numero_contratto: "SUB-2026-008", data_stipula: "2026-03-01", order_id: "c-A", stato: "attivo" },
        { id: "k3", company_id: AZ, subappaltatore_id: SUB, numero_contratto: "SUB-2026-009", data_stipula: "2026-03-01", order_id: "c-A", stato: "bozza" },
      ],
    };
    const cita = (n: string) => xml(`<DatiContratto><IdDocumento>${n}</IdDocumento></DatiContratto>`);

    it("la fattura cita il contratto del suo subappaltatore: commessa del contratto", async () => {
      const r = await catenaDellaFattura(dbFinto(conContratti), fattura(cita("SUB-2026-007")));
      expect(r.commessa).toEqual({ order_id: "c-B", motivo: "catena: contratto SUB-2026-007" });
    });

    it("contratto di un altro subappaltatore, o ancora in bozza: nessuna commessa", async () => {
      expect((await catenaDellaFattura(dbFinto(conContratti), fattura(cita("SUB-2026-008")))).commessa).toBeNull();
      expect((await catenaDellaFattura(dbFinto(conContratti), fattura(cita("SUB-2026-009")))).commessa).toBeNull();
    });

    it("senza contratto citato i contratti non si leggono", async () => {
      const db = dbFinto(conContratti);
      await catenaDellaFattura(db, fattura(xml("<DatiDDT><NumeroDDT>1068</NumeroDDT><DataDDT>2026-09-07</DataDDT></DatiDDT>")));
      expect(db.lette).not.toContain("contratti_subappalto");
    });
  });

  describe("letture filtrate e limite (revisione del 15/11)", () => {
    const citaOda = xml("<DatiOrdineAcquisto><IdDocumento>ODA-2026-0039</IdDocumento></DatiOrdineAcquisto>");
    it("un ordine in bozza non conta", async () => {
      const bozza = { ...tabelle, purchase_orders: [{ ...tabelle.purchase_orders[0], status: "bozza" }] };
      expect((await catenaDellaFattura(dbFinto(bozza), fattura(citaOda))).commessa).toBeNull();
    });

    it("una lettura arrivata al limite: niente commessa certa, la conferma una persona", async () => {
      const tante = Array.from({ length: 1000 }, (_, i) => ({
        id: `dz${i}`, company_id: AZ, supplier_id: FORN, numero_ddt: `Z${i}`, data_ricezione: "2026-01-01", purchase_order_id: null as string | null, order_id: null as string | null, warehouse_id: null as string | null,
      }));
      const piene = { ...tabelle, ddt_ricezione: [...tabelle.ddt_ricezione, ...tante] };
      const r = await catenaDellaFattura(dbFinto(piene), fattura(xml("<DatiDDT><NumeroDDT>1068</NumeroDDT><DataDDT>2026-09-07</DataDDT></DatiDDT>")));
      expect(r.commessa).toBeNull();
      expect(r.saltata).toMatch(/troppi documenti/);
    });
  });
});

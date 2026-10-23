import { describe, expect, it } from "vitest";
import {
  FILTRI_VUOTI, MASSIMO_CONSEGNATI, colonnaOda, costruisciPipeline, filtraOda, giorniRitardoOda, giorniRitardoRfq,
  leggiFiltriAcquisti, scriviFiltroAcquisti,
  type FiltriAcquisti, type MaterialeAcquisti, type OdaPipeline, type RfqPipeline,
} from "@/lib/acquisti/pipelineAcquisti";

const OGGI = "2026-10-23";

const materiale = (id: string, extra: Partial<MaterialeAcquisti> = {}): MaterialeAcquisti => ({
  id, order_id: "c1", name: `Materiale ${id}`, description: null, quantity: 10, status: "da_ordinare", supplier_id: "f1",
  purchase_price: 2, vat_rate: 22, phase_id: "fase-el", unita_misura: "m", specifiche: null, origine_materiale: "computo",
  quantita_calcolata: 10, origini: null, locale: null, supplier_rfq_item_id: null, stock_item_id: null, posizioni: null,
  stato: "da_ordinare", ordinabile: true, avviso: null,
  commessa: "C-001", fase: "Impianto elettrico", posizioneFase: 1, rfqId: null, odaIds: [],
  ...extra,
});

const oda = (id: string, status: string, extra: Partial<OdaPipeline> = {}): OdaPipeline => ({
  id, oda_number: `ODA-${id}`, status, supplier_id: "f1", order_id: "c1", total: 100,
  issue_date: "2026-10-01", expected_delivery_date: null, suppliers: { name: "Elettroforniture" }, orders: { order_code: "C-001" },
  ...extra,
});

const rfq = (id: string, status: string, extra: Partial<RfqPipeline> = {}): RfqPipeline => ({
  id, rfq_number: `RDO-${id}`, titolo: `Cavi ${id}`, status, order_id: "c1", scadenza_offerte: null, data_fabbisogno: null,
  supplier_id_aggiudicato: null, created_at: "2026-10-01", orders: { order_code: "C-001" },
  ...extra,
});

function pipeline(p: { materiali?: MaterialeAcquisti[]; rfqs?: RfqPipeline[]; oda?: OdaPipeline[]; filtri?: Partial<FiltriAcquisti>; contatori?: Record<string, { invitati: number; risposte: number; migliore: number | null; fornitori?: string[] }> }) {
  const colonne = costruisciPipeline({
    materiali: p.materiali ?? [], rfqs: p.rfqs ?? [], oda: p.oda ?? [], contatori: p.contatori ?? {},
    filtri: { ...FILTRI_VUOTI, ...p.filtri }, oggi: OGGI,
  });
  return Object.fromEntries(colonne.map((c) => [c.id, c]));
}

describe("pipeline acquisti: dove va ogni cosa", () => {
  it("le cinque colonne nell'ordine del lavoro", () => {
    expect(Object.keys(pipeline({}))).toEqual(["da_ordinare", "offerta", "ordinato", "in_consegna", "consegnato"]);
  });

  it("gli ordini vanno per stato; gli annullati restano fuori", () => {
    expect(colonnaOda("bozza")).toBe("da_ordinare");
    expect(colonnaOda("inviato")).toBe("ordinato");
    expect(colonnaOda("confermato")).toBe("ordinato");
    expect(colonnaOda("parziale")).toBe("in_consegna");
    expect(colonnaOda("ricevuto")).toBe("consegnato");
    expect(colonnaOda("annullato")).toBeNull();
    const c = pipeline({ oda: [oda("1", "bozza"), oda("2", "inviato"), oda("3", "parziale"), oda("4", "ricevuto"), oda("5", "annullato")] });
    expect(c.da_ordinare.carte.map((x) => x.id)).toEqual(["1"]);
    expect(c.da_ordinare.carte[0].nota).toBe("Bozza da mandare");
    expect(c.ordinato.carte.map((x) => x.id)).toEqual(["2"]);
    expect(c.in_consegna.carte.map((x) => x.id)).toEqual(["3"]);
    expect(c.consegnato.carte.map((x) => x.id)).toEqual(["4"]);
  });

  it("solo i materiali ancora liberi stanno in «Da ordinare»: quelli in offerta o in ordine li rappresenta la richiesta o l'ordine", () => {
    const c = pipeline({
      materiali: [
        materiale("a"),
        materiale("b", { stato: "in_offerta", rfqId: "r1" }),
        materiale("c", { stato: "in_bozza_oda", odaIds: ["1"] }),
        materiale("d", { stato: "ordinato", odaIds: ["2"] }),
      ],
    });
    expect(c.da_ordinare.materiali.map((m) => m.id)).toEqual(["a"]);
    expect(c.da_ordinare.conteggio).toBe(1);
    expect(c.da_ordinare.importo).toBe(20);
  });

  it("le richieste d'offerta aperte, con il numero di risposte e l'offerta migliore", () => {
    const c = pipeline({
      rfqs: [rfq("r1", "inviata"), rfq("r2", "in_valutazione"), rfq("r3", "aggiudicata"), rfq("r4", "annullata")],
      contatori: { r1: { invitati: 3, risposte: 2, migliore: 450 } },
    });
    expect(c.offerta.carte.map((x) => x.id)).toEqual(["r1", "r2"]);
    expect(c.offerta.carte[0].nota).toBe("2/3 risposte");
    expect(c.offerta.carte[0].importo).toBe(450);
    expect(c.offerta.carte[1].nota).toBe("Nessun fornitore invitato");
    expect(c.offerta.importo).toBe(450);
  });

  it("conteggi e importi per colonna", () => {
    const c = pipeline({ oda: [oda("1", "inviato", { total: 100 }), oda("2", "confermato", { total: "250.5" })] });
    expect(c.ordinato.conteggio).toBe(2);
    expect(c.ordinato.importo).toBe(350.5);
  });

  it("i consegnati più recenti per primi, e la colonna non si allunga all'infinito", () => {
    const tanti = Array.from({ length: MASSIMO_CONSEGNATI + 5 }, (_, i) =>
      oda(String(i), "ricevuto", { actual_delivery_date: `2026-${String((i % 9) + 1).padStart(2, "0")}-10` }));
    const c = pipeline({ oda: tanti });
    expect(c.consegnato.conteggio).toBe(MASSIMO_CONSEGNATI + 5);
    expect(c.consegnato.carte).toHaveLength(MASSIMO_CONSEGNATI);
    expect(c.consegnato.nascoste).toBe(5);
    expect(c.consegnato.carte[0].data).toBe("2026-09-10");
  });
});

describe("pipeline acquisti: ritardi", () => {
  it("un ordine mandato con la consegna passata è in ritardo; bozze e ricevuti mai", () => {
    expect(giorniRitardoOda({ status: "inviato", expected_delivery_date: "2026-10-20" }, OGGI)).toBe(3);
    expect(giorniRitardoOda({ status: "parziale", expected_delivery_date: "2026-10-22" }, OGGI)).toBe(1);
    expect(giorniRitardoOda({ status: "inviato", expected_delivery_date: OGGI }, OGGI)).toBeNull();
    expect(giorniRitardoOda({ status: "bozza", expected_delivery_date: "2026-10-01" }, OGGI)).toBeNull();
    expect(giorniRitardoOda({ status: "ricevuto", expected_delivery_date: "2026-10-01" }, OGGI)).toBeNull();
  });

  it("una richiesta aperta oltre la scadenza delle offerte è in ritardo", () => {
    expect(giorniRitardoRfq({ status: "inviata", scadenza_offerte: "2026-10-21" }, OGGI)).toBe(2);
    expect(giorniRitardoRfq({ status: "aggiudicata", scadenza_offerte: "2026-10-01" }, OGGI)).toBeNull();
  });

  it("i ritardi stanno in cima alla colonna; «solo in ritardo» toglie il resto, materiali compresi", () => {
    const ordini = [
      oda("puntuale", "inviato", { expected_delivery_date: "2026-11-01" }),
      oda("poco", "inviato", { expected_delivery_date: "2026-10-21" }),
      oda("tanto", "confermato", { expected_delivery_date: "2026-10-01" }),
    ];
    expect(pipeline({ oda: ordini }).ordinato.carte.map((x) => x.id)).toEqual(["tanto", "poco", "puntuale"]);
    const soloRitardo = pipeline({ oda: ordini, materiali: [materiale("a")], filtri: { soloRitardo: true } });
    expect(soloRitardo.ordinato.carte.map((x) => x.id)).toEqual(["tanto", "poco"]);
    expect(soloRitardo.da_ordinare.materiali).toEqual([]);
  });
});

describe("pipeline acquisti: filtri comuni", () => {
  it("commessa: anche «senza commessa» per scorte e attrezzatura", () => {
    const ordini = [oda("1", "inviato"), oda("2", "inviato", { order_id: "c2" }), oda("3", "inviato", { order_id: null, orders: null })];
    expect(pipeline({ oda: ordini, filtri: { commessa: "c2" } }).ordinato.carte.map((x) => x.id)).toEqual(["2"]);
    expect(pipeline({ oda: ordini, filtri: { commessa: "_nessuna" } }).ordinato.carte.map((x) => x.id)).toEqual(["3"]);
  });

  it("fornitore: le richieste si vedono se il fornitore è fra gli invitati", () => {
    const c = pipeline({
      rfqs: [rfq("r1", "inviata"), rfq("r2", "inviata")],
      contatori: { r1: { invitati: 2, risposte: 0, migliore: null, fornitori: ["f1", "f9"] }, r2: { invitati: 1, risposte: 0, migliore: null, fornitori: ["f2"] } },
      materiali: [materiale("a"), materiale("b", { supplier_id: null })],
      filtri: { fornitore: "f9" },
    });
    expect(c.offerta.carte.map((x) => x.id)).toEqual(["r1"]);
    expect(c.da_ordinare.materiali).toEqual([]);
    expect(pipeline({ materiali: [materiale("a"), materiale("b", { supplier_id: null })], filtri: { fornitore: "_nessuno" } })
      .da_ordinare.materiali.map((m) => m.id)).toEqual(["b"]);
  });

  it("fase: ordini e richieste si legano alla fase attraverso i suoi materiali", () => {
    const materiali = [
      materiale("a"),
      materiale("b", { stato: "ordinato", odaIds: ["1"] }),
      materiale("c", { phase_id: "fase-id", fase: "Idraulica", stato: "in_offerta", rfqId: "r2" }),
    ];
    const c = pipeline({ materiali, oda: [oda("1", "inviato"), oda("2", "inviato")], rfqs: [rfq("r1", "inviata"), rfq("r2", "inviata")], filtri: { fase: "fase-el" } });
    expect(c.da_ordinare.materiali.map((m) => m.id)).toEqual(["a"]);
    expect(c.ordinato.carte.map((x) => x.id)).toEqual(["1"]);
    expect(c.offerta.carte).toEqual([]);
    expect(filtraOda([oda("1", "inviato"), oda("2", "inviato")], materiali, { ...FILTRI_VUOTI, fase: "fase-el" }, OGGI).map((o) => o.id)).toEqual(["1"]);
  });

  it("ricerca su numero, fornitore, commessa e materiale", () => {
    const c = pipeline({
      oda: [oda("1", "inviato"), oda("2", "inviato", { suppliers: { name: "Idrotermica" } })],
      materiali: [materiale("a", { name: "Cavo FG16" }), materiale("b", { name: "Tubo multistrato" })],
      filtri: { cerca: "idro" },
    });
    expect(c.ordinato.carte.map((x) => x.id)).toEqual(["2"]);
    expect(pipeline({ materiali: [materiale("a", { name: "Cavo FG16" }), materiale("b", { name: "Tubo" })], filtri: { cerca: "fg16" } })
      .da_ordinare.materiali.map((m) => m.id)).toEqual(["a"]);
  });

  it("vista e filtri si leggono e si scrivono nell'URL", () => {
    const p = new URLSearchParams("tab=acquisto&vista=elenco&commessa=c1&forn=f1&fase=x&ritardo=1&cerca=cavo");
    expect(leggiFiltriAcquisti(p)).toEqual({ vista: "elenco", commessa: "c1", fornitore: "f1", fase: "x", soloRitardo: true, cerca: "cavo" });
    expect(leggiFiltriAcquisti(new URLSearchParams("tab=acquisto")).vista).toBe("pipeline");
    expect(scriviFiltroAcquisti(p, "ritardo", false).has("ritardo")).toBe(false);
    expect(scriviFiltroAcquisti(p, "commessa", null).get("tab")).toBe("acquisto");
    expect(scriviFiltroAcquisti(new URLSearchParams(), "ritardo", true).toString()).toBe("ritardo=1");
  });
});

import { describe, expect, it } from "vitest";
import { daChiedereInOfferta, livelloProva, proponiFornitori, type AnagraficaFornitore, type ProvaAcquisto, type ProvaListino } from "@/lib/acquisti/fornitoriSuggeriti";

const OGGI = "2026-11-23";
const FORNITORI: AnagraficaFornitore[] = [
  { id: "ceramiche", name: "Ceramiche Rossi", lead_time_days: 10, min_order_amount: 300 },
  { id: "edile", name: "Edilcommerciale", lead_time_days: null },
  { id: "bianchi", name: "Bianchi Pavimenti", lead_time_days: 5 },
  { id: "chiuso", name: "Fornitore chiuso", is_active: false },
];
const listino = (v: Partial<ProvaListino> & { supplier_id: string; descrizione: string }): ProvaListino =>
  ({ valido_dal: "2026-01-01", valido_al: null, attivo: true, unita: "m", ...v });
const acquisto = (v: Partial<ProvaAcquisto> & { supplier_id: string; descrizione: string }): ProvaAcquisto => ({ origine: "ordine", data: "2026-06-10", unita: "m", ...v });
const BATTISCOPA = { nome: "Battiscopa in gres porcellanato h 8 cm", unita: "m" };

describe("quanto una prova riguarda il materiale", () => {
  it("stesso articolo: per id, per codice, per nome identico", () => {
    expect(livelloProva({ nome: "x", article_template_id: "a1" }, { descrizione: "tutt'altro", article_template_id: "a1" })).toBe("stesso_articolo");
    expect(livelloProva({ nome: "Battiscopa", codice: "BT-08" }, { descrizione: "Zoccolino", codice: "bt08" })).toBe("stesso_articolo");
    expect(livelloProva(BATTISCOPA, { descrizione: "BATTISCOPA IN GRES PORCELLANATO H 8 CM" })).toBe("stesso_articolo");
  });
  it("simile: stessa cosa, stesso materiale e misura; famiglia: solo la stessa parola", () => {
    expect(livelloProva(BATTISCOPA, { descrizione: "Battiscopa gres porcellanato 8x60 rettificato" })).toBe("articolo_simile");
    expect(livelloProva(BATTISCOPA, { descrizione: "Battiscopa in legno rovere h 10" })).toBe("stessa_famiglia");
    expect(livelloProva(BATTISCOPA, { descrizione: "Collante per piastrelle" })).toBeNull();
  });
});

describe("fornitori proposti, con le prove", () => {
  const dati = {
    fornitori: FORNITORI,
    listini: [
      listino({ supplier_id: "ceramiche", descrizione: "Battiscopa in gres porcellanato h 8 cm", codice: "BT08", prezzo: 5, sconto_pct: 10, valido_al: "2026-12-31" }),
      listino({ supplier_id: "bianchi", descrizione: "Battiscopa in gres porcellanato h 8 cm", prezzo: 4, valido_al: "2026-06-30" }),
      listino({ supplier_id: "chiuso", descrizione: "Battiscopa in gres porcellanato h 8 cm", prezzo: 1 }),
      listino({ supplier_id: "edile", descrizione: "Battiscopa in gres porcellanato h 8 cm", prezzo: 2, attivo: false }),
    ],
    acquisti: [
      acquisto({ supplier_id: "edile", descrizione: "Battiscopa in legno rovere h 10", prezzo: 9 }),
      acquisto({ supplier_id: "ceramiche", descrizione: "Battiscopa in gres porcellanato h 8 cm", prezzo: 4.8, data: "2026-09-02" }),
    ],
  };
  const r = proponiFornitori(BATTISCOPA, dati, { oggi: OGGI });

  it("prima chi ha l'articolo col listino in vigore, poi chi ha il listino scaduto, in fondo chi vende solo la famiglia", () => {
    expect(r.map((x) => [x.supplier_id, x.livello])).toEqual([
      ["ceramiche", "stesso_articolo"], ["bianchi", "stesso_articolo"], ["edile", "stessa_famiglia"],
    ]);
  });
  it("il prezzo è netto dello sconto, con la validità e gli acquisti fatti", () => {
    expect(r[0].prova).toMatchObject({ fonte: "listino", prezzo: 4.5, valido_al: "2026-12-31", stato_listino: "in_vigore" });
    expect(r[0].motivo).toMatch(/a listino, valido fino al 31\/12\/2026 a 4,50\s?€\/m/);
    expect(r[0].acquisti).toBe(1);
    expect(r[0]).toMatchObject({ consegna_giorni: 10, ordine_minimo: 300, mancano: [] });
  });
  it("un listino scaduto, anche se costa meno, non vince: dice che serve un prezzo aggiornato", () => {
    expect(r[1].mancano.join(" ")).toMatch(/listino scaduto il 30\/06\/2026/);
  });
  it("chi vende solo la famiglia non mostra un prezzo come se fosse di questo articolo", () => {
    expect(r[2].motivo).toMatch(/non ancora questo articolo/);
    expect(r[2].motivo).not.toMatch(/€/);
    expect(r[2].mancano.join(" ")).toMatch(/offerta per questo articolo/);
    expect(r[2].mancano.join(" ")).toMatch(/tempi di consegna/);
  });
  it("fornitore non attivo e listino spento non sono prove", () => {
    expect(r.some((x) => x.supplier_id === "chiuso")).toBe(false);
    expect(r.find((x) => x.supplier_id === "edile")?.prove.every((p) => p.fonte === "ordine")).toBe(true);
  });
  it("i criteri si possono cambiare: con la consegna per prima vince chi consegna in 5 giorni", () => {
    const perConsegna = proponiFornitori(BATTISCOPA, dati, { oggi: OGGI, criteri: ["consegna", "livello"] });
    expect(perConsegna[0].supplier_id).toBe("bianchi");
  });
  it("prezzo in un'altra unità: si dice che manca la conversione, e non batte un prezzo confrontabile", () => {
    const x = proponiFornitori(BATTISCOPA, { fornitori: FORNITORI, acquisti: [], listini: [
      listino({ supplier_id: "bianchi", descrizione: BATTISCOPA.nome, prezzo: 1, unita: "pz" }),
      listino({ supplier_id: "ceramiche", descrizione: BATTISCOPA.nome, prezzo: 5 }),
    ] }, { oggi: OGGI });
    expect(x[0].supplier_id).toBe("ceramiche");
    expect(x[1].mancano.join(" ")).toMatch(/conversione: lui vende a pz, il fabbisogno è in m/);
  });
  it("un ordine emesso vale più di un'assegnazione in un'altra commessa, e lo dice", () => {
    const x = proponiFornitori(BATTISCOPA, { fornitori: FORNITORI, listini: [], acquisti: [
      acquisto({ supplier_id: "edile", descrizione: BATTISCOPA.nome, origine: "commessa", data: "2026-10-01" }),
      acquisto({ supplier_id: "bianchi", descrizione: BATTISCOPA.nome, prezzo: 4.2, data: "2026-03-01" }),
      acquisto({ supplier_id: "bianchi", descrizione: BATTISCOPA.nome, prezzo: 4.4, data: "2026-08-01" }),
    ] }, { oggi: OGGI });
    expect(x.map((p) => p.supplier_id)).toEqual(["bianchi", "edile"]);
    expect(x[0].motivo).toMatch(/ordinato il 01\/08\/2026 a 4,40\s?€\/m · 2 ordini/);
    expect(x[1].motivo).toMatch(/assegnato a lui in un'altra commessa/);
    expect(x[1].mancano.join(" ")).toMatch(/un ordine o un listino che lo confermi/);
  });
  it("nessuna prova: nessun fornitore inventato", () => {
    expect(proponiFornitori({ nome: "Piattaforma elevatrice" }, dati, { oggi: OGGI })).toEqual([]);
  });
});

describe("che cosa chiedere in un'offerta", () => {
  it("senza quantità o unità lo dice per primo; senza nessuno che abbia l'articolo chiede codice e scheda", () => {
    const c = daChiedereInOfferta({ nome: "Opere varie", unita: "", quantita: null }, []);
    expect(c[0]).toMatch(/quantità: manca/);
    expect(c[1]).toMatch(/unità di misura/);
    expect(c.at(-1)).toMatch(/codice e scheda tecnica/);
  });
});

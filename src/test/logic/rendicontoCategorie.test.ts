/**
 * Il Cash flow per le categorie del catalogo (15/11/2026): stessi soldi del
 * rendiconto, rimessi sotto area → categoria → voce dell'azienda.
 */
import { describe, expect, it } from "vitest";
import { costruisciRendiconto, type MovimentoRegistrato } from "@/lib/controlloGestione/rendicontoCassa";
import { categoriaPerRiga, SENZA_VOCE, vistaPerCategorie, righeEsportazioneCategorie } from "@/lib/controlloGestione/rendicontoCategorie";
import type { VoceCatalogo } from "@/lib/finance/cassaVoci";

const v = (p: Partial<VoceCatalogo> & { id: string; codice: string; nome: string }): VoceCatalogo => ({
  parent_id: null, livello: "voce", descrizione: null, esempio: null, flusso: "uscita", sezione: "operativa",
  voce_cassa_in: null, voce_cassa_out: null, richiede_commessa: false, attiva: true, archiviata_il: null,
  ordine: 0, origine: "catalogo", ...p,
});
const catalogo: VoceCatalogo[] = [
  v({ id: "op", codice: "A.operativa", nome: "Operativa", livello: "area", ordine: 1 }),
  v({ id: "fin", codice: "A.finanziamenti", nome: "Finanziamenti", livello: "area", ordine: 5 }),
  v({ id: "c01", codice: "01", nome: "Incassi clienti", livello: "categoria", parent_id: "op", ordine: 1 }),
  v({ id: "v0104", codice: "01.04", nome: "Lavori edili", parent_id: "c01", flusso: "entrata", voce_cassa_in: "inc_clienti" }),
  v({ id: "c04", codice: "04", nome: "Materiali e merci", livello: "categoria", parent_id: "op", ordine: 4 }),
  v({ id: "v0402", codice: "04.02", nome: "Materiali edili", parent_id: "c04", voce_cassa_out: "usc_materiali" }),
  v({ id: "v0406", codice: "04.06", nome: "Materiale elettrico", parent_id: "c04", voce_cassa_out: "usc_materiali" }),
  // Una voce spenta di un'altra categoria che usa la stessa riga non sposta la scelta.
  v({ id: "c09", codice: "09", nome: "Mezzi e logistica", livello: "categoria", parent_id: "op", ordine: 9 }),
  v({ id: "v0912", codice: "09.12", nome: "Trasporti", parent_id: "c09", voce_cassa_out: "usc_mezzi" }),
  v({ id: "v0999", codice: "09.99", nome: "Materiali spenti", parent_id: "c09", voce_cassa_out: "usc_materiali", attiva: false }),
  v({ id: "c18", codice: "18", nome: "Leasing finanziario", livello: "categoria", parent_id: "fin", ordine: 18 }),
  v({ id: "v1802", codice: "18.02", nome: "Quota capitale leasing", parent_id: "c18", voce_cassa_out: "fin_leasing" }),
];
const pn = (p: Partial<MovimentoRegistrato> & { id: string; amount: number }): MovimentoRegistrato => ({
  direction: "uscita", entry_date: "2025-03-10", category: null, ...p,
});
const rendiconto = (registrati: MovimentoRegistrato[]) =>
  costruisciRendiconto({
    anno: 2025, today: "2026-11-15", saldoOggiCents: 0, saldoFonte: "banca", registrati, flussoDopoAnnoCents: 0, previsti: null,
    ipotesi: { includeOverdueIncome: false, includeOverdueExpense: false, includeEstimates: true },
  });

describe("la categoria di ogni riga del riassunto", () => {
  it("è quella che ne raccoglie più voci attive, nel verso giusto", () => {
    const m = categoriaPerRiga(catalogo);
    expect(m.get("out:usc_materiali")?.nome).toBe("Materiali e merci");
    expect(m.get("in:inc_clienti")?.nome).toBe("Incassi clienti");
    expect(m.get("in:usc_materiali")).toBeUndefined();
  });
});

describe("il cash flow per categorie", () => {
  const registrati = [
    pn({ id: "a", amount: 1000, direction: "entrata", category: "Incassi fatture" }),
    pn({ id: "b", amount: 300, category: "materiali" }),
    pn({ id: "c", amount: 120, codiceCassa: "04.06", voceCassa: "usc_materiali", entry_date: "2025-04-02" }),
    pn({ id: "d", amount: 480, codiceCassa: "18.02", voceCassa: "fin_leasing" }),
    pn({ id: "e", amount: 75, category: "qualcosa di strano" }),
  ];
  const r = rendiconto(registrati);
  const aree = vistaPerCategorie(r, catalogo);
  const cat = (nome: string) => aree.flatMap((a) => a.categorie).find((c) => c.nome === nome)!;

  it("aree nell'ordine del catalogo, «Da classificare» in fondo", () => {
    expect(aree.map((a) => a.nome)).toEqual(["Operativa", "Finanziamenti", "Da classificare"]);
  });

  it("la voce scelta sul movimento decide categoria e voce; il resto va sotto «Senza voce precisa»", () => {
    const mat = cat("Materiali e merci");
    expect(mat.valori[2]).toBe(-30000);
    expect(mat.valori[3]).toBe(-12000);
    expect(mat.voci.map((x) => x.nome)).toEqual(["Materiale elettrico", SENZA_VOCE]);
    expect(cat("Leasing finanziario").voci.map((x) => [x.codice, x.valori[2]])).toEqual([["18.02", -48000]]);
    expect(cat("Incassi clienti").valori[2]).toBe(100000);
  });

  it("i movimenti senza categoria restano da classificare, e si sa che lo sono", () => {
    const da = cat("Movimenti da classificare");
    expect(da.daClassificare).toBe(true);
    expect(da.valori[2]).toBe(-7500);
  });

  it("nessun euro si perde: la somma delle aree è il flusso netto, mese per mese", () => {
    const somma = Array.from({ length: 12 }, (_, i) => aree.reduce((s, a) => s + a.valori[i], 0));
    expect(somma).toEqual(r.flussoNetto);
  });

  it("l'Excel ha categorie, voci e i saldi del rendiconto", () => {
    const righe = righeEsportazioneCategorie(r, aree);
    expect(righe[0].voce).toBe("Saldo di cassa a inizio mese");
    expect(righe.some((x) => x.voce === "  04 Materiali e merci")).toBe(true);
    expect(righe.some((x) => x.voce === "      04.06 Materiale elettrico")).toBe(true);
    expect(righe.at(-1)!.voce).toBe("SALDO DI CASSA A FINE MESE");
  });

  it("le categorie rinominate dall'azienda si vedono col loro nome", () => {
    const rinominato = catalogo.map((x) => (x.id === "c04" ? { ...x, nome: "Forniture di cantiere" } : x));
    expect(vistaPerCategorie(r, rinominato).flatMap((a) => a.categorie).some((c) => c.nome === "Forniture di cantiere")).toBe(true);
  });
});

describe("qualità della classificazione e confronto con l'anno prima", () => {
  it("divide il consuntivo in voce precisa, stimata dalla prima nota e da classificare", async () => {
    const { qualitaClassificazione } = await import("@/lib/controlloGestione/rendicontoCategorie");
    const r = rendiconto([
      pn({ id: "a", amount: 100, codiceCassa: "04.06", voceCassa: "usc_materiali" }),
      pn({ id: "b", amount: 300, category: "materiali" }),
      pn({ id: "c", amount: 600, category: "boh" }),
    ]);
    expect(qualitaClassificazione(r)).toEqual({ precisa: 10000, stimata: 30000, daClassificare: 60000, totale: 100000 });
  });

  it("totali per categoria e per area, per la colonna dell'anno prima", async () => {
    const { totaliPerChiave } = await import("@/lib/controlloGestione/rendicontoCategorie");
    const r = rendiconto([pn({ id: "b", amount: 300, category: "materiali" }), pn({ id: "a", amount: 1000, direction: "entrata", category: "Incassi fatture" })]);
    const t = totaliPerChiave(vistaPerCategorie(r, catalogo));
    expect(t.get("c04")).toBe(-30000);
    expect(t.get("area:op")).toBe(70000);
  });
});

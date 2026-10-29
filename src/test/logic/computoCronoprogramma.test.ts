import { describe, expect, it } from "vitest";
import { generaComputoPdf } from "@/lib/computo/esportaComputo";
import { bozzaVuota, leggiBozzaComputo, voceVuota, vociDaBozza } from "@/lib/computo/editorNativo";
import { cronoDaCapitoli, dataDelGiorno, durataTotale, leggiData, normalizzaFasi } from "@/lib/computo/cronoprogramma";

/**
 * Il cronoprogramma del preventivo con computo (29/10/2026): giorni
 * lavorativi dal lunedì al venerdì, una base dai capitoli quando non c'è
 * l'AI, una pagina Gantt nel PDF.
 */
const bozza = { ...bozzaVuota(), titolo: "Campo da tennis", voci: [
  { ...voceVuota(), capitolo: "Scavi", descrizione: "Scavo", unita: "mc", quantita: "259,2", prezzo: "12" },
  { ...voceVuota(), capitolo: "Manto", descrizione: "Resina", unita: "mq", quantita: "648", prezzo: "32" },
] };

describe("giorni lavorativi", () => {
  it("salta sabato e domenica", () => {
    const venerdi = leggiData("30/10/2026")!;
    expect(dataDelGiorno(venerdi, 1).getDate()).toBe(30);
    expect(dataDelGiorno(venerdi, 2).getDate()).toBe(2); // lunedì 2 novembre
    expect(dataDelGiorno(leggiData("31/10/2026")!, 1).getDate()).toBe(2); // si parte di sabato: il primo giorno è lunedì
  });
  it("una data scritta male non vale", () => {
    expect(leggiData("31/02/2026")).toBeNull();
    expect(leggiData("2026-10-30")).toBeNull();
  });
});

describe("fasi", () => {
  it("dai capitoli: una fase per capitolo, in fila, lunga quanto pesa", () => {
    const c = cronoDaCapitoli(bozza);
    expect(c.fasi.map(f => f.nome)).toEqual(["Scavi", "Manto"]);
    expect(c.fasi[0]).toMatchObject({ inizio: 1, durata: 2 }); // 3.110 € ≈ 2 giornate
    expect(c.fasi[1].inizio).toBe(3);
    expect(durataTotale(c)).toBe(2 + 14);
  });
  it("numeri ripuliti e ordine di partenza", () => {
    const f = normalizzaFasi([{ id: "b", nome: " Finiture ", inizio: 5.4, durata: 0, nota: "" }, { id: "a", nome: "", inizio: -3, durata: 2, nota: "" }]);
    expect(f.map(x => [x.nome, x.inizio, x.durata])).toEqual([["Fase", 1, 2], ["Finiture", 5, 1]]);
  });
  it("una bozza di prima, senza cronoprogramma, si apre vuota", () => {
    const vecchia = JSON.stringify({ versione: 1, titolo: "x", committente: "", oggetto: "", voci: [] });
    expect(leggiBozzaComputo(vecchia).cronoprogramma).toEqual({ dataInizio: "", fasi: [], nota: "" });
  });
});

describe("pagina del cronoprogramma nel PDF", () => {
  for (const presentazione of ["preventivo", "tecnico"] as const) it(`c'è nel PDF ${presentazione}`, async () => {
    const crono = { ...cronoDaCapitoli(bozza, "02/11/2026"), nota: "Stagionatura del massetto compresa" };
    const pdf = (await generaComputoPdf(vociDaBozza(bozza), { ...bozza, presentazione, impaginazione: presentazione === "tecnico" ? "primus" : "editoriale", stato: "", cronoprogramma: crono })).output();
    expect(pdf).toContain("Cronoprogramma dei lavori");
    expect(pdf).toContain("Stagionatura del massetto compresa");
    expect(pdf).toContain("dal 02/11/2026");
  });
  it("senza fasi la pagina non c'è", async () => {
    const pdf = (await generaComputoPdf(vociDaBozza(bozza), { ...bozza, presentazione: "preventivo", stato: "" })).output();
    expect(pdf).not.toContain("Cronoprogramma dei lavori");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contaSigleDaTesto, eDescrizioneLegenda, eSigla, riepilogoFamiglie, type TestoTavola } from "@/lib/distinta/conteggioTesto";
import { sommaRiquadri } from "@/lib/distinta/tavolePdf";

// Tavole SINTETICHE con la stessa struttura del testo che pdfjs estrae da una
// tavola d'impianto (Archicad): legenda con sigla + descrizione, sigle sparse
// in pianta vicino ai nomi dei locali (inventati), scritte spaziate e lettere
// minuscole di un disegno. I conteggi attesi sono noti per costruzione.
function tavola(nome: string): TestoTavola[] {
  return (JSON.parse(readFileSync(`src/test/fixtures/tavole/${nome}`, "utf8")) as { s: string; x: number; y: number; h: number; p: number }[])
    .filter((t) => t.s !== "__PAGE__")
    .map((t) => ({ s: t.s, x: t.x, y: t.y, h: t.h, pagina: t.p }));
}

describe("tavole sintetiche: sigle contate dal testo del PDF", () => {
  it("forza motrice: 23 «PA» in pianta, quello della legenda escluso, con la sua descrizione", () => {
    const r = contaSigleDaTesto(tavola("tavola_sintetica_fm_testo.json"));
    const pa = r.sigle.find((s) => s.sigla === "PA");
    expect(pa?.quantita).toBe(23);
    expect(pa?.inLegenda).toBe(1);
    expect(pa?.descrizioneLegenda).toBe("PUNTO ALIMENTAZIONE UTILIZZATORI");
    expect(Object.values(pa!.perLocale).reduce((a, b) => a + b, 0)).toBe(23);
    expect(pa!.perLocale["sala lettura"]).toBeGreaterThanOrEqual(5);
  });

  it("climatizzazione: 19 «T» e 5 «TG» scritti, di cui uno ciascuno in legenda; collettori C1…C7 come famiglia", () => {
    const r = contaSigleDaTesto(tavola("tavola_sintetica_cdz_testo.json"));
    const t = r.sigle.find((s) => s.sigla === "T")!;
    const tg = r.sigle.find((s) => s.sigla === "TG")!;
    expect([t.quantita + t.inLegenda, t.quantita, t.descrizioneLegenda]).toEqual([19, 18, "TERMOSTATO DI ZONA"]);
    expect([tg.quantita + tg.inLegenda, tg.quantita, tg.descrizioneLegenda]).toEqual([5, 4, "TERMOSTATO GENERALE"]);
    const c = riepilogoFamiglie(r.sigle).find((f) => f.famiglia === "C");
    expect(c?.quantita).toBe(7);
    expect(c?.sigle).toEqual(["C1", "C2", "C3", "C4", "C5", "C6", "C7"]);
    // «Cx» è il simbolo generico della legenda, non un collettore numerato.
    expect(r.sigle.some((s) => s.sigla === "Cx")).toBe(false);
  });

  it("antincendio: le lettere del disegno e le scritte spaziate non diventano sigle", () => {
    const r = contaSigleDaTesto(tavola("tavola_sintetica_antincendio_testo.json"));
    expect(r.sigle).toEqual([]);
    expect(r.legenda).toContain("RILEVATORE OTTICO DI FUMO");
    expect(r.legenda.some((l) => l.startsWith("CAVO FTE29OHM16"))).toBe(true);
  });

  it("con l'elenco delle sigle scelte conta solo quelle (anche se compaiono una volta)", () => {
    const r = contaSigleDaTesto(tavola("tavola_sintetica_cdz_testo.json"), { sigle: ["TG", "C7"] });
    expect(r.sigle.map((s) => [s.sigla, s.quantita])).toEqual([["TG", 4], ["C7", 1]]);
  });
});

describe("regole sul testo", () => {
  it("riconosce sigle e descrizioni di legenda", () => {
    expect(eSigla("PA")).toBe(true);
    expect(eSigla("RJ45")).toBe(true);
    expect(eSigla("S-02")).toBe(true);
    expect(eSigla("sala")).toBe(false);
    expect(eSigla("DOWN")).toBe(false);
    expect(eDescrizioneLegenda("PUNTO LUCE A SOFFITTO")).toBe(true);
    expect(eDescrizioneLegenda("sala lettura")).toBe(false);
  });

  it("una sigla lontana da ogni nome di locale resta «Senza locale»", () => {
    const testi: TestoTavola[] = [
      { s: "Ufficio", x: 0, y: 0, h: 10 },
      { s: "PA", x: 5, y: 5, h: 10 },
      { s: "PA", x: 5000, y: 5000, h: 10 },
    ];
    const r = contaSigleDaTesto(testi);
    expect(r.sigle[0].perLocale).toEqual({ Ufficio: 1, "Senza locale": 1 });
  });
});

describe("somma dei riquadri dell'AI", () => {
  it("somma le quantità e pesa la confidenza", () => {
    const r = sommaRiquadri([
      [{ simbolo: "PUNTO LUCE A SOFFITTO", quantita: 3, confidenza: 1 }],
      [{ simbolo: "PUNTO LUCE A SOFFITTO", quantita: 1, confidenza: 0.6 }, { simbolo: "PRESE ELETTRICHE 10/16A", quantita: 2, confidenza: 0.8 }],
    ]);
    expect(r).toEqual([
      { simbolo: "PUNTO LUCE A SOFFITTO", quantita: 4, confidenza: 0.9, riquadri: 2 },
      { simbolo: "PRESE ELETTRICHE 10/16A", quantita: 2, confidenza: 0.8, riquadri: 1 },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { gruppiDaTagli, numeroBollaDaTesto, paginaDiTotale, tagliProposti } from "@/lib/ddt/dividiPdf";

describe("il numero della bolla nel testo", () => {
  it.each([
    ["DDT n. 123/A del 03/11/2026", "123/A"],
    ["D.D.T. N° 45 - Data 01/10/2026", "45"],
    ["Documento di trasporto numero: BL-77", "BL-77"],
    ["DOCUMENTO DI TRASPORTO Nr. 0012", "0012"],
    ["Bolla di consegna n. 9.", "9"],
  ])("%s → %s", (testo, atteso) => {
    expect(numeroBollaDaTesto(testo)).toBe(atteso);
  });

  it("senza un numero di bolla non inventa", () => {
    expect(numeroBollaDaTesto("Cemento 32.5 sacco 25kg - Qta 10")).toBeNull();
  });
});

describe("pagina X di Y", () => {
  it("la riconosce e scarta quello che non torna", () => {
    expect(paginaDiTotale("Pagina 2 di 3")).toEqual({ pagina: 2, totale: 3 });
    expect(paginaDiTotale("pag. 1/2")).toEqual({ pagina: 1, totale: 2 });
    expect(paginaDiTotale("Pagina 5 di 3")).toBeNull();
    expect(paginaDiTotale("nessuna")).toBeNull();
  });
});

describe("dove tagliare", () => {
  it("quando cambia il numero comincia un'altra bolla", () => {
    expect(tagliProposti(["DDT n. 1", "DDT n. 2", "DDT n. 3"]).tagli).toEqual([1, 2]);
  });

  it("lo stesso numero su due pagine è la stessa bolla", () => {
    expect(tagliProposti(["DDT n. 1", "DDT n. 1 segue", "DDT n. 2"]).tagli).toEqual([2]);
  });

  it("il «pagina X di Y» vince sul numero, anche se la seconda pagina non lo ripete", () => {
    expect(tagliProposti(["DDT n. 1 Pagina 1 di 2", "righe Pagina 2 di 2", "DDT n. 2 Pagina 1 di 1"]).tagli).toEqual([2]);
    expect(tagliProposti(["Ditta Pagina 1 di 1", "Ditta Pagina 1 di 1"]).tagli).toEqual([1]);
  });

  it("una pagina con testo ma senza numero resta con la precedente", () => {
    expect(tagliProposti(["DDT n. 1", "altre righe merce"]).tagli).toEqual([]);
  });

  it("una scansione si taglia a ogni pagina, e lo dice", () => {
    expect(tagliProposti(["", " ", ""])).toEqual({ tagli: [1, 2], senzaTesto: 3 });
  });

  it("dopo una scansione il numero non resta quello vecchio", () => {
    expect(tagliProposti(["DDT n. 1", "", "DDT n. 1"]).tagli).toEqual([1]);
  });

  it("una pagina sola non si taglia", () => {
    expect(tagliProposti(["DDT n. 1"]).tagli).toEqual([]);
    expect(tagliProposti([]).tagli).toEqual([]);
  });
});

describe("dai tagli ai gruppi di pagine", () => {
  it("ogni pagina una volta sola e in ordine", () => {
    expect(gruppiDaTagli(5, [3, 2])).toEqual([[0, 1], [2], [3, 4]]);
    expect(gruppiDaTagli(3, [])).toEqual([[0, 1, 2]]);
    expect(gruppiDaTagli(3, [0, 3, 1, 1])).toEqual([[0], [1, 2]]);
  });
});

it("divide un archivio di 191 scansioni senza perdere o ripetere pagine",()=>{
 const proposta=tagliProposti(Array.from({length:191},()=>""));
 const gruppi=gruppiDaTagli(191,proposta.tagli);
 expect(gruppi).toHaveLength(191);expect(gruppi.flat()).toEqual(Array.from({length:191},(_,i)=>i));
});

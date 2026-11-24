import { describe, expect, it } from "vitest";
import { CAMPIONI_MINIMI, correzioneRese, type CampioneCommessa } from "@/lib/planimetrie/correzioneRese";
import { previsioneLavori } from "@/lib/planimetrie/previsioneLavori";
import type { RigaStudio } from "@/lib/planimetrie/studioImmobiliare";

const giorni = (n: number, da = 1) => Array.from({ length: n }, (_, i) => `2026-03-${String(da + i).padStart(2, "0")}`);
const campione = (id: string, demolizioniVere: number, tinteggiatureVere = 0): CampioneCommessa => ({
  order_id: id,
  fasi_previste: [{ fase: "Demolizioni", giorni: 4 }, { fase: "Tinteggiature", giorni: 5 }],
  fasi_commessa: [
    { id: id + "a", nome: "Allestimento e demolizioni", giorni: giorni(demolizioniVere) },
    { id: id + "b", nome: "Pitture", giorni: giorni(tinteggiatureVere, 10) },
    { id: id + "c", nome: "Impianti", giorni: giorni(3, 20) },
  ],
});

describe("correzioneRese", () => {
  it("sotto i campioni minimi non corregge niente", () => {
    const c = correzioneRese([campione("1", 6, 5)]);
    expect(c.fattori).toEqual({});
    expect(c.perFase).toEqual([{ fase: "Demolizioni", campioni: 1, fattore: null }, { fase: "Tinteggiature", campioni: 1, fattore: null }]);
    expect(c.commesse).toBe(1);
  });

  it("con abbastanza commesse usa la mediana, che una commessa strana non sposta", () => {
    // Demolizioni: 6/4 su quattro commesse, una a 24/4 (fuori dai limiti, scartata) e una a 8/4.
    const c = correzioneRese([campione("1", 6), campione("2", 6), campione("3", 6), campione("4", 6), campione("5", 24), campione("6", 8)]);
    expect(CAMPIONI_MINIMI).toBe(5);
    expect(c.perFase).toEqual([{ fase: "Demolizioni", campioni: 5, fattore: 1.5 }]);
    expect(c.fattori).toEqual({ Demolizioni: 1.5 });
  });

  it("una fase senza rapportini sulle fasi abbinate non conta", () => {
    const c = correzioneRese(Array.from({ length: 6 }, (_, i) => campione(String(i), 4, 0)));
    expect(c.perFase.map((f) => f.fase)).toEqual(["Demolizioni"]);
    expect(c.fattori).toEqual({});
  });
});

describe("previsioneLavori con la correzione", () => {
  const riga: RigaStudio = { id: "m1-dem", livelloId: "pt", piano: "PT", fase: "Progetto", descrizione: "Demolizione tramezzo m1", gruppo: "Lavori", unita: "m²", quantita: 40, criterio: "", stimata: false,
    prezzo: { importo: 30, unita: "m²", fonte: "Listino" } as RigaStudio["prezzo"] };
  it("allunga i giorni della fase e tiene quelli tipici, senza toccare gli importi", () => {
    const base = previsioneLavori([riga], []);
    const corretta = previsioneLavori([riga], [], { Demolizioni: 1.5 });
    expect(base.fasi[0]).toMatchObject({ giorni: 2, giorniBase: 2 });
    expect(base.fasi[0].correzione).toBeUndefined();
    expect(corretta.fasi[0]).toMatchObject({ giorni: 3, giorniBase: 2, correzione: 1.5 });
    expect(corretta.totale).toBe(base.totale);
  });
});

import { describe, expect, it } from "vitest";
import { datiLotto, riepilogoProgetto, tipoAlloggio } from "@/lib/planimetrie/riepilogoProgetto";
import { zonaDelLocale } from "@/lib/planimetrie/esporta/scena";
import { validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello";

const stanza = (id: string, nome: string, destinazione: string, x: number, unita?: string) => ({
  id, nome, destinazione, altezza: 300, origine: "rilevata", ...(unita ? { unita } : {}),
  contorno: [{ x, y: 0 }, { x: x + 400, y: 0 }, { x: x + 400, y: 300 }, { x, y: 300 }],
});
const doc = {
  schema: 1, unita: "cm",
  livelli: [{
    id: "pt", nome: "Piano terra", quota: 0, proposte: [],
    fatto: { muri: [], aperture: [], elementi: [], quote: [], testi: [], locali: [
      stanza("a", "soggiorno", "soggiorno", 0, "Int. 01"), stanza("b", "letto", "camera", 400, "Int. 01"), stanza("c", "bagno", "bagno", 800, "Int. 01"),
      stanza("d", "soggiorno", "soggiorno", 1200, "Int. 02"), stanza("e", "letto", "camera", 1600, "Int. 02"), stanza("f", "letto", "camera", 2000, "Int. 02"),
      stanza("g", "Locale 5", "altro", 2400),
    ] },
  }],
} as unknown as Planimetria;

describe("riepilogo del progetto", () => {
  it("unità con tipo, bagni e m², come nelle tavole", () => {
    const r = riepilogoProgetto(doc, "fatto");
    expect(r.unita.map((u) => [u.nome, u.tipo, u.bagni, u.nettaMq])).toEqual([["Int. 01", "Bilocale", 1, 36], ["Int. 02", "Da completare", 0, 36]]);
    expect(r.senzaUnitaMq).toBe(12);
    expect(r.piani).toEqual([{ id: "pt", nome: "Piano terra", stanze: 7, nettaMq: 84, lordaMq: 0 }]);
  });
  it("confronta con la legenda della tavola e mostra le unità che la pianta non ha trovato", () => {
    const conLegenda = { ...doc, unitaDichiarate: [
      { nome: "INT. 01", sulMq: 46, suMq: 36.5, tipo: "Bilocale" },
      { nome: "Int. 02", suMq: 50, tipo: "Trilocale" },
      { nome: "Int. 03", suMq: 60, tipo: "Trilocale" },
    ] } as Planimetria;
    const r = riepilogoProgetto(conLegenda, "fatto");
    expect(r.unita.map((u) => [u.nome, u.nettaMq, u.dichiarata?.suMq, u.scartoMq, u.torna])).toEqual([
      ["Int. 01", 36, 36.5, -0.5, true],
      ["Int. 02", 36, 50, -14, false],
      ["Int. 03", 0, 60, -60, false],
    ]);
    expect(validaPlanimetria(conLegenda).ok).toBe(true);
    expect(validaPlanimetria({ ...doc, unitaDichiarate: [{ nome: "", suMq: -1 }] }).ok).toBe(false);
  });
  it("i dati del lotto: superficie, verde, piscine", () => {
    const quadrato = (x: number, y: number, l: number) => [{ x, y }, { x: x + l, y }, { x: x + l, y: y + l }, { x, y: y + l }];
    const conLotto = { ...doc, livelli: [{ ...doc.livelli[0], fatto: { ...doc.livelli[0].fatto,
      aree: [{ id: "l", tipo: "lotto", contorno: quadrato(-1000, -1000, 4000) }, { id: "p", tipo: "prato", contorno: quadrato(-1000, -1000, 1000) }],
      elementi: [{ id: "e", tipo: "piscina", posizione: { x: 0, y: 0 }, larghezza: 500, profondita: 800, rotazione: 0 }],
    } }] } as unknown as Planimetria;
    expect(datiLotto(conLotto, "fatto")).toMatchObject({ lottoMq: 1600, copertaMq: 0, rapportoCopertura: 0, aree: [{ tipo: "prato", mq: 100 }], piscine: 1 });
    expect(datiLotto(doc, "fatto")).toBeNull();
  });
  it("la zona della stanza per le tavole di vendita", () => {
    expect([
      { nome: "sogg/pranzo", destinazione: "soggiorno" }, { nome: "letto", destinazione: "altro" }, { nome: "dis.", destinazione: "altro" },
      { nome: "bagno", destinazione: "bagno" }, { nome: "atrio condominiale", destinazione: "altro" }, { nome: "terrazzo", destinazione: "terrazzo" },
    ].map(zonaDelLocale)).toEqual(["giorno", "notte", "servizi", "servizi", "comuni", "esterni"]);
  });
  it("il tipo viene dalle camere", () => {
    expect([0, 1, 2, 3, 4].map(tipoAlloggio)).toEqual(["Monolocale", "Bilocale", "Trilocale", "Quadrilocale", "5 locali"]);
  });
});

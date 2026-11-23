import { describe, expect, it } from "vitest";
import { registraRiscontroDwg } from "@/lib/planimetrie/revisioneDwg";
import { differenzeLavorazioni, studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { nuovaPlanimetria, validaPlanimetria, type Locale } from "../../../shared/planimetrie/modello.ts";

function rettangolo(x: number, l: number, h: number) {
  return [{x, y: 0}, {x: x + l, y: 0}, {x: x + l, y: h}, {x, y: h}];
}

function progetto() {
  const documento = nuovaPlanimetria();
  const [piano] = documento.livelli;
  const garage: Locale = {
    id: "garage", nome: "Garage", contorno: rettangolo(0, 600, 1000), destinazione: "garage", altezza: 270, origine: "stimata",
  };
  const studio: Locale = {
    id: "studio", nome: "Studio", contorno: rettangolo(800, 400, 300), destinazione: "studio", altezza: 270, origine: "stimata",
  };
  piano.fatto.locali = [garage, studio];
  piano.proposte = [{ ...piano.fatto, id: "A", nome: "Progetto",
    locali: piano.fatto.locali.map(l => ({ ...l, finiture: { pavimento: "Gres" } })),
  }, { ...piano.fatto, id: "B", nome: "Progetto con una misura già diversa",
    locali: [{ ...garage, contorno: rettangolo(0, 610, 1000) }, studio],
  }];
  const tratti = [{ a: {x: 625, y: 0}, b: {x: 625, y: 1000}, fonti: [{handle: "3BB", layer: "Wall"}] }];
  piano.controlloDwg = [
    { id: "rettifica", tipo: "portoni", stato: "da_rivedere", tratti,
      modifica: { localeId: garage.id, prima: garage.contorno, dopo: rettangolo(0, 625, 1000) } },
    { id: "sovrapposti", tipo: "sovrapposizione", stato: "da_rivedere", tratti },
  ];
  return { documento, piano };
}

describe("revisione geometrica DWG", () => {
  it("ricompone il contorno nella variante che lo eredita e cambia solo la quantità del garage", () => {
    const { documento, piano } = progetto();
    const dopo = registraRiscontroDwg(documento, piano.id, "rettifica", "confermata");
    const [aggiornato] = dopo.livelli;
    expect(validaPlanimetria(dopo).ok).toBe(true);
    expect(aggiornato.proposte[1]).toBe(piano.proposte[1]);
    expect(aggiornato.proposte[0].locali[0].finiture?.pavimento).toBe("Gres");
    const differenze = differenzeLavorazioni(studioVariante(documento, "A").righe, studioVariante(dopo, "A").righe);
    expect(differenze).toMatchObject([{ prima: { descrizione: "Posa pavimento · Garage", quantita: 60 },
      dopo: { quantita: 62.5 }, delta: 2.5 }]);
    const ripristinato = registraRiscontroDwg(dopo, piano.id, "rettifica", "da_rivedere");
    expect(studioVariante(ripristinato, "A").righe).toEqual(studioVariante(documento, "A").righe);
  });

  it("registra sovrapposizioni o esclusioni senza produrre una variazione di quantità", () => {
    const { documento, piano } = progetto();
    const visto = registraRiscontroDwg(documento, piano.id, "sovrapposti", "confermata");
    const escluso = registraRiscontroDwg(visto, piano.id, "rettifica", "ignorata");
    expect(escluso.livelli[0].fatto).toBe(piano.fatto);
    expect(escluso.livelli[0].proposte).toBe(piano.proposte);
    expect(escluso.livelli[0].controlloDwg?.map(r => r.stato)).toEqual(["ignorata", "confermata"]);
  });

  it("protegge una revisione fatta a mano e impedisce di introdurre un nuovo incrocio fra locali", () => {
    const { documento, piano } = progetto();
    piano.fatto.locali[1].contorno = rettangolo(615, 130, 300);
    expect(() => registraRiscontroDwg(documento, piano.id, "rettifica", "confermata")).toThrow("si sovrappone");
    piano.fatto.locali[0].contorno = rettangolo(0, 620, 1000);
    expect(() => registraRiscontroDwg(documento, piano.id, "rettifica", "confermata")).toThrow("modificato dopo l’importazione");
  });
});

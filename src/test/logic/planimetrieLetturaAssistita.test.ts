import { describe, expect, it } from "vitest";
import { aggiungiTracciaSullaTavola, aggiornaLarghezzaTavolaIndicativa, esaminaPropostaTavola } from "@/lib/planimetrie/letturaAssistita";
import { rilevaSullaTavola } from "@/lib/planimetrie/rilevaTavola";
import { letturaAssistitaValida, type ElementoLetturaTavola } from "../../../shared/planimetrie/letturaAssistita.ts";
import { nuovaPlanimetria, scalaModelloDaVerificare, statoVuoto, validaPlanimetria, type Muro } from "../../../shared/planimetrie/modello.ts";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";

describe("lettura assistita della tavola", () => {
  it("ricalca muro, porta e finestra come oggetti nativi conservando la scala indicativa", () => {
    const doc = nuovaPlanimetria();
    doc.livelli[0].ricalco = { percorso: "azienda/ricalco/bim.png", x: 0, y: 0, larghezzaCm: 1000, proporzione: 0.75, opacita: 0.8, calibrata: false };
    const bozza = aggiornaLarghezzaTavolaIndicativa(doc, "pt", 27.5);
    const muro = aggiungiTracciaSullaTavola(bozza, "pt", "muro", { x: .1, y: .3 }, { x: .6, y: .3 }, 30).documento;
    const porta = aggiungiTracciaSullaTavola(muro, "pt", "porta", { x: .2, y: .3 }, { x: .24, y: .3 }, 2).documento;
    const risultato = aggiungiTracciaSullaTavola(porta, "pt", "finestra", { x: .4, y: .3 }, { x: .46, y: .3 }, 2).documento;
    const piano = risultato.livelli[0];
    expect(piano.fatto.muri).toMatchObject([{ spessore: 30 }]);
    expect(piano.fatto.aperture).toMatchObject([
      { tipo: "porta", larghezza: 110, muroId: piano.fatto.muri[0].id },
      { tipo: "finestra", larghezza: 165, muroId: piano.fatto.muri[0].id },
    ]);
    expect(piano.ricalco?.calibrata).toBe(false);
    expect(scalaModelloDaVerificare(piano)).toBe(true);
    expect(validaPlanimetria(risultato).ok).toBe(true);
    expect(() => aggiornaLarghezzaTavolaIndicativa(risultato, "pt", 28)).toThrow(/geometria/);
    expect(() => aggiungiTracciaSullaTavola(bozza, "pt", "porta", { x: .2, y: .3 }, { x: .24, y: .3 }, 2)).toThrow(/parete/);
  });

  it("propone muri, finestre, battenti, rampe e nomi letti, tutti da verificare", () => {
    const larghezza = 800;
    const altezza = 600;
    const pixel = new Uint8Array(larghezza * altezza);
    const orizzontale = (y: number, da: number, a: number) => { for (let x = da; x <= a; x++) pixel[y * larghezza + x] = 1; };
    const verticale = (x: number, da: number, a: number) => { for (let y = da; y <= a; y++) pixel[y * larghezza + x] = 1; };
    orizzontale(60, 40, 615);
    orizzontale(72, 40, 615);
    orizzontale(66, 220, 305);
    verticale(220, 60, 72);
    verticale(305, 60, 72);
    for (const y of [200, 210]) {
      orizzontale(y, 55, 180);
      orizzontale(y, 240, 375);
    }
    verticale(180, 205, 265);
    for (let i = 0; i <= 100; i++) {
      const theta = i * Math.PI / 200;
      pixel[Math.round(205 + 60 * Math.sin(theta)) * larghezza + Math.round(180 + 60 * Math.cos(theta))] = 1;
    }
    for (const y of [345, 353, 361, 369, 377, 385]) orizzontale(y, 442, 509);
    const elementi = rilevaSullaTavola({ pixel, larghezza, altezza }, [
      {text: "UPPER FAMILY ROOM", confidence: 0.88, bbox: [0.34, 0.44, 0.12, 0.03]},
      {text: "SCALE 1:100", confidence: 0.93, bbox: [0.07, 0.92, 0.12, 0.03]},
    ]);
    expect(new Set(elementi.map((e) => e.tipo))).toEqual(new Set(["muro", "porta", "finestra", "scala", "locale"]));
    expect(elementi.filter((e) => e.tipo === "locale").map((e) => e.nome)).toEqual(["UPPER FAMILY ROOM"]);
    expect(elementi.every((e) => e.stato === "da_verificare")).toBe(true);
    expect(letturaAssistitaValida({percorso: "azienda/ricalco/pdf-1.png", elementi})).toBe(true);
  });

  it("applica solo gli elementi confermati sulla tavola in scala del piano scelto", () => {
    const percorso = "azienda/ricalco/pdf-1.png";
    const zona = {x: 0.1, y: 0.2, larghezza: 0.6, altezza: 0.04};
    const muro: ElementoLetturaTavola = {id: "muro-1", tipo: "muro", zona, stato: "da_verificare",
      tratto: {da: {x: 0.1, y: 0.2}, a: {x: 0.8, y: 0.2}, spessore: 0.02}};
    const finestra: ElementoLetturaTavola = {id: "finestra-1", tipo: "finestra", zona, stato: "da_verificare",
      tratto: {da: {x: 0.3, y: 0.2}, a: {x: 0.4, y: 0.2}, spessore: 0.02}};
    const porta: ElementoLetturaTavola = {...finestra, id: "porta-1", tipo: "porta"};
    const doc = nuovaPlanimetria();
    doc.livelli.push({id: "primo", nome: "Primo piano", quota: 310, fatto: statoVuoto(), proposte: []});
    const [terra] = doc.livelli;
    terra.ricalco = {percorso, x: 0, y: 0, larghezzaCm: 1200, proporzione: 1, opacita: 0.8, calibrata: false};
    terra.letturaAssistita = {percorso, elementi: [muro, finestra, porta]};

    expect(() => esaminaPropostaTavola(doc, "pt", muro.id, "inserito")).toThrow(/Imposta la scala/);
    expect(terra.fatto.muri).toEqual([]);
    expect(Object.values(calcolaQuantita(doc)).filter((q) => q.descrizione === "Lunghezza parete")).toEqual([]);
    terra.ricalco.calibrata = true;
    expect(() => esaminaPropostaTavola(doc, "pt", finestra.id, "inserito")).toThrow(/parete del vano/);
    const conMuro = esaminaPropostaTavola(doc, "pt", muro.id, "inserito");
    expect(conMuro.livelli[0].fatto.muri).toHaveLength(1);
    expect(conMuro.livelli[0].fatto.aperture).toHaveLength(0);
    expect(esaminaPropostaTavola(conMuro, "pt", muro.id, "inserito")).toBe(conMuro);
    const conFinestra = esaminaPropostaTavola(conMuro, "pt", finestra.id, "inserito");
    const conclusa = esaminaPropostaTavola(conFinestra, "pt", porta.id, "scartato");
    expect(conclusa.livelli[0].fatto.aperture).toMatchObject([{tipo: "finestra", larghezza: 120}]);
    expect(conclusa.livelli[0].letturaAssistita?.elementi.map((e) => e.stato)).toEqual(["inserito", "inserito", "scartato"]);
    expect(Object.values(calcolaQuantita(conclusa)).filter((q) => q.descrizione === "Lunghezza parete")).toMatchObject([{livelloId: "pt", valore: 8.4}]);
    expect(conclusa.livelli[1]).toBe(doc.livelli[1]);
    expect(validaPlanimetria(conclusa).ok).toBe(true);
  });

  it("collega una porta tra due muri esistenti e applica rampa e nome del locale", () => {
    const percorso = "azienda/ricalco/pdf.png";
    const doc = nuovaPlanimetria();
    const [piano] = doc.livelli;
    piano.ricalco = {percorso, x: 0, y: 0, larghezzaCm: 1200, proporzione: 1, opacita: 0.8, calibrata: true};
    const segmento = (id: string, da: number, a: number): Muro => ({id, p1: {x: da, y: -240}, p2: {x: a, y: -240},
      spessore: 20, altezza: 270, tipo: "tramezzo", stato: "esistente", origine: "rilevata"});
    piano.fatto.muri = [segmento("prima", 120, 420), segmento("dopo", 540, 900)];
    const zona = {x: 0.35, y: 0.18, larghezza: 0.2, altezza: 0.12};
    piano.letturaAssistita = {percorso, elementi: [
      {id: "porta-1", tipo: "porta", zona, stato: "da_verificare", tratto: {da: {x: 0.35, y: 0.2}, a: {x: 0.45, y: 0.2}, spessore: 0.02}},
      {id: "scala-1", tipo: "scala", zona, stato: "da_verificare", tratto: {da: {x: 0.56, y: 0.5}, a: {x: 0.56, y: 0.65}, spessore: 0.06}},
      {id: "locale-1", tipo: "locale", nome: "FOYER", zona, stato: "da_verificare"},
    ]};
    const porta = esaminaPropostaTavola(doc, "pt", "porta-1", "inserito");
    const scala = esaminaPropostaTavola(porta, "pt", "scala-1", "inserito");
    const confermata = esaminaPropostaTavola(scala, "pt", "locale-1", "inserito");
    expect(confermata.livelli[0].fatto.muri).toHaveLength(3);
    expect(confermata.livelli[0].fatto.aperture).toMatchObject([{tipo: "porta", larghezza: 120}]);
    expect(confermata.livelli[0].fatto.elementi).toMatchObject([{tipo: "scala", larghezza: 72, profondita: 180}]);
    expect(confermata.livelli[0].fatto.testi).toMatchObject([{testo: "FOYER"}]);
    expect(validaPlanimetria(confermata).ok).toBe(true);
  });
});

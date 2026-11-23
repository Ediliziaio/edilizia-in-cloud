import { describe, expect, it } from "vitest";
import { nuovaPlanimetria, type Apertura, type Locale, type Muro } from "../../../shared/planimetrie/modello.ts";
import { analizzaProgetto } from "./analisiProgetto";
import { anteprimaCorrezioniProgetto } from "./chatProgetto";

const portante: Muro = { id: "portante", p1: { x: 0, y: 0 }, p2: { x: 400, y: 0 }, spessore: 30, altezza: 270, tipo: "portante", stato: "esistente", origine: "da_documento" };
const vano: Apertura = {
  id: "P1", muroId: portante.id, tipo: "porta", offset: 110, larghezza: 85,
  altezza: 210, davanzale: 0, manovra: "battente", stato: "esistente", origine: "da_documento",
};

describe("analisi di progetto in Silvio", () => {
  it("limita il confronto strutturale alla variante selezionata", () => {
    const doc = nuovaPlanimetria();
    const livello = doc.livelli[0];
    livello.fatto.muri = [portante];
    livello.fatto.aperture = [vano];
    livello.proposte = [
      { ...livello.fatto, id: "demolizione", nome: "Demolizione", muri: [{ ...portante, stato: "da_demolire" }], aperture: [] },
      { ...livello.fatto, id: "nuovo-vano", nome: "Vano", aperture: [{ ...vano, offset: 130 }] },
      { ...livello.fatto, id: "finiture", nome: "Finiture", aperture: [{ ...vano, ante: 2 }] },
    ];
    expect(analizzaProgetto(doc, "progetto:demolizione")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        area: "Struttura", priorita: "tecnico", titolo: "Parete portante",
        posizione: { livelloId: livello.id, etichetta: "Parete portante", tratto: { da: portante.p1, a: portante.p2, tratteggiato: true } },
      }),
    ]));
    expect(analizzaProgetto(doc, "progetto:nuovo-vano").some(e => e.titolo === "Vano P1 su parete portante")).toBe(true);
    expect(analizzaProgetto(doc, "progetto:finiture").filter(e => e.area === "Struttura" && e.priorita === "tecnico")).toEqual([]);
  });

  it("ripristina il vano originale e mantiene la parete in una nuova variante, con le altre demolizioni intatte", () => {
    const doc = nuovaPlanimetria();
    doc.ambitoDocumento = "alloggio";
    const livello = doc.livelli[0];
    const parti: Locale = {
      id: "ingresso", nome: "Ingresso comune", destinazione: "ingresso", altezza: 270, unita: "Parti comuni", origine: "da_documento",
      contorno: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 }],
    };
    const unita: Locale = {
      ...parti, id: "disimpegno-b", nome: "Disimpegno B", destinazione: "disimpegno", unita: "B",
      contorno: [{ x: 110, y: 0 }, { x: 340, y: 0 }, { x: 340, y: 200 }, { x: 110, y: 200 }],
    };
    const esterno: Muro = { ...portante, id: "facciata", tipo: "esterno", spessore: 10, p1: { x: -5, y: 0 }, p2: { x: -5, y: 200 } };
    const divisione: Muro = { ...esterno, id: "divisione", tipo: "tramezzo", p1: { x: 105, y: 0 }, p2: { x: 105, y: 200 } };
    const ingresso: Apertura = { ...vano, id: "P2", muroId: divisione.id, offset: 55, larghezza: 80 };
    const pareteDiProva: Muro = { ...portante, p1: { x: 0, y: -300 }, p2: { x: 400, y: -300 } };
    const tramezzo: Muro = { ...pareteDiProva, id: "altro", tipo: "tramezzo", p1: { x: 0, y: -200 }, p2: { x: 400, y: -200 } };
    livello.fatto.muri = [esterno, divisione, pareteDiProva, tramezzo];
    livello.fatto.locali = [parti, unita];
    livello.fatto.aperture = [{ ...vano, muroId: esterno.id, offset: 55 }, ingresso];
    livello.proposte = [{
      ...livello.fatto, id: "senza-ingresso", nome: "Senza ingresso", aperture: [livello.fatto.aperture[0]],
      muri: [esterno, divisione, { ...pareteDiProva, stato: "da_demolire" }, { ...tramezzo, stato: "da_demolire" }],
    }];
    expect(analizzaProgetto(doc, "fatto").some(e => e.area === "Accessi")).toBe(false);
    const esito = analizzaProgetto(doc, "progetto:senza-ingresso").find(e => e.area === "Accessi");
    expect(esito?.posizione).toEqual({
      livelloId: livello.id, etichetta: "Ingresso B", locali: ["disimpegno-b"],
      tratto: { da: { x: 105, y: 55 }, a: { x: 105, y: 135 }, tratteggiato: true },
    });
    expect(esito?.verifica).toContain("Rivedi il vano P2");
    expect(esito?.correzione).toEqual({ tipo: "ripristina-apertura", id: ingresso.id });

    const selezione = { livelloId: livello.id, ambito: "progetto:senza-ingresso", localeId: unita.id };
    const anteprima = anteprimaCorrezioniProgetto(doc, selezione);
    expect(anteprima?.piani[0].correzioni?.map(c => c.id)).toEqual([ingresso.id, pareteDiProva.id]);
    expect(anteprima?.piani[0].accessi).toEqual([
      expect.objectContaining({ nome: "Unità B", esito: "collegato", dettaglio: ingresso.id }),
    ]);
    const nuova = anteprima?.documento.livelli[0].proposte.at(-1);
    expect(nuova?.aperture).toEqual(livello.fatto.aperture);
    expect(nuova?.muri).toEqual([esterno, divisione, pareteDiProva, { ...tramezzo, stato: "da_demolire" }]);
    expect(livello.proposte).toHaveLength(1);
    expect(livello.proposte[0].muri[2].stato).toBe("da_demolire");
    expect(livello.proposte[0].aperture).toHaveLength(1);
    const dopo = analizzaProgetto(anteprima!.documento, anteprima!.ambito);
    expect(dopo.some(e => e.area === "Accessi" && e.titolo === "B")).toBe(false);
    expect(dopo.some(e => e.area === "Struttura" && e.titolo === "Parete portante")).toBe(false);
    expect(dopo.find(e => e.area === "Antincendio" && e.titolo === "Percorsi e dati dell’edificio")?.verifica).toContain("altezza antincendio");

    // Con due vani alternativi praticabili, la scelta dell’ingresso resta al progettista.
    livello.fatto.aperture.push({ ...ingresso, id: "P2-bis", offset: 145, larghezza: 45 });
    const ambiguo = analizzaProgetto(doc, selezione.ambito).find(e => e.area === "Accessi");
    expect(ambiguo?.posizione?.tratto).toBeUndefined();
    expect(ambiguo?.correzione).toBeUndefined();
    expect(anteprimaCorrezioniProgetto(doc, selezione)?.piani[0].correzioni?.map(c => c.id)).toEqual([pareteDiProva.id]);
  });

  it("segnala l’assenza di ingresso disegnato senza dedurre la conformità d’esodo", () => {
    const doc = nuovaPlanimetria();
    doc.ambitoDocumento = "alloggio";
    const camera: Locale = {
      id: "unit-a", nome: "Camera A", destinazione: "camera", altezza: 270, unita: "A", origine: "da_documento",
      contorno: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 350 }, { x: 0, y: 350 }],
    };
    doc.livelli[0].fatto.locali = [camera];
    const risultati = analizzaProgetto(doc, "fatto");
    expect(risultati).toEqual(expect.arrayContaining([
      expect.objectContaining({ area: "Accessi", titolo: "A", priorita: "problema" }),
      expect.objectContaining({ area: "Antincendio", titolo: "Percorsi e dati dell’edificio", priorita: "dato" }),
    ]));
  });

  it("usa soglie strettamente superiori per le attività 75 e 77", () => {
    const doc = nuovaPlanimetria();
    const filtra = (altezzaAntincendio: number, autorimessaCoperta: number) =>
      analizzaProgetto(doc, "fatto", { altezzaAntincendio, autorimessaCoperta }).filter(e => e.area === "Antincendio" && e.priorita === "tecnico");
    expect(filtra(24, 300)).toEqual([]);
    expect(filtra(24.1, 300.5).map(e => e.titolo)).toEqual(["Attività 77 da inquadrare", "Attività 75 da inquadrare"]);
  });
});

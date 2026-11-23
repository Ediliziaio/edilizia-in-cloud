import { describe, expect, it } from "vitest";
import { PAVIMENTI_STANZA } from "../../../shared/planimetrie/finiture";
import { nuovaPlanimetria, statoVuoto, validaPlanimetria, type Elemento, type Locale, type Planimetria } from "../../../shared/planimetrie/modello";
import { anteprimaModificheCasa3D, STILI_ARREDI, type ModificaCasa3D } from "./modificheCasa3D";
import { pianiDaPlanimetria } from "./tred/edificio";

const contorno = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }];
const stanza = (id: string, destinazione: Locale["destinazione"], x = 0): Locale => ({
  id, nome: id, destinazione, origine: "rilevata", altezza: 270,
  contorno: contorno.map(p => ({ ...p, x: p.x + x })),
  finiture: { pavimento: "Gres avorio", pareti: "Intonaco bianco" },
});
const arredo = (id: string, tipo: string, localeId?: string, x = 126): Elemento => ({
  id, tipo, localeId, posizione: { x, y: 182 }, larghezza: 190, profondita: 82, altezza: 80, rotazione: 90, origine: "rilevata",
});
const rovere: ModificaCasa3D = { tipo: "pavimento", campioneId: "rovere_spina", mantieniBagni: true };
const descrizioneRovere = PAVIMENTI_STANZA.find(c => c.id === "rovere_spina")!.descrizione;

function casa(): Planimetria {
  const documento = nuovaPlanimetria("Casa due piani");
  const terra = {
    ...statoVuoto(),
    locali: [stanza("soggiorno", "soggiorno"), stanza("bagno", "bagno", 400), stanza("terrazzo", "terrazzo", 800)],
    elementi: [arredo("divano-pt", "divano", "soggiorno"), arredo("divano-fuori", "divano", "terrazzo", 920), arredo("wc", "wc", "bagno", 500)],
  };
  documento.livelli = [
    { ...documento.livelli[0], fatto: terra, proposte: [{
      ...terra, id: "A", nome: "Nuovi interni", elementi: [...terra.elementi, { ...arredo("vecchio-divano", "divano", "soggiorno"), stato: "da_demolire" }],
    }] },
    { id: "p1", nome: "Primo piano", quota: 300, proposte: [], fatto: {
      ...statoVuoto(), locali: [stanza("studio", "studio")],
      elementi: [arredo("divano-p1", "divano"), arredo("scrivania", "scrivania", "studio")],
    } },
  ];
  return documento;
}

describe("modifiche rapide all’intera casa nel 3D", () => {
  it("estende i pavimenti della variante anche al piano che usa lo stato di fatto, con bagni e terrazzi esclusi", () => {
    const prima = casa(), originale = structuredClone(prima);
    const dopo = anteprimaModificheCasa3D(prima, "progetto:A", rovere);
    expect(dopo.errore).toBeUndefined();
    expect(dopo.piani.map(p => [p.id, p.locali.map(l => l.id)])).toEqual([["pt", ["soggiorno"]], ["p1", ["studio"]]]);
    expect(validaPlanimetria(dopo.documento).ok).toBe(true);
    expect(prima).toEqual(originale);
    expect(dopo.documento.livelli.map(l => l.fatto)).toEqual(prima.livelli.map(l => l.fatto));
    expect(dopo.documento.livelli[0].proposte[0].locali.map(l => l.finiture?.pavimento)).toEqual([descrizioneRovere, "Gres avorio", "Gres avorio"]);
    const piani = pianiDaPlanimetria(dopo.documento, "A");
    expect(piani[1].piante.progetto.locali[0].finiture?.pavimento).toBe(descrizioneRovere);
    expect(piani[1].piante.fatto.locali[0].finiture?.pavimento).toBe("Gres avorio");
    expect(anteprimaModificheCasa3D(dopo.documento, "progetto:A", rovere).documento).toBe(dopo.documento);
  });

  it("può cambiare un solo piano e includere il bagno su richiesta", () => {
    const prima = casa();
    const dopo = anteprimaModificheCasa3D(prima, "fatto", { ...rovere, mantieniBagni: false }, "pt");
    expect(dopo.piani.map(p => p.locali.map(l => l.id))).toEqual([["soggiorno", "bagno"]]);
    expect(dopo.documento.livelli[1]).toBe(prima.livelli[1]);
    expect(dopo.documento.livelli[0].proposte).toBe(prima.livelli[0].proposte);
  });

  it("sostituisce lo stesso modello tra piani senza cambiare quote, posizione e rotazione", () => {
    const prima = casa();
    const dopo = anteprimaModificheCasa3D(prima, "progetto:A", { tipo: "arredo", arredo: "divano", modello: "modulare", colore: "#829180" });
    expect(dopo.piani.map(p => p.arredi)).toEqual([1, 1]);
    for (const i of [0, 1]) {
      const stato = prima.livelli[i].proposte[0] ?? prima.livelli[i].fatto;
      const elementi = dopo.documento.livelli[i].proposte[0].elementi;
      expect(elementi[0]).toEqual({ ...stato.elementi[0], modello: "modulare", colore: "#829180" });
      expect(elementi.slice(1)).toEqual(stato.elementi.slice(1));
    }
  });

  it("coordina tessili e mobili senza applicare la palette ai sanitari", () => {
    const prima = casa();
    const dopo = anteprimaModificheCasa3D(prima, "fatto", { tipo: "stile", stile: "salvia" });
    expect(dopo.piani.map(p => p.arredi)).toEqual([1, 2]);
    expect(dopo.documento.livelli[0].fatto.elementi[2]).toBe(prima.livelli[0].fatto.elementi[2]);
    expect(dopo.documento.livelli[1].fatto.elementi.map(e => e.colore)).toEqual([STILI_ARREDI.salvia.tessile, STILI_ARREDI.salvia.mobile]);
  });
});

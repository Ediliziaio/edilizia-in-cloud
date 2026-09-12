import { describe, expect, it } from "vitest";
import {
  descrizionePosizione,
  mqPosizione,
  posizioneCompleta,
  riferimentoSuccessivo,
  selezioniEffettive,
  totaliRilievo,
  type PosizioneRilievo,
} from "@/lib/preventivo/posizioni";

const posizione = (p: Partial<PosizioneRilievo> = {}): PosizioneRilievo => ({
  id: "1",
  riferimento: "P1",
  familyId: "f1",
  larghezza_mm: 1200,
  altezza_mm: 1400,
  quantita: 1,
  selezioni: {},
  ...p,
});

describe("riferimentoSuccessivo", () => {
  it("parte da P1 su un rilievo vuoto", () => {
    expect(riferimentoSuccessivo([])).toBe("P1");
  });

  it("continua dal numero più alto, non dal conteggio", () => {
    // Cancellata P2, la prossima è P4: due posizioni non possono chiamarsi uguale.
    expect(riferimentoSuccessivo(["P1", "P3"])).toBe("P4");
  });

  it("ignora i riferimenti scritti a mano", () => {
    expect(riferimentoSuccessivo(["Cucina", "Bagno"])).toBe("P1");
    expect(riferimentoSuccessivo(["Cucina", "P7"])).toBe("P8");
  });
});

describe("mqPosizione", () => {
  it("converte i millimetri in metri quadri", () => {
    expect(mqPosizione(1200, 1400)).toBeCloseTo(1.68, 6);
  });

  it("non inventa una superficie senza misure", () => {
    expect(mqPosizione(null, 1400)).toBeNull();
    expect(mqPosizione(0, 1400)).toBeNull();
    expect(mqPosizione(-100, 1400)).toBeNull();
  });
});

describe("posizioneCompleta", () => {
  it("una riga appena aggiunta non entra nel totale", () => {
    expect(posizioneCompleta(posizione({ familyId: null }))).toBe(false);
    expect(posizioneCompleta(posizione({ larghezza_mm: null }))).toBe(false);
    expect(posizioneCompleta(posizione({ quantita: 0 }))).toBe(false);
  });

  it("con tipologia, misure e quantità sì", () => {
    expect(posizioneCompleta(posizione())).toBe(true);
  });
});

describe("totaliRilievo", () => {
  it("somma pezzi, metri quadri e importi moltiplicando per la quantità", () => {
    const t = totaliRilievo([
      { posizione: posizione({ quantita: 3 }), prezzo: { unitario_vendita: 1008, unitario_acquisto: 302.4, mq: 1.68 } },
      { posizione: posizione({ id: "2", riferimento: "P2", larghezza_mm: 600, altezza_mm: 800, quantita: 1 }),
        prezzo: { unitario_vendita: 288, unitario_acquisto: 86.4, mq: 0.48 } },
    ]);
    expect(t.posizioni).toBe(2);
    expect(t.pezzi).toBe(4);
    expect(t.mq).toBeCloseTo(3 * 1.68 + 0.48, 4);
    expect(t.vendita).toBeCloseTo(3 * 1008 + 288, 2);
    expect(t.acquisto).toBeCloseTo(3 * 302.4 + 86.4, 2);
    expect(t.marginePct).toBeCloseTo(70, 1);
  });

  it("le righe incomplete non sporcano il totale", () => {
    const t = totaliRilievo([
      { posizione: posizione(), prezzo: { unitario_vendita: 1008, unitario_acquisto: 302.4, mq: 1.68 } },
      { posizione: posizione({ id: "2", familyId: null }), prezzo: { unitario_vendita: 999, unitario_acquisto: 1, mq: 1 } },
    ]);
    expect(t.posizioni).toBe(1);
    expect(t.vendita).toBe(1008);
  });

  it("senza righe valide non dichiara un margine", () => {
    expect(totaliRilievo([]).marginePct).toBeNull();
  });
});

describe("selezioniEffettive", () => {
  it("le scelte comuni valgono per tutti, l'eccezione vince sulla riga", () => {
    const comuni = { linea: "salamander", colore: "bianco", vetro: "standard" };
    const p = posizione({ selezioni: { vetro: "satinato" } });
    expect(selezioniEffettive(comuni, p)).toEqual({
      linea: "salamander",
      colore: "bianco",
      vetro: "satinato",
    });
  });

  it("non modifica le scelte comuni degli altri", () => {
    const comuni = { colore: "bianco" };
    selezioniEffettive(comuni, posizione({ selezioni: { colore: "antracite" } }));
    expect(comuni).toEqual({ colore: "bianco" });
  });
});

describe("descrizionePosizione", () => {
  it("mette il riferimento davanti: è quello che cerca il posatore", () => {
    const testo = descrizionePosizione(posizione({ riferimento: "P2" }), "Finestra 2 Ante", [
      "PVC Salamander 76",
      "Bianco",
    ]);
    expect(testo).toBe("P2 — Finestra 2 Ante · 1200 × 1400 mm · PVC Salamander 76 · Bianco");
  });

  it("senza riferimento resta la descrizione, senza trattini a vuoto", () => {
    expect(descrizionePosizione(posizione({ riferimento: "  " }), "Finestra 1 Anta", [])).toBe(
      "Finestra 1 Anta · 1200 × 1400 mm",
    );
  });
});

import { describe, it, expect } from "vitest";
import {
  costruisciFasi, faseIniziale, percentuale, oggettoLeggibile, inRitardo, passoMigliore, numeroPasso,
  type FaseRiga, type PassoDef,
} from "@/components/admin/outreach/campagne/campagneFasi";

const passi: PassoDef[] = [
  { passo: 1, canale: "email", giorno: 0, oggetto: "Serramenti PVC===Seconda variante" },
  { passo: 2, canale: "email", giorno: 4, oggetto: "" },
  { passo: 3, canale: "email", giorno: 9, oggetto: "" },
];

const riga = (fase: string, contatti: number): FaseRiga => ({ fase, contatti, in_pausa: 0, prossimo_invio: null, ultimo_programmato: null });

describe("costruisciFasi", () => {
  it("disegna tutte le colonne del flusso, anche vuote, nell'ordine del contatto", () => {
    const f = costruisciFasi([riga("da_contattare", 1660), riga("passo_1", 16)], passi);
    expect(f.filter((x) => x.gruppo === "flusso").map((x) => x.chiave))
      .toEqual(["da_contattare", "passo_1", "passo_2", "passo_3", "completato"]);
    expect(f.find((x) => x.chiave === "passo_2")?.contatti).toBe(0);
    expect(f.find((x) => x.chiave === "da_contattare")?.contatti).toBe(1660);
  });

  it("il sottotitolo dice quando parte il passo successivo", () => {
    const f = costruisciFasi([], passi);
    expect(f.find((x) => x.chiave === "passo_1")?.sottotitolo).toContain("giorno 4");
    expect(f.find((x) => x.chiave === "passo_3")?.sottotitolo).toContain("ultima");
  });

  it("contatti oltre l'ultimo passo definito: la colonna compare lo stesso", () => {
    const f = costruisciFasi([riga("passo_5", 2)], passi);
    expect(f.some((x) => x.chiave === "passo_5" && x.contatti === 2)).toBe(true);
  });

  it("risposte e uscite hanno sempre le loro colonne", () => {
    const f = costruisciFasi([], passi);
    expect(f.filter((x) => x.gruppo === "risposta")).toHaveLength(4);
    expect(f.filter((x) => x.gruppo === "uscita").map((x) => x.chiave)).toEqual(["rimbalzato", "disiscritto", "fermato"]);
  });
});

describe("faseIniziale", () => {
  it("prima le risposte", () => {
    const f = costruisciFasi([riga("passo_1", 16), riga("risposta_domanda", 1)], passi);
    expect(faseIniziale(f)).toBe("risposta_domanda");
  });
  it("poi il primo passo con qualcuno dentro", () => {
    const f = costruisciFasi([riga("da_contattare", 1660), riga("passo_2", 4), riga("passo_1", 16)], passi);
    expect(faseIniziale(f)).toBe("passo_1");
  });
  it("campagna appena partita: chi deve ancora ricevere", () => {
    expect(faseIniziale(costruisciFasi([riga("da_contattare", 10)], passi))).toBe("da_contattare");
  });
});

describe("percentuale", () => {
  it("0 su 0 non è 0%", () => expect(percentuale(0, 0)).toBe("—"));
  it("meno dell'1% ma qualcuno c'è", () => expect(percentuale(16, 1676)).toBe("<1%"));
  it("un decimale sotto il 10%", () => expect(percentuale(3, 40)).toBe("7,5%"));
  it("intero sopra il 10%", () => expect(percentuale(1, 3)).toBe("33%"));
  it("zero vero", () => expect(percentuale(0, 50)).toBe("0%"));
});

describe("oggettoLeggibile", () => {
  it("la prima variante e quante altre", () => {
    expect(oggettoLeggibile("Serramenti PVC===Seconda variante")).toEqual({ testo: "Serramenti PVC", varianti: 1, risposta: false });
  });
  it("oggetto vuoto = risposta nel thread", () => {
    expect(oggettoLeggibile("").risposta).toBe(true);
  });
});

describe("inRitardo e passoMigliore", () => {
  it("somma solo i programmati dei giorni passati", () => {
    expect(inRitardo([
      { giorno: "2026-09-10", programmati: 5 },
      { giorno: "2026-09-11", programmati: 190 },
      { giorno: "2026-09-14", programmati: 328 },
    ], "2026-09-11")).toBe(5);
  });
  it("il passo migliore serve un numero minimo di invii", () => {
    expect(passoMigliore([{ passo: 1, inviati: 10, risposte: 3 }, { passo: 2, inviati: 200, risposte: 4 }])).toBe(2);
    expect(passoMigliore([{ passo: 1, inviati: 10, risposte: 3 }])).toBeNull();
  });
  it("numeroPasso", () => {
    expect(numeroPasso("passo_12")).toBe(12);
    expect(numeroPasso("completato")).toBeNull();
  });
});

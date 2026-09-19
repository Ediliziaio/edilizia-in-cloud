/**
 * Lo split delle automazioni con più di due rami.
 *
 * Il caso vero è BeMade: i lead del Nuovo si dividono tra call center, oggi
 * Antonella 60% e Venusia 40%, domani magari tre persone. Il motore sceglieva
 * solo tra "a" e "b": con tre rami il terzo non riceveva mai nessuno.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  arcoDelRamo,
  inizioGiornoRoma,
  leggiPercentuali,
  letteraRamo,
  modalitaSplit,
  ramoEquilibrato,
  ramoPerNumero,
} from "../../../supabase/functions/_shared/splitRami";

const ROOT = join(__dirname, "../../..");

describe("leggiPercentuali", () => {
  it("legge la stringa dell'editor con due rami", () => {
    expect(leggiPercentuali({ percentuali: "60,40" })).toEqual([60, 40]);
  });

  it("legge tre, quattro e cinque rami", () => {
    expect(leggiPercentuali({ percentuali: "40,30,30" })).toEqual([40, 30, 30]);
    expect(leggiPercentuali({ percentuali: "25,25,25,25" })).toEqual([25, 25, 25, 25]);
    expect(leggiPercentuali({ percentuali: "20,20,20,20,20" })).toHaveLength(5);
  });

  it("tollera spazi, simbolo % e separatori diversi", () => {
    expect(leggiPercentuali({ percentuali: " 50% ; 30 | 20 " })).toEqual([50, 30, 20]);
  });

  it("se la somma non fa 100 ripartisce in proporzione", () => {
    const [a, b] = leggiPercentuali({ percentuali: "2,1" });
    expect(a).toBeCloseTo(66.667, 2);
    expect(b).toBeCloseTo(33.333, 2);
  });

  it("uno 0 mette in pausa quel ramo senza toccare gli altri", () => {
    expect(leggiPercentuali({ percentuali: "60,0,40" })).toEqual([60, 0, 40]);
  });

  it("lo schema vecchio con split_a vale ancora", () => {
    expect(leggiPercentuali({ split_a: 70 })).toEqual([70, 30]);
    expect(leggiPercentuali({ split_a: "25", percentuali: "90,10" })).toEqual([25, 75]);
  });

  it("senza due rami validi torna a 50/50, come prima", () => {
    expect(leggiPercentuali({})).toEqual([50, 50]);
    expect(leggiPercentuali({ percentuali: "100" })).toEqual([50, 50]);
    expect(leggiPercentuali({ percentuali: "abc,40" })).toEqual([50, 50]);
    expect(leggiPercentuali({ percentuali: "0,0" })).toEqual([50, 50]);
    expect(leggiPercentuali({ percentuali: "-10,110" })).toEqual([50, 50]);
  });

  it("oltre cinque rami tiene i primi cinque", () => {
    expect(leggiPercentuali({ percentuali: "10,10,10,10,10,50" })).toEqual([20, 20, 20, 20, 20]);
  });
});

describe("ramoPerNumero", () => {
  it("60/40: sotto 60 ramo a, da 60 in su ramo b", () => {
    const p = [60, 40];
    expect(ramoPerNumero(p, 0)).toBe("a");
    expect(ramoPerNumero(p, 59.99)).toBe("a");
    expect(ramoPerNumero(p, 60)).toBe("b");
    expect(ramoPerNumero(p, 99.99)).toBe("b");
  });

  it("con tre rami il terzo riceve davvero", () => {
    const p = [40, 30, 30];
    expect(ramoPerNumero(p, 10)).toBe("a");
    expect(ramoPerNumero(p, 45)).toBe("b");
    expect(ramoPerNumero(p, 85)).toBe("c");
  });

  it("un ramo a 0 non riceve mai, nemmeno sul confine", () => {
    const p = [60, 0, 40];
    expect(ramoPerNumero(p, 60)).toBe("c");
    for (let n = 0; n < 100; n += 0.5) expect(ramoPerNumero(p, n)).not.toBe("b");
  });

  it("un numero a ridosso di 100 va all'ultimo ramo che riceve", () => {
    expect(ramoPerNumero([50, 50, 0], 100)).toBe("b");
  });

  it("su tanti lead le quote rispettano le percentuali", () => {
    const p = leggiPercentuali({ percentuali: "50,30,20" });
    const conta: Record<string, number> = {};
    const N = 10000;
    // Numeri equidistanti invece che casuali: il test non deve mai fallire per sfortuna.
    for (let i = 0; i < N; i++) {
      const r = ramoPerNumero(p, (i / N) * 100);
      conta[r] = (conta[r] ?? 0) + 1;
    }
    expect(conta.a / N).toBeCloseTo(0.5, 2);
    expect(conta.b / N).toBeCloseTo(0.3, 2);
    expect(conta.c / N).toBeCloseTo(0.2, 2);
  });
});

describe("arcoDelRamo e letteraRamo", () => {
  it("riconosce le etichette dell'editor, vecchie e nuove", () => {
    expect(arcoDelRamo("A", "a")).toBe(true);
    expect(arcoDelRamo("B: 40%", "b")).toBe(true);
    expect(arcoDelRamo("C", "c")).toBe(true);
    expect(arcoDelRamo("A: 60%", "b")).toBe(false);
    expect(arcoDelRamo(null, "a")).toBe(false);
  });

  it("lettere in ordine", () => {
    expect([0, 1, 2, 3, 4].map(letteraRamo)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("il motore usa questa regola", () => {
  const motore = readFileSync(join(ROOT, "supabase/functions/process-automation/index.ts"), "utf8");

  it("importa il modulo condiviso", () => {
    expect(motore).toMatch(/from "\.\.\/_shared\/splitRami\.ts"/);
  });

  it("non sceglie più tra due soli rami", () => {
    expect(motore).not.toMatch(/rand < splitA \? "a" : "b"/);
    expect(motore).toMatch(/ramoPerNumero\(/);
  });
});

describe("ramoEquilibrato", () => {
  it("dà il contatto a chi è più indietro sulla sua quota", () => {
    // Il 16/09 di BeMade: Venusia 29 (col Restauro), Antonella 15.
    expect(ramoEquilibrato([50, 50], [15, 29])).toBe("a");
    expect(ramoEquilibrato([50, 50], [30, 29])).toBe("b");
  });

  it("a parità sceglie il primo ramo, poi alterna", () => {
    expect(ramoEquilibrato([50, 50], [0, 0])).toBe("a");
    expect(ramoEquilibrato([50, 50], [1, 0])).toBe("b");
  });

  it("rispetta le percentuali sul lungo periodo, senza sbandare", () => {
    const conteggi = [0, 0, 0];
    for (let n = 0; n < 100; n++) {
      const ramo = ramoEquilibrato([50, 30, 20], conteggi);
      conteggi[ramo.charCodeAt(0) - 97]++;
    }
    expect(conteggi).toEqual([50, 30, 20]);
  });

  it("un ramo allo 0% non riceve mai, anche se è a zero", () => {
    expect(ramoEquilibrato([0, 100], [0, 40])).toBe("b");
  });

  it("recupera chi ha ricevuto lead da un altro flusso", () => {
    // Venusia ha già 12 Restauro: i prossimi Nuovo vanno ad Antonella finché non la raggiunge.
    const conteggi = [0, 12];
    const scelte: string[] = [];
    for (let n = 0; n < 14; n++) {
      const ramo = ramoEquilibrato([50, 50], conteggi);
      scelte.push(ramo);
      conteggi[ramo === "a" ? 0 : 1]++;
    }
    expect(scelte.slice(0, 12).every((r) => r === "a")).toBe(true);
    expect(conteggi).toEqual([13, 13]);
  });
});

describe("modalitaSplit", () => {
  it("senza scelta resta casuale, come i nodi di prima", () => {
    expect(modalitaSplit({ percentuali: "60,40" })).toBe("casuale");
    expect(modalitaSplit({ modalita: "equilibrato" })).toBe("equilibrato");
  });
});

describe("inizioGiornoRoma", () => {
  it("in estate la giornata italiana parte alle 22:00 UTC del giorno prima", () => {
    expect(inizioGiornoRoma(new Date("2026-09-16T21:30:00Z")).toISOString()).toBe("2026-09-15T22:00:00.000Z");
    expect(inizioGiornoRoma(new Date("2026-09-16T22:30:00Z")).toISOString()).toBe("2026-09-16T22:00:00.000Z");
  });

  it("in inverno alle 23:00 UTC", () => {
    expect(inizioGiornoRoma(new Date("2026-01-10T12:00:00Z")).toISOString()).toBe("2026-01-09T23:00:00.000Z");
  });
});

describe("split «in modo equo»: si conta la pipeline che lo split divide", () => {
  const motore = readFileSync(join(process.cwd(), "supabase/functions/process-automation/index.ts"), "utf8");

  it("se tutti i rami creano nella stessa pipeline, contano solo le opportunità di quella", () => {
    // BeMade 19/09: il Restauro di Venusia faceva pendere il Nuovo verso
    // Antonella (12 a 5) perché il conteggio guardava tutta l'azienda.
    expect(motore).toContain("pipelineDeiRami.every((p) => p && p === pipelineDeiRami[0])");
    expect(motore).toContain('if (pipelineComune) query = query.eq("pipeline_id", pipelineComune);');
  });

  it("con pipeline diverse fra i rami si conta ancora tutta l'azienda", () => {
    expect(motore).toContain('base: pipelineComune ? "persone_pipeline" : "persone"');
  });
});

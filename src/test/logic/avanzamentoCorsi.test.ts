import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  avanzamentoCorso,
  chiaveModuliSpuntati,
  leggiModuliSpuntati,
  moduliDaAvanzamento,
  moduliDaMostrare,
  salvaModuliSpuntati,
} from "@/lib/formazione/avanzamentoCorsi";

const leggi = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");

// I due corsi del caso del 25/09/2026 su «Demo Azienda 2»: moduli con i loro
// `completedRate` (dati del corso) e nessun avanzamento della persona.
const sicurezza = {
  id: "sicurezza-base-d2",
  moduli: [
    { id: "m1-d2", completedRate: 82 },
    { id: "m2-d2", completedRate: 71 },
    { id: "m3-d2", completedRate: 64 },
  ],
};
const procedure = {
  id: "procedure-oda-ddt-d2",
  moduli: [
    { id: "m1-d2", completedRate: 74 },
    { id: "m2-d2", completedRate: 48 },
  ],
};

function avanzamentoDaMostrare(corso: typeof sicurezza, spuntatiQui: string[], salvato: number) {
  const idModuli = corso.moduli.map((m) => m.id);
  const mostrati = moduliDaMostrare(spuntatiQui, salvato, idModuli);
  return { mostrati, avanzamento: avanzamentoCorso(idModuli.length, mostrati.length, salvato) };
}

afterEach(() => window.localStorage.clear());

describe("avanzamento di una persona in un corso", () => {
  it("il caso segnalato: senza moduli fatti è 0%, non la media dei completedRate (72% e 61%)", () => {
    expect(avanzamentoDaMostrare(sicurezza, [], 0).avanzamento).toBe(0);
    expect(avanzamentoDaMostrare(procedure, [], 0).avanzamento).toBe(0);
  });

  it("un modulo su tre è 33%, non 78% come salvava il Portale", () => {
    expect(avanzamentoCorso(3, 1)).toBe(33);
    expect(avanzamentoCorso(3, 2)).toBe(67);
    expect(avanzamentoCorso(3, 3)).toBe(100);
  });

  it("non scende sotto l'avanzamento salvato nel database", () => {
    expect(avanzamentoCorso(3, 0, 33)).toBe(33);
    expect(avanzamentoCorso(3, 1, 78)).toBe(78);
    expect(avanzamentoCorso(3, 3, 78)).toBe(100);
  });

  it("un corso senza moduli è fatto o non fatto", () => {
    expect(avanzamentoCorso(0, 0, 0)).toBe(0);
    expect(avanzamentoCorso(0, 1, 0)).toBe(100);
    expect(avanzamentoCorso(0, 0, 100)).toBe(100);
    expect(avanzamentoCorso(0, 0, 40)).toBe(0);
  });

  it("dalla percentuale salvata ai moduli, senza mai superarla", () => {
    expect(moduliDaAvanzamento(0, 3)).toBe(0);
    expect(moduliDaAvanzamento(33, 3)).toBe(1); // con Math.floor era 0 (0,33 × 3 = 0,99)
    expect(moduliDaAvanzamento(67, 3)).toBe(2);
    expect(moduliDaAvanzamento(78, 3)).toBe(2);
    expect(moduliDaAvanzamento(50, 3)).toBe(1); // 2 moduli sarebbero 67%, più di 50
    expect(moduliDaAvanzamento(100, 3)).toBe(3);
    expect(moduliDaAvanzamento(50, 2)).toBe(1);
    expect(moduliDaAvanzamento(61, 2)).toBe(1);
    // Per ogni corso fino a 12 moduli: k moduli → percentuale → di nuovo k.
    for (let n = 1; n <= 12; n++) {
      for (let k = 0; k <= n; k++) {
        expect(moduliDaAvanzamento(avanzamentoCorso(n, k), n)).toBe(k);
      }
    }
  });

  it("i moduli mostrati: quelli spuntati qui, altrimenti i primi che il database giustifica", () => {
    expect(avanzamentoDaMostrare(sicurezza, ["m3-d2"], 0)).toEqual({ mostrati: ["m3-d2"], avanzamento: 33 });
    expect(avanzamentoDaMostrare(sicurezza, [], 33)).toEqual({ mostrati: ["m1-d2"], avanzamento: 33 });
    // Altro dispositivo, database a 67%: due moduli e 67%, come nell'elenco.
    expect(avanzamentoDaMostrare(sicurezza, [], 67)).toEqual({ mostrati: ["m1-d2", "m2-d2"], avanzamento: 67 });
    // Moduli tolti dal corso nel frattempo: non contano.
    expect(moduliDaMostrare(["vecchio", "m2-d2"], 0, ["m1-d2", "m2-d2"])).toEqual(["m2-d2"]);
  });
});

describe("moduli spuntati nel browser: un archivio per le due pagine", () => {
  it("la chiave è quella che «La mia formazione» usa da sempre", () => {
    expect(chiaveModuliSpuntati("az", "ut", "corso")).toBe("portale-formazione:az:ut:corso");
    window.localStorage.setItem("portale-formazione:az:ut:corso", JSON.stringify(["m1", "m2"]));
    expect(leggiModuliSpuntati("az", "ut", "corso")).toEqual(["m1", "m2"]);
  });

  it("salva senza doppioni e senza azienda o persona non salva", () => {
    salvaModuliSpuntati("az", "ut", "corso", ["m1", "m1", "m3"]);
    expect(leggiModuliSpuntati("az", "ut", "corso")).toEqual(["m1", "m3"]);
    salvaModuliSpuntati(null, "ut", "altro", ["m1"]);
    expect(leggiModuliSpuntati(null, "ut", "altro")).toEqual([]);
    expect(window.localStorage.length).toBe(1);
  });

  it("un contenuto rovinato vale come nessun modulo", () => {
    window.localStorage.setItem("portale-formazione:az:ut:corso", "{non json");
    expect(leggiModuliSpuntati("az", "ut", "corso")).toEqual([]);
  });
});

describe("le due pagine usano la stessa regola", () => {
  const portale = leggi("src/pages/azienda/personale/PortalePage.tsx");
  const formazione = leggi("src/pages/azienda/formazione/FormazioneDipendente.tsx");

  it("il Portale non conta più il completedRate del corso come avanzamento della persona", () => {
    expect(portale).toContain('from "@/lib/formazione/avanzamentoCorsi"');
    expect(portale).toContain("(completedState[`${courseId}:${module.id}`] ? 100 : 0)");
    expect(portale).not.toMatch(/\?\s*100\s*:\s*module\.completedRate/);
    expect(portale).not.toContain(": targetCourse?.completion ?? 0");
  });

  it("entrambe calcolano con avanzamentoCorso e leggono i moduli dallo stesso archivio", () => {
    for (const sorgente of [portale, formazione]) {
      expect(sorgente).toContain("avanzamentoCorso(");
      expect(sorgente).toContain("moduliDaMostrare(");
      expect(sorgente).toContain("leggiModuliSpuntati(");
      expect(sorgente).toContain("salvaModuliSpuntati(");
    }
  });
});

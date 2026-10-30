import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { controllaPlanimetria } from "../../../shared/planimetrie/controllo.ts";
import { areaPoligono, ricostruisciLocali } from "../../../shared/planimetrie/geometria.ts";
import { ambitiDi, statoDelLivello, validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";

// Gli esempi sono il banco di prova comune di editor, AI, 3D ed esportazioni:
// devono restare validi, senza problemi, e con le quantità qui sotto.

const leggi = (nome: string): Planimetria =>
  JSON.parse(readFileSync(join(process.cwd(), "shared/planimetrie/esempi", nome), "utf8"));

describe.each(["bilocale.json", "trilocale.json"])("esempio %s", nome => {
  const p = leggi(nome);

  it("è una pianta valida senza errori né avvisi", () => {
    expect(validaPlanimetria(p).ok).toBe(true);
    expect(controllaPlanimetria(p)).toEqual([]);
  });

  it("i locali salvati coincidono con quelli ricostruiti dalle pareti, in ogni stato", () => {
    for (const ambito of ambitiDi(p)) {
      const stato = statoDelLivello(p.livelli[0], ambito)!;
      const ricostruiti = ricostruisciLocali(stato.muri).map(r => Math.round(areaPoligono(r.contorno))).sort();
      const salvati = stato.locali.map(l => Math.round(areaPoligono(l.contorno))).sort();
      expect(ricostruiti).toEqual(salvati);
    }
  });
});

describe("quantità dell'esempio bilocale", () => {
  const q = calcolaQuantita(leggi("bilocale.json"));

  it("superfici dei locali", () => {
    expect(q["fatto:locale:l1.pavimento_mq"].valore).toBe(29.7); // 4,95 × 6,00
    expect(q["fatto:locale:l2.pavimento_mq"].valore).toBe(10.1775); // 2,95 × 3,45
    expect(q["fatto:locale:l3.pavimento_mq"].valore).toBe(7.2275); // 2,95 × 2,45
    expect(q["fatto:pianta.pavimento_mq"].valore).toBe(47.105);
  });

  it("soggiorno: pareti nette e battiscopa", () => {
    // perimetro 2 × (4,95 + 6,00) = 21,90 ; lorde × 2,70 = 59,13
    // portafinestra 2,40 × 2,40 = 5,76 > 4 → si detrae ; porta d'ingresso 0,90 × 2,20 e porta camera/bagno sotto soglia
    expect(q["fatto:locale:l1.pareti_nette_mq"].valore).toBe(53.37);
    // 21,90 − 2,40 (portafinestra) − 0,90 (ingresso) − 0,80 (camera) − 0,70 (bagno)
    expect(q["fatto:locale:l1.battiscopa_ml"].valore).toBe(17.1);
  });

  it("bagno: rivestimento alto 2,00 m", () => {
    // perimetro 2 × (2,95 + 2,45) = 10,80 → 21,60 mq ; nessun vuoto oltre soglia
    expect(q["fatto:locale:l3.rivestimento_mq"].valore).toBe(21.6);
  });
});

describe("quantità dell'esempio trilocale, fatto e proposta A", () => {
  const q = calcolaQuantita(leggi("trilocale.json"));

  it("la superficie totale non cambia: la striscia del tramezzo tolto compensa quello nuovo", () => {
    // fatto: 23,5025 + 8,7025 + 8,555 + 15,6025 + 5,605 + 5,7525
    expect(q["fatto:pianta.pavimento_mq"].valore).toBe(67.72);
    // proposta: 32,50 + 5,605 + 2,655 + 15,6025 + 5,605 + 5,7525 (+0,295 − 0,295)
    expect(q["progetto:A:pianta.pavimento_mq"].valore).toBe(67.72);
  });

  it("la zona giorno a L della proposta", () => {
    // (15,15)(610,15)(610,410)(310,410)(310,715)(15,715): 5,95 × 7,00 − 3,00 × 3,05
    expect(q["progetto:A:locale:zona_giorno.pavimento_mq"].valore).toBe(32.5);
  });

  it("demolizioni e pareti nuove", () => {
    expect(q["progetto:A:demolizioni.muri_mq"].valore).toBe(8.505); // t2a: 3,15 × 2,70
    expect(q["progetto:A:costruzioni.muri_mq"].valore).toBe(8.505); // t6: 3,15 × 2,70 (porta 1,47 sotto soglia)
    expect(q["progetto:A:aperture:nuovo:porta:70x210.numero"].valore).toBe(1);
  });
});

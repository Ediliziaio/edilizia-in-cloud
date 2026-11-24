import { describe, expect, it } from "vitest";
import { trovaNelleFrasi, trovaNelRacconto } from "@/lib/campo/voceCose";

const fasi = [
  { key: "f1", nome: "Opere provvisionali per la sicurezza" },
  { key: "f2", nome: "Isolamento termico di strutture opache verticali" },
  { key: "f3", nome: "Isolamento termico di strutture opache inclinate" },
  { key: "f4", nome: "Sostituzione infissi" },
  { key: "f5", nome: "Impianto fotovoltaico" },
];
const voci = [
  { key: "v1", nome: "Ponteggio metallico fisso a telai prefabbricati, montaggio e smontaggio" },
  { key: "v2", nome: "Bagno chimico realizzato in polietilene" },
];
const mezzi = [
  { key: "m1", nome: "Miscelatore e aspiratore 1" },
  { key: "m2", nome: "Miscelatore e aspiratore 2" },
  { key: "m3", nome: "Laser e strumenti di rilievo" },
];

describe("Racconto a voce → fasi, voci e mezzi", () => {
  it("trova la fase detta, anche con un'altra forma della parola", () => {
    expect(trovaNelRacconto("Oggi abbiamo sostituito gli infissi al primo piano", fasi)).toEqual(["f4"]);
    expect(trovaNelRacconto("montato il fotovoltaico sul tetto", fasi)).toEqual(["f5"]);
  });

  it("trova la voce del computo: «montato i ponteggi» → il ponteggio a telai", () => {
    expect(trovaNelRacconto("abbiamo finito di montare i ponteggi", voci)).toEqual(["v1"]);
  });

  it("a pari merito con una parola sola non sceglie: «il cappotto isolamento» resta da toccare", () => {
    expect(trovaNelRacconto("fatto isolamento termico", fasi)).toEqual([]);
    expect(trovaNelRacconto("isolamento termico parete verticale", fasi)).toEqual(["f2"]);
  });

  it("due mezzi uguali non si indovinano; uno chiaro sì", () => {
    expect(trovaNelRacconto("usato il miscelatore", mezzi)).toEqual([]);
    expect(trovaNelRacconto("abbiamo preso il laser per le misure", mezzi)).toEqual(["m3"]);
  });

  it("frase per frase trova cose diverse dette nello stesso racconto", () => {
    expect(trovaNelleFrasi("Abbiamo sostituito gli infissi. Poi montato il fotovoltaico", fasi).sort()).toEqual(["f4", "f5"]);
  });

  it("niente di sensato, niente scelta", () => {
    expect(trovaNelRacconto("", fasi)).toEqual([]);
    expect(trovaNelRacconto("oggi tutto bene", fasi)).toEqual([]);
  });
});

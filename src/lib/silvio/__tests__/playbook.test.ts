import { describe, it, expect } from "vitest";
import { validaPlaybook, passiAzione, ramiSicurezza, type PlaybookPasso } from "../playbook";

const REGISTRO = ["crea_bozza_fattura_passiva", "aggiungi_scadenza_previsionale", "collega_email_entita", "notifica_digest"];

const fatturaPassiva: PlaybookPasso[] = [
  { ordine: 1, azione_chiave: "crea_bozza_fattura_passiva" },
  { ordine: 2, condizione: "iban_diverso_dal_solito", ramo: "ferma_e_allerta" },
  { ordine: 3, azione_chiave: "aggiungi_scadenza_previsionale" },
  { ordine: 4, azione_chiave: "collega_email_entita", condizione: "cantiere_citato" },
  { ordine: 5, azione_chiave: "notifica_digest" },
];

describe("validaPlaybook — ogni passo-azione è nel registro", () => {
  it("playbook valido (le condizioni non si validano)", () => {
    const r = validaPlaybook(fatturaPassiva, REGISTRO);
    expect(r.valido).toBe(true);
    expect(r.azioniIgnote).toEqual([]);
    expect(r.numAzioni).toBe(4);
    expect(r.numRamiSicurezza).toBe(1);
  });
  it("azione fuori registro → non valido", () => {
    const r = validaPlaybook([{ ordine: 1, azione_chiave: "cancella_db" }], REGISTRO);
    expect(r.valido).toBe(false);
    expect(r.azioniIgnote).toEqual(["cancella_db"]);
  });
  it("solo condizioni, nessuna azione → non valido (non fa nulla)", () => {
    expect(validaPlaybook([{ ordine: 1, condizione: "x" }], REGISTRO).valido).toBe(false);
  });
});

describe("separazione azioni / rami", () => {
  it("passiAzione prende solo gli step con azione_chiave", () => {
    expect(passiAzione(fatturaPassiva).map((p) => p.ordine)).toEqual([1, 3, 4, 5]);
  });
  it("ramiSicurezza prende i nodi-condizione", () => {
    expect(ramiSicurezza(fatturaPassiva).map((p) => p.ordine)).toEqual([2]);
  });
});

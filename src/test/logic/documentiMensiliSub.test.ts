import { describe, expect, it } from "vitest";
import {
  meseValido,
  meseFuoriContratto,
  riepilogoMensili,
  type DocumentoMensile,
} from "@/lib/sicurezza/documentiMensili";
describe("Controlli mensili documentali", () => {
  it.each(["2026-00", "2026-13", "2026-1", "2026-10-01", ""])(
    "rifiuta competenze non mensili: %s",
    (m) => expect(meseValido(m)).toBe(false),
  );
  it("accetta un mese senza assumere un giorno o una scadenza legale", () =>
    expect(meseValido("2026-10")).toBe(true));
  it("un file ricevuto è ancora da verificare e lo storico non chiude la checklist corrente", () => {
    const dati = [
      "ricevuto",
      "verificato",
      "non_applicabile",
      "superato",
      "richiesto",
    ].map((stato, index) => ({
      id: String(index),
      stato,
    })) as DocumentoMensile[];
    expect(riepilogoMensili(dati)).toEqual({
      configurati: 4,
      verificati: 1,
      nonApplicabili: 1,
      aperti: 2,
    });
  });
});

describe("Competenza e periodo contrattuale", () => {
  it("non scambia un vecchio contratto con una richiesta del mese corrente", () => {
    expect(
      meseFuoriContratto("2026-10", {
        data_inizio: "2023-03-01",
        data_fine_effettiva: "2023-04-30",
      }),
    ).toBe(true);
    expect(
      meseFuoriContratto("2023-04", {
        data_inizio: "2023-03-01",
        data_fine_effettiva: "2023-04-30",
      }),
    ).toBe(false);
    expect(meseFuoriContratto("2023-02", { data_inizio: "2023-03-01" })).toBe(
      true,
    );
    expect(meseFuoriContratto("2026-10", {})).toBe(false);
  });
});

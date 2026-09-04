import { describe, it, expect } from "vitest";
import {
  esitoUpdateConGuardia,
  isConflittoModifica,
  ConflittoModifica,
} from "@/lib/concorrenza";

/**
 * La guardia sulla modifica concorrente vive tutta qui: se sbaglia a leggere
 * l'esito della UPDATE, o si blocca un salvataggio legittimo, o si torna a
 * sovrascrivere il lavoro di un collega senza dirlo.
 */

describe("esitoUpdateConGuardia", () => {
  it("una riga toccata: salvataggio riuscito, e restituisce la nuova versione", () => {
    const nuova = esitoUpdateConGuardia([{ updated_at: "2026-09-03T10:00:00Z" }], "ordine");
    expect(nuova).toBe("2026-09-03T10:00:00Z");
  });

  it("zero righe toccate: qualcun altro ha salvato prima", () => {
    expect(() => esitoUpdateConGuardia([], "ordine")).toThrow(ConflittoModifica);
  });

  it("risposta nulla: si tratta come conflitto, non come successo", () => {
    // Meglio un falso allarme che sovrascrivere senza saperlo.
    expect(() => esitoUpdateConGuardia(null, "ordine")).toThrow(ConflittoModifica);
  });

  it("il messaggio dice cosa è successo e cosa fare, col nome dell'entità", () => {
    try {
      esitoUpdateConGuardia([], "cliente");
      expect.unreachable();
    } catch (e) {
      expect(isConflittoModifica(e)).toBe(true);
      const msg = (e as Error).message;
      expect(msg).toContain("cliente");
      expect(msg).toContain("Non ho salvato");
      expect(msg).toContain("ricarica");
    }
  });

  it("una riga senza updated_at non è un conflitto: la UPDATE è passata", () => {
    expect(esitoUpdateConGuardia([{}], "ordine")).toBeNull();
  });

  it("isConflittoModifica non scambia per conflitto un errore qualunque", () => {
    expect(isConflittoModifica(new Error("network down"))).toBe(false);
    expect(isConflittoModifica(null)).toBe(false);
    expect(isConflittoModifica("boom")).toBe(false);
  });
});

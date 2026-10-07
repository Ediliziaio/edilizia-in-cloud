import { describe, expect, it } from "vitest";
import { messaggioGbpPerCliente } from "@/lib/gbpErrori";

describe("messaggioGbpPerCliente", () => {
  it("niente errore, niente messaggio", () => {
    expect(messaggioGbpPerCliente(null)).toBeNull();
    expect(messaggioGbpPerCliente("  ")).toBeNull();
  });

  it("la quota di Google si spiega senza termini tecnici e senza chiedere nulla al cliente", () => {
    const m = messaggioGbpPerCliente(
      "Quota API Google Business Profile esaurita o non assegnata. Per nuovi progetti Google Cloud la quota di 'mybusinessaccountmanagement.googleapis.com' parte da 0",
    )!;
    expect(m.inAttivazione).toBe(true);
    expect(m.testo).not.toMatch(/quota|api|cloud|console|googleapis/i);
  });

  it("l'API 429 grezza vale come quota", () => {
    expect(messaggioGbpPerCliente('API accounts errore 429: {"error":{"code":429}}')?.inAttivazione).toBe(true);
  });

  it("un token scaduto chiede di ricollegare", () => {
    const m = messaggioGbpPerCliente("Token OAuth non valido o scope insufficienti. Riconnetti l'account.")!;
    expect(m.inAttivazione).toBe(false);
    expect(m.titolo).toMatch(/ricollegare/i);
  });

  it("nessuna scheda: dice quale account usare", () => {
    expect(messaggioGbpPerCliente("L'account Google collegato non ha nessuna scheda Google Business.")?.titolo).toMatch(/nessuna scheda/i);
  });

  it("un errore sconosciuto non mostra il testo grezzo", () => {
    const m = messaggioGbpPerCliente("boom {\"internal\": 1}")!;
    expect(m.testo).not.toContain("boom");
  });
});

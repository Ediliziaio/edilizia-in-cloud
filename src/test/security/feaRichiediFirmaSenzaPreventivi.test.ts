/**
 * fea-richiedi-firma non manda preventivi (26/09/2026).
 *
 * Dal 26/09 un preventivo va al cliente solo se chi lo manda può modificarlo:
 * lo controlla send-quote-signature (preventivo_modificabile, col token di chi
 * chiama), insieme allo sconto approvato e al PDF congelato. fea-richiedi-firma
 * accettava anche tipo_documento "quote" e controllava soltanto che chi chiama
 * facesse parte dell'azienda del preventivo: riscriveva stato, link ed email del
 * cliente col service role e mandava il link di firma a qualunque indirizzo.
 * L'app non la chiama mai con "quote": la porta si chiude, prima di ogni
 * scrittura e di ogni email.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const funzione = readFileSync(join(process.cwd(), "supabase/functions/fea-richiedi-firma/index.ts"), "utf8");

describe("fea-richiedi-firma: i preventivi passano solo da send-quote-signature", () => {
  const RIFIUTO = 'JSON.stringify({ error: "Per mandare un preventivo usa l\'invio del preventivo (send-quote-signature)." })';

  it("rifiuta tipo_documento quote con un 400 che dice dove andare", () => {
    const i = funzione.indexOf(RIFIUTO);
    expect(i, "rifiuto dei preventivi").toBeGreaterThan(-1);
    const prima = funzione.slice(Math.max(0, i - 120), i);
    expect(prima).toContain('if (tipo_documento === "quote") {');
    expect(funzione.slice(i, i + 200)).toContain("status: 400");
  });

  it("prima di leggere il documento, di scrivere e di mandare email", () => {
    const rifiuto = funzione.indexOf(RIFIUTO);
    expect(rifiuto, "rifiuto dei preventivi").toBeGreaterThan(-1);
    for (const dopo of [
      ".from(tabella)",
      '.from("signature_requests")',
      '.from("quotes")',
      "/functions/v1/fea-genera-otp",
      '.from("fea_audit_log")',
    ]) {
      const i = funzione.indexOf(dopo);
      expect(i, dopo).toBeGreaterThan(-1);
      expect(rifiuto, dopo).toBeLessThan(i);
    }
  });
});

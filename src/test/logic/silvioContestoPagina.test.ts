import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Il contesto della pagina aperta che silvio-chat dà al modello (31/10/2026).
 * Leggeva colonne inesistenti (profiles.profile_data e role, quotes.total_amount e
 * customer_id): la lettura falliva in silenzio e Silvio non sapeva mai su quale
 * commessa, cliente o preventivo fosse l'utente. Qui si tiene fermo che non tornino.
 */
const codice = readFileSync(resolve(process.cwd(), "supabase/functions/silvio-chat/index.ts"), "utf8");
const contesto = codice.slice(codice.indexOf("async function buildPageContextSummary"), codice.indexOf("async function buildPageContextSummary") + 9000);

describe("contesto della pagina per Silvio", () => {
  it("non legge colonne che non esistono", () => {
    expect(contesto).not.toContain("profile_data");
    expect(contesto).not.toMatch(/from\("quotes"\)[\s\S]{0,80}total_amount/);
    expect(contesto).not.toContain("customer_id(");
  });
  it("sulla commessa dice il codice e manda a quadro_commessa", () => {
    expect(contesto).toContain('.select("id, order_code, description, total_amount, expected_date, client_name, client_company")');
    expect(contesto).toContain("chiama PRIMA quadro_commessa");
  });
});

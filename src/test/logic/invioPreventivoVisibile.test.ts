/**
 * Il preventivo parte (firma o PDF) solo da chi lo può vedere (26/09/2026).
 *
 * send-quote-signature controllava solo l'azienda. In modalità firma, prima di
 * chiedere il PDF a generate-quote-pdf, annullava le firme in corso e cambiava
 * link e scadenza del preventivo; per i preventivi dei moduli col PDF già
 * pronto il PDF non si chiedeva affatto e l'email partiva a qualunque
 * indirizzo. Ora la RLS di quotes, letta col token di chi chiama, decide prima
 * di ogni scrittura, con la stessa funzione di generate-quote-pdf.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const invio = readFileSync(join(process.cwd(), "supabase/functions/send-quote-signature/index.ts"), "utf8");
const posizione = (testo: string) => {
  const i = invio.indexOf(testo);
  expect(i, testo).toBeGreaterThan(-1);
  return i;
};
const CONTROLLO = "if (!(await preventivoVisibile(comeChiChiama, quote.id))) {";

describe("send-quote-signature controlla il preventivo con le regole di chi chiama", () => {
  it("col token della richiesta e la chiave anon, non col service role", () => {
    expect(invio).toContain('import { preventivoVisibile } from "../_shared/preventivoVisibile.ts";');
    expect(invio).toMatch(
      /const comeChiChiama = createClient\(Deno\.env\.get\("SUPABASE_URL"\)!, Deno\.env\.get\("SUPABASE_ANON_KEY"\)!, \{\s+global: \{ headers: \{ Authorization: req\.headers\.get\("Authorization"\) \?\? "" \} \},/,
    );
    expect(invio).toContain(`${CONTROLLO}\n      return errorResponse("Preventivo non trovato", 404, corsH);`);
  });

  it("subito dopo l'azienda e prima di ogni scrittura, del PDF e dell'email", () => {
    const controllo = posizione(CONTROLLO);
    expect(posizione("await requireCompanyAccess(supabaseAdmin, userId, quote.company_id, corsH);")).toBeLessThan(controllo);
    for (const dopo of [
      'if (mode === "solo_pdf")',
      '.from("signature_requests")',
      ".update(",
      "/functions/v1/generate-quote-pdf",
      "sendEmailUnified(",
    ]) {
      expect(controllo, dopo).toBeLessThan(posizione(dopo));
    }
  });
});

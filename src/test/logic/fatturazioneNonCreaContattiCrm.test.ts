/**
 * Chi riceve una fattura è un cliente della fatturazione, non un contatto del
 * CRM (20/10/2026): l'importazione delle emesse aggancia un contatto che esiste
 * già, ma non ne crea. Prima ne nascevano centinaia per azienda, con provenienza
 * «fatturazione», in mezzo ai contatti commerciali.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const IMPORT = readFileSync(join(__dirname, "../../../supabase/functions/billing-import/index.ts"), "utf8");

describe("importazione fatture: niente contatti CRM nuovi", () => {
  it("billing-import non inserisce nei contatti", () => {
    expect(IMPORT).not.toMatch(/from\("marketing_contacts"\)\s*\.(insert|upsert)\(/);
  });

  it("cerca il contatto esistente per partita IVA o codice fiscale", () => {
    expect(IMPORT).toContain('.from("marketing_contacts").select("id")');
  });

  it("un aggiornamento non stacca la fattura dal contatto che aveva", () => {
    expect(IMPORT).toContain("if (clientId) invoiceData.client_id = clientId;");
  });
});

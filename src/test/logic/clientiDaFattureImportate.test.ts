/**
 * Gli intestatari delle fatture importate finiscono nei Clienti (20/10/2026):
 * un contatto del CRM diventa cliente, e al cliente si fanno le fatture.
 * Clienti con portale spento e account bloccato, mai inviti né contatti CRM.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codiceCognome, codiceNome, nomeDaIntestatario } from "../../../supabase/functions/_shared/clienteOperativoDaFattura";

const radice = join(__dirname, "../../..");
const MODULO = readFileSync(join(radice, "supabase/functions/_shared/clienteOperativoDaFattura.ts"), "utf8");
const FUNZIONE = readFileSync(join(radice, "supabase/functions/clienti-da-fatture-importate/index.ts"), "utf8");

describe("clienti dalle fatture importate", () => {
  it("il cliente nasce senza portale e con l'account bloccato", () => {
    expect(MODULO).toContain("portal_disabled: true");
    expect(MODULO).toContain("is_blocked: true");
    expect(MODULO).toContain('role: "customer"');
  });

  it("niente email, niente contatti CRM", () => {
    expect(MODULO).not.toMatch(/sendEmail|marketing_contacts/);
    expect(FUNZIONE).not.toMatch(/sendEmail|from\("marketing_contacts"\)/);
  });

  it("riconosce prima, crea solo se manca, e lega l'anagrafica fiscale dopo", () => {
    const prima = MODULO.indexOf("riconcilia(supabase, companyId, fattura.id)");
    const crea = MODULO.indexOf("auth.admin.createUser");
    expect(prima).toBeGreaterThan(0);
    expect(crea).toBeGreaterThan(prima);
    expect(MODULO.indexOf("riconcilia(supabase, companyId, fattura.id)", crea)).toBeGreaterThan(crea);
  });

  it("l'account ha l'email tecnica deterministica: due giri non fanno due clienti", () => {
    expect(MODULO).toContain("emailTecnicaClienteImportato(");
    expect(MODULO).toContain("email_exists");
  });

  it("un errore non timbra la fattura: si riprova al giro dopo", () => {
    const blocco = FUNZIONE.slice(FUNZIONE.indexOf('if (r.esito === "errore")'));
    expect(blocco.indexOf("continue;")).toBeLessThan(blocco.indexOf("cliente_collegato_at:"));
  });

  it("nome e cognome di una persona dall'intestatario", () => {
    expect(nomeDaIntestatario("ROSSI MARIO")).toEqual({ last_name: "ROSSI", first_name: "MARIO" });
    expect(nomeDaIntestatario("DE LUCA  ANNA MARIA")).toEqual({ last_name: "DE LUCA", first_name: "ANNA MARIA" });
    expect(nomeDaIntestatario("BIANCHI")).toEqual({ first_name: "", last_name: "BIANCHI" });
  });

  it("con il codice fiscale l'ordine giusto lo dice il codice", () => {
    expect(nomeDaIntestatario("Elena Piovano", "PVNLNE91H60L219H")).toEqual({ last_name: "Piovano", first_name: "Elena" });
    expect(nomeDaIntestatario("ROSSI MARIO", "RSSMRA80A01H501U")).toEqual({ last_name: "ROSSI", first_name: "MARIO" });
    expect(codiceNome("Gianfranco")).toBe("GFR");
    expect(codiceCognome("Fo")).toBe("FOX");
  });
});

import { describe, expect, it } from "vitest";
import {
  chiaveTelefono,
  eUtenteInterno,
  stessoTelefono,
  tipoUtenteBot,
} from "../../../supabase/functions/_shared/botOperativoRuoli";

describe("bot operativo: lo stesso numero scritto in modi diversi", () => {
  it("combacia con prefisso, spazi, 0039", () => {
    expect(stessoTelefono("+39 348 346 7567", "393483467567")).toBe(true);
    expect(stessoTelefono("00393483467567", "348 3467567")).toBe(true);
  });
  it("numeri diversi, vuoti o troppo corti non combaciano", () => {
    expect(stessoTelefono("+39 348 346 7567", "+39 348 346 7568")).toBe(false);
    expect(stessoTelefono("", "")).toBe(false);
    expect(stessoTelefono("12345", "12345")).toBe(false);
    expect(chiaveTelefono(null)).toBe("");
  });
});

describe("bot operativo: che poteri ha chi scrive", () => {
  it("amministratore dell'azienda e super admin sono admin", () => {
    expect(tipoUtenteBot(["company_admin"], true)).toBe("admin");
    expect(tipoUtenteBot(["super_admin"], true)).toBe("admin");
  });
  it("chi lavora in ufficio è ufficio, anche con un ruolo in più", () => {
    expect(tipoUtenteBot(["company_staff"], true)).toBe("ufficio");
    expect(tipoUtenteBot(["salesperson", "employee"], true)).toBe("ufficio");
    expect(tipoUtenteBot(["accountant"], true)).toBe("ufficio");
  });
  it("dipendenti, subappaltatori e chi non ha account restano operai", () => {
    expect(tipoUtenteBot(["employee"], true)).toBe("operaio");
    expect(tipoUtenteBot(["subcontractor"], true)).toBe("operaio");
    expect(tipoUtenteBot([], true)).toBe("operaio");
    expect(tipoUtenteBot(["company_admin"], false)).toBe("operaio");
  });
  it("un cliente o un segnalatore non è un utente interno", () => {
    expect(eUtenteInterno(["customer"])).toBe(false);
    expect(eUtenteInterno(["referrer"])).toBe(false);
    expect(eUtenteInterno([])).toBe(false);
    expect(eUtenteInterno(["customer", "company_staff"])).toBe(true);
    expect(eUtenteInterno(["employee"])).toBe(true);
  });
});

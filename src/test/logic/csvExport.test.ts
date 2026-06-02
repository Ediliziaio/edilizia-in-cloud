import { describe, it, expect } from "vitest";
import { escapeCSV, neutralizeCsvFormula } from "@/lib/csvExport";

/**
 * Test della messa in sicurezza delle celle CSV (src/lib/csvExport.ts).
 * Esercita il CODICE DI PRODUZIONE usato da tutti gli export CSV dell'app.
 *
 * Copre due rischi:
 *  - CSV/formula injection (celle eseguite come formule da Excel/Sheets)
 *  - rottura del formato (separatore ; virgolette, a capo) → quoting RFC-4180
 */

describe("escapeCSV — anti formula-injection", () => {
  it("antepone un apice alle celle che iniziano con = (formula)", () => {
    expect(escapeCSV("=1+1")).toBe("'=1+1");
    expect(escapeCSV('=HYPERLINK("http://evil","x")')).toBe(
      `"'=HYPERLINK(""http://evil"",""x"")"`,
    );
  });

  it("neutralizza anche @ + - quando introducono una formula", () => {
    expect(escapeCSV("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCSV("+1+1")).toBe("'+1+1");
    // contiene apici singoli (non virgolette doppie) e nessun ; → niente quoting RFC,
    // solo l'apice anteposto
    expect(escapeCSV("-2+3+cmd|' /C calc'")).toBe("'-2+3+cmd|' /C calc'");
  });

  it("neutralizza i caratteri di controllo iniziali (TAB/CR)", () => {
    expect(escapeCSV("\t=1+1")).toBe("'\t=1+1");
    expect(escapeCSV("\rcmd")).toBe("'\rcmd");
  });

  it("NON tocca i numeri con segno (restano numeri, non testo)", () => {
    expect(escapeCSV("-500")).toBe("-500");
    expect(escapeCSV("+500")).toBe("+500");
    expect(escapeCSV("-1.234,56")).toBe("-1.234,56");
    expect(escapeCSV(-42)).toBe("-42");
  });

  it("non altera il testo benigno", () => {
    expect(escapeCSV("Mario Rossi")).toBe("Mario Rossi");
    expect(escapeCSV("ACME S.r.l.")).toBe("ACME S.r.l.");
    expect(escapeCSV("1+1 (testo, non inizia con +)")).toBe(
      "1+1 (testo, non inizia con +)",
    );
  });
});

describe("escapeCSV — quoting RFC-4180", () => {
  it("racchiude tra virgolette se contiene il separatore ;", () => {
    expect(escapeCSV("Rossi; Bianchi")).toBe('"Rossi; Bianchi"');
  });

  it("raddoppia le virgolette interne", () => {
    expect(escapeCSV('dice "ciao"')).toBe('"dice ""ciao"""');
  });

  it("racchiude tra virgolette se contiene un a capo", () => {
    expect(escapeCSV("riga1\nriga2")).toBe('"riga1\nriga2"');
  });

  it("null/undefined → stringa vuota", () => {
    expect(escapeCSV(null)).toBe("");
    expect(escapeCSV(undefined)).toBe("");
  });

  it("combina anti-formula e quoting quando serve", () => {
    // inizia con = (formula) e contiene ; (separatore) → apice + quoting
    expect(escapeCSV("=A1;B1")).toBe(`"'=A1;B1"`);
  });
});

describe("neutralizeCsvFormula — riuso indipendente da separatore/quoting", () => {
  it("antepone l'apice solo alle celle 'attive'", () => {
    expect(neutralizeCsvFormula("=1+1")).toBe("'=1+1");
    expect(neutralizeCsvFormula("@x")).toBe("'@x");
    expect(neutralizeCsvFormula("+x")).toBe("'+x");
    expect(neutralizeCsvFormula("-cmd")).toBe("'-cmd");
    expect(neutralizeCsvFormula("\t=1")).toBe("'\t=1");
  });

  it("non tocca numeri e testo benigno", () => {
    expect(neutralizeCsvFormula("-500")).toBe("-500");
    expect(neutralizeCsvFormula("Mario")).toBe("Mario");
  });

  it("è la base usata da escapeCSV (stessa neutralizzazione, senza quoting)", () => {
    // cella attiva ma senza separatori → escapeCSV non aggiunge quoting
    expect(escapeCSV("=1+1")).toBe(neutralizeCsvFormula("=1+1"));
  });
});

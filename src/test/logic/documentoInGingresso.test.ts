import { describe, expect, it } from "vitest";
import { tipoDocumento } from "../../../supabase/functions/_shared/documentoInGingresso";

describe("che documento è arrivato al bot", () => {
  it("riconosce il DDT", () => {
    expect(tipoDocumento("DOCUMENTO DI TRASPORTO n. 12 - vettore Bartolini - 3 colli", null)).toBe("ddt");
  });
  it("riconosce la fattura del fornitore", () => {
    expect(tipoDocumento("FATTURA n. 2026/45 imponibile 1.000 IVA 22% totale fattura 1.220", null)).toBe("fattura");
  });
  it("riconosce il computo metrico", () => {
    expect(tipoDocumento("COMPUTO METRICO ESTIMATIVO - voci di capitolato - quantità mq", null)).toBe("computo");
  });
  it("riconosce lo scontrino, anche solo dalla didascalia", () => {
    expect(tipoDocumento("BRICO CENTER - resto 4,50 - contanti", "ho pagato il ferramenta")).toBe("scontrino");
    expect(tipoDocumento("...", "ti mando lo scontrino della ferramenta")).toBe("scontrino");
  });
  it("un testo qualunque è «altro»", () => {
    expect(tipoDocumento("lista della spesa: pane, latte", null)).toBe("altro");
    expect(tipoDocumento("", null)).toBe("altro");
  });
  it("«fatturato del mese» non è una fattura del fornitore per una parola sola isolata", () => {
    // «fattura» dentro «fatturato» non deve scattare da sola: parola intera.
    expect(tipoDocumento("il fatturato di settembre", null)).toBe("altro");
  });
});

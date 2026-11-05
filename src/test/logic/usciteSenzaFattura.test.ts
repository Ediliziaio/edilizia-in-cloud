import { describe, expect, it } from "vitest";
import { erroreUscita, rigaUscita, type FormUscita } from "@/lib/costi/usciteSenzaFattura";

const base: FormUscita = { descrizione: "Bollo furgone", imponibile: "1.234,50", aliquota: "0", data: "2026-03-15", mese: "", riferimento: "", fornitoreId: "", commessaId: "", mezzoId: "", pagata: true };

describe("uscita senza fattura", () => {
  it("un'uscita completa si può salvare", () => expect(erroreUscita(base)).toBeNull());
  it("chiede descrizione, importo e data", () => {
    expect(erroreUscita({ ...base, descrizione: " " })).toMatch(/di cosa/);
    expect(erroreUscita({ ...base, imponibile: "0" })).toMatch(/importo/);
    expect(erroreUscita({ ...base, imponibile: "abc" })).toMatch(/importo/);
    expect(erroreUscita({ ...base, data: "" })).toMatch(/data/);
    expect(erroreUscita({ ...base, aliquota: "120" })).toMatch(/aliquota/);
  });
  it("è un costo senza fattura, con l'importo all'italiana", () => {
    const r = rigaUscita(base, "co");
    expect(r).toMatchObject({ senza_fattura: true, amount: 1234.5, vat_rate: 0, due_date: "2026-03-15", is_paid: true, paid_date: "2026-03-15", supplier_id: null });
  });
  it("il mese di competenza è quello scelto, altrimenti quello della data", () => {
    expect(rigaUscita(base, "co").mese_competenza).toBe("2026-03-01");
    expect(rigaUscita({ ...base, mese: "2026-01" }, "co").mese_competenza).toBe("2026-01-01");
  });
  it("da pagare non ha la data di pagamento", () => {
    expect(rigaUscita({ ...base, pagata: false }, "co").paid_date).toBeNull();
  });
});

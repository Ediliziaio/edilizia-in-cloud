import { describe, expect, it } from "vitest";
import { differenzaTotaleVisibile } from "@/lib/finanziamenti/riconciliaTotale";
const base = { modalita: "esatto" as const, importo_richiesto: 5000, numero_rate: 36, rata_completa: 162, spese_istruttoria: 0, importo_totale_dovuto: 5857.6 };
describe("Riconciliazione delle componenti visibili", () => {
  it("segnala i 25,60 euro non spiegati senza riscrivere la fonte", () => {
    expect(differenzaTotaleVisibile(base)).toBe(25.6);
    expect(base.importo_totale_dovuto).toBe(5857.6);
  });
  it("riconosce istruttoria esplicita e tollera gli arrotondamenti della rata", () => {
    expect(differenzaTotaleVisibile({ ...base, spese_istruttoria: 25.6 })).toBeNull();
    expect(differenzaTotaleVisibile({ ...base, importo_totale_dovuto: 5832.1 })).toBeNull();
  });
  it("non inventa una differenza con campi mancanti o errori", () => {
    expect(differenzaTotaleVisibile({ ...base, rata_completa: undefined })).toBeNull();
    expect(differenzaTotaleVisibile({ ...base, modalita: "errore" })).toBeNull();
  });
});

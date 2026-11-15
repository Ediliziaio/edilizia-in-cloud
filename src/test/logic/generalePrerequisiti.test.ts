import { describe, expect, it } from "vitest";
import { leggiPrerequisiti, mancanzeOperazione } from "@/lib/orders/generali/prerequisiti";

/** «Per lavorare ti mancano…» (15/11/2026, URBAN VISION: 0 operai, 0 clienti, niente dati fiscali). */
describe("prerequisiti dell'operazione", () => {
  const urban = leggiPrerequisiti({ dipendenti: 0, ditte: 0, mezzi: 0, clienti: 0, dati_fiscali: false });

  it("dice cosa manca, nell'ordine in cui ci si ferma", () => {
    expect(mancanzeOperazione(urban, "sviluppo").map((m) => m.id)).toEqual(["squadra", "clienti", "fatturazione"]);
  });
  it("una ditta basta per i rapportini", () => {
    const p = leggiPrerequisiti({ dipendenti: 0, ditte: 1, mezzi: 0, clienti: 0, dati_fiscali: false });
    expect(mancanzeOperazione(p, "sviluppo").map((m) => m.id)).toEqual(["clienti", "fatturazione"]);
  });
  it("l'appalto non chiede i clienti: il committente sta nei dati", () => {
    expect(mancanzeOperazione(urban, "appalto").map((m) => m.id)).toEqual(["squadra", "fatturazione"]);
  });
  it("con tutto a posto non dice niente", () => {
    const p = leggiPrerequisiti({ dipendenti: 17, ditte: 5, mezzi: 2, clienti: 414, dati_fiscali: true });
    expect(mancanzeOperazione(p, "compravendita")).toEqual([]);
  });
  it("una risposta illeggibile non produce avvisi", () => {
    expect(leggiPrerequisiti({ dipendenti: "0" })).toBeNull();
    expect(mancanzeOperazione(null, "sviluppo")).toEqual([]);
  });
});

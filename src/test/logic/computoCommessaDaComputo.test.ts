import { describe, expect, it } from "vitest";
import { bozzaVuota, voceVuota } from "@/lib/computo/editorNativo";
import { fasiDaRate, righeDaComputo } from "@/lib/computo/commessaDaComputo";

/** Dal preventivo con computo alla commessa (29/10/2026): voci → righe del preventivo, piano → fasi di pagamento. */
describe("commessa dal computo", () => {
  const bozza = { ...bozzaVuota(), voci: [
    { ...voceVuota(), tariffa: "NP.01", descrizione: "Scavo di sbancamento\nfino a 40 cm", unita: "mc", quantita: "259,2", prezzo: "12", costo: "8" },
  ] };
  it("una riga per voce: nome dalla prima riga, quantità e prezzo, codice", () => {
    const [r] = righeDaComputo({ bozza, aliquotaIva: 10, conCosti: true, companyId: "c" }, "q");
    expect(r).toMatchObject({ name: "Scavo di sbancamento", description: "fino a 40 cm", quantity: 259.2, unit_price: 12, unit_of_measure: "mc", vat_rate: 10, codice_prezzario: "NP.01", prezzo_acquisto: 8 });
  });
  it("senza il permesso dei costi il costo non passa alla commessa", () => {
    expect(righeDaComputo({ bozza, aliquotaIva: 10, conCosti: false, companyId: "c" }, "q")[0].prezzo_acquisto).toBeNull();
  });
  it("le rate diventano fasi: l'ultima è il saldo", () => {
    expect(fasiDaRate([{ descrizione: "Acconto", percentuale: 30, importo: 300 }, { descrizione: "Saldo", percentuale: 70, importo: 700 }]).map(f => f.type)).toEqual(["deposit", "balance"]);
  });
});

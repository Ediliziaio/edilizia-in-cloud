import { describe, expect, it } from "vitest";
import { bozzaVuota, voceVuota } from "@/lib/computo/editorNativo";
import { fasiDaRate, righeDaComputo } from "@/lib/computo/commessaDaComputo";
import { applicaCostiListino, codiciSenzaCosto } from "@/lib/computo/costiDalListino";

/** Dal preventivo con computo alla commessa (29/10/2026): voci → righe del preventivo, piano → fasi di pagamento. */
describe("commessa dal computo", () => {
  const bozza = { ...bozzaVuota(), voci: [
    { ...voceVuota(), tariffa: "NP.01", descrizione: "Scavo di sbancamento\nfino a 40 cm", unita: "mc", quantita: "259,2", prezzo: "12", costo: "8" },
  ] };
  it("una riga per voce: nome dalla prima riga, quantità e prezzo, codice", () => {
    const [r] = righeDaComputo({ bozza, aliquotaIva: 10, conCosti: true, companyId: "c" }, "q");
    expect(r).toMatchObject({ name: "Scavo di sbancamento", description: "fino a 40 cm", quantity: 259.2, unit_price: 12, unit_of_measure: "mc", vat_rate: 10, codice_prezzario: "NP.01", prezzo_acquisto: 8 });
  });
  it("il capitolo passa alla commessa: diventa la fase, la voce la sua sottofase", () => {
    expect(righeDaComputo({ bozza, aliquotaIva: 10, conCosti: true, companyId: "c" }, "q")[0].custom_field_values).toEqual({ computo: { capitolo: "Opere edili" } });
  });
  it("senza il permesso dei costi il costo non passa alla commessa", () => {
    expect(righeDaComputo({ bozza, aliquotaIva: 10, conCosti: false, companyId: "c" }, "q")[0].prezzo_acquisto).toBeNull();
  });
  it("le rate diventano fasi: l'ultima è il saldo", () => {
    expect(fasiDaRate([{ descrizione: "Acconto", percentuale: 30, importo: 300 }, { descrizione: "Saldo", percentuale: 70, importo: 700 }]).map(f => f.type)).toEqual(["deposit", "balance"]);
  });
});

describe("costi dal listino", () => {
  const voce = (tariffa: string, costo: string, opzionale = false) => ({ ...voceVuota(), tariffa, costo, opzionale });
  it("cerca solo i codici delle voci senza costo, una volta", () => {
    expect(codiciSenzaCosto([voce("A.1", ""), voce("A.1", "0"), voce("B.2", "12"), voce("", ""), voce("C.3", "", true)])).toEqual(["A.1"]);
  });
  it("mette il costo del listino alle voci che non l'hanno, e lascia quelle già scritte", () => {
    const { voci, trovate } = applicaCostiListino([voce("A.1", ""), voce("B.2", "9"), voce("Z.9", "")], [{ codice: "A.1", costo: 12.345 }, { codice: "B.2", costo: 20 }]);
    expect(voci.map(v => v.costo)).toEqual(["12,35", "9", ""]);
    expect(trovate).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { bozzaVuota, voceVuota } from "@/lib/computo/editorNativo";
import { fasiDaRate, righeDaComputo, prezzoConcordatoComputo } from "@/lib/computo/commessaDaComputo";
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
  it("le rate diventano fasi: l'ultima è il saldo, e il momento d'incasso arriva fino alla commessa", () => {
    const fasi = fasiDaRate([
      { descrizione: "Acconto", percentuale: 30, importo: 300, aMisura: false, evento: "firma_contratto", numero: null },
      { descrizione: "2° SAL", percentuale: null, importo: null, aMisura: true, evento: "sal_numero", numero: 2 },
      { descrizione: "Saldo", percentuale: 70, importo: 700, aMisura: false, evento: "fine_lavori", numero: null },
    ]);
    expect(fasi.map(f => f.type)).toEqual(["deposit", "deposit", "balance"]);
    // Prima erano tutte «acconto» senza momento: una rata al SAL 2 non si riconosceva più.
    expect(fasi.map(f => f.evento)).toEqual(["firma_contratto", "sal_numero", "fine_lavori"]);
    expect(fasi[1]).toMatchObject({ numero: 2, a_misura: true, amount: 0, percent: 0 });
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

 it("BUG-81: trasferisce gli acconti IVA inclusa e conserva il netto se IVA assente", () => {
    // Dall'11/11/2026 l'importo della rata è già quello che paga il cliente, IVA inclusa.
    const rata = (descrizione: string, percentuale: number, importo: number) =>
      ({ descrizione, percentuale, importo, aMisura: false, evento: "firma_contratto", numero: null as number | null });
    const fasi = fasiDaRate([rata("Acconto", 30, 237.17), rata("SAL", 40, 316.22), rata("Saldo", 30, 237.17)]);
    expect(fasi.map(f => f.amount)).toEqual([237.17, 316.22, 237.17]);
    expect(fasiDaRate([rata("Saldo", 100, 648)])[0].amount).toBe(648);
 });

 describe("BUG-81: prezzo concordato del computo", () => {
   it("mantiene il netto scontato senza ricalcolarlo dalle righe a prezzo pieno", () => {
     expect(prezzoConcordatoComputo({ subtotal: 648, vatAmount: 142.56, total: 790.56, aliquotaIva: 22 }))
       .toEqual({ prezzo_manuale: 648, prezzo_manuale_iva_pct: 22, discount_percent: 0 });
   });
   it("conserva i centesimi di uno sconto fisso e il caso senza IVA", () => {
     expect(prezzoConcordatoComputo({ subtotal: 93.17, vatAmount: 20.50, total: 113.67, aliquotaIva: 22 }).prezzo_manuale).toBe(93.17);
     expect(prezzoConcordatoComputo({ subtotal: 93.17, vatAmount: 0, total: 93.17, aliquotaIva: null }).prezzo_manuale_iva_pct).toBe(0);
   });
   it("preserva zero e blocca importi incoerenti prima di scrivere", () => {
     expect(prezzoConcordatoComputo({ subtotal: 0, vatAmount: 0, total: 0, aliquotaIva: 22 }).discount_percent).toBe(100);
     expect(() => prezzoConcordatoComputo({ subtotal: 648, vatAmount: 142.56, total: 878.4, aliquotaIva: 22 })).toThrow(/riconciliati/);
   });
 });

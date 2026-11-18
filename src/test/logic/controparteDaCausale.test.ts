import { describe, expect, it } from "vitest";
import { controparteDaCausale, controparteMovimento } from "@/components/tesoreria/controparteDaCausale";

// Causali vere di Impresa Vulcano (18/11/2026): la banca non manda il nome della controparte.
describe("controparteDaCausale", () => {
  it.each([
    ["BONIFICO o/c: TORNO SUBITO S.R.L. ABI-CAB: 02008-01623 a favore di IMPRESA VULCANO SRL Num. Bon.Sepa 263211000", "TORNO SUBITO S.R.L"],
    ["BONIFICO ISTANTANEO o/c: CATTELAN MAURIZIO ABI-CAB: 02008-01623 a favo", "CATTELAN MAURIZIO"],
    ["DISPOSIZIONE a favore di F.LLI LAZZARO SRL EUR 11.000,00 SALDO FATTURA N.29 DEL 31/10/2026 Spese: 0,50 EUR", "F.LLI LAZZARO SRL"],
    ["DISPOSIZIONE a favore di CATANIA ANGELO EUR 4.102,00 SALDO FATTURA N.15/001", "CATANIA ANGELO"],
    ["Bonifico a vs favore *COLOMBO DAVIDE PAGAMENTO FT N 1.216 DEL 28.10.26 3. ACCONTO", "COLOMBO DAVIDE"],
    ["Bonifico a vs favore *INST 19:25 FRONTINI FABIO OLEOTTO ISABELLA FAT-2026-205", "FRONTINI FABIO OLEOTTO ISABELLA"],
    ["Bonifico a vs favore *CAVE ROSSETTI SPA 287 FT 1/154 26", "CAVE ROSSETTI SPA"],
    ["Bonifico a vs favore *INST 18:04 FRONTINI FABIO OLEOTTO ISABELLA fattura 2026-214", "FRONTINI FABIO OLEOTTO ISABELLA"],
    ["Bonifico tramite Internet Banking *IMBERTI LEGNAMI SRL SALDO FATTURE N.3273 E 32ID.BON:08404000", "IMBERTI LEGNAMI SRL"],
    ["Bonifico tramite Internet Banking *PELLEGATTA LUIGI saldo fattura n.42/001 deID.BON:08404000219", "PELLEGATTA LUIGI"],
    ["ADDEBITO B2B Radius Business Solution N: 1184694905/02 ID:2061402", "Radius Business Solution"],
  ])("%s", (causale, atteso) => {
    expect(controparteDaCausale(causale)).toBe(atteso);
  });

  it.each([
    "Bonifico tramite Internet Banking *INSTANT DEL 14/10/2026 ORE 10:55 ID. 08404000217245494850510",
    "COMMISSIONI BONIFICI Bonifico num. 263210100029920",
    "RATA PRESTITO Fin. 005/005480714 Scadenza del 17/11/2026",
    "ANTICIPO SU DOCUMENTI ant ft",
    "",
  ])("nessun nome in «%s»", (causale) => {
    expect(controparteDaCausale(causale)).toBeNull();
  });

  it("il nome della banca vince su quello ricavato", () => {
    expect(controparteMovimento({ transaction_type: "credit", debtor_name: "Mario Rossi", description: "BONIFICO o/c: ALTRO ABI-CAB" }))
      .toEqual({ nome: "Mario Rossi", dedotta: false });
    expect(controparteMovimento({ transaction_type: "debit", creditor_name: null, description: "DISPOSIZIONE a favore di CBC SRL EUR 8.920,00" }))
      .toEqual({ nome: "CBC SRL", dedotta: true });
  });
});

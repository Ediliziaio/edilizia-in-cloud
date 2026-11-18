import { describe, expect, it } from "vitest";
import { controparteDaCausale, controparteMovimento } from "@/components/tesoreria/controparteDaCausale";

// Causali con la forma di quelle vere di BCC e BPER via Distyra (18/11/2026), con nomi inventati:
// la banca non manda il nome della controparte, che sta solo nella causale.
describe("controparteDaCausale", () => {
  it.each([
    ["BONIFICO o/c: ROSSI COSTRUZIONI S.R.L. ABI-CAB: 02008-01623 a favore di EDILE ESEMPIO SRL Num. Bon.Sepa 263211000", "ROSSI COSTRUZIONI S.R.L"],
    ["BONIFICO ISTANTANEO o/c: VERDI MARIO ABI-CAB: 02008-01623 a favo", "VERDI MARIO"],
    ["DISPOSIZIONE a favore di F.LLI BIANCHI SRL EUR 1.000,00 SALDO FATTURA N.29 DEL 31/10/2026 Spese: 0,50 EUR", "F.LLI BIANCHI SRL"],
    ["DISPOSIZIONE a favore di NERI LUCA EUR 4.100,00 SALDO FATTURA N.15/001", "NERI LUCA"],
    ["Bonifico a vs favore *GIALLI PAOLO PAGAMENTO FT N 1.216 DEL 28.10.26 3. ACCONTO", "GIALLI PAOLO"],
    ["Bonifico a vs favore *INST 19:25 BLU ANNA ROSA CARLA FAT-2026-205", "BLU ANNA ROSA CARLA"],
    ["Bonifico a vs favore *CAVE ESEMPIO SPA 287 FT 1/154 26", "CAVE ESEMPIO SPA"],
    ["Bonifico a vs favore *INST 18:04 BLU ANNA ROSA CARLA fattura 2026-214", "BLU ANNA ROSA CARLA"],
    ["Bonifico tramite Internet Banking *LEGNAMI ESEMPIO SRL SALDO FATTURE N.3273 E 32ID.BON:08404000", "LEGNAMI ESEMPIO SRL"],
    ["Bonifico tramite Internet Banking *ARANCIO GINO saldo fattura n.42/001 deID.BON:08404000219", "ARANCIO GINO"],
    ["ADDEBITO B2B Noleggi Esempio Spa N: 1184694905/02 ID:2061402", "Noleggi Esempio Spa"],
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

  it("il titolare del conto non è la controparte (giroconto)", () => {
    const causale = "BONIFICO ISTANTANEO o/c: EDILE ESEMPIO SRL ABI-CAB: 08404-32690 a favore di EDILE ESEMPIO SRL";
    expect(controparteDaCausale(causale, "EDILE ESEMPIO S.R.L.")).toBeNull();
    expect(controparteDaCausale(causale)).toBe("EDILE ESEMPIO SRL");
  });

  it("il nome della banca vince su quello ricavato", () => {
    expect(controparteMovimento({ transaction_type: "credit", debtor_name: "Mario Rossi", description: "BONIFICO o/c: ALTRO ABI-CAB" }))
      .toEqual({ nome: "Mario Rossi", dedotta: false, origine: "banca" });
    expect(controparteMovimento({ transaction_type: "debit", creditor_name: null, description: "DISPOSIZIONE a favore di ABC SRL EUR 8.920,00" }))
      .toEqual({ nome: "ABC SRL", dedotta: true, origine: "causale" });
  });

  /**
   * Il nome certo del server (documento abbinato, candidato del motore, natura del movimento) vale
   * più di qualunque lettura della causale: su Vulcano copre 351 movimenti su 482 (18/11/2026).
   */
  describe("il nome certo del server", () => {
    it("vince sulla causale, e non si presenta come un'ipotesi", () => {
      const esito = controparteMovimento(
        { transaction_type: "debit", description: "DISPOSIZIONE a favore di ABC SRL EUR 8.920,00" },
        { nome: "ABC Costruzioni S.r.l.", certa: true, origine: "documento" },
      );
      expect(esito).toEqual({ nome: "ABC Costruzioni S.r.l.", dedotta: false, origine: "documento" });
    });

    it("una commissione ha come controparte la banca del conto", () => {
      expect(controparteMovimento(
        { transaction_type: "debit", description: "COMMISSIONI BONIFICI Bonifico num. 263210100012" },
        { nome: "BPER Banca", certa: true, origine: "istituto" },
      )).toEqual({ nome: "BPER Banca", dedotta: false, origine: "istituto" });
    });

    it("quello che manda la banca resta davanti a tutto", () => {
      expect(controparteMovimento(
        { transaction_type: "credit", debtor_name: "Mario Rossi", description: "x" },
        { nome: "Altro Nome Srl", certa: true, origine: "motore" },
      )).toEqual({ nome: "Mario Rossi", dedotta: false, origine: "banca" });
    });

    it("senza risposta dal server si torna alla causale, dichiarandolo", () => {
      expect(controparteMovimento(
        { transaction_type: "debit", description: "DISPOSIZIONE a favore di ABC SRL EUR 8.920,00" },
        null,
      )).toEqual({ nome: "ABC SRL", dedotta: true, origine: "causale" });
    });

    it("un nome vuoto dal server non prende il posto della causale", () => {
      expect(controparteMovimento(
        { transaction_type: "debit", description: "DISPOSIZIONE a favore di ABC SRL EUR 8.920,00" },
        { nome: "   ", certa: true, origine: "motore" },
      )).toEqual({ nome: "ABC SRL", dedotta: true, origine: "causale" });
    });

    it("un nome che il server dichiara incerto si mostra come dedotto", () => {
      expect(controparteMovimento(
        { transaction_type: "debit", description: "x" },
        { nome: "Forse Questo Srl", certa: false, origine: "motore" },
      )).toEqual({ nome: "Forse Questo Srl", dedotta: true, origine: "motore" });
    });
  });
});

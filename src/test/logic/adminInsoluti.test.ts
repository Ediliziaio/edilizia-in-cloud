import { describe, expect, it } from "vitest";
import { formatInsolutiEuro, paymentStatusLabel, paymentFailureLabel, plannedRecoveryAction } from "@/lib/adminInsoluti";
describe("Importi e stati insoluti", () => {
  it("preserva i centesimi e distingue un importo mancante da zero", () => {
    expect(formatInsolutiEuro(12749)).toContain("127,49");
    expect(formatInsolutiEuro(0)).toContain("0,00");
    expect(formatInsolutiEuro(null)).toBe("Non disponibile");
  });
  it("descrive stato e causa senza perdere il motivo specifico", () => {
    expect(paymentStatusLabel("past_due")).toBe("Pagamento in ritardo");
    expect(paymentFailureLabel("insufficient_funds | card_declined | Your card has insufficient funds.")).toBe("Fondi insufficienti sulla carta");
    expect(paymentStatusLabel("nuovo_stato")).toBe("Stato da verificare");
  });
  it("presenta la sospensione come prevista e gestisce azioni assenti", () => {
    expect(plannedRecoveryAction("sospensione automatica alla prossima notte")).toBe("Sospensione prevista dalle regole di recupero");
    expect(plannedRecoveryAction(null)).toBe("Azione da verificare");
  });
});

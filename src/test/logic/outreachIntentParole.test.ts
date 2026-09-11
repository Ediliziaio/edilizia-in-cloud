import { describe, expect, it } from "vitest";
import { intentDaParoleChiave } from "../../../supabase/functions/_shared/outreach-intent-parole";

describe("intentDaParoleChiave", () => {
  it("un «no» secco è un opt-out (è la risposta alla frase d'uscita)", () => {
    expect(intentDaParoleChiave("Re: Serramenti", "No")).toBe("unsubscribe");
    expect(intentDaParoleChiave("Re: Serramenti", "no grazie.")).toBe("unsubscribe");
    expect(intentDaParoleChiave("", "STOP")).toBe("unsubscribe");
  });

  it("cancellatemi / non scrivetemi più / unsubscribe → opt-out", () => {
    expect(intentDaParoleChiave("", "Cancellatemi dalla vostra lista, grazie")).toBe("unsubscribe");
    expect(intentDaParoleChiave("", "Per favore non scrivetemi più")).toBe("unsubscribe");
    expect(intentDaParoleChiave("unsubscribe", "")).toBe("unsubscribe");
  });

  it("«non mi interessa» → non interessato (cooldown, non opt-out)", () => {
    expect(intentDaParoleChiave("", "Grazie ma non siamo interessati, abbiamo già un fornitore.")).toBe("not_interested");
    expect(intentDaParoleChiave("", "Al momento non ci serve.")).toBe("not_interested");
  });

  it("una risposta lunga e neutra resta all'AI", () => {
    expect(intentDaParoleChiave("", "Buongiorno, mi può mandare il listino aggiornato? Avremmo un cantiere a ottobre.")).toBe(null);
  });

  it("ignora la nostra citazione sotto la risposta", () => {
    const testo = "Sì, chiamatemi domani.\n\nIl giorno 11 set 2026 Filippo Milesi ha scritto:\n> Se non ti interessa, rispondi «no» e non ti scrivo più.";
    expect(intentDaParoleChiave("", testo)).toBe(null);
  });
});

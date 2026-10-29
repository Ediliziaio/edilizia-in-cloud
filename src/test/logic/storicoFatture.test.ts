import { describe, expect, it } from "vitest";
import { campiEmessaStorica, campiRicevutaStorica, eStorico } from "../../../supabase/functions/_shared/storicoFatture";
import { messaggioStorico } from "@/components/billing/StoricoGiaRegistrato";

describe("storico già registrato nel gestionale di prima", () => {
  it("vale fino alla data di taglio compresa, e solo se la data c'è", () => {
    expect(eStorico("2026-06-30", "2026-06-30")).toBe(true);
    expect(eStorico("2026-07-01", "2026-06-30")).toBe(false);
    expect(eStorico("2026-06-30T10:00:00Z", "2026-06-30")).toBe(true);
    expect(eStorico("2026-01-01", null)).toBe(false);
    expect(eStorico(null, "2026-06-30")).toBe(false);
  });

  it("una fattura emessa storica entra incassata, con la data di pagamento della scadenza", () => {
    const inv = { issueDate: "2025-03-10", dueDate: "2025-04-10", total: 1220, documentType: "invoice" };
    expect(campiEmessaStorica(inv, "2026-06-30", null)).toEqual({
      status: "paid", paid_amount: 1220, payment_date: "2025-04-10", storico_esterno: true,
    });
    expect(campiEmessaStorica({ ...inv, dueDate: null }, "2026-06-30", null)?.payment_date).toBe("2025-03-10");
  });

  it("dopo la data di taglio, o senza data, l'import resta quello di sempre", () => {
    const inv = { issueDate: "2026-07-01", total: 100, documentType: "invoice" };
    expect(campiEmessaStorica(inv, "2026-06-30", null)).toBeNull();
    expect(campiEmessaStorica(inv, null, null)).toBeNull();
  });

  it("una nota di credito storica si chiude senza diventare un incasso", () => {
    const campi = campiEmessaStorica({ issueDate: "2025-03-10", total: 200, documentType: "credit_note" }, "2026-06-30", null);
    expect(campi).toMatchObject({ status: "paid", storico_esterno: true });
    expect(campi).not.toHaveProperty("paid_amount");
  });

  it("le stornate e le annullate restano come sono", () => {
    const inv = { issueDate: "2025-03-10", total: 100, documentType: "invoice" };
    expect(campiEmessaStorica(inv, "2026-06-30", "credited")).toBeNull();
    expect(campiEmessaStorica(inv, "2026-06-30", "cancelled")).toBeNull();
  });

  it("una ricevuta storica nuova entra contabilizzata, senza costo", () => {
    expect(campiRicevutaStorica("2025-05-02", "2026-06-30", null)).toEqual({ stato: "contabilizzata", storico_esterno: true });
    expect(campiRicevutaStorica("2026-07-02", "2026-06-30", null)).toBeNull();
  });

  it("una ricevuta già toccata da qualcuno non si cambia", () => {
    expect(campiRicevutaStorica("2025-05-02", "2026-06-30", { stato: "letta" })).not.toBeNull();
    expect(campiRicevutaStorica("2025-05-02", "2026-06-30", { stato: "letta", company_cost_id: "c1" })).toBeNull();
    expect(campiRicevutaStorica("2025-05-02", "2026-06-30", { stato: "non_letta", prima_nota_id: "p1" })).toBeNull();
    expect(campiRicevutaStorica("2025-05-02", "2026-06-30", { stato: "rifiutata" })).toBeNull();
    expect(campiRicevutaStorica("2025-05-02", "2026-06-30", { stato: "contabilizzata" })).toBeNull();
  });

  it("dice in parole cosa ha chiuso", () => {
    expect(messaggioStorico({ fino_al: "2026-06-30", emesse: 19, ricevute: 1 })).toBe(
      "Fino al 30/06/2026: 19 fatture emesse segnate incassate e 1 fattura ricevuta segnata registrata.",
    );
    expect(messaggioStorico({ fino_al: "2026-06-30", emesse: 0, ricevute: 0 })).toMatch(/nessuna fattura da chiudere/);
    expect(messaggioStorico({ fino_al: null, emesse: 0, ricevute: 0 })).toMatch(/tolta/);
  });
});

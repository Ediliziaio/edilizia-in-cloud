/**
 * Il «quando» di ogni rata sopravvive al passaggio preventivo → commessa (04/11/2026).
 *
 * Prima il momento d'incasso viveva solo nel testo della descrizione: diventando commessa
 * le rate nascevano tutte «a data fissa» con scadenze inventate a 30, 60 e 90 giorni, e
 * una rata «al SAL 2» non era più riconoscibile come tale — così la card «SAL da emettere»
 * della commessa restava vuota e il verbale non seguiva il piano concordato col cliente.
 */
import { describe, expect, it } from "vitest";
import { parseQuotePaymentPhases } from "@/lib/preventivi/paymentTerms";
import { prefillExpectedDates, type Installment } from "@/lib/orderUtils";

describe("le fasi di pagamento del preventivo portano il loro momento d'incasso", () => {
  it("legge evento e numero del SAL", () => {
    const fasi = parseQuotePaymentPhases([
      { label: "Acconto", type: "deposit", percent: 20, amount: 200, evento: "firma_contratto" },
      { label: "Secondo SAL", type: "deposit", percent: 40, amount: 400, evento: "sal_numero", numero: 2 },
      { label: "Saldo", type: "balance", percent: 40, amount: 400, evento: "fine_lavori" },
    ]);
    expect(fasi.map((f) => f.evento)).toEqual(["firma_contratto", "sal_numero", "fine_lavori"]);
    expect(fasi.map((f) => f.numero)).toEqual([null, 2, null]);
  });

  it("un preventivo vecchio, senza il campo, vale «a una data precisa»", () => {
    const fasi = parseQuotePaymentPhases([{ label: "Acconto", type: "deposit", percent: 30, amount: 300 }]);
    expect(fasi[0].evento).toBe("data_fissa");
    expect(fasi[0].numero).toBeNull();
  });

  it("un evento inventato non passa, e il numero vale solo per il SAL", () => {
    const fasi = parseQuotePaymentPhases([
      { label: "X", type: "deposit", percent: 50, amount: 1, evento: "quando_mi_pare" },
      { label: "Y", type: "balance", percent: 50, amount: 1, evento: "fine_lavori", numero: 7 },
    ]);
    expect(fasi[0].evento).toBe("data_fissa");
    expect(fasi[1].numero).toBeNull();
  });

  it("lo stato della commessa non è un evento da preventivo: si sceglie sulla rata", () => {
    const fasi = parseQuotePaymentPhases([{ label: "X", type: "deposit", percent: 100, amount: 1, evento: "stato_commessa" }]);
    expect(fasi[0].evento).toBe("data_fissa");
  });
});

describe("le date suggerite non coprono le rate legate a un evento", () => {
  const rata = (patch: Partial<Installment>): Installment =>
    ({ position: 0, label: "R", type: "deposit", amount: 100, is_paid: false, ...patch });

  it("una rata a evento resta senza data: gliela dà l'evento, non un conto a 30 giorni", () => {
    const fuori = prefillExpectedDates([
      rata({ position: 0, trigger_evento: "sal_numero", trigger_numero: 2 }),
      rata({ position: 1, trigger_evento: "merce_magazzino" }),
    ]);
    expect(fuori.every((r) => !r.expected_date)).toBe(true);
  });

  it("una rata a data fissa la riceve ancora, come prima", () => {
    const fuori = prefillExpectedDates([rata({ trigger_evento: "data_fissa" }), rata({ position: 1 })]);
    expect(fuori.every((r) => !!r.expected_date)).toBe(true);
  });

  it("una data già scritta e una rata incassata non si toccano", () => {
    const fuori = prefillExpectedDates([
      rata({ expected_date: "2026-12-31" }),
      rata({ position: 1, is_paid: true }),
    ]);
    expect(fuori[0].expected_date).toBe("2026-12-31");
    expect(fuori[1].expected_date).toBeUndefined();
  });
});

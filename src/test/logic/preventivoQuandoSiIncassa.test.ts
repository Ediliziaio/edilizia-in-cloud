/**
 * Il «quando» di ogni rata sopravvive al passaggio preventivo → commessa (04/11/2026).
 *
 * Prima il momento d'incasso viveva solo nel testo della descrizione: diventando commessa
 * le rate nascevano tutte «a data fissa» con scadenze inventate a 30, 60 e 90 giorni, e
 * una rata «al SAL 2» non era più riconoscibile come tale — così la card «SAL da emettere»
 * della commessa restava vuota e il verbale non seguiva il piano concordato col cliente.
 */
import { describe, expect, it } from "vitest";
import { parseQuotePaymentPhases, quotePaymentPresets, recalcPhaseAmounts } from "@/lib/preventivi/paymentTerms";
import { prefillExpectedDates, type Installment } from "@/lib/orderUtils";
import { prefillDaPreventivo } from "@/lib/preventivi/prefillPreventivo";

describe("le fasi di pagamento del preventivo portano il loro momento d'incasso", () => {
  // 11/11/2026: una rata «a misura» del computo deve dirsi tale anche nello scadenzario.
  it("la rata a misura arriva in commessa marcata come da misurare", () => {
    const fasi = parseQuotePaymentPhases([
      { label: "Acconto", type: "deposit", percent: 20, amount: 200, evento: "firma_contratto" },
      { label: "1° SAL", type: "deposit", percent: 0, amount: 0, evento: "sal_numero", numero: 1, a_misura: true },
    ]);
    expect(fasi.map(f => f.aMisura)).toEqual([undefined, true]);
    const prefill = prefillDaPreventivo({ payment_phases: fasi.map(f => ({ ...f, a_misura: f.aMisura })) }, []);
    expect(prefill.installments.map(r => r.importo_da_misurare)).toEqual([false, true]);
  });

  // 12/11/2026: la condizione del contratto arriva intera, non solo il nome dell'evento.
  it("soglia, fase e termine di pagamento arrivano fino alla rata", () => {
    const fasi = parseQuotePaymentPhases([
      { label: "Acconto", type: "deposit", percent: 20, amount: 200, evento: "firma_contratto", termine_giorni: 60, termine_fine_mese: true },
      { label: "A metà", type: "deposit", percent: 40, amount: 400, evento: "sal_percentuale", soglia: 50 },
      { label: "Strutture", type: "deposit", percent: 20, amount: 200, evento: "fase_completata", fase: "Strutture in elevazione" },
    ]);
    expect(fasi[0]).toMatchObject({ termineGiorni: 60, termineFineMese: true });
    expect(fasi[1]).toMatchObject({ soglia: 50 });
    expect(fasi[2]).toMatchObject({ fase: "Strutture in elevazione" });
    const rate = prefillDaPreventivo({ payment_phases: [
      { label: "Acconto", type: "deposit", percent: 20, amount: 200, evento: "firma_contratto", termine_giorni: 60, termine_fine_mese: true },
      { label: "A metà", type: "deposit", percent: 40, amount: 400, evento: "sal_percentuale", soglia: 50 },
      { label: "Strutture", type: "deposit", percent: 20, amount: 200, evento: "fase_completata", fase: "Strutture in elevazione" },
    ] }, []).installments;
    expect(rate[0]).toMatchObject({ termine_giorni: 60, termine_fine_mese: true });
    expect(rate[1]).toMatchObject({ trigger_evento: "sal_percentuale", trigger_soglia: 50 });
    expect(rate[2]).toMatchObject({ trigger_evento: "fase_completata", trigger_fase: "Strutture in elevazione" });
  });

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

describe("i piani pronti e il ricalcolo non perdono il momento d'incasso", () => {
  it("il piano con i SAL arriva con evento e numero di ogni SAL", () => {
    const conSal = quotePaymentPresets().find((p) => p.fasi.some((f) => f.evento === "sal_numero"));
    expect(conSal).toBeDefined();
    const numeri = conSal!.fasi.filter((f) => f.evento === "sal_numero").map((f) => f.numero);
    expect(numeri).toEqual(numeri.map((_, i) => i + 1));
  });

  it("ricalcolare gli importi tiene evento e numero", () => {
    const [fase] = recalcPhaseAmounts([{ label: "SAL", type: "balance", percent: 100, amount: 0, evento: "sal_numero", numero: 2 }], 1000);
    expect(fase).toMatchObject({ amount: 1000, evento: "sal_numero", numero: 2 });
  });
});

describe("dal preventivo alla commessa", () => {
  it("la rata resta legata al suo SAL, con la sua percentuale e senza date inventate", () => {
    const { installments } = prefillDaPreventivo({
      payment_phases: [
        { label: "Acconto", type: "deposit", percent: 20, amount: 200, evento: "firma_contratto" },
        { label: "SAL 2", type: "deposit", percent: 50, amount: 500, evento: "sal_numero", numero: 2 },
        { label: "Saldo", type: "balance", percent: 30, amount: 300, evento: "fine_lavori" },
      ],
    }, []);
    expect(installments[1]).toMatchObject({ label: "SAL 2", amount: 500, percent: 50, trigger_evento: "sal_numero", trigger_numero: 2 });
    expect(prefillExpectedDates(installments).every((r) => !r.expected_date)).toBe(true);
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

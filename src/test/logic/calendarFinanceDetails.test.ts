import { describe, it, expect } from "vitest";
import {
  calendarFinanceModel,
  type CalendarInstallment,
  type CalendarSal,
} from "@/lib/calendar/financeDetails";
import {
  calendarEventDate,
  calendarEventTime,
} from "@/lib/calendar/eventDetails";
import {
  calendarLocation,
  validCalendarCoordinates,
} from "@/hooks/useCalendarTravel";
import type { CalendarOrder } from "@/types/calendar";
const rate = (
  id: string,
  position: number,
  amount: number,
  extra: Partial<CalendarInstallment> = {},
): CalendarInstallment => ({
  id,
  position,
  amount,
  label: id,
  type: "balance",
  is_paid: false,
  paid_date: null,
  data_attesa: null,
  stato_incasso: null,
  trigger_evento: null,
  trigger_numero: null,
  ...extra,
});
const sal = (id: string, extra: Partial<CalendarSal> = {}): CalendarSal => ({
  id,
  numero_sal: 1,
  stato: "firmato",
  data_emissione: "2026-09-29",
  importo_totale: 1000,
  installment_id: "middle",
  ...extra,
});
const model = (
  rates: CalendarInstallment[],
  sals: CalendarSal[] = [],
  maturity: "emesso" | "approvato" = "emesso",
) =>
  calendarFinanceModel({
    order: {
      total_amount: 1000,
      vat_rate: 22,
      financing_cost: 0,
      payment_type: null,
    },
    rates,
    sals,
    maturity,
    variations: [
      { status: "approvato", impatto_economico: 100 },
      { status: "in_attesa", impatto_economico: 9999 },
    ],
  });
describe("Incassi del calendario dalla stessa fonte della commessa", () => {
  it("le rate SAL intermedie mantengono l'importo e soltanto l'ultimo saldo è il residuo", () => {
    const m = model([
      rate("deposit", 0, 200, { type: "deposit", is_paid: true }),
      rate("middle", 1, 400),
      rate("last", 2, 0),
    ]);
    expect(m.rates.map((r) => r.amount)).toEqual([200, 400, 742]);
    expect(m.target).toBe(1342);
    expect(m.collected).toBe(200);
    expect(m.remaining).toBe(1142);
  });
  it("firmare o emettere il SAL non significa averne incassato la rata", () => {
    const m = model(
      [
        rate("middle", 0, 400, { trigger_evento: "sal_numero" }),
        rate("last", 1, 0),
      ],
      [sal("s")],
    );
    expect(m.rates[0].status).toBe("Da incassare");
    expect(m.collected).toBe(0);
    expect(
      model(
        [rate("middle", 0, 400, { trigger_evento: "sal_numero" })],
        [sal("s", { stato: "emesso" })],
        "approvato",
      ).rates[0].status,
    ).toBe("In attesa del SAL");
  });
  it("gli incassi parziali della fattura sono contati una sola volta anche con due rate collegate", () => {
    const invoice = { id: "invoice", importo_pagato: 150 };
    const m = model([
      rate("deposit", 0, 200, { type: "deposit", fattura: invoice }),
      rate("middle", 1, 400, { fattura: invoice }),
      rate("last", 2, 0),
    ]);
    expect(m.collected).toBe(150);
    expect(m.rates[0].status).toBe("Incasso parziale");
    expect(m.rates[0].remaining).toBe(50);
    expect(m.rates[1].collected).toBe(0);
  });
  it("lo zero registrato nella fattura non viene sostituito dal flag pagato", () => {
    const m = model([
      rate("deposit", 0, 200, {
        type: "deposit",
        is_paid: true,
        fattura: { id: "invoice", importo_pagato: 0 },
      }),
      rate("last", 1, 0),
    ]);
    expect(m.collected).toBe(0);
    expect(m.rates[0].status).toBe("Incasso da verificare");
  });
  it("un SAL privo di rata non viene associato per numero né aggiunto agli incassi", () => {
    const m = model(
      [
        rate("middle", 0, 400, {
          trigger_evento: "sal_numero",
          trigger_numero: 1,
        }),
      ],
      [sal("s", { installment_id: null })],
    );
    expect(m.rates[0].sal).toBeUndefined();
    expect(m.rates[0].status).toBe("In attesa del SAL");
    expect(m.collected).toBe(0);
  });
});
describe("Indirizzi e tempi operativi", () => {
  it("un appuntamento usa il proprio indirizzo e non la distanza della commessa collegata", () => {
    expect(
      calendarLocation(
        {
          type: "appointment",
          color: "",
          appointment: {
            formatted_address: "Via Nuova 5",
            lat: 0,
            lng: 1,
          } as never,
        },
        "Via Vecchia 10",
      ),
    ).toEqual({ address: "Via Nuova 5", coordinates: { lat: 0, lng: 1 } });
    expect(validCalendarCoordinates(0, 0)).toBe(true);
    expect(validCalendarCoordinates(100, 200)).toBe(false);
  });
  it("la lavorazione prende l'indirizzo canonico del cantiere", () => {
    const order = {
      indirizzo_lavori: "Via Roma 10",
      work_address: "Indirizzo vecchio",
      work_lat: 45,
      work_lng: 9,
    } as CalendarOrder;
    expect(
      calendarLocation({ type: "lavoro", color: "", order }, "Via diversa"),
    ).toEqual({ address: "Via Roma 10", coordinates: { lat: 45, lng: 9 } });
  });
  it("gli interventi vicino a mezzanotte seguono il giorno e l'ora italiani", () => {
    expect(calendarEventDate("2026-09-28T22:30:00Z")).toBe("2026-09-29");
    expect(
      calendarEventTime({
        type: "intervento",
        color: "",
        intervento: {
          data_intervento_prevista: "2026-09-28T22:30:00Z",
        } as never,
      }),
    ).toBe("00:30");
  });
});

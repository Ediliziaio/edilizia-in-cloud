import { describe, it, expect } from "vitest";
import { rischioPagamenti, orderColor, ORDER_COLOR_PALETTE } from "@/lib/calendarUtils";
import type { CalendarOrder } from "@/types/calendar";

// Ordine minimo per la logica pagamenti: le viste passano il CalendarOrder
// intero, ma qui contano solo date e pagamenti_scoperti.
const ordine = (over: Partial<CalendarOrder>): CalendarOrder =>
  ({
    id: "o1",
    order_code: "ORD-1",
    description: "",
    expected_date: null,
    work_start_date: null,
    work_end_date: null,
    warehouse_arrival_date: null,
    created_at: "2026-01-01",
    customer_id: "c1",
    current_status_id: null,
    customer: { first_name: "", last_name: "" },
    status: null,
    ...over,
  }) as CalendarOrder;

const OGGI = new Date("2026-09-01T12:00:00");

describe("rischioPagamenti — 'sto iniziando ma il cliente non ha pagato'", () => {
  it("acconto scoperto con lavoro già avviato → rosso", () => {
    const r = rischioPagamenti(
      ordine({ work_start_date: "2026-08-20", pagamenti_scoperti: { acconto_eur: 4740, saldo_eur: 0 } }),
      OGGI,
    );
    expect(r?.livello).toBe("rosso");
    expect(r?.messaggio).toContain("avviato");
    expect(r?.importo_eur).toBe(4740);
  });

  it("acconto scoperto con lavoro futuro → rosso ('parte ma non ha pagato')", () => {
    const r = rischioPagamenti(
      ordine({ work_start_date: "2026-09-10", pagamenti_scoperti: { acconto_eur: 500, saldo_eur: 0 } }),
      OGGI,
    );
    expect(r?.livello).toBe("rosso");
    expect(r?.messaggio).toContain("parte");
  });

  it("solo saldo scoperto a lavori finiti → ambra", () => {
    const r = rischioPagamenti(
      ordine({ work_start_date: "2026-08-01", work_end_date: "2026-08-19", pagamenti_scoperti: { acconto_eur: 0, saldo_eur: 6900 } }),
      OGGI,
    );
    expect(r?.livello).toBe("ambra");
    expect(r?.importo_eur).toBe(6900);
  });

  it("saldo scoperto ma lavoro ancora in corso → nessun avviso (fisiologico)", () => {
    const r = rischioPagamenti(
      ordine({ work_start_date: "2026-08-25", work_end_date: "2026-09-15", pagamenti_scoperti: { acconto_eur: 0, saldo_eur: 6900 } }),
      OGGI,
    );
    expect(r).toBeNull();
  });

  it("senza rate scoperte → nessun avviso", () => {
    expect(rischioPagamenti(ordine({ work_start_date: "2026-09-01" }), OGGI)).toBeNull();
  });
});

describe("orderColor — colore stabile per commessa", () => {
  it("stesso id → stesso colore, sempre dalla palette", () => {
    const c1 = orderColor("4d652b7e-691a-4ea0-8324-b3908cf0f962");
    expect(orderColor("4d652b7e-691a-4ea0-8324-b3908cf0f962")).toBe(c1);
    expect(ORDER_COLOR_PALETTE).toContain(c1);
  });

  it("id diversi si distribuiscono su più tinte", () => {
    const colori = new Set(Array.from({ length: 30 }, (_, i) => orderColor(`ordine-${i}-x`)));
    expect(colori.size).toBeGreaterThan(4);
  });
});

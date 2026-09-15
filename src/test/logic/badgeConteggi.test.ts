import { describe, expect, it } from "vitest";
import { contaAttivita, contaEmailNonLette } from "@/lib/badgeConteggi";

describe("contaEmailNonLette", () => {
  it("totale dal count, urgenti dalle righe", () => {
    const righe = [{ ai_priority: "alta" }, { ai_priority: "alta" }, { ai_priority: "media" }, { ai_priority: null }];
    expect(contaEmailNonLette(righe, 629)).toEqual({ unread: 629, urgent: 2 });
  });

  it("senza dati è tutto zero", () => {
    expect(contaEmailNonLette(null, null)).toEqual({ unread: 0, urgent: 0 });
  });
});

describe("contaAttivita", () => {
  const oggi = "2026-09-15";
  const domani = "2026-09-16";

  it("separa scadute, di oggi e future; le senza data contano solo nel totale", () => {
    const righe = [
      { due_date: "2026-09-10" },
      { due_date: "2026-09-14" },
      { due_date: "2026-09-15" },
      { due_date: "2026-09-16" },
      { due_date: null },
    ];
    expect(contaAttivita(righe, 5, oggi, domani)).toEqual({ total: 5, overdue: 2, dueToday: 1 });
  });

  it("accetta anche un timestamp completo", () => {
    const righe = [{ due_date: "2026-09-14T23:30:00+00:00" }, { due_date: "2026-09-15T08:00:00+00:00" }];
    expect(contaAttivita(righe, 2, oggi, domani)).toEqual({ total: 2, overdue: 1, dueToday: 1 });
  });

  it("il totale non scende sotto le righe lette se il count manca", () => {
    expect(contaAttivita([{ due_date: "2026-09-01" }], null, oggi, domani)).toEqual({
      total: 1,
      overdue: 1,
      dueToday: 0,
    });
  });
});

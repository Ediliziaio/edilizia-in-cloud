// Il bug del giorno sfasato si vede solo a est di Greenwich: si fissa il fuso
// italiano prima di creare qualsiasi data.
process.env.TZ = "Europe/Rome";

import { describe, it, expect } from "vitest";
import { calcolaConflitti } from "@/hooks/useConflictDetection";
import type { CalendarOrder } from "@/types/calendar";

function commessa(p: {
  id: string;
  squadra?: string;
  operaio?: string;
  posa?: string | null;
  inizio?: string | null;
  fine?: string | null;
}): CalendarOrder {
  return {
    id: p.id,
    order_code: p.id,
    description: null,
    expected_date: p.posa ?? null,
    work_start_date: p.inizio ?? null,
    work_end_date: p.fine ?? null,
    order_employees: p.operaio
      ? [{ employee: { id: p.operaio, first_name: "Mario", last_name: "Rossi" } }]
      : [],
    order_external_teams: p.squadra
      ? [{ external_team: { id: p.squadra, name: "Squadra Nord" } }]
      : [],
  } as unknown as CalendarOrder;
}

describe("Calendario: conflitti di risorse", () => {
  it("il lavoro su più giorni cade sui suoi giorni, non sul giorno prima", () => {
    // La squadra lavora dal 5 al 7 ottobre sulla A e il 7 ha la posa della B.
    const conflitti = calcolaConflitti(
      [
        commessa({ id: "A", squadra: "sq1", inizio: "2026-10-05", fine: "2026-10-07" }),
        commessa({ id: "B", squadra: "sq1", posa: "2026-10-07" }),
      ],
      [],
      undefined,
      "2026-09-25",
    );
    // Con toISOString() i giorni di lavoro diventavano 4–6 ottobre: nessun
    // conflitto il 7, e il 4 compariva un giorno di lavoro inesistente.
    expect(conflitti.map((c) => c.date)).toEqual(["2026-10-07"]);
  });

  it("posa e lavoro della stessa commessa nello stesso giorno non sono un conflitto", () => {
    const conflitti = calcolaConflitti(
      [commessa({ id: "A", operaio: "op1", inizio: "2026-10-05", fine: "2026-10-07", posa: "2026-10-06" })],
      [],
      undefined,
      "2026-09-25",
    );
    expect(conflitti).toEqual([]);
  });

  it("i conflitti già passati non si contano", () => {
    const ordini = [
      commessa({ id: "A", operaio: "op1", posa: "2026-06-15" }),
      commessa({ id: "B", operaio: "op1", posa: "2026-06-15" }),
    ];
    expect(calcolaConflitti(ordini, [], undefined, "2026-09-25")).toEqual([]);
    expect(calcolaConflitti(ordini, [], undefined, "2026-06-15")).toHaveLength(1);
  });
});

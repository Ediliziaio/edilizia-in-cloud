import { describe, expect, it } from "vitest";
import { daGuardare, finestreAnnuali, giorniTra, oreTimbratePerGiorno, periodoCommessa, righePerPersona } from "@/lib/orders/orePersone";
import type { DailyHoursLine } from "@/lib/orders/dailyHours";

const riga = (over: Partial<DailyHoursLine>): DailyHoursLine => ({
  key: Math.random().toString(), reportId: "r", employeeId: "e1", day: "2026-10-15", orderId: "o1", hours: 8,
  cost: 200, pending: false, office: false, updatedAt: "", note: null, ...over,
});
const persone = [{ id: "e1", name: "Marco Verdi" }, { id: "e2", name: "Luca Bianchi" }];

describe("Ore e persone", () => {
  it("una riga per persona: giorni, ore, da dove arrivano, ultimo giorno, costo", () => {
    const [r] = righePerPersona([
      riga({ day: "2026-10-14" }), riga({ day: "2026-10-15", office: true, cost: 160, hours: 6 }),
      riga({ day: "2026-10-16", pending: true, cost: null, hours: 4 }),
    ], persone);
    expect(r).toMatchObject({ nome: "Marco Verdi", giorni: 3, ore: 18, oreConfermate: 14, oreInAttesa: 4, oreUfficio: 6, oreRapportino: 12, ultimoGiorno: "2026-10-16", costo: 360 });
  });
  it("un costo mancante su ore confermate non diventa zero", () => {
    const [r] = righePerPersona([riga({ cost: null })], persone);
    expect(r.costo).toBeNull();
  });
  it("chi ha timbrato ma non ha ore registrate compare, ed è da guardare", () => {
    const righe = righePerPersona([riga({})], persone, new Map([["e1", 8], ["e2", 7.5]]));
    const luca = righe.find((r) => r.employeeId === "e2")!;
    expect(luca).toMatchObject({ ore: 0, oreTimbrate: 7.5 });
    expect(daGuardare(luca)).toBe(true);
    expect(daGuardare(righe.find((r) => r.employeeId === "e1")!)).toBe(false);
  });
  it("le ore timbrate si contano solo per la parte di giornata sul cantiere", () => {
    const perGiorno = oreTimbratePerGiorno([
      { id: "1", tipo: "entrata", timestamp_evento: "2026-10-15T06:00:00Z", order_id: "o1" },
      { id: "2", tipo: "uscita", timestamp_evento: "2026-10-15T10:00:00Z", order_id: "o1" },
      { id: "3", tipo: "entrata", timestamp_evento: "2026-10-15T11:00:00Z", order_id: "altro" },
      { id: "4", tipo: "uscita", timestamp_evento: "2026-10-15T15:00:00Z", order_id: "altro" },
    ], "o1", new Date("2026-10-18T10:00:00Z"));
    expect(perGiorno.get("2026-10-15")).toBe(4);
  });
  it("tutta la commessa: dall'inizio lavori a oggi, per intero", () => {
    expect(periodoCommessa("2026-09-01", "2026-10-18")).toEqual({ da: "2026-09-01", a: "2026-10-18", finestre: 1 });
    expect(periodoCommessa(null, "2026-10-18").da).toBe("2025-10-17");
  });
  it("una commessa aperta da più di un anno non viene più tagliata: l'inizio resta l'inizio", () => {
    // Il caso visto in demo: lavori dal 20/10/2025, oggi 25/11/2026. Prima partiva dal 24/11/2025
    // e i primi 25 rapportini su 40 sparivano dal riepilogo.
    expect(periodoCommessa("2025-10-20", "2026-11-25")).toEqual({ da: "2025-10-20", a: "2026-11-25", finestre: 2 });
    expect(periodoCommessa("2024-01-01", "2026-10-18").da).toBe("2024-01-01");
  });
  it("il periodo lungo si legge a finestre di un anno, senza buchi né sovrapposizioni", () => {
    expect(finestreAnnuali("2026-09-01", "2026-10-18")).toEqual([{ da: "2026-09-01", a: "2026-10-18" }]);
    const finestre = finestreAnnuali("2025-10-20", "2026-11-25");
    expect(finestre).toEqual([{ da: "2025-10-20", a: "2026-10-20" }, { da: "2026-10-21", a: "2026-11-25" }]);
    for (const f of finestre) expect((Date.parse(`${f.a}T12:00:00Z`) - Date.parse(`${f.da}T12:00:00Z`)) / 86_400_000).toBeLessThanOrEqual(366);
    expect(finestreAnnuali("2026-10-18", "2026-09-01")).toEqual([]);
  });
  it("giorni tra due date, senza sabato e domenica", () => {
    expect(giorniTra("2026-10-16", "2026-10-19", true)).toEqual(["2026-10-16", "2026-10-19"]);
    expect(giorniTra("2026-10-16", "2026-10-19", false)).toHaveLength(4);
  });
});

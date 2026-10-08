/**
 * Orari liberi della prenotazione interna: stesse regole della pagina pubblica.
 */
import { describe, expect, it } from "vitest";
import { calcolaSlotLiberi, fasceDelGiorno, impegniEsterniInFascia } from "@/lib/opportunita/slotCalendario";

const VENERDI = new Date(2026, 9, 9); // venerdì 9 ottobre 2026
const PASSATO = new Date(2026, 9, 1).getTime();
const settimana = [
  { day_of_week: 5, start_time: "09:00:00", end_time: "12:00:00", is_enabled: true, specific_date: null },
  { day_of_week: 5, start_time: "14:00:00", end_time: "17:00:00", is_enabled: true, specific_date: null },
];

describe("fasceDelGiorno", () => {
  it("usa la regola settimanale", () => {
    expect(fasceDelGiorno(settimana, VENERDI)).toHaveLength(2);
  });
  it("una giornata speciale ha la precedenza", () => {
    const regole = [...settimana, { day_of_week: null, specific_date: "2026-10-09", start_time: "10:00:00", end_time: "11:00:00", is_enabled: true }];
    expect(fasceDelGiorno(regole, VENERDI)).toEqual([expect.objectContaining({ start_time: "10:00:00" })]);
  });
  it("una giornata speciale tutta spenta è un giorno di chiusura", () => {
    const regole = [...settimana, { day_of_week: null, specific_date: "2026-10-09", start_time: "09:00:00", end_time: "17:00:00", is_enabled: false }];
    expect(fasceDelGiorno(regole, VENERDI)).toEqual([]);
  });
});

describe("calcolaSlotLiberi", () => {
  const base = { giorno: VENERDI, regole: settimana, appuntamenti: [], occupatiEsterni: [], durataMin: 60, adesso: PASSATO };

  it("riempie le fasce di lavoro", () => {
    const r = calcolaSlotLiberi(base);
    expect(r.slot).toEqual(["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"]);
    expect(r.fasce).toEqual([{ da: "09:00", a: "12:00" }, { da: "14:00", a: "17:00" }]);
  });

  it("toglie gli appuntamenti già fissati", () => {
    const r = calcolaSlotLiberi({ ...base, appuntamenti: [{ inizio: "10:00:00", fine: "11:00:00" }] });
    expect(r.slot).not.toContain("10:00");
    expect(r.slot).toContain("09:00");
    expect(r.slot).toContain("11:00");
  });

  it("i margini del calendario allargano l'appuntamento", () => {
    const r = calcolaSlotLiberi({ ...base, appuntamenti: [{ inizio: "10:00:00", fine: "11:00:00" }], bufferPrimaMin: 15, bufferDopoMin: 15 });
    expect(r.slot).not.toContain("09:00");
    expect(r.slot).not.toContain("11:00");
    expect(r.slot).toContain("14:00");
  });

  it("toglie gli impegni di Google Calendar", () => {
    const inizio = new Date(2026, 9, 9, 14, 30).toISOString();
    const fine = new Date(2026, 9, 9, 15, 30).toISOString();
    const r = calcolaSlotLiberi({ ...base, occupatiEsterni: [{ start_at: inizio, end_at: fine }] });
    expect(r.slot).not.toContain("14:00");
    expect(r.slot).not.toContain("15:00");
    expect(r.slot).toContain("16:00");
  });

  it("rispetta il preavviso minimo", () => {
    const adesso = new Date(2026, 9, 9, 8, 30).getTime();
    const r = calcolaSlotLiberi({ ...base, adesso, preavvisoMin: 120 });
    expect(r.slot[0]).toBe("11:00");
  });

  it("raggiunto il tetto giornaliero non ci sono orari", () => {
    const r = calcolaSlotLiberi({ ...base, appuntamenti: [{ inizio: "09:00", fine: "10:00" }, { inizio: "14:00", fine: "15:00" }], maxAlGiorno: 2 });
    expect(r.slot).toEqual([]);
    expect(r.motivoVuoto).toBe("tetto");
  });

  it("un giorno senza regole è chiuso", () => {
    const r = calcolaSlotLiberi({ ...base, giorno: new Date(2026, 9, 10) });
    expect(r.motivoVuoto).toBe("chiuso");
  });
});

describe("impegniEsterniInFascia", () => {
  it("trova gli impegni che toccano un orario scelto a mano", () => {
    const occupati = [{ start_at: new Date(2026, 9, 9, 10, 30).toISOString(), end_at: new Date(2026, 9, 9, 11, 30).toISOString() }];
    expect(impegniEsterniInFascia(VENERDI, "10:00", "11:00", occupati)).toHaveLength(1);
    expect(impegniEsterniInFascia(VENERDI, "12:00", "13:00", occupati)).toHaveLength(0);
  });
});

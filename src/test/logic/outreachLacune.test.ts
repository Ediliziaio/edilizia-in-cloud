import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { spostaNeiGiorniDellaFinestra, type SendWindow } from "../../../supabase/functions/_shared/outreach-schedule";
import { warmupMessage, warmupReply } from "../../../supabase/functions/_shared/outreach-warmup";

// 21/09/2026 — i follow-up seguono i giorni della finestra del BRAND. Prima
// saltavano sempre sabato e domenica, anche per i brand che spediscono tutti i
// giorni, e il lunedì si trovava tre giorni di richiami insieme.
describe("spostaNeiGiorniDellaFinestra", () => {
  const roma = (days: number[]): SendWindow => ({ days, startHour: 7, endHour: 20, timeZone: "Europe/Rome" });
  const sabato = new Date("2026-09-05T08:30:00Z");
  const domenica = new Date("2026-09-06T08:30:00Z");
  const giovedi = new Date("2026-09-03T08:30:00Z");

  it("brand senza finestra propria (lun–ven): sabato e domenica → lunedì, come prima", () => {
    expect(spostaNeiGiorniDellaFinestra(sabato).toISOString()).toBe("2026-09-07T08:30:00.000Z");
    expect(spostaNeiGiorniDellaFinestra(domenica).toISOString()).toBe("2026-09-07T08:30:00.000Z");
    expect(spostaNeiGiorniDellaFinestra(giovedi).toISOString()).toBe("2026-09-03T08:30:00.000Z");
  });

  it("tutti i giorni (Marketing Edile, Edilizia in Cloud): il weekend resta weekend", () => {
    const sempre = roma([0, 1, 2, 3, 4, 5, 6]);
    expect(spostaNeiGiorniDellaFinestra(sabato, sempre).toISOString()).toBe(sabato.toISOString());
    expect(spostaNeiGiorniDellaFinestra(domenica, sempre).toISOString()).toBe(domenica.toISOString());
  });

  it("lun–sab (ThermoDMR): il sabato resta, la domenica va al lunedì", () => {
    const lunSab = roma([1, 2, 3, 4, 5, 6]);
    expect(spostaNeiGiorniDellaFinestra(sabato, lunSab).toISOString()).toBe(sabato.toISOString());
    expect(spostaNeiGiorniDellaFinestra(domenica, lunSab).toISOString()).toBe("2026-09-07T08:30:00.000Z");
  });

  it("il giorno è quello di Roma, non quello UTC", () => {
    // Domenica 23:30 UTC è già lunedì 01:30 a Roma: con lun–ven non si sposta.
    const tardi = new Date("2026-09-06T23:30:00Z");
    expect(spostaNeiGiorniDellaFinestra(tardi).toISOString()).toBe(tardi.toISOString());
  });

  it("finestra senza giorni: non si sposta (e non gira all'infinito)", () => {
    expect(spostaNeiGiorniDellaFinestra(sabato, roma([])).toISOString()).toBe(sabato.toISOString());
  });

  it("il dispatcher la usa con la finestra del brand, per i passi lineari e per il grafo", () => {
    const motore = readFileSync(join(__dirname, "../../../supabase/functions/outreach-dispatch/index.ts"), "utf8");
    expect(motore.match(/spostaNeiGiorniDellaFinestra\(orario, finestra\)/g)).toHaveLength(2);
    expect(motore).not.toContain("spostaFuoriWeekend");
  });
});

describe("warmupMessage", () => {
  it("nessuna graffa residua, testi diversi tra indici, riproducibile con rnd fisso", () => {
    const a = warmupMessage(1, () => 0.1), b = warmupMessage(2, () => 0.1);
    for (const m of [a, b]) {
      expect(m.subject).not.toMatch(/[{}|]/);
      expect(m.body).not.toMatch(/[{}|]/);
      expect(m.subject.length).toBeGreaterThan(3);
    }
    expect(a.subject).not.toBe(b.subject);
    expect(warmupMessage(1, () => 0.1)).toEqual(a);
    expect(warmupReply(() => 0.9)).not.toMatch(/[{}|]/);
  });
});

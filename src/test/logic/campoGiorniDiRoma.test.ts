import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shiftWorkDay, workDayStart } from "@/lib/campo/workDay";
import { campoDayWindow } from "@/lib/campo/timeSummary";

/**
 * Il giorno di lavoro del campo segue l'ora italiana. Scrivere «2026-10-06T00:00:00» in una query lo fa leggere al
 * database come UTC: le timbrature fra le 00 e le 02 (ora di Roma) finivano nel giorno, o nel mese, sbagliato.
 */
describe("finestre di giorno e di mese a mezzanotte di Roma", () => {
  it("un giorno d'estate comincia alle 22:00 UTC del giorno prima", () => {
    expect(workDayStart("2026-09-24").toISOString()).toBe("2026-09-23T22:00:00.000Z");
    const { start, end } = campoDayWindow("2026-09-24");
    expect(end.getTime() - start.getTime()).toBe(24 * 3600_000);
  });

  it("il mese di ottobre 2026 cambia ora a metà: finisce alle 23:00 UTC del 31", () => {
    const da = workDayStart("2026-10-01").toISOString();
    const a = workDayStart(shiftWorkDay("2026-10-31", 1)).toISOString();
    expect(da).toBe("2026-09-30T22:00:00.000Z"); // ancora ora legale (UTC+2)
    expect(a).toBe("2026-10-31T23:00:00.000Z"); // già ora solare (UTC+1)
    expect((Date.parse(a) - Date.parse(da)) / 3600_000).toBe(31 * 24 + 1);
  });

  it("una timbratura all'1:30 del primo del mese sta nel mese giusto", () => {
    const timbratura = Date.parse("2026-09-30T23:30:00Z"); // 01:30 del 1° ottobre a Roma
    expect(timbratura).toBeGreaterThanOrEqual(workDayStart("2026-10-01").getTime());
    expect(timbratura).toBeLessThan(workDayStart("2026-11-01").getTime());
    // con la vecchia finestra «T00:00:00» (UTC) finiva nel mese prima
    expect(timbratura).toBeLessThan(Date.parse("2026-10-01T00:00:00Z"));
  });
});

describe("le pagine non scrivono più finestre «T00:00:00» senza fuso", () => {
  const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
  for (const pagina of ["src/pages/campo/CampoLavoroDetail.tsx", "src/pages/campo/CampoPresenze.tsx"]) {
    it(`${pagina.split("/").pop()}: finestre di Roma`, () => {
      const s = leggi(pagina);
      expect(s).not.toMatch(/T00:00:00|T23:59:59/);
      expect(s).toMatch(/campoDayWindow|workDayStart/);
    });
  }

  it("il cantiere conta «oggi» sul calendario italiano e non su quello del telefono", () => {
    expect(leggi("src/pages/campo/CampoLavoroDetail.tsx")).toContain("const today = campoWorkDay();");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dataOraItaliana } from "../../../supabase/functions/_shared/oraItaliana";

/**
 * Gli eventi importati da Google Calendar entravano con l'ora UTC: il server
 * delle edge function gira in UTC e il parser usava getHours(). Il «VENDITE
 * training meeting» delle 10:00 risultava alle 08:00 a ottobre e alle 09:00 a
 * novembre (19/09/2026, Il Bagno Group e Suntech).
 */
describe("Ora italiana di un evento Google", () => {
  it("l'offset di Google non sposta l'ora, d'estate e d'inverno", () => {
    expect(dataOraItaliana("2026-10-02T10:00:00+02:00")).toEqual({ data: "2026-10-02", ora: "10:00" });
    expect(dataOraItaliana("2026-11-06T10:00:00+01:00")).toEqual({ data: "2026-11-06", ora: "10:00" });
  });

  it("un istante in UTC diventa l'ora di Roma", () => {
    expect(dataOraItaliana("2026-10-02T08:00:00Z")).toEqual({ data: "2026-10-02", ora: "10:00" });
    expect(dataOraItaliana("2026-11-06T09:00:00Z")).toEqual({ data: "2026-11-06", ora: "10:00" });
  });

  it("fra mezzanotte e le due il giorno resta quello italiano", () => {
    expect(dataOraItaliana("2026-09-22T00:30:00+02:00")).toEqual({ data: "2026-09-22", ora: "00:30" });
    expect(dataOraItaliana("2026-09-21T22:30:00Z")).toEqual({ data: "2026-09-22", ora: "00:30" });
  });

  it("un calendario in un altro fuso viene riportato a Roma", () => {
    expect(dataOraItaliana("2026-10-02T09:00:00+01:00")).toEqual({ data: "2026-10-02", ora: "10:00" });
  });

  it("il giorno del cambio d'ora", () => {
    // 25/10/2026: alle 03:00 legali si torna alle 02:00 solari (01:00 UTC).
    expect(dataOraItaliana("2026-10-25T00:30:00Z")).toEqual({ data: "2026-10-25", ora: "02:30" });
    expect(dataOraItaliana("2026-10-25T01:30:00Z")).toEqual({ data: "2026-10-25", ora: "02:30" });
    expect(dataOraItaliana("2026-10-25T02:30:00Z")).toEqual({ data: "2026-10-25", ora: "03:30" });
  });

  it("niente mezzanotte scritta 24:00", () => {
    expect(dataOraItaliana("2026-09-21T22:00:00Z")).toEqual({ data: "2026-09-22", ora: "00:00" });
  });

  it("valori assenti o sbagliati non rompono il parser", () => {
    expect(dataOraItaliana(null)).toBeNull();
    expect(dataOraItaliana(undefined)).toBeNull();
    expect(dataOraItaliana("non è una data")).toBeNull();
  });

  it("la sincronizzazione Google usa l'ora italiana, non getHours()", () => {
    const sync = readFileSync(resolve(process.cwd(), "supabase/functions/google-calendar-sync/index.ts"), "utf8");
    const parser = sync.slice(sync.indexOf("function parseGoogleEventToCrmFields"), sync.indexOf("function recuperaAppuntamentiSenzaEvento"));
    expect(parser).toContain("dataOraItaliana(gEvent.start.dateTime)");
    expect(parser).toContain("dataOraItaliana(gEvent.end?.dateTime)");
    expect(parser).not.toMatch(/\.getHours\(\)/);
  });
});

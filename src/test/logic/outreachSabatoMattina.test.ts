/**
 * Il sabato solo la mattina, la domenica mai (21/09/2026). Il titolare: «le
 * email di outreach di Marketing Edile e Edilizia in Cloud non devono partire
 * di sabato pomeriggio e domenica, devono essere come ThermoDMR». La finestra
 * aveva un orario solo per tutti i giorni: ora un giorno può chiudere prima
 * (`endHourByDay`), e il motore lo rispetta all'invio, nel ritmo della casella
 * e quando programma i richiami.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fineDelGiorno,
  isWithinSendWindow,
  orarioFollowUp,
  parseSendWindow,
  spostaNeiGiorniDellaFinestra,
  type SendWindow,
} from "../../../supabase/functions/_shared/outreach-schedule";

// Lun–sab 7–20, il sabato fino alle 13: quella dei tre brand del cold.
const FINESTRA: SendWindow = parseSendWindow({
  days: [1, 2, 3, 4, 5, 6], startHour: 7, endHour: 20, timeZone: "Europe/Rome", endHourByDay: { "6": 13 },
});
// Settembre 2026, ora legale: Roma = UTC+2. Sabato 26/09, domenica 27/09, lunedì 28/09.
const roma = (giorno: string, ora: string) => new Date(`${giorno}T${ora}:00+02:00`);

describe("la finestra dei brand del cold", () => {
  it("il parser tiene la chiusura del sabato", () => {
    expect(FINESTRA.endHourByDay).toEqual({ 6: 13 });
    expect(fineDelGiorno(FINESTRA, 6)).toBe(13);
    expect(fineDelGiorno(FINESTRA, 1)).toBe(20);
  });

  it("sabato mattina sì, sabato pomeriggio no, domenica mai", () => {
    expect(isWithinSendWindow(roma("2026-09-26", "07:00"), FINESTRA)).toBe(true);
    expect(isWithinSendWindow(roma("2026-09-26", "12:59"), FINESTRA)).toBe(true);
    expect(isWithinSendWindow(roma("2026-09-26", "13:00"), FINESTRA)).toBe(false);
    expect(isWithinSendWindow(roma("2026-09-26", "17:30"), FINESTRA)).toBe(false);
    expect(isWithinSendWindow(roma("2026-09-27", "10:00"), FINESTRA)).toBe(false);
  });

  it("dal lunedì al venerdì fino alle 20, come prima", () => {
    expect(isWithinSendWindow(roma("2026-09-28", "19:59"), FINESTRA)).toBe(true);
    expect(isWithinSendWindow(roma("2026-09-25", "17:30"), FINESTRA)).toBe(true);
    expect(isWithinSendWindow(roma("2026-09-25", "20:00"), FINESTRA)).toBe(false);
  });

  it("valori scritti male si scartano: meglio il sabato intero che un giorno chiuso", () => {
    const f = parseSendWindow({ days: [1, 2, 3, 4, 5, 6], startHour: 7, endHour: 20, endHourByDay: { "6": 25, "5": 5, "9": 12, "4": "13" } });
    expect(f.endHourByDay).toBeUndefined();
    expect(fineDelGiorno(f, 6)).toBe(20);
  });

  it("senza chiusure anticipate la finestra resta quella di prima", () => {
    const f = parseSendWindow({ days: [1, 2, 3, 4, 5], startHour: 8, endHour: 19 });
    expect(f).not.toHaveProperty("endHourByDay");
  });
});

describe("i richiami rispettano il sabato corto", () => {
  it("un richiamo del sabato pomeriggio va al lunedì alla stessa ora", () => {
    expect(spostaNeiGiorniDellaFinestra(roma("2026-09-26", "16:20"), FINESTRA).toISOString())
      .toBe(roma("2026-09-28", "16:20").toISOString());
  });

  it("uno del sabato mattina resta lì, uno della domenica va al lunedì", () => {
    expect(spostaNeiGiorniDellaFinestra(roma("2026-09-26", "10:05"), FINESTRA).toISOString())
      .toBe(roma("2026-09-26", "10:05").toISOString());
    expect(spostaNeiGiorniDellaFinestra(roma("2026-09-27", "10:05"), FINESTRA).toISOString())
      .toBe(roma("2026-09-28", "10:05").toISOString());
  });

  it("un orario fuori finestra di un giorno normale resta com'è (decide il controllo all'invio)", () => {
    expect(spostaNeiGiorniDellaFinestra(roma("2026-09-23", "21:30"), FINESTRA).toISOString())
      .toBe(roma("2026-09-23", "21:30").toISOString());
  });

  it("l'orario scelto per un richiamo del sabato sta prima delle 13", () => {
    // Email precedente il mercoledì alle 16:40 → richiamo al mattino del sabato.
    const precedente = roma("2026-09-23", "16:40");
    for (const caso of [0, 0.3, 0.6, 0.99]) {
      const o = orarioFollowUp(roma("2026-09-26", "16:40"), precedente, FINESTRA, caso);
      expect(isWithinSendWindow(o, FINESTRA)).toBe(true);
    }
  });
});

describe("il motore usa la giornata di oggi", () => {
  it("il ritmo delle caselle conta sulla chiusura del giorno", () => {
    const motore = readFileSync(join(__dirname, "../../../supabase/functions/outreach-dispatch/index.ts"), "utf8");
    expect(motore).toContain("const minutiFinestra = (fineDelGiorno(fin, localParts(now, fin.timeZone).weekday) - fin.startHour) * 60;");
  });

  it("la scheda del brand mostra e modifica il sabato", () => {
    const scheda = readFileSync(join(__dirname, "../../../src/components/admin/outreach/OutreachBrands.tsx"), "utf8");
    expect(scheda).toContain("sabato fino alle");
    expect(scheda).toContain('(sabato fino alle ${sab})');
  });
});

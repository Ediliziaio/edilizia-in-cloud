import { describe, it, expect } from "vitest";
import {
  isWithinSendWindow, localParts, DEFAULT_SEND_WINDOW, parseSendWindow, minutoDelGiorno, finestraEffettiva,
} from "../../../supabase/functions/_shared/outreach-schedule";

// 2026-06-15 = lunedì (estate, CEST +2) · 2026-01-12 = lunedì (inverno, CET +1)
// 2026-06-13 = sabato · 2026-06-14 = domenica

describe("localParts — fuso Europe/Rome con DST", () => {
  it("estate = +2", () => {
    expect(localParts(new Date("2026-06-15T06:00:00Z"), "Europe/Rome")).toEqual({ hour: 8, weekday: 1 });
  });
  it("inverno = +1", () => {
    expect(localParts(new Date("2026-01-12T07:00:00Z"), "Europe/Rome")).toEqual({ hour: 8, weekday: 1 });
  });
});

describe("isWithinSendWindow — default Lun-Ven 8-19 Europe/Rome", () => {
  it("lunedì 08:00 (estate) → dentro", () => {
    expect(isWithinSendWindow(new Date("2026-06-15T06:00:00Z"))).toBe(true);
  });
  it("lunedì 07:00 → fuori (prima dell'inizio)", () => {
    expect(isWithinSendWindow(new Date("2026-06-15T05:00:00Z"))).toBe(false);
  });
  it("lunedì 18:59 → dentro", () => {
    expect(isWithinSendWindow(new Date("2026-06-15T16:59:00Z"))).toBe(true);
  });
  it("lunedì 19:00 → fuori (fine esclusa)", () => {
    expect(isWithinSendWindow(new Date("2026-06-15T17:00:00Z"))).toBe(false);
  });
  it("inverno lunedì 08:00 → dentro (DST gestita)", () => {
    expect(isWithinSendWindow(new Date("2026-01-12T07:00:00Z"))).toBe(true);
  });
  it("inverno lunedì 07:00 → fuori", () => {
    expect(isWithinSendWindow(new Date("2026-01-12T06:00:00Z"))).toBe(false);
  });
  it("sabato → fuori (weekend)", () => {
    expect(isWithinSendWindow(new Date("2026-06-13T10:00:00Z"))).toBe(false);
  });
  it("domenica → fuori (weekend)", () => {
    expect(isWithinSendWindow(new Date("2026-06-14T10:00:00Z"))).toBe(false);
  });
});

describe("finestra personalizzata", () => {
  it("rispetta giorni/ore/fuso custom", () => {
    const w = { days: [6, 0], startHour: 10, endHour: 12, timeZone: "Europe/Rome" };
    expect(isWithinSendWindow(new Date("2026-06-13T08:30:00Z"), w)).toBe(true);  // sabato 10:30
    expect(isWithinSendWindow(new Date("2026-06-15T08:30:00Z"), w)).toBe(false); // lunedì non incluso
  });
  it("DEFAULT esportato è Lun-Ven 8-19", () => {
    expect(DEFAULT_SEND_WINDOW).toMatchObject({ days: [1, 2, 3, 4, 5], startHour: 8, endHour: 19, timeZone: "Europe/Rome" });
  });
});

describe("parseSendWindow — config robusta da platform_settings", () => {
  it("null/undefined → default", () => {
    expect(parseSendWindow(null)).toEqual(DEFAULT_SEND_WINDOW);
    expect(parseSendWindow(undefined)).toEqual(DEFAULT_SEND_WINDOW);
  });
  it("JSON string valido", () => {
    expect(parseSendWindow('{"days":[1,3,5],"startHour":9,"endHour":17,"timeZone":"Europe/Rome"}'))
      .toEqual({ days: [1, 3, 5], startHour: 9, endHour: 17, timeZone: "Europe/Rome" });
  });
  it("oggetto già parsato", () => {
    expect(parseSendWindow({ days: [2, 4], startHour: 10, endHour: 16, timeZone: "Europe/Paris" }))
      .toEqual({ days: [2, 4], startHour: 10, endHour: 16, timeZone: "Europe/Paris" });
  });
  it("JSON malformato → default (non lancia)", () => {
    expect(parseSendWindow("{non json")).toEqual(DEFAULT_SEND_WINDOW);
  });
  it("ore invalide (start>=end) → default su ore/tz validi", () => {
    const r = parseSendWindow({ days: [1], startHour: 20, endHour: 8, timeZone: "Europe/Rome" });
    expect(r.startHour).toBe(DEFAULT_SEND_WINDOW.startHour);
    expect(r.endHour).toBe(DEFAULT_SEND_WINDOW.endHour);
    expect(r.days).toEqual([1]);
  });
  it("giorni fuori range filtrati", () => {
    expect(parseSendWindow({ days: [1, 9, -2, 3] }).days).toEqual([1, 3]);
  });
  it("giorni vuoti → default", () => {
    expect(parseSendWindow({ days: [] }).days).toEqual(DEFAULT_SEND_WINDOW.days);
  });
  it("timeZone mancante → Europe/Rome", () => {
    expect(parseSendWindow({ days: [1, 2] }).timeZone).toBe("Europe/Rome");
  });
});

describe("minutoDelGiorno — minuti dalla mezzanotte locale", () => {
  it("estate (+2): 06:30Z = 08:30 a Roma = 510", () => {
    expect(minutoDelGiorno(new Date("2026-06-15T06:30:00Z"), "Europe/Rome")).toBe(510);
  });
  it("inverno (+1): 06:30Z = 07:30 a Roma = 450", () => {
    expect(minutoDelGiorno(new Date("2026-01-12T06:30:00Z"), "Europe/Rome")).toBe(450);
  });
  it("mezzanotte locale = 0", () => {
    expect(minutoDelGiorno(new Date("2026-06-14T22:00:00Z"), "Europe/Rome")).toBe(0);
  });
});

describe("finestraEffettiva — piattaforma ∩ brand", () => {
  const brand = { days: [1, 2, 3, 4, 5, 6], startHour: 7, endHour: 19, timeZone: "Europe/Rome" };
  it("senza brand vale la piattaforma", () => {
    expect(finestraEffettiva(DEFAULT_SEND_WINDOW, null)).toEqual(DEFAULT_SEND_WINDOW);
  });
  it("intersezione di giorni e ore (Lun-Sab 7-19 dentro Lun-Ven 8-19 = Lun-Ven 8-19)", () => {
    expect(finestraEffettiva(DEFAULT_SEND_WINDOW, brand)).toEqual({ days: [1, 2, 3, 4, 5], startHour: 8, endHour: 19, timeZone: "Europe/Rome" });
  });
  it("brand più stretto: vince il brand", () => {
    const stretto = { days: [2, 4], startHour: 9, endHour: 12, timeZone: "Europe/Rome" };
    expect(finestraEffettiva(DEFAULT_SEND_WINDOW, stretto)).toEqual({ days: [2, 4], startHour: 9, endHour: 12, timeZone: "Europe/Rome" });
  });
  it("nessuna sovrapposizione: resta la piattaforma, non una finestra vuota", () => {
    const sera = { days: [1, 2, 3, 4, 5], startHour: 20, endHour: 23, timeZone: "Europe/Rome" };
    expect(finestraEffettiva(DEFAULT_SEND_WINDOW, sera)).toEqual(DEFAULT_SEND_WINDOW);
  });
});

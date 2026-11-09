import { describe, expect, it } from "vitest";
import { parseSocialSchedule } from "@/lib/social/scheduling";
describe("giorno e ora del post", () => {
  it("una bozza senza data resta senza data", () => {
    expect(parseSocialSchedule("", "")).toEqual({ scheduledAt: "" });
    expect(parseSocialSchedule("", "09:00", { required: true }).error).toContain("giorno");
  });
  it("l'ora vuota e i dati malformati non lanciano eccezioni", () => {
    expect(parseSocialSchedule("2026-11-10", "").error).toContain("ora");
    expect(parseSocialSchedule("2026-02-31", "10:00").error).toContain("non esiste");
    expect(parseSocialSchedule("2026-11-10", "25:20").error).toContain("Controlla");
  });
  it("salva l'ora locale corretta e rifiuta programmazioni nel passato o troppo vicine", () => {
    const valid = parseSocialSchedule("2026-11-10", "10:30");
    expect(new Date(valid.scheduledAt!).getHours()).toBe(10);
    expect(parseSocialSchedule("2026-11-10", "10:30", { future: true, now: new Date("2026-11-10T10:29:30").getTime() }).error).toContain("minuto");
    expect(parseSocialSchedule("2026-11-10", "10:30", { future: true, now: new Date("2026-11-10T10:28:00").getTime() })).toEqual(valid);
  });
});

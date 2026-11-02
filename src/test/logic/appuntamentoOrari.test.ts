import { describe, expect, it } from "vitest";
import { durataTra, durateDisponibili, etichettaDurata, sovrapposizioni, titoloProposto } from "@/lib/appuntamenti/orari";

const impegni = [
  { title: "Rilievo", appointment_time: "09:00:00" as string | null, appointment_end_time: "10:00:00" as string | null },
  { title: "Senza fine", appointment_time: "14:00" as string | null, appointment_end_time: null as string | null },
  { title: "Senza ora", appointment_time: null as string | null },
];

describe("orari dell'appuntamento", () => {
  it("trova chi si sovrappone, non chi tocca solo il bordo", () => {
    expect(sovrapposizioni("09:30", "10:30", impegni).map((i) => i.title)).toEqual(["Rilievo"]);
    expect(sovrapposizioni("10:00", "11:00", impegni)).toEqual([]);
    expect(sovrapposizioni("08:00", "09:00", impegni)).toEqual([]);
    expect(sovrapposizioni("14:30", "16:00", impegni).map((i) => i.title)).toEqual(["Senza fine"]);
    expect(sovrapposizioni("", "", impegni)).toEqual([]);
  });

  it("senza fine l'appuntamento nuovo vale un'ora", () => {
    expect(sovrapposizioni("08:30", "", impegni).map((i) => i.title)).toEqual(["Rilievo"]);
  });

  it("durata dagli orari e sua etichetta", () => {
    expect(durataTra("09:00", "10:30")).toBe(90);
    expect(durataTra("10:00", "09:00")).toBeNull();
    expect(durataTra("", "09:00")).toBeNull();
    expect(etichettaDurata(30)).toBe("30 minuti");
    expect(etichettaDurata(60)).toBe("1 ora");
    expect(etichettaDurata(90)).toBe("1 ora e 30");
    expect(etichettaDurata(480)).toBe("8 ore");
  });

  it("una durata non prevista resta scelta invece di lasciare la tendina vuota", () => {
    expect(durateDisponibili([30, 60], 60)).toEqual([30, 60]);
    expect(durateDisponibili([30, 60], 45)).toEqual([30, 45, 60]);
    expect(durateDisponibili([30, 60], Number.NaN)).toEqual([30, 60]);
  });

  it("titolo proposto dalla commessa", () => {
    expect(titoloProposto("Sopralluogo", "C-1")).toBe("Sopralluogo — C-1");
  });
});

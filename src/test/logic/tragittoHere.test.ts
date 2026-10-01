import { describe, expect, it, vi } from "vitest";
import {
  percorsoHere, testoDistanza, testoDurata, tratteDaSezioniHere, urlPercorsoHere,
} from "../../../supabase/functions/_shared/tragitto";
import { distanzaLineaAria, testoKm } from "@/lib/opportunita/appuntamentoPrecompilato";

describe("tragitto con HERE", () => {
  it("scrive distanza e durata in italiano", () => {
    expect(testoDistanza(850)).toBe("850 m");
    expect(testoDistanza(5234)).toBe("5,2 km");
    expect(testoDistanza(0)).toBe("0 m");
    expect(testoDurata(40)).toBe("1 min");
    expect(testoDurata(12 * 60)).toBe("12 min");
    expect(testoDurata(3600)).toBe("1 ora");
    expect(testoDurata(3600 + 5 * 60)).toBe("1 ora 5 min");
    expect(testoDurata(2 * 3600 + 10 * 60)).toBe("2 ore 10 min");
  });

  it("trasforma le sezioni in tratte con la forma di Google", () => {
    expect(tratteDaSezioniHere([{ summary: { length: 12400, duration: 900 } }, { summary: { length: 300, duration: 60 } }])).toEqual([
      { distance_m: 12400, duration_s: 900, distance_text: "12,4 km", duration_text: "15 min" },
      { distance_m: 300, duration_s: 60, distance_text: "300 m", duration_text: "1 min" },
    ]);
    expect(tratteDaSezioniHere(undefined)).toEqual([]);
  });

  it("costruisce l'indirizzo con le tappe intermedie", () => {
    const url = urlPercorsoHere([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, { lat: 5, lng: 6 }], "K");
    expect(url).toContain("origin=1%2C2");
    expect(url).toContain("destination=5%2C6");
    expect(url).toContain("&via=3,4");
  });

  it("chiede il percorso, e torna null se HERE sbaglia", async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [{ sections: [{ summary: { length: 5000, duration: 600 } }] }] }) });
    const tratte = await percorsoHere([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }], "K", ok as unknown as typeof fetch);
    expect(tratte?.[0].distance_text).toBe("5,0 km");
    const ko = vi.fn().mockResolvedValue({ ok: false });
    expect(await percorsoHere([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }], "K", ko as unknown as typeof fetch)).toBeNull();
    const vuoto = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [] as unknown[] }) });
    expect(await percorsoHere([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }], "K", vuoto as unknown as typeof fetch)).toBeNull();
    const rotto = vi.fn().mockRejectedValue(new Error("rete"));
    expect(await percorsoHere([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }], "K", rotto as unknown as typeof fetch)).toBeNull();
    expect(await percorsoHere([{ lat: 1, lng: 2 }], "K")).toBeNull();
    expect(await percorsoHere([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }], "")).toBeNull();
  });

  it("stima la distanza in linea d'aria", () => {
    // Milano - Lodi: circa 30 km
    const km = distanzaLineaAria(45.4642, 9.19, 45.3138, 9.5035);
    expect(km).toBeGreaterThan(27);
    expect(km).toBeLessThan(33);
    expect(distanzaLineaAria(45, 9, 45, 9)).toBe(0);
    expect(testoKm(5234)).toBe("5,2 km");
    expect(testoKm(420)).toBe("420 m");
  });
});

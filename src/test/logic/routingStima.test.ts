import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { getRoute, stimaPercorso } from "@/lib/routing";

afterEach(() => { invoke.mockReset(); vi.unstubAllGlobals(); });

// San Donato Milanese → Corso Lodi (Milano) → Segrate
const punti = [{ lat: 45.41783, lng: 9.27544 }, { lat: 45.44202, lng: 9.21939 }, { lat: 45.486, lng: 9.293 }];

describe("Percorsi: HERE solo su richiesta (26/11/2026)", () => {
  it("di base è una stima e non chiama nessun servizio", async () => {
    const fetchFinto = vi.fn();
    vi.stubGlobal("fetch", fetchFinto);
    const r = await getRoute(punti);
    expect(invoke).not.toHaveBeenCalled();
    expect(fetchFinto).not.toHaveBeenCalled();
    expect(r?.provider).toBe("stima");
    expect(r?.legs).toHaveLength(2);
    // ~5,1 km in linea d'aria × 1,3 ≈ 6,6 km; a 45 km/h ≈ 9 minuti.
    expect(r!.legs![0].distanceMeters).toBeGreaterThan(6_000);
    expect(r!.legs![0].distanceMeters).toBeLessThan(7_200);
    expect(Math.round(r!.legs![0].durationSec / 60)).toBeGreaterThanOrEqual(8);
    expect(r!.distanceMeters).toBe(r!.legs![0].distanceMeters + r!.legs![1].distanceMeters);
  });

  it("con { strada: true } chiede la strada vera (HERE)", async () => {
    invoke.mockResolvedValue({ data: { coordinates: [[45.4, 9.2]], durationSec: 900, distanceMeters: 7_600, legs: [] }, error: null });
    const r = await getRoute(punti.slice(0, 2), { strada: true });
    expect(invoke).toHaveBeenCalledWith("geo-router", { body: { action: "route", waypoints: punti.slice(0, 2) } });
    expect(r?.provider).toBe("here");
    expect(r?.distanceMeters).toBe(7_600);
  });

  it("se HERE e OSRM non rispondono, anche la richiesta esplicita ripiega sulla stima", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("giù") });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const r = await getRoute(punti.slice(0, 2), { strada: true });
    expect(r?.provider).toBe("stima");
  });

  it("meno di due punti: niente percorso", () => {
    expect(stimaPercorso([punti[0]])).toBeNull();
  });
});

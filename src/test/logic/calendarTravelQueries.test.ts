import { beforeEach, describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({
  company: "company" as string | null,
  user: "me" as string | null,
  calendar: true,
  requestedAddress: null as string | null,
  base: { lat: 45, lng: 9, label: "Sede" } as {
    lat: number;
    lng: number;
    label: string;
  } | null,
  cachedRoute: undefined as
    | { km: number; minutes: number; source: "percorso" }
    | undefined,
  options: [] as {
    queryKey: unknown[];
    enabled: boolean;
    queryFn: (context: { signal: AbortSignal }) => Promise<unknown>;
  }[],
  from: vi.fn(),
}));
vi.mock("react", () => ({
  useState: () => [
    state.requestedAddress,
    (value: string) => {
      state.requestedAddress = value;
    },
  ],
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: state.company ? { id: state.company } : null,
    user: state.user ? { id: state.user } : null,
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewCalendar: state.calendar, isLoading: false }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (q: (typeof state.options)[number]) => {
    state.options.push(q);
    return {
      data:
        q.queryKey[0] === "calendar-travel-base"
          ? state.base
          : state.cachedRoute,
      isError: false,
      isSuccess: true,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: state.from },
}));
vi.mock("@/lib/routing", () => ({ getRoute: vi.fn() }));
vi.mock("@/lib/geocoding", () => ({ forwardGeocode: vi.fn() }));
import { useCalendarTravel } from "@/hooks/useCalendarTravel";
import { getRoute } from "@/lib/routing";
import { forwardGeocode } from "@/lib/geocoding";
import type { CalendarOrder } from "@/types/calendar";
beforeEach(() => {
  state.company = "company";
  state.user = "me";
  state.calendar = true;
  state.requestedAddress = null;
  state.base = { lat: 45, lng: 9, label: "Sede" };
  state.cachedRoute = undefined;
  state.options = [];
  state.from.mockClear();
  vi.mocked(forwardGeocode).mockReset();
  vi.mocked(getRoute).mockReset();
});
describe("Percorsi del calendario per indirizzo e sede effettivi", () => {
  it("senza coordinate della sede non inventa km o minuti da Milano", () => {
    state.base = null;
    const q = useCalendarTravel({
      type: "lavoro",
      color: "",
      order: { indirizzo_lavori: "Via Roma 10" } as CalendarOrder,
    });
    expect(q.missingBase).toBe(true);
    expect(q.canCalculate).toBe(false);
    expect(q.data).toBeNull();
    expect(state.options.at(-1)!.enabled).toBe(false);
  });
  it("distanza e tempo salvati nella commessa prevalgono su un percorso precedente in cache", () => {
    state.cachedRoute = { km: 1, minutes: 2, source: "percorso" };
    const q = useCalendarTravel({
      type: "lavoro",
      color: "",
      order: {
        indirizzo_lavori: "Via Roma 10",
        distanza_sede_km: 24,
        distanza_sede_minuti: 40,
      } as CalendarOrder,
    });
    expect(q.data).toMatchObject({ km: 24, minutes: 40, source: "commessa" });
    expect(state.options.at(-1)!.enabled).toBe(false);
  });
  it("gli appuntamenti hanno percorsi separati per indirizzo e coordinate, compreso lo zero", () => {
    useCalendarTravel({
      type: "appointment",
      color: "",
      appointment: {
        formatted_address: "Via Nuova 5",
        lat: 0,
        lng: 1,
      } as never,
    });
    const query = state.options.at(-1)!;
    expect(query.enabled).toBe(true);
    expect(query.queryKey).toEqual([
      "calendar-event-route-v1",
      "company",
      "me",
      "Via Nuova 5",
      0,
      1,
      45,
      9,
    ]);
  });
  it("logout blocca il calcolo e nasconde i dati del percorso precedente", async () => {
    state.user = null;
    state.cachedRoute = { km: 1, minutes: 2, source: "percorso" };
    const q = useCalendarTravel({
      type: "lavoro",
      color: "",
      order: { indirizzo_lavori: "Via Roma 10" } as CalendarOrder,
    });
    expect(q.data).toBeNull();
    expect(state.options.every((q) => !q.enabled)).toBe(true);
    await expect(
      state.options[0].queryFn({ signal: new AbortController().signal }),
    ).rejects.toThrow("Sede non accessibile");
    expect(state.from).not.toHaveBeenCalled();
  });
  it("calcola km e minuti dall'indirizzo selezionato alla sede effettiva", async () => {
    const event = {
      type: "lavoro" as const,
      color: "",
      order: { indirizzo_lavori: "Via Roma 22" } as CalendarOrder,
    };
    const first = useCalendarTravel(event);
    expect(state.options.at(-1)!.enabled).toBe(false);
    first.calculate();
    vi.mocked(forwardGeocode).mockResolvedValue({ lat: 46, lng: 10 });
    vi.mocked(getRoute).mockResolvedValue({
      distanceMeters: 24780,
      durationSec: 2370,
      coordinates: [],
      durationLabel: "40 minuti",
      provider: "here",
    });
    useCalendarTravel(event);
    const query = state.options.at(-1)!;
    expect(query.enabled).toBe(true);
    const result = await query.queryFn({
      signal: new AbortController().signal,
    });
    expect(forwardGeocode).toHaveBeenCalledWith("Via Roma 22");
    expect(getRoute).toHaveBeenCalledWith([
      { lat: 45, lng: 9, label: "Sede" },
      { lat: 46, lng: 10 },
    ]);
    expect(result).toEqual({ km: 24.8, minutes: 40, source: "percorso" });
  });
  it("la richiesta di calcolo non si trasferisce a un altro indirizzo o account", () => {
    const event = {
      type: "lavoro" as const,
      color: "",
      order: { indirizzo_lavori: "Via Roma 22" } as CalendarOrder,
    };
    useCalendarTravel(event).calculate();
    useCalendarTravel({
      ...event,
      order: { indirizzo_lavori: "Via Nuova 5" } as CalendarOrder,
    });
    expect(state.options.at(-1)!.enabled).toBe(false);
    state.company = "other-company";
    useCalendarTravel(event);
    expect(state.options.at(-1)!.enabled).toBe(false);
  });
});

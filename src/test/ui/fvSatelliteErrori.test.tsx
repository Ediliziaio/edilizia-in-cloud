import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSatelliteFv } from "@/components/fotovoltaico/tetto/useSatelliteFv";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock(
  "@/integrations/supabase/client",
  () => ({ supabase: { functions: { invoke } } }),
);

beforeEach(() => invoke.mockReset());

describe("vista satellitare fotovoltaico", () => {
  it("mostra la causa leggibile restituita dal proxy", async () => {
    const message = "Google Maps richiede una fatturazione attiva.";
    invoke.mockResolvedValue({
      data: {
        error: "static_map_unavailable",
        google_error: "fatturazione",
        message,
      },
      error: null,
    });
    const { result } = renderHook(() =>
      useSatelliteFv({ lat: 45, lng: 9 }, 20)
    );
    await waitFor(() => expect(result.current.caricando).toBe(false));
    expect(result.current.errore).toBe(message);
    expect(result.current.url).toBeNull();
  });

  it("usa soltanto la vista Google con il riferimento metrico atteso", async () => {
    invoke.mockResolvedValue({
      data: { provider: "here", dataUrl: "data:image/png;base64,iVBORw==" },
      error: null,
    });
    const { result } = renderHook(() =>
      useSatelliteFv({ lat: 45, lng: 9 }, 20)
    );
    await waitFor(() => expect(result.current.caricando).toBe(false));
    expect(result.current.url).toBeNull();
    expect(result.current.errore).toContain("non disponibile");
    expect(invoke.mock.calls[0][1].body.solo_google).toBe(true);
  });

  it("visualizza la risposta Google valida", async () => {
    const dataUrl = "data:image/png;base64,iVBORw==";
    invoke.mockResolvedValue({
      data: { provider: "google", dataUrl },
      error: null,
    });
    const { result } = renderHook(() =>
      useSatelliteFv({ lat: 45, lng: 9 }, 20)
    );
    await waitFor(() => expect(result.current.caricando).toBe(false));
    expect(result.current.url).toBe(dataUrl);
    expect(result.current.errore).toBe("");
  });
});

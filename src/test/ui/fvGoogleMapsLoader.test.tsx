import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock(
  "@/integrations/supabase/client",
  () => ({ supabase: { functions: { invoke } } }),
);
type GoogleWindow = Window & {
  google?: { maps: { Map: unknown } };
  __eicFvMapsReady?: () => void;
  gm_authFailure?: () => void;
};
const ambiente = window as GoogleWindow;
beforeEach(() => {
  vi.resetModules();
  invoke.mockReset();
  invoke.mockResolvedValue({
    data: { configured: true, key: "AIza" + "b".repeat(35) },
    error: null,
  });
});
afterEach(() => {
  document.getElementById("eic-fv-google-maps")?.remove();
  delete ambiente.google;
  delete ambiente.__eicFvMapsReady;
  delete ambiente.gm_authFailure;
  vi.useRealTimers();
});
describe("caricamento SDK Google ufficiale", () => {
  it("condivide un solo caricamento e usa la chiave browser dedicata", async () => {
    const { caricaGoogleMapsFv } = await import(
      "@/components/fotovoltaico/tetto/googleMapsJsFv"
    );
    const uno = caricaGoogleMapsFv(), due = caricaGoogleMapsFv();
    expect(uno).toBe(due);
    await vi.waitFor(() =>
      expect(document.getElementById("eic-fv-google-maps")).toBeTruthy()
    );
    const script = document.getElementById(
      "eic-fv-google-maps",
    ) as HTMLScriptElement;
    const url = new URL(script.src);
    expect(url.origin).toBe("https://maps.googleapis.com");
    expect(url.searchParams.get("libraries")).toBeNull();
    expect(url.searchParams.get("key")).toBe("AIza" + "b".repeat(35));
    expect(invoke).toHaveBeenCalledWith(
      "maps-proxy",
      expect.objectContaining({ body: { action: "browserconfig" } }),
    );
    ambiente.google = { maps: { Map: class {} } };
    ambiente.__eicFvMapsReady!();
    expect(await uno).toBe(ambiente.google.maps);
  });
  it("non carica lo script senza una chiave dedicata e consente di riprovare", async () => {
    invoke.mockResolvedValueOnce({
      data: { configured: false, message: "Mappa non configurata" },
      error: null,
    });
    const { caricaGoogleMapsFv } = await import(
      "@/components/fotovoltaico/tetto/googleMapsJsFv"
    );
    await expect(caricaGoogleMapsFv()).rejects.toThrow("Mappa non configurata");
    expect(document.getElementById("eic-fv-google-maps")).toBeNull();
    invoke.mockResolvedValueOnce({ data: null, error: Error("sessione") });
    await expect(caricaGoogleMapsFv()).rejects.toThrow("sessione");
    expect(invoke).toHaveBeenCalledTimes(2);
  });
  it("interrompe lo script bloccato e libera il tentativo successivo", async () => {
    vi.useFakeTimers();
    const { caricaGoogleMapsFv } = await import(
      "@/components/fotovoltaico/tetto/googleMapsJsFv"
    );
    const caricamento = caricaGoogleMapsFv();
    const esito = expect(caricamento).rejects.toThrow("tempo");
    await vi.advanceTimersByTimeAsync(20001);
    await esito;
    expect(document.getElementById("eic-fv-google-maps")).toBeNull();
  });
  it("propaga l’errore di autorizzazione solo ai componenti ancora montati", async () => {
    const { ascoltaErroreGoogleFv, caricaGoogleMapsFv } = await import(
      "@/components/fotovoltaico/tetto/googleMapsJsFv"
    );
    ambiente.google = { maps: { Map: class {} } };
    await caricaGoogleMapsFv();
    const a = vi.fn(), b = vi.fn(), scollega = ascoltaErroreGoogleFv(a);
    ascoltaErroreGoogleFv(b);
    scollega();
    ambiente.gm_authFailure!();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });
});

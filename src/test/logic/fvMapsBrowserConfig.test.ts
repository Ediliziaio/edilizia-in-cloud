import { describe, expect, it, vi } from "vitest";
import { configurazioneMapsBrowser } from "../../../supabase/functions/_shared/mapsBrowserConfig";
import {
  coordinateDaMetri,
  coordinateDaPixel,
  metriDaCoordinate,
  pixelDaCoordinate,
} from "../../../supabase/functions/_shared/fvMappa";
import { riferimentoMappaGoogleFv } from "@/components/fotovoltaico/tetto/riferimentoMappaGoogle";
import { pixelMondo } from "@/components/fotovoltaico/tetto/rilievoLocale";

describe("chiave browser dedicata per Google Maps", () => {
  const server = "AIza" + "s".repeat(35), browser = "AIza" + "b".repeat(35);
  it("non ripiega sulla chiave server quando manca quella browser", async () => {
    const leggi = vi.fn(async (nome: string) =>
      nome === "google_maps_api_key" ? server : ""
    );
    expect(await configurazioneMapsBrowser(leggi)).toMatchObject({
      configured: false,
    });
    expect(leggi).toHaveBeenCalledTimes(1);
    expect(leggi).toHaveBeenCalledWith(
      "google_maps_browser_key",
      "GOOGLE_MAPS_BROWSER_KEY",
    );
  });
  it.each([server, "una-chiave-invalida"])(
    "non pubblica la credenziale server né un valore malformato",
    async (key) => {
      const result = await configurazioneMapsBrowser(async (nome) =>
        nome === "google_maps_browser_key" ? key : server
      );
      expect(result.configured).toBe(false);
      expect(result).not.toHaveProperty("key");
      expect(JSON.stringify(result)).not.toContain(server);
    },
  );
  it("restituisce soltanto la chiave dedicata, mai quella server", async () => {
    expect(
      await configurazioneMapsBrowser(async (nome) =>
        nome === "google_maps_browser_key" ? browser : server
      ),
    ).toEqual({ configured: true, key: browser });
  });
});

describe("metri del tetto e pixel CSS reali del viewport Google", () => {
  const origine = { lat: 45.46378, lng: 9.18983 };
  it.each([375, 768, 1280])(
    "mantiene il riferimento metrico con viewport %ipx, pan e zoom",
    (w) => {
      const h = w * 440 / 640;
      for (const zoom of [17, 20, 21]) {
        for (const spostamento of [{ x: 0, y: 0 }, { x: 30, y: -20 }]) {
          const centro = coordinateDaMetri(spostamento, origine);
          const frame = riferimentoMappaGoogleFv(origine, centro, zoom, {
            w,
            h,
          });
          expect(frame.url).toBe("");
          expect(frame.larghezza).toBe(w);
          expect(frame.altezza).toBe(h);
          for (const metri of [{ x: -10, y: -7 }, { x: 10, y: 7 }]) {
            const coordinate = coordinateDaMetri(metri, origine),
              pixel = pixelDaCoordinate(coordinate, centro, zoom, w, h);
            const ritorno = metriDaCoordinate(
              coordinateDaPixel(pixel, centro, zoom, w, h),
              origine,
            );
            expect(ritorno.x).toBeCloseTo(metri.x, 5);
            expect(ritorno.y).toBeCloseTo(metri.y, 5);
            const sullaFoto = pixelMondo(frame.affine, pixel);
            expect(Math.abs(sullaFoto.x - metri.x)).toBeLessThan(.05);
            expect(Math.abs(sullaFoto.y - metri.y)).toBeLessThan(.05);
          }
        }
      }
    },
  );
});

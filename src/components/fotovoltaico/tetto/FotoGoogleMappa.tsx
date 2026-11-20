import { useMemo } from "react";
import { useSatelliteFv } from "./useSatelliteFv";
import {
  coordinateDaPixel,
  metriDaCoordinate,
} from "../../../../supabase/functions/_shared/fvMappa";
import { edificioDaMappaFv } from "./mappaGeometria";
import { FotoTettoReale } from "./FotoTettoReale";
import { RilievoContext } from "./RilievoContext";
import type { RilievoRuntime } from "./rilievoLocale";
export function FotoGoogleMappa(props: Parameters<typeof FotoTettoReale>[0]) {
  const mappa = props.piano.mappa!,
    satellite = useSatelliteFv(mappa.origine, 20);
  const runtime = useMemo<RilievoRuntime>(() => {
    const a = metriDaCoordinate(
        coordinateDaPixel({ x: 0, y: 0 }, mappa.origine, 20),
        mappa.origine,
      ),
      b = metriDaCoordinate(
        coordinateDaPixel({ x: 640, y: 440 }, mappa.origine, 20),
        mappa.origine,
      );
    return {
      edificio: edificioDaMappaFv(mappa),
      orto: satellite.url
        ? {
          url: satellite.url,
          larghezza: 640,
          altezza: 440,
          affine: [(b.x - a.x) / 640, 0, a.x, 0, (b.y - a.y) / 440, a.y],
          nome: "Google Maps · vista satellitare",
        }
        : null,
      modello: null,
      fonte: null,
    };
  }, [mappa, satellite.url]);
  return (
    <>
      <p className="mb-2 text-xs text-slate-600">
        Posa sulla falda inclinata, proiettata sulla vista satellitare. Bordi,
        ostacoli e spazi fra i moduli seguono il disegno metrico.
      </p>
      {satellite.caricando && <p role="status">Caricamento del tetto…</p>}
      {satellite.errore && (
        <p role="status">
          {satellite.errore}{" "}
          <button
            type="button"
            className="underline"
            onClick={satellite.riprova}
          >
            Riprova
          </button>
        </p>
      )}
      <RilievoContext.Provider value={runtime}>
        <FotoTettoReale {...props} mostraImmagineIntera />
      </RilievoContext.Provider>
    </>
  );
}

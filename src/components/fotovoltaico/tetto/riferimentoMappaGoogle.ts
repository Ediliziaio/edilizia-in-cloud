import {
  coordinateDaPixel,
  metriDaCoordinate,
  type PosizioneMappaFv,
} from "../../../../supabase/functions/_shared/fvMappa";
import type { OrtoRuntime } from "./rilievoLocale";

/** Solo riferimento metrico dell’overlay: nessuna immagine o tile Google salvata. */
export function riferimentoMappaGoogleFv(
  origine: PosizioneMappaFv,
  centro: PosizioneMappaFv,
  zoom: number,
  { w, h }: { w: number; h: number },
): OrtoRuntime {
  const a = metriDaCoordinate(
    coordinateDaPixel({ x: 0, y: 0 }, centro, zoom, w, h),
    origine,
  );
  const b = metriDaCoordinate(
    coordinateDaPixel({ x: w, y: h }, centro, zoom, w, h),
    origine,
  );
  return {
    url: "",
    larghezza: w,
    altezza: h,
    affine: [(b.x - a.x) / w, 0, a.x, 0, (b.y - a.y) / h, a.y],
    nome: "Google Maps · riferimento metrico",
  };
}

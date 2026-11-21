import type { DisegnoCommercialeFv } from "./fvDisegnoCommerciale.ts";

/** Un tetto dalla mappa non significa che sia stato preparato anche il 3D. */
export function vistePdfTetto(piano: DisegnoCommercialeFv) {
  return {
    satellite: !!piano.mappa && (piano.vistePdf?.satellite ?? true),
    pianta: piano.vistePdf?.pianta ?? true,
    treD: !!piano.mappa && (piano.vistePdf?.treD ?? !!piano.schema3d),
  };
}

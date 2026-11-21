import type { LibreriaMapsFv } from "./googleMapsJsFv";
import type { PosizioneMappaFv } from "../../../../supabase/functions/_shared/fvMappa";

const cache = new WeakMap<LibreriaMapsFv, Map<string, Promise<number>>>();

/** La risoluzione satellitare varia per località: una tile grigia può arrivare
 * con HTTP 200 e tilesloaded. Usa il limite ufficiale se disponibile. Il suo
 * servizio di metadati può fallire anche quando la foto Google funziona:
 * in quel caso conserva il dettaglio prudente 20, senza bloccare la mappa.
 * Autenticazione, immagini e allineamento restano verificati dal chiamante. */
export function massimoZoomGoogleFv(api: LibreriaMapsFv, centro: PosizioneMappaFv): Promise<number> {
  if (!api.MaxZoomService) return Promise.resolve(20);
  let risultati = cache.get(api);
  if (!risultati) { risultati = new Map(); cache.set(api, risultati); }
  const chiave = `${centro.lat.toFixed(5)}:${centro.lng.toFixed(5)}`;
  const precedente = risultati.get(chiave);
  if (precedente) return precedente;
  const errore = "Google non ha confermato il dettaglio satellitare disponibile. Riprova la mappa prima di stampare.";
  const lavoro = new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errore)), 5000);
    try {
      new api.MaxZoomService!().getMaxZoomAtLatLng(centro, result => {
        clearTimeout(timer);
        if (result.status !== "OK" || !Number.isInteger(result.zoom) || result.zoom! < 1 || result.zoom! > 30) reject(new Error(errore));
        else resolve(Math.min(21, result.zoom!));
      });
    } catch { clearTimeout(timer); reject(new Error(errore)); }
  }).catch(() => { risultati!.delete(chiave); return 20; });
  if (risultati.size >= 100) risultati.delete(risultati.keys().next().value!);
  risultati.set(chiave, lavoro);
  return lavoro;
}

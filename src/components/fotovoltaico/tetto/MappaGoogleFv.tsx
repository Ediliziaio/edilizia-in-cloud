import { useEffect, useRef } from "react";
import type { PosizioneMappaFv } from "../../../../supabase/functions/_shared/fvMappa";
import {
  ascoltaErroreGoogleFv,
  caricaGoogleMapsFv,
  type MappaGoogleFvApi,
} from "./googleMapsJsFv";

export type StatoMappaGoogleFv = {
  caricando: boolean;
  pronto: boolean;
  errore: string;
};
export type DimensioniMappaGoogleFv = { w: number; h: number };
type Props = {
  centro: PosizioneMappaFv;
  zoom: number;
  /** Cambia soltanto per comandi esterni, mai per il ritorno della camera nativa. */
  comandoVista: number;
  navigabile: boolean;
  onVista?: (centro: PosizioneMappaFv, zoom: number) => void;
  onDimensioni: (dimensioni: DimensioniMappaGoogleFv) => void;
  onStato: (stato: StatoMappaGoogleFv) => void;
};
export function MappaGoogleFv(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    mappa = useRef<MappaGoogleFvApi | null>(null),
    correnti = useRef(props);
  useEffect(() => {
    correnti.current = props;
  });
  useEffect(() => {
    let attivo = true, authFallita = false;
    let attesaImmagini: ReturnType<typeof setTimeout> | undefined;
    const listeners: Array<{ remove: () => void }> = [];
    props.onStato({ caricando: true, pronto: false, errore: "" });
    const scollegaAuth = ascoltaErroreGoogleFv(() => {
      authFallita = true;
      clearTimeout(attesaImmagini);
      if (attivo) {
        correnti.current.onStato({
          caricando: false,
          pronto: false,
          errore:
            "Google non ha autorizzato la mappa. Chiedi all’amministratore di verificare la chiave browser e i domini consentiti.",
        });
      }
    });
    const dimensioni = () => {
      if (!host.current) return;
      const { width, height } = host.current.getBoundingClientRect();
      if (width > 0 && height > 0) {
        correnti.current.onDimensioni({ w: width, h: height });
      }
    };
    dimensioni();
    const observer = typeof ResizeObserver === "function"
      ? new ResizeObserver(dimensioni)
      : null;
    if (host.current) observer?.observe(host.current);
    void caricaGoogleMapsFv().then((api) => {
      if (!attivo || !host.current) return;
      const p = correnti.current;
      const map = new api.Map(host.current, {
        center: p.centro,
        zoom: p.zoom,
        mapTypeId: "satellite",
        tilt: 0,
        heading: 0,
        disableDefaultUI: true,
        clickableIcons: false,
        keyboardShortcuts: false,
        disableDoubleClickZoom: true,
        gestureHandling: p.navigabile ? "greedy" : "none",
        draggable: p.navigabile,
        scrollwheel: p.navigabile,
        isFractionalZoomEnabled: false,
        minZoom: 17,
        maxZoom: 21,
      });
      mappa.current = map;
      attesaImmagini = setTimeout(() => {
        if (attivo && !authFallita) {
          correnti.current.onStato({
            caricando: false,
            pronto: false,
            errore:
              "Le immagini del tetto non sono arrivate. Controlla la connessione e riprova.",
          });
        }
      }, 20000);
      listeners.push(map.addListener("bounds_changed", () => {
        const c = map.getCenter()?.toJSON(), z = map.getZoom();
        if (attivo && c && z != null) correnti.current.onVista?.(c, z);
      }));
      listeners.push(map.addListener("tilesloaded", () => {
        clearTimeout(attesaImmagini);
        if (attivo && !authFallita) {
          correnti.current.onStato({
            caricando: false,
            pronto: true,
            errore: "",
          });
        }
      }));
      dimensioni();
    }).catch((errore: unknown) => {
      if (attivo) {
        correnti.current.onStato({
          caricando: false,
          pronto: false,
          errore: errore instanceof Error
            ? errore.message
            : "Mappa Google non disponibile. Riprova.",
        });
      }
    });
    return () => {
      attivo = false;
      clearTimeout(attesaImmagini);
      observer?.disconnect();
      scollegaAuth();
      listeners.forEach((l) => l.remove());
      mappa.current?.unbindAll();
      mappa.current = null;
    };
    // L’istanza resta stabile durante pan/zoom e resize; le opzioni correnti sono aggiornate sotto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const map = mappa.current,
      p = correnti.current,
      c = map?.getCenter()?.toJSON();
    if (
      map &&
      (!c || Math.abs(c.lat - p.centro.lat) > 1e-9 ||
        Math.abs(c.lng - p.centro.lng) > 1e-9)
    ) map.setCenter(p.centro);
    if (map && map.getZoom() !== p.zoom) map.setZoom(p.zoom);
  }, [props.comandoVista]);
  useEffect(() => {
    const map = mappa.current;
    map?.setOptions({
      gestureHandling: props.navigabile ? "greedy" : "none",
      draggable: props.navigabile,
      scrollwheel: props.navigabile,
    });
  }, [props.navigabile]);
  return (
    <div
      ref={host}
      className="absolute inset-0"
      role="region"
      aria-label="Google Maps: vista satellitare interattiva"
    />
  );
}

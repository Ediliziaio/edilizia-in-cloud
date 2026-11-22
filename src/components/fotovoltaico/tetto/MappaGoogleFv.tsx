import { useCallback, useEffect, useRef } from "react";
import type { PosizioneMappaFv } from "../../../../supabase/functions/_shared/fvMappa";
import {
  ascoltaErroreGoogleFv,
  caricaGoogleMapsFv,
  type MappaGoogleFvApi,
  type LibreriaMapsFv,
} from "./googleMapsJsFv";
import { massimoZoomGoogleFv } from "./massimoZoomGoogleFv";

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
  const libreria = useRef<LibreriaMapsFv | null>(null), versioneVista = useRef(0);
  const applicaVista = useCallback((map: MappaGoogleFvApi, api: LibreriaMapsFv, p: Props) => {
    const versione = ++versioneVista.current, partenza = map.getCenter()?.toJSON(), zoomPartenza = map.getZoom();
    const applica = (massimo: number) => {
      const adesso = map.getCenter()?.toJSON();
      if (mappa.current !== map || versione !== versioneVista.current || (partenza && adesso && (Math.abs(partenza.lat - adesso.lat) > 1e-9 || Math.abs(partenza.lng - adesso.lng) > 1e-9)) || map.getZoom() !== zoomPartenza) return;
      const zoom = Math.min(p.zoom, massimo);
      map.setOptions({ maxZoom: massimo, minZoom: Math.min(17, massimo) });
      if (!adesso || Math.abs(adesso.lat - p.centro.lat) > 1e-9 || Math.abs(adesso.lng - p.centro.lng) > 1e-9) map.setCenter(p.centro);
      if (map.getZoom() !== zoom) map.setZoom(zoom);
      if (zoom !== p.zoom) correnti.current.onVista?.(p.centro, zoom);
    };
    if (!api.MaxZoomService) applica(20);
    else void massimoZoomGoogleFv(api, p.centro).then(applica).catch(e => {
      if (mappa.current === map && versione === versioneVista.current) correnti.current.onStato({caricando:false,pronto:false,errore:e instanceof Error ? e.message : "Dettaglio satellitare non disponibile. Riprova."});
    });
  }, []);
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
    let avviata = false;
    const avvia = () => {
      if (!attivo || avviata) return;
      avviata = true;
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
        libreria.current = api;
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
        applicaVista(map, api, p);
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
    };
    // Su telefono la mappa può trovarsi sotto la piega: il tempo per ricevere
    // le immagini decorre quando l'utente la raggiunge, non mentre è nascosta.
    const visibilita = typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries, observer) => {
        if (!attivo) return;
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect();
          avvia();
        }
      })
      : null;
    if (host.current && visibilita) visibilita.observe(host.current);
    else avvia();
    return () => {
      attivo = false;
      clearTimeout(attesaImmagini);
      visibilita?.disconnect();
      observer?.disconnect();
      scollegaAuth();
      listeners.forEach((l) => l.remove());
      mappa.current?.unbindAll();
      mappa.current = null;
      libreria.current = null;
    };
    // L’istanza resta stabile durante pan/zoom e resize; le opzioni correnti sono aggiornate sotto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (mappa.current && libreria.current) applicaVista(mappa.current, libreria.current, correnti.current);
  }, [props.comandoVista, applicaVista]);
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

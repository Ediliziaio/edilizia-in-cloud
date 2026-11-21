import { ascoltaErroreGoogleFv, caricaGoogleMapsFv, type MappaGoogleFvApi } from "@/components/fotovoltaico/tetto/googleMapsJsFv";

const preparazioni = new WeakMap<Document, Promise<() => void>>();

/** SDK Google ufficiale, stesso servizio e chiave limitata della mappa del tetto.
 * Nessun download di tile, screenshot o salvataggio dell'immagine. Il documento
 * salva soltanto inquadratura e overlay; la stampa attende le immagini reali. */
export function preparaMappeDocumentoFv(doc: Document, signal?: AbortSignal): Promise<() => void> {
  const hosts = [...(doc.querySelectorAll?.<HTMLElement>("[data-fv-google-pdf]") ?? [])];
  if (!hosts.length) return Promise.resolve(() => {});
  const esistente = preparazioni.get(doc);
  if (esistente) return esistente;
  const pulizie: Array<() => void> = [];
  const pulisci = () => { pulizie.splice(0).forEach(fn => fn()); preparazioni.delete(doc); };
  const lavoro = (async () => {
    const api = await caricaGoogleMapsFv();
    if (signal?.aborted) throw new Error("Caricamento mappa annullato.");
    await Promise.all(hosts.map(async host => {
      const c = JSON.parse(decodeURIComponent(host.dataset.fvGooglePdf ?? ""));
      if (!Number.isFinite(c.centro?.lat) || Math.abs(c.centro.lat) > 80 || !Number.isFinite(c.centro.lng) || Math.abs(c.centro.lng) > 180 || !Number.isInteger(c.zoom) || c.zoom < 1 || c.zoom > 21 || c.w !== 640 || c.h !== 440) throw new Error("Riferimento della mappa nel documento non valido.");
      const frame = host.querySelector<HTMLElement>("[data-fv-google-frame]")!, nodo = host.querySelector<HTMLElement>("[data-fv-google-map]")!, status = host.querySelector<HTMLElement>("[data-fv-google-status]");
      if (!frame || !nodo) throw new Error("Vista Google del documento incompleta.");
      if (status) { status.hidden = false; status.textContent = "Caricamento della vista Google del tetto…"; }
      const ridimensiona = () => {
        const scala = Math.min(host.clientWidth / c.w, host.clientHeight / c.h);
        frame.style.transform = `translate(-50%,-50%) scale(${scala || 1})`;
      };
      ridimensiona();
      const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(ridimensiona) : null;
      observer?.observe(host);
      let map: MappaGoogleFvApi | undefined;
      pulizie.push(() => { observer?.disconnect(); if (map) { api.event?.clearInstanceListeners(map); map.unbindAll(); } nodo.replaceChildren(); delete host.dataset.fvGoogleReady; });
      await new Promise<void>((resolve, reject) => {
        let finito = false;
        const termina = (errore?: string) => {
          if (finito) return;
          finito = true; clearTimeout(timer); listener?.remove(); listener = undefined; scollega(); signal?.removeEventListener("abort", annulla);
          if (errore) { if (status) status.textContent = errore; reject(new Error(errore)); }
          else {
            // Lo stile generato dall'SDK può essere nel documento dell'app.
            // Lo stesso stile serve nella cornice di anteprima/stampa, senza script.
            if (doc !== document) for (const style of document.querySelectorAll("style")) if (style.textContent?.includes(".gm-style") && !doc.querySelector(`style[data-fv-google-style="${[...document.querySelectorAll("style")].indexOf(style)}"]`)) {
              const copia = doc.createElement("style"); copia.dataset.fvGoogleStyle = String([...document.querySelectorAll("style")].indexOf(style)); copia.textContent = style.textContent; doc.head.appendChild(copia);
            }
            host.dataset.fvGoogleReady = "true"; if (status) status.hidden = true; resolve();
          }
        };
        const annulla = () => termina("Caricamento mappa annullato.");
        const timer = setTimeout(() => termina("Le immagini Google del tetto non sono arrivate. Riprova prima di stampare."), 20000);
        const scollega = ascoltaErroreGoogleFv(() => termina("Google non ha autorizzato la mappa. Verifica il collegamento e riprova."));
        let listener: { remove: () => void } | undefined;
        signal?.addEventListener("abort", annulla, { once: true });
        try {
          map = new api.Map(nodo, { center: c.centro, zoom: c.zoom, minZoom: c.zoom, maxZoom: c.zoom, mapTypeId: "satellite", renderingType: "RASTER", tilt: 0, heading: 0, disableDefaultUI: true, clickableIcons: false, keyboardShortcuts: false, gestureHandling: "none", draggable: false, scrollwheel: false, isFractionalZoomEnabled: false });
          listener = map.addListener("tilesloaded", () => {
            const centro = map?.getCenter()?.toJSON();
            if (!centro || map?.getZoom() !== c.zoom || Math.abs(centro.lat - c.centro.lat) > 1e-8 || Math.abs(centro.lng - c.centro.lng) > 1e-8) termina("La vista Google non è allineata al disegno salvato. Riprova prima di stampare.");
            else termina();
          });
        } catch { termina("Impossibile preparare la vista Google del tetto. Riprova."); }
      });
    }));
    return pulisci;
  })().catch(error => { pulisci(); throw error; });
  preparazioni.set(doc, lavoro);
  return lavoro;
}

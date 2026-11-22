import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Map as MappaLeaflet } from "leaflet";
import "maplibre-gl/dist/maplibre-gl.css";
import { stileStradaleOpenFreeMap } from "./stileStradale";

setWorkerUrl(workerUrl);

export function caricaCartografiaVettoriale(
  mappa: MappaLeaflet, stile: string, onPronta: () => void, onErrore: () => void,
) {
  const style = stile === "https://tiles.openfreemap.org/styles/liberty" ? stileStradaleOpenFreeMap : stile;
  const livello = maplibreGL({ style }).addTo(mappa);
  livello.getMaplibreMap().once("load", onPronta).on("error", onErrore);
  return livello;
}

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Coordinate } from "../../../../shared/mappa-operativa/calcoli";

import { tilesMappa } from "./servizio";
export type Pin = { id: string; titolo: string; punto: Coordinate; numero?: number };

interface Props {
  pin: Pin[];
  selezionato: string | null;
  percorso: Coordinate[][];
  bozza?: Coordinate | null; tileConsentito?: boolean; erroreTiles?: string;
  onSeleziona: (id: string) => void;
  onPunto?: (punto: Coordinate) => void;
}

export default function CartografiaOperativa({ pin, selezionato, percorso, bozza, tileConsentito, erroreTiles, onSeleziona, onPunto }: Props) {
  const contenitore = useRef<HTMLDivElement>(null);
  const mappa = useRef<L.Map | null>(null);
  const elementi = useRef<L.LayerGroup | null>(null);
  const geometrie = useRef<L.LayerGroup | null>(null);
  const ultimoInquadramento = useRef("");
  const [errore, setErrore] = useState(false);
  const [zoom, setZoom] = useState(6);

  useEffect(() => {
    if (!contenitore.current) return;
    const istanza = L.map(contenitore.current, { scrollWheelZoom: false, minZoom: 3, maxZoom: 19 }).setView([42.4, 12.6], 6);
    istanza.on("zoomend", () => setZoom(istanza.getZoom()));
    elementi.current = L.layerGroup().addTo(istanza);
    geometrie.current = L.layerGroup().addTo(istanza);
    mappa.current = istanza;
    const osservatore = new ResizeObserver(() => istanza.invalidateSize());
    osservatore.observe(contenitore.current);
    return () => {
      osservatore.disconnect();
      istanza.remove();
      mappa.current = null;
      ultimoInquadramento.current = "";
    };
  }, []);

  useEffect(() => {
    const istanza = mappa.current;
    if (!istanza) return;
    const tiles = tilesMappa && tileConsentito ? L.tileLayer(tilesMappa, {
      attribution: '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(istanza) : null;
    tiles?.on("tileerror", () => setErrore(true));
    return () => { tiles?.remove(); };
  }, [tileConsentito]);

  useEffect(() => {
    const istanza = mappa.current;
    if (!istanza || !onPunto) return;
    const clic = (e: L.LeafletMouseEvent) => onPunto({ lat: e.latlng.lat, lng: e.latlng.wrap().lng });
    istanza.on("click", clic);
    return () => { istanza.off("click", clic); };
  }, [onPunto]);

  useEffect(() => {
    const istanza = mappa.current;
    if (!istanza || !elementi.current) return;
    elementi.current.clearLayers();
    const firma = pin.map(p => `${p.id}:${p.punto.lat}:${p.punto.lng}`).join("|");
    if (firma !== ultimoInquadramento.current) {
      ultimoInquadramento.current = firma;
      if (pin.length) istanza.fitBounds(L.latLngBounds(pin.map(p => [p.punto.lat, p.punto.lng])), {
        padding: [38, 38], maxZoom: 15, animate: false,
      });
    }
    const gruppi: { x: number; y: number; pin: Pin[] }[] = [];
    for (const p of pin) {
      const { x, y } = istanza.project([p.punto.lat, p.punto.lng], zoom);
      const gruppo = gruppi.find(g => Math.hypot(g.x - x, g.y - y) < 34);
      if (gruppo) gruppo.pin.push(p);
      else gruppi.push({ x, y, pin: [p] });
    }
    gruppi.forEach(g => {
      const primo = g.pin[0];
      const attivo = g.pin.some(p => p.id === selezionato);
      const nodo = document.createElement("span");
      nodo.textContent = String(g.pin.length > 1 ? g.pin.length : primo.numero ?? "●");
      nodo.className = `grid size-9 place-items-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md ${attivo ? "bg-orange-600" : "bg-slate-900"}`;
      const testo = g.pin.length > 1 ? `${g.pin.length} attività vicine` : primo.titolo;
      const marker = L.marker([primo.punto.lat, primo.punto.lng], {
        icon: L.divIcon({ html: nodo, className: "", iconSize: [36, 36], iconAnchor: [18, 18] }),
        title: testo, alt: testo, keyboard: true, bubblingMouseEvents: false,
        zIndexOffset: attivo ? 1000 : 0,
      }).addTo(elementi.current!);
      if (g.pin.length === 1) marker.on("click", () => onSeleziona(primo.id));
      else {
        const elenco = document.createElement("div");
        elenco.className = "grid max-h-48 gap-1 overflow-auto";
        g.pin.forEach(p => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "rounded px-2 py-1 text-left hover:bg-slate-100";
          b.textContent = p.numero ? `${p.numero}. ${p.titolo}` : p.titolo;
          b.onclick = () => { marker.closePopup(); onSeleziona(p.id); };
          elenco.append(b);
        });
        marker.bindPopup(elenco);
      }
    });
    if (bozza) L.circleMarker([bozza.lat, bozza.lng], { radius: 10, color: "#c2410c", fillOpacity: 0.4 }).addTo(elementi.current);
  }, [pin, selezionato, zoom, bozza, onSeleziona]);

  useEffect(() => {
    const punto = pin.find(p => p.id === selezionato)?.punto;
    if (punto && mappa.current && !mappa.current.getBounds().pad(-0.12).contains([punto.lat, punto.lng])) {
      mappa.current.panTo([punto.lat, punto.lng], { animate: false });
    }
  }, [pin, selezionato]);

  useEffect(() => {
    const layer = geometrie.current;
    if (!layer) return;
    layer.clearLayers();
    percorso.forEach(linea => L.polyline(linea.map((p): L.LatLngTuple => [p.lat, p.lng]), { color: "#1d4ed8", weight: 4, opacity: 0.8 }).addTo(layer));
  }, [percorso]);

  return <div className="min-w-0 space-y-2">
    <div ref={contenitore} role="region" aria-label="Mappa operativa" className="relative isolate h-[40dvh] min-h-64 overflow-hidden rounded-lg border bg-slate-100 lg:h-[34rem]" />
    {(errore || erroreTiles || !tilesMappa) && <p role="status" className="px-1 text-xs text-muted-foreground">
      {erroreTiles || (errore ? "Cartografia temporaneamente non disponibile." : "Sfondo cartografico da configurare.")} I punti restano consultabili.
    </p>}
  </div>;
}

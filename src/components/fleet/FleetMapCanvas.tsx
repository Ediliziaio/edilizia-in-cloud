import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
type Point = { lat: number; lng: number; label?: string; color?: string; radius?: number; onClick?: () => void };
type Props = { points?: Point[]; route?: Point[]; height?: string; onMapClick?: (lat: number, lng: number) => void };
const valid = (p: Point) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

/** React-18 compatible map. Names go through textContent, never interpolated HTML. */
export function FleetMapCanvas(props: Props) {
  const [enabled, setEnabled] = useState(false);
  return <div className="space-y-2">
    {!enabled ? <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border bg-slate-50 p-4 text-center text-sm">
      <p>La cartografia usa OpenStreetMap. Nessuna posizione viene inviata a servizi di ricerca indirizzi.</p>
      <Button variant="outline" size="sm" onClick={() => setEnabled(true)}>Carica cartografia</Button>
    </div> : <ActiveMap {...props} />}
  </div>;
}
function ActiveMap({ points = [], route = [], height = "320px", onMapClick }: Props) {
  const container = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), shapes = useRef<L.LayerGroup | null>(null);
  const [tileError, setTileError] = useState(false);
  const fitted = useRef(false);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView([41.9, 12.5], 6);
    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom:19 }).addTo(instance);
    tiles.on("tileerror", () => setTileError(true));
    shapes.current = L.layerGroup().addTo(instance); map.current = instance;
    return () => { tiles.off(); instance.remove(); map.current = null; shapes.current = null; };
  }, []);
  useEffect(() => {
    const instance = map.current, layer = shapes.current;
    if (!instance || !layer) return;
    layer.clearLayers();
    const safePoints = points.filter(valid), safeRoute = route.filter(valid);
    safePoints.forEach((p) => {
      const marker = p.radius != null ? L.circle([p.lat,p.lng], {radius:p.radius,color:p.color || "#2563eb",fillOpacity:0.12})
        : L.circleMarker([p.lat,p.lng], {radius:7,color:p.color || "#2563eb",fillOpacity:0.9});
      if (p.label) { const node = document.createElement("span"); node.textContent = p.label; marker.bindTooltip(node); }
      if (p.onClick) marker.on("click", p.onClick);
      marker.addTo(layer);
    });
    if (safeRoute.length) L.polyline(safeRoute.map((p):[number,number]=>[p.lat,p.lng]), {color:"#2563eb",weight:3}).addTo(layer);
    const all = [...safePoints,...safeRoute];
    if (all.length && !fitted.current) {
      instance.fitBounds(L.latLngBounds(all.map((p):[number,number]=>[Math.max(-85,Math.min(85,p.lat)),p.lng])), {padding:[30,30],maxZoom:16,animate:false});
      fitted.current = true;
    }
    instance.invalidateSize();
  }, [points,route]);
  useEffect(() => {
    const instance=map.current;
    if (!instance || !onMapClick) return;
    const handler=(event:L.LeafletMouseEvent)=>onMapClick(event.latlng.lat,event.latlng.lng);
    instance.on("click",handler); return ()=>{instance.off("click",handler);};
  },[onMapClick]);
  return <><div ref={container} role="region" aria-label="Mappa GPS" className="relative isolate overflow-hidden rounded-lg border" style={{height}} />
    {tileError && <p role="status" className="text-xs text-orange-700">Cartografia non disponibile. I dati GPS restano consultabili nell’elenco.</p>}</>;
}

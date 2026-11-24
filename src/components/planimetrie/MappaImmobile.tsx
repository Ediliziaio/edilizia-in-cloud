import { useEffect, useLayoutEffect, useRef, useState } from "react";
import L from "leaflet";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import "leaflet/dist/leaflet.css";

export default function MappaImmobile({ lat, lng, mostraPunto = true, onSposta }: { lat: number; lng: number; mostraPunto?: boolean; onSposta?: (lat: number, lng: number) => void }) {
  const t = useT();
  const elemento = useRef<HTMLDivElement>(null);
  const mappa = useRef<L.Map | undefined>(undefined);
  const marker = useRef<L.CircleMarker | undefined>(undefined);
  const sposta = useRef(onSposta);
  useLayoutEffect(() => { sposta.current = onSposta; }, [onSposta]);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    if (!elemento.current) return;
    const vista = L.map(elemento.current,{scrollWheelZoom:false});
    mappa.current = vista;
    const base = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom:19,
    }).addTo(vista);
    base.on("tileerror",() => setErrore(true));
    vista.on("click",(e: L.LeafletMouseEvent) => sposta.current?.(e.latlng.lat,e.latlng.wrap().lng));
    return () => { vista.remove(); mappa.current = undefined; marker.current = undefined; };
  },[]);
  useEffect(() => {
    const vista = mappa.current;
    if (!vista) return;
    vista.setView([lat,lng],mostraPunto ? 18 : 12,{animate:false});
    if (!mostraPunto) { marker.current?.remove(); marker.current=undefined; }
    else if (marker.current) marker.current.setLatLng([lat,lng]);
    else marker.current = L.circleMarker([lat,lng],{color:"#1d4ed8",fillColor:"#3b82f6",fillOpacity:.65,radius:7}).addTo(vista);
  },[lat,lng,mostraPunto]);

  return <div className="space-y-1">
    <div ref={elemento} role="region" aria-label={t("Mappa per posizionare l’immobile")} className="isolate h-52 rounded-lg border bg-muted"/>
    {errore && <p className="text-xs text-muted-foreground">{t("La mappa di sfondo non risponde. Puoi inserire le coordinate manualmente.")}</p>}
  </div>;
}

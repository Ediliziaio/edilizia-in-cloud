import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Coordinate } from "../../../../shared/mappa-operativa/calcoli";

import { caricaSfondoVettoriale, preparaSfondoMappa } from "./caricaSfondo";
import { fonteCartografica, stileMappa, tilesMappa } from "./servizio";
import type { LineaPercorso } from "./tratte";
export type Pin = { id: string; titolo: string; punto: Coordinate; numero?: number; tipo?: "base" | "gps" | "mezzo" | "destinazione_mezzo"; etichetta?: string; avviso?: boolean };

export type InquadraturaMappa = Coordinate & { zoom: number; firma: string };

interface Props {
  pin: Pin[];
  selezionato: string | null;
  percorso?: LineaPercorso[];
  trattaSelezionata?: number | null;
  onTratta?: (indice: number) => void;
  nomiPin?: boolean;
  bozza?: Coordinate | null; tileConsentito?: boolean; erroreTiles?: string;
  attesaPunti?: boolean;
  contesto?: string;
  inquadratura?: InquadraturaMappa | null;
  onInquadratura?: (v: InquadraturaMappa) => void;
  onSeleziona: (id: string) => void;
  onPunto?: (punto: Coordinate) => void;
}

function frecciaDirezione(istanza: L.Map, linea: LineaPercorso, opacita: number) {
  const zoomFreccia = 12;
  const punti = linea.punti.map(p => istanza.project([p.lat, p.lng], zoomFreccia));
  const lunghi = punti.slice(1).map((p, i) => p.distanceTo(punti[i]));
  let distanza = lunghi.reduce((sum, tratto) => sum + tratto, 0) * 0.45;
  for (const [i, lungo] of lunghi.entries()) {
    if (distanza > lungo || !lungo) { distanza -= lungo; continue; }
    const direzione = punti[i + 1].subtract(punti[i]);
    const punto = punti[i].add(direzione.multiplyBy(distanza / lungo));
    const nodo = document.createElement("span");
    nodo.textContent = "➜";
    nodo.setAttribute("aria-hidden", "true");
    nodo.className = "grid size-5 place-items-center rounded-full border border-white text-[13px] font-bold leading-none text-white shadow-sm";
    nodo.style.backgroundColor = linea.colore;
    nodo.style.opacity = String(opacita);
    nodo.style.transform = `rotate(${Math.atan2(direzione.y, direzione.x) * 180 / Math.PI}deg)`;
    return L.marker(istanza.unproject(punto, zoomFreccia), {
      icon: L.divIcon({ html: nodo, className: "mappa-freccia-tratta", iconSize: [20, 20], iconAnchor: [10, 10] }),
      keyboard: false, interactive: false, zIndexOffset: -250,
    });
  }
}

const nessunPercorso: LineaPercorso[] = [];
const passoGruppi = 34;
type GruppoPin = { x: number; y: number; indice: number; pin: Pin[] };
type LivelloPin = { marker: L.Marker; nodo: HTMLElement; colore: string; avviso: boolean; pin: Pin[] };

function raggruppaPin(mappa: L.Map, pin: Pin[], zoom: number) {
  const celle = new Map<string, GruppoPin[]>();
  const gruppi: GruppoPin[] = [];
  for (const p of pin) {
    const { x, y } = mappa.project([p.punto.lat, p.punto.lng], zoom);
    const col = Math.floor(x / passoGruppi), riga = Math.floor(y / passoGruppi);
    let vicino: GruppoPin | undefined;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const candidati = celle.get(`${col + dx}:${riga + dy}`);
        if (!candidati) continue;
        for (const g of candidati) {
          if ((!vicino || g.indice < vicino.indice) && (g.x - x) ** 2 + (g.y - y) ** 2 < passoGruppi ** 2) vicino = g;
        }
      }
    }
    if (vicino) vicino.pin.push(p);
    else {
      const g = { x, y, indice: gruppi.length, pin: [p] };
      gruppi.push(g);
      const cella = `${col}:${riga}`;
      const candidati = celle.get(cella);
      if (candidati) candidati.push(g);
      else celle.set(cella, [g]);
    }
  }
  return gruppi;
}

function evidenziaPin(livello: LivelloPin | undefined, id: string | null) {
  if (!livello) return;
  const p = livello.pin.find(p => p.id === id);
  if (!livello.avviso) {
    livello.nodo.classList.toggle(livello.colore, !p);
    livello.nodo.classList.toggle("bg-orange-600", Boolean(p));
  }
  const { lat, lng } = (p ?? livello.pin[0]).punto;
  if (!livello.marker.getLatLng().equals([lat, lng])) livello.marker.setLatLng([lat, lng]);
  livello.marker.setZIndexOffset(p ? 1000 : 0);
}

export default function CartografiaOperativa({
  pin, selezionato, percorso = nessunPercorso, trattaSelezionata, onTratta, nomiPin, bozza, tileConsentito, erroreTiles,
  attesaPunti, contesto = "", inquadratura, onInquadratura, onSeleziona, onPunto,
}: Props) {
  const contenitore = useRef<HTMLDivElement>(null);
  const mappa = useRef<L.Map | null>(null);
  const elementi = useRef<L.LayerGroup | null>(null);
  const geometrie = useRef<L.LayerGroup | null>(null);
  const markerPerId = useRef(new Map<string, LivelloPin>());
  const ultimoInquadramento = useRef<string | null>(null);
  const cameraAutomatica = useRef(false);
  const evidenziato = useRef<string | null>(null);
  const popupTratte = useRef<L.Popup | null>(null);
  const avvio = useRef(inquadratura);
  const azioni = useRef({ onSeleziona, onInquadratura, onTratta });
  const [errore, setErrore] = useState(false);
  const [mappaPronta, setMappaPronta] = useState(false);
  const [zoom, setZoom] = useState(inquadratura?.zoom ?? 6);

  useLayoutEffect(() => { azioni.current = { onSeleziona, onInquadratura, onTratta }; }, [onSeleziona, onInquadratura, onTratta]);
  useLayoutEffect(() => {
    if (!contenitore.current) return;
    const precedente = avvio.current;
    const istanza = L.map(contenitore.current, { scrollWheelZoom: false, minZoom: 3, maxZoom: 19 })
      .setView(precedente ? [precedente.lat, precedente.lng] : [42.4, 12.6], precedente?.zoom ?? 6);
    istanza.on("zoomend", () => setZoom(istanza.getZoom()));
    istanza.on("moveend", () => {
      const firma = ultimoInquadramento.current;
      if (firma == null || cameraAutomatica.current) return;
      const { lat, lng } = istanza.getCenter();
      azioni.current.onInquadratura?.({ lat, lng, zoom: istanza.getZoom(), firma });
    });
    elementi.current = L.layerGroup().addTo(istanza);
    geometrie.current = L.layerGroup().addTo(istanza);
    mappa.current = istanza;
    const osservatore = new ResizeObserver(() => istanza.invalidateSize());
    osservatore.observe(contenitore.current);
    return () => {
      osservatore.disconnect();
      istanza.remove();
      mappa.current = null;
      ultimoInquadramento.current = null;
    };
  }, []);

  const inquadra = useMemo(() => {
    const tratto = percorso.find(linea => trattaSelezionata != null && linea.indice === trattaSelezionata);
    const limite = new L.LatLngBounds([]);
    for (const p of pin) if (!tratto && (!percorso.length || !p.avviso)) limite.extend([p.punto.lat, p.punto.lng]);
    for (const linea of tratto ? [tratto] : percorso) {
      for (const p of linea.punti) limite.extend([p.lat, p.lng]);
    }
    const chiave = tratto ? [trattaSelezionata, limite.isValid() ? limite.toBBoxString() : ""] :
      pin.map(p => [p.id, p.punto.lat, p.punto.lng, Boolean(p.avviso)]);
    const firma = JSON.stringify([contesto, chiave, percorso.length > 0, limite.isValid() ? limite.toBBoxString() : ""]);
    return { limite, firma };
  }, [contesto, pin, percorso, trattaSelezionata]);

  useLayoutEffect(() => {
    const istanza = mappa.current;
    if (!istanza || attesaPunti || ultimoInquadramento.current === inquadra.firma) return;
    ultimoInquadramento.current = inquadra.firma;
    cameraAutomatica.current = true;
    if (inquadratura?.firma === inquadra.firma) {
      istanza.setView([inquadratura.lat, inquadratura.lng], inquadratura.zoom, { animate: false });
    } else if (inquadra.limite.isValid()) {
      istanza.fitBounds(inquadra.limite, { padding: [38, 38], maxZoom: 15, animate: false });
    }
    cameraAutomatica.current = false;
    istanza.fire("operativa:inquadrata");
  }, [attesaPunti, inquadra, inquadratura]);

  useEffect(() => { preparaSfondoMappa(); }, []);
  useEffect(() => {
    const istanza = mappa.current;
    if (!istanza || !tileConsentito) return;
    let annullato = false;
    let avviato = false;
    let livello: L.Layer | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const avvia = () => {
      if (avviato) return;
      avviato = true;
      if (stileMappa) {
        timer = setTimeout(() => setErrore(true), 10_000);
        void caricaSfondoVettoriale().then(({ caricaCartografiaVettoriale }) => {
          if (annullato) return;
          livello = caricaCartografiaVettoriale(istanza, stileMappa, () => {
            clearTimeout(timer);
            if (!annullato) { setMappaPronta(true); setErrore(false); }
          }, () => { if (!annullato) setErrore(true); });
        }).catch(() => { if (!annullato) setErrore(true); });
      } else if (tilesMappa) {
        const attribuzioneOsm = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
        livello = L.tileLayer(tilesMappa, {
          attribution: fonteCartografica === "maptiler"
            ? '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' + attribuzioneOsm : attribuzioneOsm,
          maxZoom: 19,
        }).on("tileerror", () => setErrore(true)).on("load", () => setMappaPronta(true)).addTo(istanza);
      }
    };
    if (ultimoInquadramento.current != null) avvia();
    else istanza.once("operativa:inquadrata", avvia);
    return () => {
      annullato = true;
      clearTimeout(timer);
      istanza.off("operativa:inquadrata", avvia);
      livello?.remove();
    };
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
    markerPerId.current.clear();
    const gruppi = raggruppaPin(istanza, pin, zoom);
    gruppi.forEach(g => {
      const primo = g.pin[0];
      const numeri = g.pin.length > 1 && g.pin.every(p => p.numero != null && !p.tipo) ? g.pin.map(p => p.numero) : [];
      const sequenza = numeri.length === 2 ? numeri.join(" / ") : "";
      const mostraSequenza = sequenza.length > 0 && sequenza.length <= 6;
      const nodo = document.createElement("span");
      const daVerificare = g.pin.some(p => p.avviso);
      const gps = primo.tipo === "gps";
      const flotta = primo.tipo === "mezzo" || primo.tipo === "destinazione_mezzo";
      const destinazione = primo.tipo === "destinazione_mezzo" && g.pin.length === 1;
      const base = g.pin.length === 1 && primo.tipo === "base";
      const ciclo = g.pin.length === 2 && g.pin.every(p => p.tipo === "base");
      nodo.textContent = daVerificare ? "!" : ciclo ? "P/R" : mostraSequenza ? sequenza : String(g.pin.length > 1 ? g.pin.length : primo.etichetta ?? primo.numero ?? "●");
      const forma = (gps || flotta) && g.pin.length === 1 ? "rounded-lg" : "rounded-full";
      const colore = daVerificare ? "bg-amber-800" : gps ? "bg-violet-700" : destinazione ? "bg-amber-700" : flotta ? "bg-sky-800" : base ? (primo.etichetta === "R" ? "bg-pink-700" : "bg-teal-700") : "bg-slate-900";
      nodo.className = `grid size-9 place-items-center ${forma} border-2 border-white font-bold text-white shadow-md ${mostraSequenza ? "text-[10px]" : "text-xs"} ${colore}`;
      const testo = daVerificare ? `Pin fuori copertura · ${g.pin.filter(p => p.avviso).map(p => p.titolo).join(", ")}` :
        numeri.length === 2 ? `Tappe ${numeri.join(" e ")}` :
        g.pin.length > 1 ? `${g.pin.length} ${gps ? "timbrature vicine" : flotta ? "punti mezzi vicini" : nomiPin ? "cantieri vicini" : "tappe vicine"}` : primo.titolo;
      const punto = primo.punto;
      const marker = L.marker([punto.lat, punto.lng], {
        icon: L.divIcon({ html: nodo, className: "", iconSize: [36, 36], iconAnchor: [18, 18] }),
        title: testo, alt: testo, keyboard: true, bubblingMouseEvents: false,
        zIndexOffset: 0,
      }).addTo(elementi.current!);
      marker.getElement()?.setAttribute("aria-label", testo);
      const livello = { marker, nodo, colore, avviso: daVerificare, pin: g.pin };
      for (const p of g.pin) markerPerId.current.set(p.id, livello);
      if (g.pin.length === 1 || nomiPin || flotta) {
        const nomi = document.createElement("div");
        nomi.className = "w-max max-w-52 whitespace-normal break-words";
        for (const p of g.pin.slice(0, 4)) {
          const nome = document.createElement("div");
          nome.textContent = p.titolo;
          nomi.append(nome);
        }
        if (g.pin.length > 4) {
          const altri = document.createElement("div");
          altri.textContent = `Altri ${g.pin.length - 4} ${flotta ? "punti" : "cantieri"}`;
          nomi.append(altri);
        }
        marker.bindTooltip(nomi, { direction: "top", offset: [0, -15], opacity: 1 });
      }
      if (g.pin.length === 1) marker.on("click", () => azioni.current.onSeleziona(primo.id));
      else marker.bindPopup(() => {
        const elenco = document.createElement("div");
        elenco.className = "grid max-h-48 gap-1 overflow-auto";
        g.pin.forEach(p => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "rounded px-2 py-1 text-left hover:bg-slate-100";
          b.textContent = `${p.numero != null ? `${p.numero}. ` : ""}${p.titolo}${p.avviso ? " · fuori copertura" : ""}`;
          b.onclick = () => { marker.closePopup(); azioni.current.onSeleziona(p.id); };
          elenco.append(b);
        });
        return elenco;
      });
    });
  }, [pin, zoom, nomiPin]);

  useEffect(() => {
    const precedente = evidenziato.current;
    if (precedente) evidenziaPin(markerPerId.current.get(precedente), null);
    if (selezionato) evidenziaPin(markerPerId.current.get(selezionato), selezionato);
    evidenziato.current = selezionato;
  }, [pin, selezionato, zoom, nomiPin]);

  useEffect(() => {
    if (!bozza || !mappa.current) return;
    const marker = L.circleMarker([bozza.lat, bozza.lng], { radius: 10, color: "#c2410c", fillOpacity: 0.4 }).addTo(mappa.current);
    return () => { marker.remove(); };
  }, [bozza]);

  useEffect(() => {
    const punto = pin.find(p => p.id === selezionato)?.punto;
    if (punto && mappa.current && !mappa.current.getBounds().contains([punto.lat, punto.lng])) {
      mappa.current.panTo([punto.lat, punto.lng], { animate: false });
    }
  }, [pin, selezionato]);

  const firmaTratte = useMemo(() => JSON.stringify(percorso.map(l => [l.indice, l.titolo, l.punti.length, l.punti[0], l.punti.at(-1)])), [percorso]);
  const modificaPin = Boolean(onPunto);
  useEffect(() => () => {
    popupTratte.current?.remove();
    popupTratte.current = null;
  }, [firmaTratte, trattaSelezionata, modificaPin]);

  useEffect(() => {
    const layer = geometrie.current;
    const istanza = mappa.current;
    if (!layer || !istanza) return;
    layer.clearLayers();
    let selezionata: L.Polyline | undefined;
    const selezionabili: { indice: number; linea: L.Polyline; titolo: string }[] = [];
    const scegliTratta = (indice: number, evento: L.LeafletMouseEvent) => {
      const punto = evento.layerPoint;
      const vicine = selezionabili.filter(t => t.indice === indice ||
        (punto && (t.linea.closestLayerPoint(punto)?.distanceTo(punto) ?? Infinity) <= 9));
      if (vicine.length <= 1) { azioni.current.onTratta?.(indice); return; }
      const elenco = document.createElement("div");
      elenco.className = "grid max-h-56 gap-1 overflow-auto";
      elenco.setAttribute("role", "group");
      elenco.setAttribute("aria-label", "Tratte sovrapposte");
      const titolo = document.createElement("p");
      titolo.textContent = "Scegli la tratta";
      titolo.className = "font-semibold";
      elenco.append(titolo);
      for (const t of vicine) {
        const pulsante = document.createElement("button");
        pulsante.type = "button";
        pulsante.className = "rounded px-2 py-1 text-left hover:bg-slate-100";
        pulsante.textContent = t.titolo;
        pulsante.onclick = () => { popupTratte.current?.remove(); azioni.current.onTratta?.(t.indice); };
        elenco.append(pulsante);
      }
      popupTratte.current?.remove();
      popupTratte.current = L.popup().setLatLng(evento.latlng).setContent(elenco).openOn(istanza);
      elenco.querySelector("button")?.focus({ preventScroll: true });
    };
    for (const linea of percorso) {
      const indice = linea.indice;
      const attiva = indice != null && trattaSelezionata === indice;
      const opacita = trattaSelezionata == null || attiva ? 0.94 : 0.27;
      const tratto = L.polyline(linea.punti.map((p): L.LatLngTuple => [p.lat, p.lng]), {
        color: linea.colore, weight: attiva ? 7 : linea.rientro ? 5.5 : 4.5,
        opacity: opacita, dashArray: linea.rientro || linea.indicativa ? "9 7" : undefined,
        className: linea.indicativa ? "mappa-linea-indicativa" : linea.rientro ? "mappa-linea-rientro" : "mappa-linea-stradale",
        interactive: indice != null && !modificaPin, bubblingMouseEvents: false,
      }).addTo(layer);
      if (attiva) selezionata = tratto;
      if (indice != null) {
        frecciaDirezione(istanza, linea, opacita)?.addTo(layer);
        if (modificaPin) continue;
        selezionabili.push({ indice, linea: tratto, titolo: linea.titolo });
        const nome = document.createElement("span");
        nome.textContent = linea.titolo;
        tratto.bindTooltip(nome, { sticky: true, opacity: 1 });
        tratto.on("click", (evento: L.LeafletMouseEvent) => scegliTratta(indice, evento));
      }
    }
    selezionata?.bringToFront();
  }, [percorso, trattaSelezionata, modificaPin]);

  return <div className="min-w-0 space-y-2">
    <div ref={contenitore} role="region" aria-label="Mappa operativa" data-livello-zoom={zoom} data-cartografia={mappaPronta ? "pronta" : "in-attesa"} className="relative isolate h-[40dvh] min-h-64 overflow-hidden rounded-lg border bg-slate-100 lg:h-[34rem]" />
    {stileMappa && tileConsentito && !mappaPronta && !errore && <p role="status" className="px-1 text-xs text-muted-foreground">Caricamento mappa stradale…</p>}
    {(errore || erroreTiles || (!tilesMappa && !stileMappa)) && <p role="status" className="px-1 text-xs text-muted-foreground">
      {erroreTiles || (errore ? "Cartografia temporaneamente non disponibile." : "Sfondo cartografico da configurare.")} I punti restano consultabili.
    </p>}
  </div>;
}

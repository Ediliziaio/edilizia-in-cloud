/**
 * CrmMapTab — tab "Mappa" della dashboard commerciale CRM.
 *
 * Mappa d'Italia (tile OpenStreetMap) con un pin per azienda: VERDE = clienti
 * (EiC + clienti servizi), ROSSO = prospect da outreach. Pan/zoom liberi,
 * filtri per tipo/provincia/ricerca, legenda e contatori.
 *
 * IMPLEMENTAZIONE: Leaflet PURO (pacchetto `leaflet`), non `react-leaflet`.
 * Motivo: react-leaflet@5 richiede React 19 e crasha su React 18 (l'app è su
 * 18.3) con "context consumer expects a single child that is a function".
 * Leaflet vanilla è framework-agnostic e stabile: creiamo la mappa in un
 * useEffect e aggiorniamo i marker (CircleMarker SVG, leggeri) quando cambiano
 * i filtri. Con decine di migliaia di pin si aggiungerà il clustering (Fase 2).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCrmMapPoints, type CrmMapPoint } from "@/hooks/useCrmMapPoints";
import { ITALY_CENTER } from "@/lib/crm/provinceCentroids";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, MapPin, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const COLOR = {
  cliente: "#16a34a", // emerald-600
  prospect: "#dc2626", // red-600
} as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Icona emoji per canale attività. */
const ACT_ICON: Record<string, string> = {
  email: "✉️", whatsapp: "💬", call: "📞", chiamata: "📞", phone: "📞",
  sms: "📱", note: "📝", nota: "📝", meeting: "🤝", incontro: "🤝", linkedin: "💼",
};
function actIcon(t: string): string {
  const k = t.toLowerCase();
  for (const key of Object.keys(ACT_ICON)) if (k.includes(key)) return ACT_ICON[key];
  return "•";
}
/** Colore della temperatura (ai_score_tier). */
function tempColor(t: string): string {
  const k = t.toLowerCase();
  if (k.includes("hot") || k.includes("cald")) return "#dc2626";
  if (k.includes("warm") || k.includes("tiep")) return "#f59e0b";
  if (k.includes("cold") || k.includes("fred")) return "#3b82f6";
  return "#64748b";
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** HTML del popup di un pin — mini-scheda (Leaflet vuole stringa/nodo, non JSX). */
function popupHtml(p: CrmMapPoint): string {
  const dot = `<span style="display:inline-block;width:9px;height:9px;border-radius:9999px;background:${COLOR[p.tipo]};margin-right:6px"></span>`;
  const tipoLabel = p.tipo === "cliente" ? "Cliente" : "Prospect";
  const tipoBadge = `<span style="display:inline-block;font-size:10px;font-weight:600;padding:1px 6px;border-radius:6px;background:${p.tipo === "cliente" ? "#dcfce7" : "#fee2e2"};color:${p.tipo === "cliente" ? "#166534" : "#991b1b"}">${tipoLabel}</span>`;
  const tempBadge = p.temperatura
    ? `<span style="display:inline-block;font-size:10px;font-weight:600;padding:1px 6px;border-radius:6px;margin-left:4px;background:${tempColor(p.temperatura)}22;color:${tempColor(p.temperatura)}">${escapeHtml(cap(p.temperatura))}</span>`
    : "";

  const rows: string[] = [];
  const row = (label: string, value: string) =>
    `<div style="margin-top:3px"><span style="color:#94a3b8">${label}:</span> <span style="color:#334155">${value}</span></div>`;

  if (p.categoria) rows.push(row("Categoria", escapeHtml(p.categoria)));
  if (p.stato) rows.push(row("Stato", escapeHtml(cap(p.stato))));
  if (p.fatturato) rows.push(row("Fatturato", escapeHtml(p.fatturato)));

  const luogo = [p.citta, p.provincia].filter(Boolean).map((x) => escapeHtml(String(x))).join(" · ");
  const regione = p.regione ? ` (${escapeHtml(p.regione)})` : "";
  if (luogo) rows.push(row("Zona", `${luogo}${regione}`));
  if (p.indirizzo) rows.push(row("Indirizzo", escapeHtml(p.indirizzo)));

  if (p.email) rows.push(row("Email", `<a href="mailto:${escapeHtml(p.email)}" style="color:#2563eb">${escapeHtml(p.email)}</a>`));
  if (p.telefono) rows.push(row("Tel", `<a href="tel:${escapeHtml(p.telefono)}" style="color:#2563eb">${escapeHtml(p.telefono)}</a>`));

  if (p.attivita.length) {
    const tot = p.attivita.reduce((s, a) => s + a.n, 0);
    const chips = p.attivita.map((a) => `${actIcon(a.tipo)} ${a.n}`).join(" · ");
    rows.push(row(`Attività (${tot})`, chips));
  }

  return `
    <div style="min-width:190px;max-width:280px;font-size:12px;line-height:1.35">
      <div style="font-weight:600;margin-bottom:3px">${dot}${escapeHtml(p.nome)}</div>
      <div>${tipoBadge}${tempBadge}</div>
      ${rows.join("")}
      ${!p.precise ? `<div style="margin-top:4px;font-style:italic;color:#d97706;font-size:10px">Posizione approssimata (provincia)</div>` : ""}
    </div>`;
}

export function CrmMapTab({ companyId }: { companyId: string }) {
  const { data, isLoading, isError, refetch, isFetching } = useCrmMapPoints(companyId);
  const [tipo, setTipo] = useState<"tutti" | "cliente" | "prospect">("tutti");
  const [provincia, setProvincia] = useState<string>("tutte");
  const [search, setSearch] = useState("");

  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const province = useMemo(() => {
    const s = new Set<string>();
    (data?.points ?? []).forEach((p) => { if (p.provincia) s.add(p.provincia); });
    return Array.from(s).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.points ?? []).filter((p) => {
      if (tipo !== "tutti" && p.tipo !== tipo) return false;
      if (provincia !== "tutte" && p.provincia !== provincia) return false;
      if (q && !p.nome.toLowerCase().includes(q) && !(p.categoria ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, tipo, provincia, search]);

  const shownClienti = filtered.filter((p) => p.tipo === "cliente").length;
  const shownProspect = filtered.length - shownClienti;

  // Init mappa una sola volta (il div è sempre montato).
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    const map = L.map(mapElRef.current, {
      center: ITALY_CENTER,
      zoom: 6,
      scrollWheelZoom: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Aggiorna i marker quando cambiano i punti filtrati.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const p of filtered) {
      const cm = L.circleMarker([p.lat, p.lng], {
        radius: 7,
        color: "#ffffff",
        weight: 1.5,
        fillColor: COLOR[p.tipo],
        fillOpacity: p.precise ? 0.9 : 0.65,
      }).bindPopup(popupHtml(p), { maxWidth: 300, minWidth: 190 });
      // Apertura anche al passaggio del mouse (oltre al click).
      cm.on("mouseover", () => cm.openPopup());
      cm.addTo(layer);
    }
  }, [filtered]);

  return (
    <div className="space-y-3">
      {/* Filtri */}
      <Card>
        <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Cerca azienda o categoria…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti</SelectItem>
              <SelectItem value="cliente">🟢 Clienti</SelectItem>
              <SelectItem value="prospect">🔴 Prospect</SelectItem>
            </SelectContent>
          </Select>
          <Select value={provincia} onValueChange={setProvincia}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Provincia" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutte">Tutte le province</SelectItem>
              {province.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title="Aggiorna">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </CardContent>
      </Card>

      {/* Mappa */}
      <Card className="overflow-hidden">
        <div className="relative h-[68vh] min-h-[460px] w-full">
          {/* Contenitore mappa (sempre montato) */}
          <div ref={mapElRef} className="h-full w-full" />

          {/* Legenda + contatori */}
          {!isLoading && !isError && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-700">
                <MapPin className="h-3.5 w-3.5 text-orange-500" /> Aziende sulla mappa
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR.cliente }} />
                Clienti <span className="font-semibold text-slate-800">{shownClienti}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR.prospect }} />
                Prospect <span className="font-semibold text-slate-800">{shownProspect}</span>
              </div>
            </div>
          )}

          {/* Overlay caricamento / errore */}
          {(isLoading || isError) && (
            <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-3 bg-background/85 text-muted-foreground">
              {isError ? (
                <>
                  <AlertTriangle className="h-6 w-6 text-amber-500" />
                  <span className="text-sm">Impossibile caricare i dati della mappa.</span>
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    <RefreshCw className="mr-1.5 h-4 w-4" /> Riprova
                  </Button>
                </>
              ) : (
                <><Loader2 className="h-5 w-5 animate-spin" /> Caricamento mappa…</>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Nota copertura */}
      {data && (
        <p className="px-1 text-xs text-muted-foreground">
          {data.clienti + data.prospect} aziende posizionate
          {data.approssimate > 0 && ` · ${data.approssimate} su centroide provincia (posizione approssimata)`}
          {data.senzaPosizione > 0 && ` · ${data.senzaPosizione} senza provincia/coordinate (non mostrabili)`}
          . La geocodifica stradale precisa arriva in una fase successiva.
        </p>
      )}
    </div>
  );
}

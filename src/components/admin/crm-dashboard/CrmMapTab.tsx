/**
 * CrmMapTab — tab "Mappa" della dashboard commerciale CRM.
 *
 * Mappa d'Italia (Leaflet VANILLA — react-leaflet@5 crasha su React 18) con un
 * pin per azienda: VERDE = clienti, ROSSO = prospect. Funzioni:
 *  • pin dimensionati per fatturato + anello colore per temperatura lead;
 *  • layer stradale / chiara / satellite;
 *  • filtri: tipo, categoria, temperatura, stato, regione, provincia, fatturato,
 *    "solo con email" / "solo contattabili", ricerca;
 *  • popup mini-scheda con azioni (Email / WhatsApp / Chiama);
 *  • selezione ad area (trascina un rettangolo) → esporta CSV delle aziende dentro.
 *
 * Marker via CircleMarker (SVG, leggeri). Clustering per migliaia di pin: Ondata 2.
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
import { Loader2, Search, MapPin, AlertTriangle, RefreshCw, Filter, Download, X, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";

const COLOR = {
  cliente: "#16a34a", // emerald-600
  prospect: "#dc2626", // red-600
} as const;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const ACT_ICON: Record<string, string> = {
  email: "✉️", whatsapp: "💬", call: "📞", chiamata: "📞", phone: "📞",
  sms: "📱", note: "📝", nota: "📝", meeting: "🤝", incontro: "🤝", linkedin: "💼",
};
function actIcon(t: string): string {
  const k = t.toLowerCase();
  for (const key of Object.keys(ACT_ICON)) if (k.includes(key)) return ACT_ICON[key];
  return "•";
}
function tempColor(t: string): string {
  const k = t.toLowerCase();
  if (k.includes("hot") || k.includes("cald")) return "#dc2626";
  if (k.includes("warm") || k.includes("tiep")) return "#f59e0b";
  if (k.includes("cold") || k.includes("fred")) return "#3b82f6";
  return "#64748b";
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** wa.me link da un telefono (aggiunge prefisso 39 se sembra un mobile IT). */
function waLink(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length >= 9 && d.length <= 10 && d.startsWith("3")) d = "39" + d;
  return `https://wa.me/${d}`;
}

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
  if (p.attivita.length) {
    const tot = p.attivita.reduce((s, a) => s + a.n, 0);
    rows.push(row(`Attività (${tot})`, p.attivita.map((a) => `${actIcon(a.tipo)} ${a.n}`).join(" · ")));
  }

  // Azioni rapide
  const btn = (href: string, label: string, blank = false) =>
    `<a href="${href}"${blank ? ' target="_blank" rel="noopener"' : ""} style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;background:#f1f5f9;color:#334155;text-decoration:none">${label}</a>`;
  const actions: string[] = [];
  if (p.email) actions.push(btn(`mailto:${escapeHtml(p.email)}`, "✉️ Email"));
  if (p.telefono) actions.push(btn(waLink(p.telefono), "💬 WhatsApp", true));
  if (p.telefono) actions.push(btn(`tel:${escapeHtml(p.telefono)}`, "📞 Chiama"));

  return `
    <div style="min-width:200px;max-width:280px;font-size:12px;line-height:1.35">
      <div style="font-weight:600;margin-bottom:3px">${dot}${escapeHtml(p.nome)}</div>
      <div>${tipoBadge}${tempBadge}</div>
      ${rows.join("")}
      ${actions.length ? `<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:5px">${actions.join("")}</div>` : ""}
      ${!p.precise ? `<div style="margin-top:5px;font-style:italic;color:#d97706;font-size:10px">Posizione approssimata (provincia)</div>` : ""}
    </div>`;
}

function csvCell(v: unknown): string {
  const s = (v ?? "").toString();
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const FATT_OPTS = [
  { v: "0", label: "Qualsiasi fatturato" },
  { v: "1", label: "≥ 100k €" },
  { v: "2", label: "≥ 500k €" },
  { v: "3", label: "≥ 1 Mln €" },
  { v: "4", label: "≥ 5 Mln €" },
];

export function CrmMapTab({ companyId }: { companyId: string }) {
  const { data, isLoading, isError, refetch, isFetching } = useCrmMapPoints(companyId);
  const [tipo, setTipo] = useState<"tutti" | "cliente" | "prospect">("tutti");
  const [provincia, setProvincia] = useState("tutte");
  const [categoria, setCategoria] = useState("tutte");
  const [temperatura, setTemperatura] = useState("tutte");
  const [stato, setStato] = useState("tutti");
  const [regione, setRegione] = useState("tutte");
  const [fattMin, setFattMin] = useState("0");
  const [soloEmail, setSoloEmail] = useState(false);
  const [soloContattabili, setSoloContattabili] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdv, setShowAdv] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const pts = useMemo(() => data?.points ?? [], [data]);
  const { province, categorie, temperature, stati, regioni } = useMemo(() => {
    const u = (sel: (p: CrmMapPoint) => string | null) => {
      const s = new Set<string>();
      pts.forEach((p) => { const v = sel(p); if (v) s.add(v); });
      return Array.from(s).sort();
    };
    return {
      province: u((p) => p.provincia),
      categorie: u((p) => p.categoria),
      temperature: u((p) => p.temperatura),
      stati: u((p) => p.stato),
      regioni: u((p) => p.regione),
    };
  }, [pts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minTier = Number(fattMin);
    return pts.filter((p) => {
      if (tipo !== "tutti" && p.tipo !== tipo) return false;
      if (provincia !== "tutte" && p.provincia !== provincia) return false;
      if (categoria !== "tutte" && p.categoria !== categoria) return false;
      if (temperatura !== "tutte" && p.temperatura !== temperatura) return false;
      if (stato !== "tutti" && p.stato !== stato) return false;
      if (regione !== "tutte" && p.regione !== regione) return false;
      if (minTier > 0 && p.pesoTier < minTier) return false;
      if (soloEmail && !p.email) return false;
      if (soloContattabili && !p.contattabile) return false;
      if (q && !p.nome.toLowerCase().includes(q) && !(p.categoria ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pts, tipo, provincia, categoria, temperatura, stato, regione, fattMin, soloEmail, soloContattabili, search]);

  const shownClienti = filtered.filter((p) => p.tipo === "cliente").length;
  const shownProspect = filtered.length - shownClienti;

  // Ref sempre aggiornato dei punti filtrati (per gli handler di selezione).
  const filteredRef = useRef(filtered);
  useEffect(() => { filteredRef.current = filtered; }, [filtered]);

  // Init mappa (una volta) — 3 layer base + selettore.
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
    });
    const light = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap &copy; <a href="https://carto.com/attributions">CARTO</a>', maxZoom: 20, subdomains: "abcd",
    });
    const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri", maxZoom: 19,
    });
    const map = L.map(mapElRef.current, { center: ITALY_CENTER, zoom: 6, scrollWheelZoom: true, layers: [street] });
    L.control.layers({ Stradale: street, Chiara: light, Satellite: satellite }, {}, { position: "topright" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  // Marker: raggio per fatturato, anello per temperatura.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const p of filtered) {
      const ring = p.temperatura ? tempColor(p.temperatura) : "#ffffff";
      const cm = L.circleMarker([p.lat, p.lng], {
        radius: 6 + p.pesoTier * 2,
        color: ring,
        weight: p.temperatura ? 2.5 : 1.5,
        fillColor: COLOR[p.tipo],
        fillOpacity: p.precise ? 0.9 : 0.6,
      }).bindPopup(popupHtml(p), { maxWidth: 300, minWidth: 200 });
      cm.on("mouseover", () => cm.openPopup());
      cm.addTo(layer);
    }
  }, [filtered]);

  // Selezione ad area: trascina un rettangolo → seleziona i pin dentro.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!selectMode) return;
    map.dragging.disable();
    map.getContainer().style.cursor = "crosshair";
    const draw: { start: L.LatLng | null; rect: L.Rectangle | null } = { start: null, rect: null };
    const onDown = (e: L.LeafletMouseEvent) => {
      draw.start = e.latlng;
      if (draw.rect) draw.rect.remove();
      draw.rect = L.rectangle(L.latLngBounds(e.latlng, e.latlng), { color: "#f97316", weight: 1, fillOpacity: 0.1 }).addTo(map);
    };
    const onMove = (e: L.LeafletMouseEvent) => {
      if (draw.start && draw.rect) draw.rect.setBounds(L.latLngBounds(draw.start, e.latlng));
    };
    const onUp = () => {
      if (!draw.start || !draw.rect) return;
      const b = draw.rect.getBounds();
      const sel = new Set<string>();
      for (const p of filteredRef.current) if (b.contains(L.latLng(p.lat, p.lng))) sel.add(p.id);
      setSelectedIds(sel);
      draw.start = null;
    };
    map.on("mousedown", onDown);
    map.on("mousemove", onMove);
    map.on("mouseup", onUp);
    return () => {
      map.off("mousedown", onDown);
      map.off("mousemove", onMove);
      map.off("mouseup", onUp);
      if (draw.rect) draw.rect.remove();
      map.dragging.enable();
      map.getContainer().style.cursor = "";
    };
  }, [selectMode]);

  const selectedPoints = useMemo(() => filtered.filter((p) => selectedIds.has(p.id)), [filtered, selectedIds]);

  const exportCsv = () => {
    const header = ["Tipo", "Nome", "Categoria", "Stato", "Temperatura", "Fatturato", "Città", "Provincia", "Regione", "Indirizzo", "Email", "Telefono"];
    const body = selectedPoints.map((p) =>
      [p.tipo, p.nome, p.categoria, p.stato, p.temperatura, p.fatturato, p.citta, p.provincia, p.regione, p.indirizzo, p.email, p.telefono]
        .map(csvCell).join(";"));
    const csv = "﻿" + [header.join(";"), ...body].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `aziende-mappa-${selectedPoints.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selCls = (v: string) => (v && v !== "tutte" && v !== "tutti" && v !== "0" ? "border-orange-300 bg-orange-50" : "");

  return (
    <div className="space-y-3">
      {/* Filtri */}
      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Cerca azienda o categoria…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
              <SelectTrigger className={`w-full sm:w-36 ${selCls(tipo)}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="cliente">🟢 Clienti</SelectItem>
                <SelectItem value="prospect">🔴 Prospect</SelectItem>
              </SelectContent>
            </Select>
            <Button variant={showAdv ? "default" : "outline"} onClick={() => setShowAdv((v) => !v)} className="shrink-0">
              <Filter className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Filtri</span>
            </Button>
            <Button variant={selectMode ? "default" : "outline"} onClick={() => setSelectMode((v) => !v)} className="shrink-0" title="Seleziona un'area trascinando sulla mappa">
              <Crosshair className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">{selectMode ? "Trascina…" : "Seleziona area"}</span>
            </Button>
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title="Aggiorna" className="shrink-0">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {showAdv && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-2">
              <Select value={provincia} onValueChange={setProvincia}>
                <SelectTrigger className={`w-36 ${selCls(provincia)}`}><SelectValue placeholder="Provincia" /></SelectTrigger>
                <SelectContent><SelectItem value="tutte">Tutte le province</SelectItem>{province.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={regione} onValueChange={setRegione}>
                <SelectTrigger className={`w-40 ${selCls(regione)}`}><SelectValue placeholder="Regione" /></SelectTrigger>
                <SelectContent><SelectItem value="tutte">Tutte le regioni</SelectItem>{regioni.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className={`w-40 ${selCls(categoria)}`}><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent><SelectItem value="tutte">Tutte le categorie</SelectItem>{categorie.map((c) => <SelectItem key={c} value={c}>{cap(c)}</SelectItem>)}</SelectContent>
              </Select>
              {temperature.length > 0 && (
                <Select value={temperatura} onValueChange={setTemperatura}>
                  <SelectTrigger className={`w-36 ${selCls(temperatura)}`}><SelectValue placeholder="Temperatura" /></SelectTrigger>
                  <SelectContent><SelectItem value="tutte">Ogni temperatura</SelectItem>{temperature.map((t) => <SelectItem key={t} value={t}>{cap(t)}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {stati.length > 0 && (
                <Select value={stato} onValueChange={setStato}>
                  <SelectTrigger className={`w-36 ${selCls(stato)}`}><SelectValue placeholder="Stato" /></SelectTrigger>
                  <SelectContent><SelectItem value="tutti">Ogni stato</SelectItem>{stati.map((s) => <SelectItem key={s} value={s}>{cap(s)}</SelectItem>)}</SelectContent>
                </Select>
              )}
              <Select value={fattMin} onValueChange={setFattMin}>
                <SelectTrigger className={`w-40 ${selCls(fattMin)}`}><SelectValue /></SelectTrigger>
                <SelectContent>{FATT_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-sm">
                <input type="checkbox" checked={soloEmail} onChange={(e) => setSoloEmail(e.target.checked)} /> Solo con email
              </label>
              <label className="flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-sm">
                <input type="checkbox" checked={soloContattabili} onChange={(e) => setSoloContattabili(e.target.checked)} /> Solo contattabili
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Barra selezione */}
      {selectedIds.size > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="flex flex-wrap items-center gap-3 p-3">
            <span className="text-sm font-semibold text-orange-800">{selectedPoints.length} aziende selezionate</span>
            <Button size="sm" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" /> Esporta CSV</Button>
            <span className="text-xs text-orange-700/80">Presto: aggiungi a sequenza outreach · crea opportunità (Ondata 2)</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelectedIds(new Set())}><X className="mr-1 h-4 w-4" /> Svuota</Button>
          </CardContent>
        </Card>
      )}

      {/* Mappa */}
      <Card className="overflow-hidden">
        <div className="relative h-[68vh] min-h-[460px] w-full">
          <div ref={mapElRef} className="h-full w-full" />

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
              <div className="mt-1 text-[10px] text-slate-400">Pin più grande = fatturato · anello = temperatura</div>
            </div>
          )}

          {selectMode && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-full bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
              Trascina per selezionare un'area
            </div>
          )}

          {(isLoading || isError) && (
            <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-3 bg-background/85 text-muted-foreground">
              {isError ? (
                <>
                  <AlertTriangle className="h-6 w-6 text-amber-500" />
                  <span className="text-sm">Impossibile caricare i dati della mappa.</span>
                  <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-1.5 h-4 w-4" /> Riprova</Button>
                </>
              ) : (
                <><Loader2 className="h-5 w-5 animate-spin" /> Caricamento mappa…</>
              )}
            </div>
          )}
        </div>
      </Card>

      {data && (
        <p className="px-1 text-xs text-muted-foreground">
          {filtered.length} di {data.clienti + data.prospect} aziende
          {data.approssimate > 0 && ` · ${data.approssimate} su centroide provincia (posizione approssimata)`}
          {data.senzaPosizione > 0 && ` · ${data.senzaPosizione} senza provincia/coordinate`}
          . Geocodifica stradale precisa + clustering in arrivo (Ondata 2).
        </p>
      )}
    </div>
  );
}

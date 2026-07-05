/**
 * CrmMapTab — tab "Mappa" della dashboard commerciale CRM.
 *
 * Mappa d'Italia (Leaflet VANILLA — react-leaflet@5 crasha su React 18) SCALABILE
 * a 100k+ aziende: NON carica tutti i punti nel browser, ma interroga il DB per
 * il solo riquadro visibile (viewport) via RPC:
 *  • molti punti nel riquadro → CLUSTER aggregati lato server (bolle col numero,
 *    click per zoomare);
 *  • pochi punti (zoom alto) → PIN singoli con popup/dettaglio.
 * Rendering su canvas. VERDE = clienti, ROSSO = prospect.
 *
 * Funzioni: filtri (client-side sui pin visibili), layer, azioni popup
 * (Email/WhatsApp/Chiama), selezione ad area → CSV, heatmap (densità).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import {
  useCrmMapCells, useCrmMapPointsBbox, useCrmRegionStats, precFromZoom,
  type CrmMapPoint, type BBox,
} from "@/hooks/useCrmMapViewport";
import { ITALY_CENTER, REGION_CENTROIDS } from "@/lib/crm/provinceCentroids";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Search, MapPin, AlertTriangle, RefreshCw, Filter, Download, X, Crosshair, Flame, SlidersHorizontal, Eraser, Target, Send, Navigation, BarChart3, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

// leaflet.heat non ha i tipi ufficiali → wrapper tipizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const heatLayer = (L as any).heatLayer as (latlngs: Array<[number, number, number]>, opts?: Record<string, unknown>) => L.Layer;

/** Sotto questa soglia di punti nel riquadro → pin dettagliati; sopra → cluster. */
const POINT_THRESHOLD = 800;

const COLOR = { cliente: "#16a34a", prospect: "#dc2626" } as const;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function tempColor(t: string): string {
  const k = t.toLowerCase();
  if (k.includes("hot") || k.includes("cald")) return "#dc2626";
  if (k.includes("warm") || k.includes("tiep")) return "#f59e0b";
  if (k.includes("cold") || k.includes("fred")) return "#3b82f6";
  return "#64748b";
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// Mappa i tipi attività reali (eventi CRM) → icona + etichetta leggibile.
// L'ordine conta: pattern più specifici prima.
const ACT_META: Array<[RegExp, string, string]> = [
  [/opportunity/, "🎯", "Opportunità"],
  [/stage/, "🔀", "Cambio fase"],
  [/site_lead|lead_submitted/, "🌐", "Lead dal sito"],
  [/assigned/, "🙋", "Assegnazione"],
  [/note|nota/, "📝", "Nota"],
  [/whatsapp/, "💬", "WhatsApp"],
  [/call|chiamata|phone/, "📞", "Chiamata"],
  [/message|email|sent/, "✉️", "Messaggio"],
  [/created|contact/, "👤", "Contatto"],
  [/updated|modif/, "✏️", "Modifica"],
];
function actMeta(t: string): { ic: string; lab: string } {
  const k = t.toLowerCase();
  for (const [re, ic, lab] of ACT_META) if (re.test(k)) return { ic, lab };
  return { ic: "•", lab: t };
}
function pesoTier(num: number | null): number {
  if (num == null) return 0;
  if (num >= 5_000_000) return 4;
  if (num >= 1_000_000) return 3;
  if (num >= 500_000) return 2;
  if (num >= 100_000) return 1;
  return 0;
}
function fmtEuro(num: number | null): string | null {
  if (num == null) return null;
  if (num >= 1_000_000) return `${(num / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} Mln €`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}k €`;
  return `${Math.round(num)} €`;
}
function waLink(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length >= 9 && d.length <= 10 && d.startsWith("3")) d = "39" + d;
  return `https://wa.me/${d}`;
}
function fmtN(n: number): string {
  return n >= 1000 ? `${(n / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k` : String(n);
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
  const fatt = fmtEuro(p.fatturato);
  if (fatt) rows.push(row("Fatturato", escapeHtml(fatt)));
  const luogo = [p.citta, p.provincia].filter(Boolean).map((x) => escapeHtml(String(x))).join(" · ");
  if (luogo) rows.push(row("Zona", `${luogo}${p.regione ? ` (${escapeHtml(p.regione)})` : ""}`));
  if (p.indirizzo) rows.push(row("Indirizzo", escapeHtml(p.indirizzo)));
  const acts = Object.entries(p.attivita || {}).filter(([, n]) => Number(n) > 0);
  if (acts.length) {
    const tot = acts.reduce((s, e) => s + Number(e[1]), 0);
    const chips = acts
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([t, n]) => { const m = actMeta(t); return `<span title="${escapeHtml(m.lab)}">${m.ic} ${Number(n)}</span>`; })
      .join(" · ");
    rows.push(row(`Attività (${tot})`, chips));
  }

  const btn = (href: string, label: string, blank = false) =>
    `<a href="${href}"${blank ? ' target="_blank" rel="noopener"' : ""} style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;background:#f1f5f9;color:#334155;text-decoration:none">${label}</a>`;
  const actions: string[] = [];
  if (p.email) actions.push(btn(`mailto:${escapeHtml(p.email)}`, "✉️ Email"));
  if (p.telefono) actions.push(btn(waLink(p.telefono), "💬 WhatsApp", true));
  if (p.telefono) actions.push(btn(`tel:${escapeHtml(p.telefono)}`, "📞 Chiama"));

  // Conversione diretta dalla mappa: solo per i prospect (contatti mkt-*).
  const clientBtn = (p.tipo === "prospect" && p.id.startsWith("mkt-"))
    ? `<button data-crm-client="${escapeHtml(p.id)}" style="margin-top:7px;width:100%;cursor:pointer;font-size:11px;font-weight:600;padding:5px 8px;border-radius:6px;background:${COLOR.cliente};color:#fff;border:none">✓ Segna come cliente</button>`
    : "";

  return `
    <div style="min-width:200px;max-width:280px;font-size:12px;line-height:1.35">
      <div style="font-weight:600;margin-bottom:3px">${dot}${escapeHtml(p.nome)}</div>
      <div>${tipoBadge}${tempBadge}</div>
      ${rows.join("")}
      ${actions.length ? `<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:5px">${actions.join("")}</div>` : ""}
      ${clientBtn}
      ${!p.precise ? `<div style="margin-top:5px;font-style:italic;color:#d97706;font-size:10px">Posizione approssimata (provincia)</div>` : ""}
    </div>`;
}

function csvCell(v: unknown): string {
  const s = (v ?? "").toString();
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const FATT_OPTS = [
  { v: "0", label: "Qualsiasi fatturato" }, { v: "1", label: "≥ 100k €" },
  { v: "2", label: "≥ 500k €" }, { v: "3", label: "≥ 1 Mln €" }, { v: "4", label: "≥ 5 Mln €" },
];

export function CrmMapTab({ companyId }: { companyId: string }) {
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
  const [heatMode, setHeatMode] = useState(false);
  const [showRegions, setShowRegions] = useState(true);
  const [viewport, setViewport] = useState<{ bbox: BBox | null; zoom: number }>({ bbox: null, zoom: 6 });

  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const renderRef = useRef<L.LayerGroup | null>(null);
  const heatRef = useRef<L.Layer | null>(null);

  const prec = precFromZoom(viewport.zoom);
  const cellsQ = useCrmMapCells(companyId, viewport.bbox, prec);
  const cells = useMemo(() => cellsQ.data ?? [], [cellsQ.data]);
  const totalInView = useMemo(() => cells.reduce((s, c) => s + Number(c.n), 0), [cells]);
  const pointMode = totalInView > 0 && totalInView <= POINT_THRESHOLD;
  const pointsQ = useCrmMapPointsBbox(companyId, viewport.bbox, pointMode);
  const points = useMemo(() => pointsQ.data ?? [], [pointsQ.data]);
  const regionQ = useCrmRegionStats(companyId);
  const regionStats = useMemo(() => (regionQ.data ?? []).filter((r) => r.n > 0), [regionQ.data]);
  const regionMax = useMemo(() => Math.max(1, ...regionStats.map((r) => Number(r.n))), [regionStats]);
  // Totali globali su tutta la mappa (le stats regione sommano l'intero dataset geolocalizzato).
  const totals = useMemo(() => regionStats.reduce(
    (a, r) => ({ n: a.n + Number(r.n), cli: a.cli + Number(r.n_clienti), pro: a.pro + Number(r.n_prospect) }),
    { n: 0, cli: 0, pro: 0 },
  ), [regionStats]);

  /** Centra la mappa sulla regione (se ne conosciamo il centroide). */
  const flyToRegion = (regione: string) => {
    const c = REGION_CENTROIDS[regione.trim().toLowerCase()];
    if (c && mapRef.current) mapRef.current.setView(c, 8, { animate: true });
  };

  const isLoading = cellsQ.isLoading || (pointMode && pointsQ.isLoading);
  const isError = cellsQ.isError || pointsQ.isError;
  const isFetching = cellsQ.isFetching || pointsQ.isFetching;

  const { province, categorie, temperature, stati, regioni } = useMemo(() => {
    const u = (sel: (p: CrmMapPoint) => string | null) => {
      const s = new Set<string>();
      points.forEach((p) => { const v = sel(p); if (v) s.add(v); });
      return Array.from(s).sort();
    };
    return {
      province: u((p) => p.provincia), categorie: u((p) => p.categoria),
      temperature: u((p) => p.temperatura), stati: u((p) => p.stato), regioni: u((p) => p.regione),
    };
  }, [points]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minTier = Number(fattMin);
    return points.filter((p) => {
      if (tipo !== "tutti" && p.tipo !== tipo) return false;
      if (provincia !== "tutte" && p.provincia !== provincia) return false;
      if (categoria !== "tutte" && p.categoria !== categoria) return false;
      if (temperatura !== "tutte" && p.temperatura !== temperatura) return false;
      if (stato !== "tutti" && p.stato !== stato) return false;
      if (regione !== "tutte" && p.regione !== regione) return false;
      if (minTier > 0 && pesoTier(p.fatturato) < minTier) return false;
      if (soloEmail && !p.email) return false;
      if (soloContattabili && !p.email) return false;
      if (q && !p.nome.toLowerCase().includes(q) && !(p.categoria ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [points, tipo, provincia, categoria, temperatura, stato, regione, fattMin, soloEmail, soloContattabili, search]);

  const filteredRef = useRef(filtered);
  useEffect(() => { filteredRef.current = filtered; }, [filtered]);

  // Init mappa (una volta): canvas renderer + layer base + selettore.
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 });
    const light = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { attribution: '&copy; OpenStreetMap &copy; <a href="https://carto.com/attributions">CARTO</a>', maxZoom: 20, subdomains: "abcd" });
    const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles &copy; Esri", maxZoom: 19 });
    const map = L.map(mapElRef.current, { center: ITALY_CENTER, zoom: 6, scrollWheelZoom: true, layers: [street], preferCanvas: true });
    L.control.layers({ Stradale: street, Chiara: light, Satellite: satellite }, {}, { position: "topright" }).addTo(map);
    renderRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const readViewport = () => {
      const b = map.getBounds();
      setViewport({
        bbox: { minLat: b.getSouth(), minLng: b.getWest(), maxLat: b.getNorth(), maxLng: b.getEast() },
        zoom: map.getZoom(),
      });
    };
    let t: ReturnType<typeof setTimeout>;
    const onMoveEnd = () => { clearTimeout(t); t = setTimeout(readViewport, 300); };
    map.on("moveend", onMoveEnd);
    const t0 = setTimeout(() => { map.invalidateSize(); readViewport(); }, 80);
    return () => {
      clearTimeout(t); clearTimeout(t0); map.off("moveend", onMoveEnd);
      map.remove(); mapRef.current = null; renderRef.current = null; heatRef.current = null;
    };
  }, []);

  // Rendering: heatmap | pin dettagliati (pointMode) | cluster-bolle (server cells).
  useEffect(() => {
    const map = mapRef.current;
    const layer = renderRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (heatRef.current) { map.removeLayer(heatRef.current); heatRef.current = null; }

    if (heatMode) {
      const heatData: Array<[number, number, number]> = pointMode
        ? filtered.map((p) => [p.lat, p.lng, 0.4])
        : cells.map((c) => [c.clat, c.clng, Math.min(1, 0.25 + Math.log10(Number(c.n) + 1) * 0.2)]);
      heatRef.current = heatLayer(heatData, { radius: 26, blur: 18, maxZoom: 12, minOpacity: 0.35 }).addTo(map);
      return;
    }

    if (pointMode) {
      for (const p of filtered) {
        const ring = p.temperatura ? tempColor(p.temperatura) : "#ffffff";
        const cm = L.circleMarker([p.lat, p.lng], {
          radius: 6 + pesoTier(p.fatturato) * 2, color: ring, weight: p.temperatura ? 2.5 : 1.5,
          fillColor: COLOR[p.tipo], fillOpacity: p.precise ? 0.9 : 0.6,
        }).bindPopup(popupHtml(p), { maxWidth: 300, minWidth: 200 });
        cm.on("mouseover", () => cm.openPopup());
        cm.addTo(layer);
      }
      return;
    }

    // Cluster-bolle dal server (tanti punti nel riquadro)
    for (const c of cells) {
      const total = Number(c.n);
      const color = (c.n_clienti >= c.n_prospect) ? COLOR.cliente : COLOR.prospect;
      const size = 34 + Math.min(28, Math.log10(total + 1) * 16);
      const icon = L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color}dd;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35);color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:${total > 999 ? 11 : 13}px">${fmtN(total)}</div>`,
        className: "", iconSize: [size, size],
      });
      const mk = L.marker([c.clat, c.clng], { icon });
      mk.on("click", () => map.setView([c.clat, c.clng], Math.min(map.getZoom() + 3, 16)));
      mk.addTo(layer);
    }
  }, [cells, filtered, pointMode, heatMode]);

  // Selezione ad area (solo in point mode: seleziona i pin dentro il rettangolo).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectMode) return;
    map.dragging.disable();
    map.getContainer().style.cursor = "crosshair";
    const draw: { start: L.LatLng | null; rect: L.Rectangle | null } = { start: null, rect: null };
    const onDown = (e: L.LeafletMouseEvent) => {
      draw.start = e.latlng;
      if (draw.rect) draw.rect.remove();
      draw.rect = L.rectangle(L.latLngBounds(e.latlng, e.latlng), { color: "#f97316", weight: 1, fillOpacity: 0.1 }).addTo(map);
    };
    const onMove = (e: L.LeafletMouseEvent) => { if (draw.start && draw.rect) draw.rect.setBounds(L.latLngBounds(draw.start, e.latlng)); };
    const onUp = () => {
      if (!draw.start || !draw.rect) return;
      const b = draw.rect.getBounds();
      const sel = new Set<string>();
      for (const p of filteredRef.current) if (b.contains(L.latLng(p.lat, p.lng))) sel.add(p.id);
      setSelectedIds(sel);
      draw.start = null;
    };
    map.on("mousedown", onDown); map.on("mousemove", onMove); map.on("mouseup", onUp);
    return () => {
      map.off("mousedown", onDown); map.off("mousemove", onMove); map.off("mouseup", onUp);
      if (draw.rect) draw.rect.remove();
      map.dragging.enable(); map.getContainer().style.cursor = "";
    };
  }, [selectMode]);

  const selectedPoints = useMemo(() => filtered.filter((p) => selectedIds.has(p.id)), [filtered, selectedIds]);
  const exportCsv = () => {
    const header = ["Tipo", "Nome", "Categoria", "Stato", "Temperatura", "Fatturato", "Città", "Provincia", "Regione", "Indirizzo", "Email", "Telefono"];
    const body = selectedPoints.map((p) =>
      [p.tipo, p.nome, p.categoria, p.stato, p.temperatura, fmtEuro(p.fatturato), p.citta, p.provincia, p.regione, p.indirizzo, p.email, p.telefono].map(csvCell).join(";"));
    const url = URL.createObjectURL(new Blob(["﻿" + [header.join(";"), ...body].join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `aziende-mappa-${selectedPoints.length}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const selCls = (v: string) => (v && v !== "tutte" && v !== "tutti" && v !== "0" ? "border-orange-300 bg-orange-50" : "");
  const shownClienti = filtered.filter((p) => p.tipo === "cliente").length;
  const shownProspect = filtered.length - shownClienti;
  const activeAdv = [
    provincia !== "tutte", regione !== "tutte", categoria !== "tutte",
    temperatura !== "tutte", stato !== "tutti", fattMin !== "0", soloEmail, soloContattabili,
  ].filter(Boolean).length;
  const resetFilters = () => {
    setProvincia("tutte"); setRegione("tutte"); setCategoria("tutte");
    setTemperatura("tutte"); setStato("tutti"); setFattMin("0");
    setSoloEmail(false); setSoloContattabili(false);
  };

  // ── Azioni outreach dalla selezione ────────────────────────────────────
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [sequenceId, setSequenceId] = useState("");
  // Solo i prospect (i clienti sono già acquisiti). id "mkt-<uuid>" → uuid.
  const selProspectIds = selectedPoints
    .filter((p) => p.tipo === "prospect" && p.id.startsWith("mkt-"))
    .map((p) => p.id.slice(4));

  const pipelineQ = useQuery({
    queryKey: ["crm-map-pipeline", companyId],
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_pipelines")
        .select("id, marketing_pipeline_stages(id, position)")
        .eq("company_id", companyId).order("position").limit(1);
      if (error) throw error;
      const p = (data?.[0] ?? null) as unknown as { id: string; marketing_pipeline_stages: Array<{ id: string; position: number }> } | null;
      if (!p) return null;
      const stages = [...(p.marketing_pipeline_stages ?? [])].sort((a, b) => a.position - b.position);
      return { pipelineId: p.id, stageId: (stages[0]?.id ?? null) as string | null };
    },
  });

  const seqsQ = useQuery({
    queryKey: ["crm-map-seqs", companyId],
    enabled: !!companyId && enrollOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_sequences").select("*").eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; name?: string; nome?: string }>;
    },
  });

  const createOpp = useMutation({
    mutationFn: async () => {
      const pl = pipelineQ.data;
      if (!pl?.pipelineId || !pl?.stageId) throw new Error("Nessuna pipeline/fase configurata per creare opportunità");
      const rows = selectedPoints
        .filter((p) => p.tipo === "prospect" && p.id.startsWith("mkt-"))
        .map((p) => ({
          contact_id: p.id.slice(4), company_id: companyId,
          pipeline_id: pl.pipelineId, stage_id: pl.stageId,
          name: p.nome, value: p.fatturato ?? 0, status: "open", source: "mappa",
        }));
      if (!rows.length) throw new Error("Nessun prospect selezionato");
      const { error } = await supabase.from("marketing_opportunities").insert(rows as never);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => { toast.success(`${n} opportunità create dai prospect selezionati`); setSelectedIds(new Set()); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const enroll = useMutation({
    mutationFn: async () => {
      if (!sequenceId) throw new Error("Scegli una sequenza");
      if (!selProspectIds.length) throw new Error("Nessun prospect selezionato");
      const { data, error } = await supabase.functions.invoke("outreach-enroll", {
        body: { sequence_id: sequenceId, contact_ids: selProspectIds },
      });
      if (error) throw error;
      return Number((data as { enrolled?: number } | null)?.enrolled ?? selProspectIds.length);
    },
    onSuccess: (n) => { toast.success(`${n} contatti iscritti alla sequenza`); setEnrollOpen(false); setSelectedIds(new Set()); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  // Geocodifica stradale precisa: sposta i pin dal centroide provincia alla via reale.
  const geocodeBatch = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("crm-geocode-batch", {
        body: { target: "both", limit: 40 },
      });
      if (error) throw error;
      return (data ?? {}) as { geocoded?: number; processed?: number; remaining?: number };
    },
    onSuccess: (r) => {
      const g = r?.geocoded ?? 0;
      const rem = r?.remaining ?? 0;
      if (g > 0) toast.success(`${g} indirizzi geocodificati${rem ? ` · ${rem} ancora da fare (premi di nuovo)` : " · completato"}`);
      else if (rem > 0) toast.warning(`Nessun indirizzo risolto in questo blocco · ${rem} rimasti`);
      else toast.success("Tutti gli indirizzi disponibili sono già geocodificati");
      cellsQ.refetch(); pointsQ.refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const queryClient = useQueryClient();
  // Invalida (→ refetch) tutte le query della mappa: cells, points, region-stats.
  const refreshMap = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("crm-map-"),
    });
  }, [queryClient]);

  // "Segna come cliente" dal popup → il prospect diventa cliente (pin verde).
  const markClient = useMutation({
    mutationFn: async (contactUuid: string) => {
      const { error } = await supabase.from("marketing_contacts")
        .update({ contact_type: "cliente" }).eq("id", contactUuid).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Segnata come cliente 🟢 · la mappa si aggiorna"); refreshMap(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  // Aggiornamento in tempo reale: quando un'opportunità cambia (es. diventa "vinta"
  // → il contatto è cliente) la mappa si ri-sincronizza da sola.
  const [liveOn, setLiveOn] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    let t: ReturnType<typeof setTimeout>;
    const bump = () => { clearTimeout(t); t = setTimeout(refreshMap, 700); };
    const ch = supabase
      .channel(`crm-map-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_opportunities", filter: `company_id=eq.${companyId}` }, bump)
      .subscribe((status) => setLiveOn(status === "SUBSCRIBED"));
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [companyId, refreshMap]);

  // Bottone "Segna come cliente" dei popup (HTML Leaflet) → mutazione, via event delegation.
  useEffect(() => {
    const el = mapElRef.current;
    if (!el) return;
    const onClick = (ev: MouseEvent) => {
      const btn = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-crm-client]");
      if (!btn) return;
      const cid = btn.getAttribute("data-crm-client") || "";
      if (cid.startsWith("mkt-")) { markClient.mutate(cid.slice(4)); mapRef.current?.closePopup(); }
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [markClient]);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Cerca azienda o categoria…" value={search} onChange={(e) => setSearch(e.target.value)} disabled={!pointMode} />
            </div>
            <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
              <SelectTrigger className={`w-full sm:w-36 ${selCls(tipo)}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="cliente">🟢 Clienti</SelectItem>
                <SelectItem value="prospect">🔴 Prospect</SelectItem>
              </SelectContent>
            </Select>
            <Button variant={showAdv ? "default" : "outline"} onClick={() => setShowAdv((v) => !v)} className="shrink-0" disabled={!pointMode}>
              <Filter className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Filtri</span>
              {activeAdv > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-500 px-1 text-[11px] font-bold text-white">{activeAdv}</span>
              )}
            </Button>
            <Button variant={selectMode ? "default" : "outline"} onClick={() => setSelectMode((v) => !v)} className="shrink-0" disabled={!pointMode} title="Seleziona un'area (zoom su pochi punti)">
              <Crosshair className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">{selectMode ? "Trascina…" : "Seleziona area"}</span>
            </Button>
            <Button variant={heatMode ? "default" : "outline"} onClick={() => setHeatMode((v) => !v)} className="shrink-0" title="Vista densità (heatmap)">
              <Flame className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Heatmap</span>
            </Button>
            <Button variant="outline" onClick={() => geocodeBatch.mutate()} disabled={geocodeBatch.isPending} className="shrink-0" title="Posiziona alla via reale gli indirizzi ancora sul centroide provincia">
              {geocodeBatch.isPending ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" /> : <Navigation className="h-4 w-4 sm:mr-1.5" />}
              <span className="hidden sm:inline">Geocodifica</span>
            </Button>
            <Button variant="outline" size="icon" onClick={() => { cellsQ.refetch(); pointsQ.refetch(); }} disabled={isFetching} title="Aggiorna" className="shrink-0">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {showAdv && pointMode && (
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Filtri avanzati
                  {activeAdv > 0 && <span className="text-orange-600">· {activeAdv} attivi</span>}
                </span>
                {activeAdv > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={resetFilters}>
                    <Eraser className="mr-1 h-3.5 w-3.5" /> Azzera
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={provincia} onValueChange={setProvincia}>
                  <SelectTrigger className={`h-9 w-44 ${selCls(provincia)}`}><SelectValue placeholder="Provincia" /></SelectTrigger>
                  <SelectContent><SelectItem value="tutte">Tutte le province</SelectItem>{province.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={regione} onValueChange={setRegione}>
                  <SelectTrigger className={`h-9 w-44 ${selCls(regione)}`}><SelectValue placeholder="Regione" /></SelectTrigger>
                  <SelectContent><SelectItem value="tutte">Tutte le regioni</SelectItem>{regioni.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger className={`h-9 w-44 ${selCls(categoria)}`}><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent><SelectItem value="tutte">Tutte le categorie</SelectItem>{categorie.map((c) => <SelectItem key={c} value={c}>{cap(c)}</SelectItem>)}</SelectContent>
                </Select>
                {temperature.length > 0 && (
                  <Select value={temperatura} onValueChange={setTemperatura}>
                    <SelectTrigger className={`h-9 w-40 ${selCls(temperatura)}`}><SelectValue placeholder="Temperatura" /></SelectTrigger>
                    <SelectContent><SelectItem value="tutte">Ogni temperatura</SelectItem>{temperature.map((t) => <SelectItem key={t} value={t}>{cap(t)}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {stati.length > 0 && (
                  <Select value={stato} onValueChange={setStato}>
                    <SelectTrigger className={`h-9 w-40 ${selCls(stato)}`}><SelectValue placeholder="Stato" /></SelectTrigger>
                    <SelectContent><SelectItem value="tutti">Ogni stato</SelectItem>{stati.map((s) => <SelectItem key={s} value={s}>{cap(s)}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                <Select value={fattMin} onValueChange={setFattMin}>
                  <SelectTrigger className={`h-9 w-44 ${selCls(fattMin)}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{FATT_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
                <label className={`flex h-9 cursor-pointer select-none items-center gap-2 rounded-md border px-3 text-sm ${soloEmail ? "border-orange-300 bg-orange-50 text-orange-800" : "bg-background"}`}>
                  <Checkbox checked={soloEmail} onCheckedChange={(v) => setSoloEmail(v === true)} /> Solo con email
                </label>
                <label className={`flex h-9 cursor-pointer select-none items-center gap-2 rounded-md border px-3 text-sm ${soloContattabili ? "border-orange-300 bg-orange-50 text-orange-800" : "bg-background"}`}>
                  <Checkbox checked={soloContattabili} onCheckedChange={(v) => setSoloContattabili(v === true)} /> Solo contattabili
                </label>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {totals.n > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 font-medium">
            <MapPin className="h-3.5 w-3.5 text-orange-500" /> {fmtN(totals.n)} sulla mappa
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium" style={{ borderColor: "#bbf7d0", background: "#f0fdf4", color: "#166534" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: COLOR.cliente }} /> {fmtN(totals.cli)} clienti
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: COLOR.prospect }} /> {fmtN(totals.pro)} prospect
          </span>
          {liveOn && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700" title="La mappa si aggiorna automaticamente quando un'azienda diventa cliente">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              Live
            </span>
          )}
        </div>
      )}

      {selectedIds.size > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-sm font-semibold text-orange-800">
              {selectedPoints.length} selezionate{selProspectIds.length > 0 ? ` · ${selProspectIds.length} prospect` : ""}
            </span>
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" /> CSV</Button>
            <Button size="sm" onClick={() => createOpp.mutate()} disabled={!selProspectIds.length || createOpp.isPending || !pipelineQ.data?.stageId} title={!pipelineQ.data?.stageId ? "Nessuna pipeline configurata" : ""}>
              {createOpp.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Target className="mr-1.5 h-4 w-4" />} Crea opportunità
            </Button>
            <Button size="sm" onClick={() => setEnrollOpen(true)} disabled={!selProspectIds.length}>
              <Send className="mr-1.5 h-4 w-4" /> Aggiungi a sequenza
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelectedIds(new Set())}><X className="mr-1 h-4 w-4" /> Svuota</Button>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="relative h-[68vh] min-h-[460px] w-full">
          <div ref={mapElRef} className="h-full w-full" />

          {!isError && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-700">
                <MapPin className="h-3.5 w-3.5 text-orange-500" /> {pointMode ? "Aziende (dettaglio)" : "Aziende (cluster)"}
              </div>
              {pointMode ? (
                <>
                  <div className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR.cliente }} /> Clienti <span className="font-semibold text-slate-800">{shownClienti}</span></div>
                  <div className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR.prospect }} /> Prospect <span className="font-semibold text-slate-800">{shownProspect}</span></div>
                  <div className="mt-1 text-[10px] text-slate-400">Pin: dimensione = fatturato · anello = temperatura</div>
                </>
              ) : (
                <>
                  <div className="font-semibold text-slate-800">{fmtN(totalInView)} aziende nel riquadro</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">Zooma o clicca un cluster per il dettaglio</div>
                </>
              )}
            </div>
          )}

          {selectMode && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-full bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
              Trascina per selezionare un'area
            </div>
          )}
          {isFetching && !isError && (
            <div className="pointer-events-none absolute right-3 top-3 z-[1000] rounded-full bg-white/90 px-2.5 py-1 text-xs text-slate-500 shadow"><Loader2 className="inline h-3 w-3 animate-spin" /> aggiorno…</div>
          )}
          {isLoading && !isError && (
            <div className="absolute inset-0 z-[999] flex items-center justify-center bg-background/70 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Caricamento…</div>
          )}
          {isError && (
            <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-3 bg-background/85 text-muted-foreground">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
              <span className="text-sm">Impossibile caricare i dati della mappa.</span>
              <Button variant="outline" size="sm" onClick={() => { cellsQ.refetch(); pointsQ.refetch(); }}><RefreshCw className="mr-1.5 h-4 w-4" /> Riprova</Button>
            </div>
          )}
        </div>
      </Card>

      {regionStats.length > 0 && (
        <Card>
          <button
            type="button"
            onClick={() => setShowRegions((v) => !v)}
            className="flex w-full items-center justify-between gap-2 p-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-2">
              <BarChart3 className="h-4 w-4 shrink-0 text-orange-500" />
              <span className="text-sm font-semibold">Analisi per regione</span>
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">· dove concentrare l'outreach</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${showRegions ? "rotate-180" : ""}`} />
          </button>
          {showRegions && (
            <CardContent className="space-y-1 p-3 pt-0">
              {regionStats.slice(0, 12).map((r) => {
                const pct = r.n > 0 ? Math.round((Number(r.n_clienti) / Number(r.n)) * 100) : 0;
                const cliW = (Number(r.n_clienti) / regionMax) * 100;
                const proW = (Number(r.n_prospect) / regionMax) * 100;
                const zoomable = !!REGION_CENTROIDS[r.regione.trim().toLowerCase()];
                return (
                  <button
                    key={r.regione}
                    type="button"
                    disabled={!zoomable}
                    onClick={() => flyToRegion(r.regione)}
                    className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs ${zoomable ? "hover:bg-muted/60" : "cursor-default"}`}
                    title={zoomable ? `Centra la mappa su ${r.regione}` : undefined}
                  >
                    <span className="w-24 shrink-0 truncate font-medium sm:w-32">{r.regione}</span>
                    <span className="relative flex h-3 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="h-full" style={{ width: `${cliW}%`, background: COLOR.cliente }} />
                      <span className="h-full" style={{ width: `${proW}%`, background: COLOR.prospect }} />
                    </span>
                    <span className="w-9 shrink-0 text-right font-semibold tabular-nums">{fmtN(Number(r.n))}</span>
                    <span className="hidden w-24 shrink-0 text-right text-[10px] text-muted-foreground sm:inline">
                      {fmtN(Number(r.n_clienti))} cli · {fmtN(Number(r.n_prospect))} pro
                    </span>
                    <span className="w-9 shrink-0 text-right text-[10px] font-medium text-emerald-600">{pct}%</span>
                  </button>
                );
              })}
              <div className="pt-1 text-[10px] text-muted-foreground">
                Barra: <span style={{ color: COLOR.cliente }}>■</span> clienti · <span style={{ color: COLOR.prospect }}>■</span> prospect · % = penetrazione clienti. Clicca una regione per centrarla.
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <p className="px-1 text-xs text-muted-foreground">
        Aggregazione lato server per riquadro visibile: la mappa scala a 100k+ aziende.
        {!pointMode && " Zooma per vedere i singoli pin, i filtri e la selezione."}
      </p>

      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Aggiungi a sequenza outreach</DialogTitle>
            <DialogDescription>{selProspectIds.length} prospect verranno iscritti alla sequenza scelta (chi ha già risposto / opt-out viene escluso).</DialogDescription>
          </DialogHeader>
          <Select value={sequenceId} onValueChange={setSequenceId}>
            <SelectTrigger><SelectValue placeholder={seqsQ.isLoading ? "Carico…" : "Scegli una sequenza"} /></SelectTrigger>
            <SelectContent>
              {!seqsQ.isLoading && (seqsQ.data ?? []).length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">Nessuna sequenza. Creane una in Outreach.</div>
              )}
              {(seqsQ.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name || s.nome || s.id}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollOpen(false)}>Annulla</Button>
            <Button onClick={() => enroll.mutate()} disabled={!sequenceId || enroll.isPending}>
              {enroll.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Iscrivi {selProspectIds.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

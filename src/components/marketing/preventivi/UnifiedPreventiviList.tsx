/**
 * UnifiedPreventiviList — vista unica "Preventivi" cross-modulo.
 *
 * Aggrega in una sola tabella:
 *   - quotes (Classico)
 *   - sr_progetti (Serramenti)
 *   - v_fv_progetti_dashboard (Fotovoltaico)
 *
 * Layout:
 *   1. KPI Hero (4 metriche principali)
 *   2. Striscia avanzata navy (4 metriche aggiuntive)
 *   3. Grafici: Trend 6 mesi + Donut distribuzione per tipo
 *   4. Toolbar: search + Filtra + Export + counter
 *   5. Sub-tab stati
 *   6. Chip filtri attivi
 *   7. Tabella unificata (7 colonne) con paginazione + mobile cards
 *
 * Mapping stati cross-modulo → 5 unified states (bozza, in_corso, vinto, perso, altro).
 * Filtri persistenti in URL (?stato=…&tipo=…) per refresh/back-friendly.
 */
import { useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { neutralizeXlsxCell } from "@/lib/csvExport";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useModuliVendita } from "@/lib/moduli-vendita";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, ChevronRight, ChevronLeft, FileText, RectangleVertical, Sun,
  Inbox, X, Target, TrendingUp, Clock, FileCheck2, Euro,
  SlidersHorizontal, Download, Loader2, Hammer, Bath, Home, Wind, Zap, Flame, LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subMonths, startOfMonth, isSameMonth } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { UnifiedFiltersSheet, type UnifiedFilters, DEFAULT_FILTERS } from "./UnifiedFiltersSheet";
import {
  mapClassicoStato,
  mapSerramentiStato,
  mapFotovoltaicoStato,
  mapRistrutturazioneStato,
  type UnifiedStato,
} from "@/lib/preventivi/statoUnificato";

export type PreventivoTipo = "classico" | "serramenti" | "fotovoltaico" | "ristrutturazione" | "bagni" | "tetti" | "climatizzazione" | "elettrico" | "termoidraulico" | "pavimenti";
export type { UnifiedStato };

export interface UnifiedRow {
  id: string;
  tipo: PreventivoTipo;
  numero: string;
  cliente: string;
  commerciale_id: string | null;
  commerciale_nome: string | null;
  stato_unif: UnifiedStato;
  stato_raw: string;
  totale: number | null;
  data: string;
  href: string;
}

export const TIPO_LABEL: Record<PreventivoTipo, { label: string; className: string; color: string; Icon: React.ComponentType<{ className?: string }> }> = {
  classico:         { label: "Classico",         className: "bg-slate-100 text-slate-700 border-slate-200",   color: "#64748b", Icon: FileText },
  serramenti:       { label: "Serramenti",       className: "bg-orange-100 text-orange-700 border-orange-200", color: "#f97316", Icon: RectangleVertical },
  fotovoltaico:     { label: "Fotovoltaico",     className: "bg-amber-100 text-amber-800 border-amber-200",    color: "#f59e0b", Icon: Sun },
  ristrutturazione: { label: "Ristrutturazione", className: "bg-teal-100 text-teal-700 border-teal-200",       color: "#0d9488", Icon: Hammer },
  bagni:            { label: "Bagni",            className: "bg-cyan-100 text-cyan-700 border-cyan-200",       color: "#0891b2", Icon: Bath },
  tetti:            { label: "Tetti",            className: "bg-stone-100 text-stone-700 border-stone-200",    color: "#78716c", Icon: Home },
  climatizzazione:  { label: "Climatizzazione",  className: "bg-sky-100 text-sky-700 border-sky-200",          color: "#0284c7", Icon: Wind },
  elettrico:        { label: "Elettrico",        className: "bg-amber-100 text-amber-700 border-amber-200",    color: "#d97706", Icon: Zap },
  termoidraulico:   { label: "Termoidraulico",   className: "bg-rose-100 text-rose-700 border-rose-200",       color: "#e11d48", Icon: Flame },
  pavimenti:        { label: "Pavimenti",        className: "bg-teal-100 text-teal-700 border-teal-200",       color: "#0d9488", Icon: LayoutGrid },
};

export const STATO_UNIF_LABEL: Record<UnifiedStato, { label: string; className: string }> = {
  bozza:    { label: "Bozza",    className: "bg-slate-100 text-slate-700 border-slate-200" },
  in_corso: { label: "In corso", className: "bg-blue-50 text-[#173b67] border-blue-200" },
  vinto:    { label: "Vinto",    className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  perso:    { label: "Perso",    className: "bg-rose-100 text-rose-700 border-rose-200" },
  altro:    { label: "Altro",    className: "bg-slate-100 text-slate-500 border-slate-200" },
};

// Le mappature di stato cross-modulo (mapClassicoStato/mapSerramentiStato/
// mapFotovoltaicoStato) vivono in @/lib/preventivi/statoUnificato — single
// source rispecchiata dalla vista DB v_preventivi_unificati.

const PAGE_SIZE = 50;

/** Format date sicuro: ritorna "—" se la stringa non è una data valida. */
function formatDateSafe(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return format(d, "d MMM yyyy", { locale: it });
}

export function UnifiedPreventiviList() {
  const navigate = useNavigate();
  const companyId = useEffectiveCompanyId();
  const { moduli } = useModuliVendita();
  const [searchParams, setSearchParams] = useSearchParams();

  // ─── Stato locale: filtri + UI ─────────────────────────────────────────
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [statoTab, setStatoTab] = useState<UnifiedStato | "all">(
    (searchParams.get("stato") as UnifiedStato | "all") || "all"
  );
  const [filters, setFilters] = useState<UnifiedFilters>(() => ({
    ...DEFAULT_FILTERS,
    tipi: (searchParams.get("tipi")?.split(",").filter(Boolean) as PreventivoTipo[]) ?? [],
    commercialeId: searchParams.get("comm") ?? "all",
    sort: (searchParams.get("sort") as UnifiedFilters["sort"]) ?? "recent",
  }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Sync URL ←→ stato filtri principali (debounced minimal: solo on commit)
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (search) next.set("q", search); else next.delete("q");
    if (statoTab !== "all") next.set("stato", statoTab); else next.delete("stato");
    if (filters.tipi.length > 0) next.set("tipi", filters.tipi.join(",")); else next.delete("tipi");
    if (filters.commercialeId !== "all") next.set("comm", filters.commercialeId); else next.delete("comm");
    if (filters.sort !== "recent") next.set("sort", filters.sort); else next.delete("sort");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statoTab, filters.tipi, filters.commercialeId, filters.sort]);

  const serramentiEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "serramenti")?.isEnabled ?? false,
    [moduli],
  );
  const fotovoltaicoEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "fotovoltaico")?.isEnabled ?? false,
    [moduli],
  );
  const ristrutturazioneEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "ristrutturazione")?.isEnabled ?? false,
    [moduli],
  );
  const bagniEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "bagni")?.isEnabled ?? false,
    [moduli],
  );
  const tettiEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "tetti")?.isEnabled ?? false,
    [moduli],
  );
  const climatizzazioneEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "climatizzazione")?.isEnabled ?? false,
    [moduli],
  );
  const elettricoEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "elettrico")?.isEnabled ?? false,
    [moduli],
  );
  const termoidraulicoEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "termoidraulico")?.isEnabled ?? false,
    [moduli],
  );
  const pavimentiEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "pavimenti")?.isEnabled ?? false,
    [moduli],
  );

  // ─── Queries ─────────────────────────────────────────────────────────────
  const { data: quotesData = [], isLoading: loadingQuotes } = useQuery({
    queryKey: ["unified-prev-quotes", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, client_name, status, total, salesperson_id, created_at, updated_at")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return data as Array<{
        id: string; quote_number: string; client_name: string | null;
        status: string; total: number | null; salesperson_id: string | null;
        created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: serramentiData = [], isLoading: loadingSerramenti } = useQuery({
    queryKey: ["unified-prev-serramenti", companyId],
    enabled: !!companyId && serramentiEnabled,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("sr_progetti")
        .select("id, code, cliente_nome, cliente_cognome, stato, totale_min, totale_max, consulente_id, created_at, updated_at")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string; cliente_nome: string | null; cliente_cognome: string | null;
        stato: string; totale_min: number | null; totale_max: number | null;
        consulente_id: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: fvData = [], isLoading: loadingFv } = useQuery({
    queryKey: ["unified-prev-fv", companyId],
    enabled: !!companyId && fotovoltaicoEnabled,
    queryFn: async () => {
      // Query alla TABLE (non alla view v_fv_progetti_dashboard) perché la view
      // non espone created_by. Ricaviamo cliente_nome con nested join su
      // marketing_contacts (FK fv_progetti.cliente_id → marketing_contacts.id).
      // Filtriamo annullato=false per matchare il comportamento della view originale.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("fv_progetti")
        .select(`
          id, numero, stato, prezzo_vendita_iva_inclusa, created_by, created_at, updated_at,
          cliente:marketing_contacts(first_name, last_name)
        `)
        .eq("company_id", companyId!)
        .eq("annullato", false)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      type ClienteJoin = { first_name: string | null; last_name: string | null } | null;
      type Row = {
        id: string; numero: string; stato: string;
        prezzo_vendita_iva_inclusa: number | null;
        created_by: string | null;
        created_at: string; updated_at: string | null;
        cliente: ClienteJoin;
      };
      return ((data ?? []) as Row[]).map((r) => ({
        id: r.id,
        numero: r.numero,
        stato: r.stato,
        prezzo_vendita_iva_inclusa: r.prezzo_vendita_iva_inclusa,
        created_by: r.created_by,
        created_at: r.created_at,
        updated_at: r.updated_at,
        cliente_nome: r.cliente
          ? [r.cliente.first_name, r.cliente.last_name].filter(Boolean).join(" ") || null
          : null,
      }));
    },
  });

  const { data: ristrutturazioneData = [], isLoading: loadingRistrutturazione } = useQuery({
    queryKey: ["unified-prev-ristrutturazione", companyId],
    enabled: !!companyId && ristrutturazioneEnabled,
    queryFn: async () => {
      // Tabella rst_* non ancora nei tipi generati → query via (supabase as any),
      // stesso pattern di sr_progetti. La vista DB v_preventivi_unificati
      // (migration locale 20271001010000) rispecchia questo merge lato server.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("rst_progetti")
        .select("id, code, cliente_nome, cliente_cognome, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; cliente_nome: string | null; cliente_cognome: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: bagniData = [], isLoading: loadingBagni } = useQuery({
    queryKey: ["unified-prev-bagni", companyId],
    enabled: !!companyId && bagniEnabled,
    queryFn: async () => {
      // Tabella bgn_* non ancora nei tipi generati → query via (supabase as any),
      // stesso pattern di rst_progetti.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("bgn_progetti")
        .select("id, code, cliente_nome, cliente_cognome, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; cliente_nome: string | null; cliente_cognome: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: tettiData = [], isLoading: loadingTetti } = useQuery({
    queryKey: ["unified-prev-tetti", companyId],
    enabled: !!companyId && tettiEnabled,
    queryFn: async () => {
      // Tabella tet_* non ancora nei tipi generati → query via (supabase as any).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("tet_progetti")
        .select("id, code, cliente_nome, cliente_cognome, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; cliente_nome: string | null; cliente_cognome: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: climatizzazioneData = [], isLoading: loadingClimatizzazione } = useQuery({
    queryKey: ["unified-prev-climatizzazione", companyId],
    enabled: !!companyId && climatizzazioneEnabled,
    queryFn: async () => {
      // Tabella clm_* non ancora nei tipi generati → query via (supabase as any).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("clm_progetti")
        .select("id, code, cliente_nome, cliente_cognome, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; cliente_nome: string | null; cliente_cognome: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: elettricoData = [], isLoading: loadingElettrico } = useQuery({
    queryKey: ["unified-prev-elettrico", companyId],
    enabled: !!companyId && elettricoEnabled,
    queryFn: async () => {
      // Tabella ele_* non ancora nei tipi generati → query via (supabase as any).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("ele_progetti")
        .select("id, code, cliente_nome, cliente_cognome, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; cliente_nome: string | null; cliente_cognome: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: termoidraulicoData = [], isLoading: loadingTermoidraulico } = useQuery({
    queryKey: ["unified-prev-termoidraulico", companyId],
    enabled: !!companyId && termoidraulicoEnabled,
    queryFn: async () => {
      // Tabella idr_* non ancora nei tipi generati → query via (supabase as any).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("idr_progetti")
        .select("id, code, cliente_nome, cliente_cognome, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; cliente_nome: string | null; cliente_cognome: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: pavimentiData = [], isLoading: loadingPavimenti } = useQuery({
    queryKey: ["unified-prev-pavimenti", companyId],
    enabled: !!companyId && pavimentiEnabled,
    queryFn: async () => {
      // Tabella pav_* non ancora nei tipi generati → query via (supabase as any).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pav_progetti")
        .select("id, code, cliente_nome, cliente_cognome, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; cliente_nome: string | null; cliente_cognome: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["unified-prev-profiles", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>;
    },
  });
  const { data: salespeople = [] } = useQuery({
    queryKey: ["unified-prev-salespeople", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("id, first_name, last_name")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>;
    },
  });

  const commercialeNameById = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p) => {
      m.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || p.id.slice(0, 6));
    });
    salespeople.forEach((s) => m.set(s.id, `${s.first_name} ${s.last_name}`));
    return m;
  }, [profiles, salespeople]);

  const commercialiOptions = useMemo(() => {
    return Array.from(commercialeNameById.entries()).map(([id, name]) => ({ id, name }));
  }, [commercialeNameById]);

  // ─── Merge unificato ─────────────────────────────────────────────────────
  const allRows: UnifiedRow[] = useMemo(() => {
    const rows: UnifiedRow[] = [];
    for (const q of quotesData) {
      rows.push({
        id: q.id, tipo: "classico",
        numero: q.quote_number ?? "—",
        cliente: q.client_name ?? "—",
        commerciale_id: q.salesperson_id,
        commerciale_nome: q.salesperson_id ? commercialeNameById.get(q.salesperson_id) ?? null : null,
        stato_unif: mapClassicoStato(q.status),
        stato_raw: q.status,
        totale: q.total != null ? Number(q.total) : null,
        data: q.updated_at ?? q.created_at,
        href: `/azienda/marketing/preventivi/${q.id}`,
      });
    }
    for (const s of serramentiData) {
      const totale = s.totale_min && s.totale_max
        ? (Number(s.totale_min) + Number(s.totale_max)) / 2
        : null;
      rows.push({
        id: s.id, tipo: "serramenti",
        numero: s.code ?? "—",
        cliente: [s.cliente_nome, s.cliente_cognome].filter(Boolean).join(" ") || "—",
        commerciale_id: s.consulente_id,
        commerciale_nome: s.consulente_id ? commercialeNameById.get(s.consulente_id) ?? null : null,
        stato_unif: mapSerramentiStato(s.stato),
        stato_raw: s.stato,
        totale,
        data: s.updated_at ?? s.created_at,
        href: `/azienda/serramenti/${s.id}/modifica`,
      });
    }
    for (const f of fvData) {
      rows.push({
        id: f.id, tipo: "fotovoltaico",
        numero: f.numero ?? "—",
        cliente: f.cliente_nome ?? "—",
        commerciale_id: f.created_by,
        commerciale_nome: f.created_by ? commercialeNameById.get(f.created_by) ?? null : null,
        stato_unif: mapFotovoltaicoStato(f.stato),
        stato_raw: f.stato,
        totale: f.prezzo_vendita_iva_inclusa != null ? Number(f.prezzo_vendita_iva_inclusa) : null,
        data: f.updated_at ?? f.created_at,
        href: `/azienda/marketing/fotovoltaico/${f.id}`,
      });
    }
    for (const r of ristrutturazioneData) {
      rows.push({
        id: r.id, tipo: "ristrutturazione",
        numero: r.code ?? "—",
        cliente: [r.cliente_nome, r.cliente_cognome].filter(Boolean).join(" ") || "—",
        commerciale_id: r.created_by,
        commerciale_nome: r.created_by ? commercialeNameById.get(r.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(r.stato),
        stato_raw: r.stato,
        totale: r.totale != null ? Number(r.totale) : null,
        data: r.updated_at ?? r.created_at,
        href: `/azienda/ristrutturazione/${r.id}/modifica`,
      });
    }
    for (const b of bagniData) {
      rows.push({
        id: b.id, tipo: "bagni",
        numero: b.code ?? "—",
        cliente: [b.cliente_nome, b.cliente_cognome].filter(Boolean).join(" ") || "—",
        commerciale_id: b.created_by,
        commerciale_nome: b.created_by ? commercialeNameById.get(b.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(b.stato),
        stato_raw: b.stato,
        totale: b.totale != null ? Number(b.totale) : null,
        data: b.updated_at ?? b.created_at,
        href: `/azienda/bagni/${b.id}/modifica`,
      });
    }
    for (const t of tettiData) {
      rows.push({
        id: t.id, tipo: "tetti",
        numero: t.code ?? "—",
        cliente: [t.cliente_nome, t.cliente_cognome].filter(Boolean).join(" ") || "—",
        commerciale_id: t.created_by,
        commerciale_nome: t.created_by ? commercialeNameById.get(t.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(t.stato),
        stato_raw: t.stato,
        totale: t.totale != null ? Number(t.totale) : null,
        data: t.updated_at ?? t.created_at,
        href: `/azienda/tetti/${t.id}/modifica`,
      });
    }
    for (const c of climatizzazioneData) {
      rows.push({
        id: c.id, tipo: "climatizzazione",
        numero: c.code ?? "—",
        cliente: [c.cliente_nome, c.cliente_cognome].filter(Boolean).join(" ") || "—",
        commerciale_id: c.created_by,
        commerciale_nome: c.created_by ? commercialeNameById.get(c.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(c.stato),
        stato_raw: c.stato,
        totale: c.totale != null ? Number(c.totale) : null,
        data: c.updated_at ?? c.created_at,
        href: `/azienda/climatizzazione/${c.id}/modifica`,
      });
    }
    for (const e of elettricoData) {
      rows.push({
        id: e.id, tipo: "elettrico",
        numero: e.code ?? "—",
        cliente: [e.cliente_nome, e.cliente_cognome].filter(Boolean).join(" ") || "—",
        commerciale_id: e.created_by,
        commerciale_nome: e.created_by ? commercialeNameById.get(e.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(e.stato),
        stato_raw: e.stato,
        totale: e.totale != null ? Number(e.totale) : null,
        data: e.updated_at ?? e.created_at,
        href: `/azienda/elettrico/${e.id}/modifica`,
      });
    }
    for (const td of termoidraulicoData) {
      rows.push({
        id: td.id, tipo: "termoidraulico",
        numero: td.code ?? "—",
        cliente: [td.cliente_nome, td.cliente_cognome].filter(Boolean).join(" ") || "—",
        commerciale_id: td.created_by,
        commerciale_nome: td.created_by ? commercialeNameById.get(td.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(td.stato),
        stato_raw: td.stato,
        totale: td.totale != null ? Number(td.totale) : null,
        data: td.updated_at ?? td.created_at,
        href: `/azienda/termoidraulico/${td.id}/modifica`,
      });
    }
    for (const pv of pavimentiData) {
      rows.push({
        id: pv.id, tipo: "pavimenti",
        numero: pv.code ?? "—",
        cliente: [pv.cliente_nome, pv.cliente_cognome].filter(Boolean).join(" ") || "—",
        commerciale_id: pv.created_by,
        commerciale_nome: pv.created_by ? commercialeNameById.get(pv.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(pv.stato),
        stato_raw: pv.stato,
        totale: pv.totale != null ? Number(pv.totale) : null,
        data: pv.updated_at ?? pv.created_at,
        href: `/azienda/pavimenti/${pv.id}/modifica`,
      });
    }
    return rows;
  }, [quotesData, serramentiData, fvData, ristrutturazioneData, bagniData, tettiData, climatizzazioneData, elettricoData, termoidraulicoData, pavimentiData, commercialeNameById]);

  // ─── KPI globali (su dataset completo) ───────────────────────────────────
  const kpi = useMemo(() => {
    const by = (k: UnifiedStato) => allRows.filter((r) => r.stato_unif === k);
    const bozze = by("bozza");
    const inCorso = by("in_corso");
    const vinte = by("vinto");
    const perse = by("perso");

    const ricavoVinte = vinte.reduce((acc, r) => acc + (r.totale ?? 0), 0);
    const pipeline = inCorso.reduce((acc, r) => acc + (r.totale ?? 0), 0);
    const valorePerse = perse.reduce((acc, r) => acc + (r.totale ?? 0), 0);
    const decisioni = vinte.length + perse.length;
    const tassoConv = decisioni > 0 ? Math.round((vinte.length / decisioni) * 100) : null;
    const offerteAttive = inCorso.length + vinte.length + perse.length;
    const valoreMedio = offerteAttive > 0 ? (pipeline + ricavoVinte + valorePerse) / offerteAttive : 0;
    const ticketMedio = vinte.length > 0 ? ricavoVinte / vinte.length : 0;

    return {
      total: allRows.length,
      bozzeCount: bozze.length,
      inCorsoCount: inCorso.length,
      vintaCount: vinte.length,
      persoCount: perse.length,
      ricavoVinte, pipeline,
      tassoConv, valoreMedio, ticketMedio,
    };
  }, [allRows]);

  // ─── Chart data: trend ultimi 6 mesi (creati vs vinti) ──────────────────
  const trendData = useMemo(() => {
    const now = new Date();
    const months: Array<{ key: string; label: string; date: Date }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = startOfMonth(subMonths(now, i));
      months.push({
        key: format(d, "yyyy-MM"),
        label: format(d, "MMM", { locale: it }),
        date: d,
      });
    }
    return months.map((m) => {
      const creati = allRows.filter((r) => isSameMonth(new Date(r.data), m.date)).length;
      const vinti = allRows.filter((r) => r.stato_unif === "vinto" && isSameMonth(new Date(r.data), m.date)).length;
      return { mese: m.label, creati, vinti };
    });
  }, [allRows]);

  // ─── Chart data: distribuzione per tipo ─────────────────────────────────
  const tipoDist = useMemo(() => {
    const counts: Record<PreventivoTipo, number> = { classico: 0, serramenti: 0, fotovoltaico: 0, ristrutturazione: 0, bagni: 0, tetti: 0, climatizzazione: 0, elettrico: 0, termoidraulico: 0, pavimenti: 0 };
    allRows.forEach((r) => { counts[r.tipo]++; });
    return [
      { name: "Classico",         value: counts.classico,         color: TIPO_LABEL.classico.color },
      { name: "Serramenti",       value: counts.serramenti,       color: TIPO_LABEL.serramenti.color },
      { name: "Fotovoltaico",     value: counts.fotovoltaico,     color: TIPO_LABEL.fotovoltaico.color },
      { name: "Ristrutturazione", value: counts.ristrutturazione, color: TIPO_LABEL.ristrutturazione.color },
      { name: "Bagni",            value: counts.bagni,            color: TIPO_LABEL.bagni.color },
      { name: "Tetti",            value: counts.tetti,            color: TIPO_LABEL.tetti.color },
      { name: "Climatizzazione",  value: counts.climatizzazione,  color: TIPO_LABEL.climatizzazione.color },
      { name: "Elettrico",        value: counts.elettrico,        color: TIPO_LABEL.elettrico.color },
      { name: "Termoidraulico",   value: counts.termoidraulico,   color: TIPO_LABEL.termoidraulico.color },
      { name: "Pavimenti",        value: counts.pavimenti,        color: TIPO_LABEL.pavimenti.color },
    ].filter((d) => d.value > 0);
  }, [allRows]);

  // ─── Filtri applicati ────────────────────────────────────────────────────
  // Edge cases gestiti:
  //  - importoMin/Max NaN → ignorato (no false negatives)
  //  - importoMin > importoMax → swap automatico (UX-forgiving)
  //  - dateFrom > dateTo → swap automatico
  //  - data riga malformata → tieni la riga (no falso esclusione)
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let importoMinN = filters.importoMin === "" ? null : Number(filters.importoMin);
    let importoMaxN = filters.importoMax === "" ? null : Number(filters.importoMax);
    if (importoMinN != null && !Number.isFinite(importoMinN)) importoMinN = null;
    if (importoMaxN != null && !Number.isFinite(importoMaxN)) importoMaxN = null;
    if (importoMinN != null && importoMaxN != null && importoMinN > importoMaxN) {
      [importoMinN, importoMaxN] = [importoMaxN, importoMinN];
    }
    let dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    let dateTo = filters.dateTo ? new Date(filters.dateTo + "T23:59:59") : null;
    if (dateFrom && isNaN(dateFrom.getTime())) dateFrom = null;
    if (dateTo && isNaN(dateTo.getTime())) dateTo = null;
    if (dateFrom && dateTo && dateFrom > dateTo) {
      [dateFrom, dateTo] = [dateTo, dateFrom];
    }

    let out = allRows.filter((r) => {
      if (statoTab !== "all" && r.stato_unif !== statoTab) return false;
      if (filters.tipi.length > 0 && !filters.tipi.includes(r.tipo)) return false;
      if (filters.commercialeId !== "all") {
        if (filters.commercialeId === "none") {
          if (r.commerciale_id) return false;
        } else if (r.commerciale_id !== filters.commercialeId) return false;
      }
      if (filters.stati.length > 0 && !filters.stati.includes(r.stato_unif)) return false;
      if (importoMinN != null && (r.totale ?? 0) < importoMinN) return false;
      if (importoMaxN != null && (r.totale ?? 0) > importoMaxN) return false;
      if (dateFrom || dateTo) {
        const data = new Date(r.data);
        if (!isNaN(data.getTime())) {
          if (dateFrom && data < dateFrom) return false;
          if (dateTo && data > dateTo) return false;
        }
      }
      if (s) {
        const blob = `${r.numero} ${r.cliente} ${r.commerciale_nome ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });

    // Sort. tsSafe: data malformata → 0 (le mando in fondo)
    const tsOf = (s: string) => {
      const t = new Date(s).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    out = [...out].sort((a, b) => {
      switch (filters.sort) {
        case "value_desc": return (b.totale ?? 0) - (a.totale ?? 0);
        case "value_asc":  return (a.totale ?? 0) - (b.totale ?? 0);
        case "code_asc":   return a.numero.localeCompare(b.numero);
        case "code_desc":  return b.numero.localeCompare(a.numero);
        case "client_asc": return a.cliente.localeCompare(b.cliente);
        case "recent":
        default:
          return tsOf(b.data) - tsOf(a.data);
      }
    });
    return out;
  }, [allRows, search, statoTab, filters]);

  // Reset pagina su cambio filtri (reset intenzionale di stato derivato).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPage(1); }, [search, statoTab, filters]);

  // ─── Paginazione ─────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  // ─── Conta filtri attivi (esclusi search + statoTab che sono inline) ────
  const advancedFiltersCount = useMemo(() => {
    let n = 0;
    if (filters.tipi.length > 0) n++;
    if (filters.commercialeId !== "all") n++;
    if (filters.stati.length > 0) n++;
    if (filters.importoMin !== "") n++;
    if (filters.importoMax !== "") n++;
    if (filters.dateFrom !== "") n++;
    if (filters.dateTo !== "") n++;
    if (filters.sort !== "recent") n++;
    return n;
  }, [filters]);

  const hasAnyFilter = search !== "" || statoTab !== "all" || advancedFiltersCount > 0;

  const reset = () => {
    setSearch("");
    setStatoTab("all");
    setFilters(DEFAULT_FILTERS);
  };

  // ─── Export Excel (cross-modulo) ─────────────────────────────────────────
  const handleExportExcel = async () => {
    if (filtered.length === 0) {
      toast.error("Nessun preventivo da esportare");
      return;
    }
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Edilizia in Cloud";
      wb.created = new Date();
      const ws = wb.addWorksheet("Preventivi", { properties: { defaultRowHeight: 18 } });

      ws.columns = [
        { header: "Numero",       key: "numero",       width: 18 },
        { header: "Cliente",      key: "cliente",      width: 28 },
        { header: "Tipo",         key: "tipo",         width: 14 },
        { header: "Commerciale",  key: "commerciale",  width: 22 },
        { header: "Stato",        key: "stato",        width: 14 },
        { header: "Stato originale", key: "statoRaw",  width: 16 },
        { header: "Totale (€)",   key: "totale",       width: 14, style: { numFmt: '#,##0.00' } },
        { header: "Data",         key: "data",         width: 14, style: { numFmt: 'dd/mm/yyyy' } },
      ];
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };

      filtered.forEach((r) => {
        ws.addRow({
          numero: neutralizeXlsxCell(r.numero),
          cliente: neutralizeXlsxCell(r.cliente),
          tipo: TIPO_LABEL[r.tipo].label,
          commerciale: neutralizeXlsxCell(r.commerciale_nome ?? ""),
          stato: STATO_UNIF_LABEL[r.stato_unif].label,
          statoRaw: neutralizeXlsxCell(r.stato_raw),
          totale: r.totale ?? 0,
          data: new Date(r.data),
        });
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `preventivi-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Esportati ${filtered.length} preventivi`);
    } catch (e) {
      console.error("[unified-prev] export failed", e);
      toast.error(`Errore export: ${e instanceof Error ? e.message : "sconosciuto"}`);
    } finally {
      setExporting(false);
    }
  };

  const isLoading = loadingQuotes || loadingSerramenti || loadingFv || loadingRistrutturazione || loadingBagni || loadingTetti || loadingClimatizzazione || loadingElettrico || loadingTermoidraulico || loadingPavimenti;

  const tabCounts = {
    all: allRows.length,
    bozza: kpi.bozzeCount,
    in_corso: kpi.inCorsoCount,
    vinto: kpi.vintaCount,
    perso: kpi.persoCount,
  };

  return (
    <div className="space-y-6">
      {/* ─── KPI Hero 4 cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Bozze" value={kpi.bozzeCount} hint="da completare" icon={<FileText className="h-4 w-4" />} tone="slate" />
        <KpiCard label="In corso" value={kpi.inCorsoCount} hint={kpi.pipeline > 0 ? `${formatCurrency(kpi.pipeline)} in pipeline` : "nessuna pipeline"} icon={<TrendingUp className="h-4 w-4" />} tone="blue" />
        <KpiCard label="Vinte" value={kpi.vintaCount} hint={kpi.tassoConv !== null ? `${kpi.tassoConv}% conversion rate` : "—"} icon={<FileCheck2 className="h-4 w-4" />} tone="emerald" />
        <KpiCard label="Ricavo firmato" value={formatCurrency(kpi.ricavoVinte)} hint={kpi.vintaCount > 0 ? `ticket medio ${formatCurrency(kpi.ticketMedio)}` : "nessuna firmata"} icon={<Euro className="h-4 w-4" />} tone="orange" />
      </div>

      {/* ─── Striscia navy avanzata ─── */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-[#1E3A5F] to-[#2C5184] p-4 sm:p-5 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <AdvKpi icon={<Target className="h-4 w-4 text-orange-300" />} label="Tasso conversione" value={kpi.tassoConv !== null ? `${kpi.tassoConv}%` : "—"} hint={kpi.vintaCount + kpi.persoCount > 0 ? `${kpi.vintaCount}/${kpi.vintaCount + kpi.persoCount} con risposta` : undefined} />
          <AdvKpi icon={<TrendingUp className="h-4 w-4 text-orange-300" />} label="Pipeline attiva" value={formatCurrency(kpi.pipeline)} hint={`${kpi.inCorsoCount} offert${kpi.inCorsoCount === 1 ? "a" : "e"}`} />
          <AdvKpi icon={<FileText className="h-4 w-4 text-orange-300" />} label="Valore medio" value={formatCurrency(kpi.valoreMedio)} hint={`su ${kpi.total - kpi.bozzeCount} offert${kpi.total - kpi.bozzeCount === 1 ? "a" : "e"}`} />
          <AdvKpi icon={<Clock className="h-4 w-4 text-orange-300" />} label="Cross-modulo" value={`${allRows.length}`} hint={[
            quotesData.length > 0 ? `${quotesData.length} classici` : null,
            serramentiData.length > 0 ? `${serramentiData.length} serramenti` : null,
            fvData.length > 0 ? `${fvData.length} fotovoltaico` : null,
            ristrutturazioneData.length > 0 ? `${ristrutturazioneData.length} ristrutturazione` : null,
            bagniData.length > 0 ? `${bagniData.length} bagni` : null,
            tettiData.length > 0 ? `${tettiData.length} tetti` : null,
            climatizzazioneData.length > 0 ? `${climatizzazioneData.length} climatizzazione` : null,
            elettricoData.length > 0 ? `${elettricoData.length} elettrico` : null,
            termoidraulicoData.length > 0 ? `${termoidraulicoData.length} termoidraulico` : null,
            pavimentiData.length > 0 ? `${pavimentiData.length} pavimenti` : null,
          ].filter(Boolean).join(" · ") || "totale preventivi"} />
        </div>
      </div>

      {/* ─── Grafici ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <span className="inline-block w-1 h-4 bg-orange-500 rounded" />
                  Trend ultimi 6 mesi
                </h3>
                <p className="text-[11px] text-muted-foreground">Preventivi creati vs vinti</p>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {formatCurrency(kpi.ricavoVinte)} firmato
              </span>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mese" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                  <RTooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="creati" name="Creati" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="vinti"  name="Vinti"  fill="#f97316" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <span className="inline-block w-1 h-4 bg-orange-500 rounded" />
                  Distribuzione per tipo
                </h3>
                <p className="text-[11px] text-muted-foreground">{allRows.length} preventivi totali</p>
              </div>
            </div>
            <div className="h-48">
              {tipoDist.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={tipoDist} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                      {tipoDist.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  Nessun dato
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Toolbar: search + Filtra + Export + counter ─── */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cerca per numero, cliente o commerciale…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtri
            {advancedFiltersCount > 0 && (
              <Badge className="ml-1 h-5 px-1.5 bg-orange-500 hover:bg-orange-500 text-[10px]">
                {advancedFiltersCount}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline" size="sm" className="h-9 gap-1.5"
            onClick={handleExportExcel}
            disabled={exporting || filtered.length === 0}
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Excel
          </Button>
          {hasAnyFilter && (
            <Button variant="ghost" size="sm" onClick={reset} className="h-9 text-xs gap-1">
              <X className="h-3.5 w-3.5" /> Azzera
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} di {allRows.length}
            {totalPages > 1 && ` · pag ${currentPage}/${totalPages}`}
          </span>
        </CardContent>
      </Card>

      {/* ─── Chip filtri attivi ─── */}
      {advancedFiltersCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.tipi.length > 0 && (
            <FilterChip label={`Tipi: ${filters.tipi.map((t) => TIPO_LABEL[t].label).join(", ")}`} onClear={() => setFilters({ ...filters, tipi: [] })} />
          )}
          {filters.commercialeId !== "all" && (
            <FilterChip
              label={`Comm: ${filters.commercialeId === "none" ? "non assegnato" : commercialeNameById.get(filters.commercialeId) ?? "—"}`}
              onClear={() => setFilters({ ...filters, commercialeId: "all" })}
            />
          )}
          {filters.stati.length > 0 && (
            <FilterChip label={`Stati: ${filters.stati.map((s) => STATO_UNIF_LABEL[s].label).join(", ")}`} onClear={() => setFilters({ ...filters, stati: [] })} />
          )}
          {filters.importoMin !== "" && <FilterChip label={`Min: €${filters.importoMin}`} onClear={() => setFilters({ ...filters, importoMin: "" })} />}
          {filters.importoMax !== "" && <FilterChip label={`Max: €${filters.importoMax}`} onClear={() => setFilters({ ...filters, importoMax: "" })} />}
          {filters.dateFrom !== "" && <FilterChip label={`Da: ${filters.dateFrom}`} onClear={() => setFilters({ ...filters, dateFrom: "" })} />}
          {filters.dateTo !== "" && <FilterChip label={`A: ${filters.dateTo}`} onClear={() => setFilters({ ...filters, dateTo: "" })} />}
          {filters.sort !== "recent" && <FilterChip label={`Ordine: ${SORT_LABEL[filters.sort]}`} onClear={() => setFilters({ ...filters, sort: "recent" })} />}
        </div>
      )}

      {/* ─── Sub-tab stati ─── */}
      <div className="flex items-center gap-1 overflow-x-auto pb-px">
        <StatoTab label="Tutti" count={tabCounts.all} active={statoTab === "all"} onClick={() => setStatoTab("all")} />
        <StatoTab label="Bozze" count={tabCounts.bozza} active={statoTab === "bozza"} onClick={() => setStatoTab("bozza")} tone="slate" />
        <StatoTab label="In corso" count={tabCounts.in_corso} active={statoTab === "in_corso"} onClick={() => setStatoTab("in_corso")} tone="blue" />
        <StatoTab label="Vinte" count={tabCounts.vinto} active={statoTab === "vinto"} onClick={() => setStatoTab("vinto")} tone="emerald" />
        <StatoTab label="Perse" count={tabCounts.perso} active={statoTab === "perso"} onClick={() => setStatoTab("perso")} tone="rose" />
      </div>

      {/* ─── Tabella ─── */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : allRows.length === 0 ? (
            <div className="p-10 text-center">
              <Inbox className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm font-medium">Nessun preventivo ancora</p>
              <p className="text-xs text-muted-foreground mt-1">
                Crea il primo preventivo dal bottone in alto.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm font-medium">Nessun risultato con i filtri attuali</p>
              <div className="flex gap-2 justify-center mt-3">
                <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)} className="text-xs gap-1">
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Modifica filtri
                </Button>
                <Button variant="ghost" size="sm" onClick={reset} className="text-xs gap-1">
                  <X className="h-3.5 w-3.5" /> Azzera tutto
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Numero</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Cliente</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Tipo</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Commerciale</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Stato</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 text-right">Totale</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Data</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => {
                      const tipoCfg = TIPO_LABEL[r.tipo];
                      const statoCfg = STATO_UNIF_LABEL[r.stato_unif];
                      const TipoIcon = tipoCfg.Icon;
                      return (
                        <TableRow
                          key={`${r.tipo}-${r.id}`}
                          className="cursor-pointer hover:bg-orange-50/40 transition-colors"
                          onClick={() => navigate(r.href)}
                        >
                          <TableCell className="font-mono text-xs font-semibold text-orange-600">{r.numero}</TableCell>
                          <TableCell className="text-xs font-medium text-slate-900 max-w-[200px] truncate">{r.cliente}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-[10px] font-medium gap-1", tipoCfg.className)}>
                              <TipoIcon className="h-3 w-3" /> {tipoCfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 max-w-[140px] truncate">
                            {r.commerciale_nome ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-[10px] font-medium", statoCfg.className)}>
                              {statoCfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums font-medium">
                            {r.totale != null ? formatCurrency(r.totale) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground">
                            {formatDateSafe(r.data)}
                          </TableCell>
                          <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden p-2 space-y-2">
                {pageRows.map((r) => {
                  const tipoCfg = TIPO_LABEL[r.tipo];
                  const statoCfg = STATO_UNIF_LABEL[r.stato_unif];
                  const TipoIcon = tipoCfg.Icon;
                  return (
                    <div
                      key={`${r.tipo}-${r.id}`}
                      className="rounded-lg border bg-card p-3 space-y-2 cursor-pointer hover:bg-orange-50/30"
                      onClick={() => navigate(r.href)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="font-mono text-xs font-semibold text-orange-600">{r.numero}</span>
                            <Badge variant="outline" className={cn("text-[10px] gap-1", tipoCfg.className)}>
                              <TipoIcon className="h-3 w-3" /> {tipoCfg.label}
                            </Badge>
                            <Badge variant="outline" className={cn("text-[10px]", statoCfg.className)}>{statoCfg.label}</Badge>
                          </div>
                          <p className="text-sm font-medium truncate">{r.cliente}</p>
                          {r.commerciale_nome && <p className="text-[11px] text-muted-foreground truncate">👤 {r.commerciale_nome}</p>}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium tabular-nums">
                          {r.totale != null ? formatCurrency(r.totale) : <span className="text-muted-foreground">—</span>}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDateSafe(r.data)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 p-3 border-t bg-slate-50/40">
                  <span className="text-xs text-muted-foreground">
                    {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} di {filtered.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1} aria-label="Pagina precedente">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs px-2 tabular-nums">Pag {currentPage} / {totalPages}</span>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages} aria-label="Pagina successiva">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Sheet filtri laterale ─── */}
      <UnifiedFiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onApply={setFilters}
        commerciali={commercialiOptions}
        serramentiEnabled={serramentiEnabled}
        fotovoltaicoEnabled={fotovoltaicoEnabled}
        ristrutturazioneEnabled={ristrutturazioneEnabled}
        bagniEnabled={bagniEnabled}
        tettiEnabled={tettiEnabled}
        climatizzazioneEnabled={climatizzazioneEnabled}
        elettricoEnabled={elettricoEnabled}
        termoidraulicoEnabled={termoidraulicoEnabled}
        pavimentiEnabled={pavimentiEnabled}
        totalResults={filtered.length}
      />
    </div>
  );
}

/* ─── Sort labels (esportati per chip) ──────────────────────────────────── */
const SORT_LABEL: Record<UnifiedFilters["sort"], string> = {
  recent: "Più recenti",
  value_desc: "Importo ↓",
  value_asc: "Importo ↑",
  code_asc: "Codice A→Z",
  code_desc: "Codice Z→A",
  client_asc: "Cliente A→Z",
};

/* ─── Componenti interni ────────────────────────────────────────────────── */

type KpiTone = "slate" | "blue" | "emerald" | "orange";
const KPI_TONE: Record<KpiTone, { border: string; iconBg: string; iconColor: string; valueColor: string }> = {
  slate:   { border: "border-l-slate-400",   iconBg: "bg-slate-100",   iconColor: "text-slate-600",   valueColor: "text-slate-900" },
  blue:    { border: "border-l-blue-500",    iconBg: "bg-blue-100",    iconColor: "text-blue-700",    valueColor: "text-blue-700" },
  emerald: { border: "border-l-emerald-500", iconBg: "bg-emerald-100", iconColor: "text-emerald-700", valueColor: "text-emerald-700" },
  orange:  { border: "border-l-orange-500",  iconBg: "bg-orange-100",  iconColor: "text-orange-600",  valueColor: "text-orange-600" },
};

function KpiCard({
  label, value, hint, icon, tone = "slate",
}: { label: string; value: string | number; hint?: string; icon: React.ReactNode; tone?: KpiTone }) {
  const c = KPI_TONE[tone];
  return (
    <div className={cn("bg-white border-l-4 rounded-lg shadow-sm p-3 sm:p-4", c.border)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">{label}</p>
        <span className={cn("h-7 w-7 rounded-md flex items-center justify-center shrink-0", c.iconBg, c.iconColor)}>{icon}</span>
      </div>
      <p className={cn("text-2xl font-bold mt-1 tabular-nums truncate", c.valueColor)}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
    </div>
  );
}

function AdvKpi({
  icon, label, value, hint,
}: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-slate-300 font-semibold">{label}</p>
        <p className="text-lg font-bold text-white tabular-nums truncate">{value}</p>
        {hint && <p className="text-[10px] text-slate-300 truncate">{hint}</p>}
      </div>
    </div>
  );
}

function StatoTab({
  label, count, active, onClick, tone,
}: { label: string; count: number; active: boolean; onClick: () => void; tone?: "slate" | "blue" | "emerald" | "rose" }) {
  const toneClass = tone === "blue" ? "bg-blue-100 text-blue-700"
    : tone === "emerald" ? "bg-emerald-100 text-emerald-700"
    : tone === "rose" ? "bg-rose-100 text-rose-700"
    : tone === "slate" ? "bg-slate-200 text-slate-700"
    : "bg-orange-100 text-orange-700";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 h-8 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 shrink-0",
        active ? "bg-orange-50 text-orange-700 ring-1 ring-orange-200" : "text-muted-foreground hover:bg-slate-50",
      )}
    >
      {label}
      <span className={cn("text-[10px] px-1.5 py-0.5 rounded tabular-nums", toneClass)}>{count}</span>
    </button>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-full bg-orange-100 hover:bg-orange-200 text-orange-700 text-[11px] px-2.5 py-1 transition-colors"
    >
      {label}
      <X className="h-3 w-3" />
    </button>
  );
}

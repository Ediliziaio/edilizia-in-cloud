import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Loader2, BrainCircuit, Copy, Check, ChevronDown, ChevronUp, Percent, ExternalLink,
  TrendingUp, Target, Award, AlertTriangle, Users,
} from "lucide-react";
import { Navigate, Link } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreventivoDato {
  quote_id: string;
  quote_number: string;
  tipo_lavoro: string | null;
  ricavo_totale: number | null;
  costo_totale: number | null;
  margine_pct: number | null;
}

interface AnalisiDati {
  totalPreventivi: number;
  ricavoTotale: number;
  margineMediano: number;
  valoreMediano: number;
  preventivi: PreventivoDato[];
}

// ─── Quick questions ──────────────────────────────────────────────────────────

const DOMANDE_RAPIDE = [
  "Quali tipi di lavoro rendono di più?",
  "Ho prezzi competitivi?",
  "Dove perdo più margine?",
  "Cosa mi conviene spingere di più?",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AnalisiPreventivi() {
  const [periodoMesi, setPeriodoMesi] = useState("12");
  const [domanda, setDomanda] = useState("");
  const [analisi, setAnalisi] = useState<string | null>(null);
  const [analisiTimestamp, setAnalisiTimestamp] = useState<Date | null>(null);
  const [dati, setDati] = useState<AnalisiDati | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingKpi, setLoadingKpi] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);
  const [spFilter, setSpFilter] = useState<string>("tutti");
  const [statusRowFilter, setStatusRowFilter] = useState<string>("tutti");

  const { effectiveCompany, isLoading: authLoading } = useAuth() as any;
  const permissions = usePermissions();
  const companyId = effectiveCompany?.id as string | undefined;
  // Analisi AI = dati margini/commissioni → gate PER-AZIENDA sulla vista margini/costi
  // (prima ruolo GLOBALE → un admin multi-azienda vedeva l'analisi anche dove è
  // solo staff marketing).
  const isAdmin = permissions.canViewMargins || permissions.canViewCosts;

  // Fetch commerciali per filtro
  const { data: salespeopleList = [] } = useQuery({
    queryKey: ["salespeople-for-analisi", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("id, first_name, last_name")
        .eq("company_id", companyId!)
        .order("last_name");
      if (error) throw error;
      return data as Array<{ id: string; first_name: string; last_name: string }>;
    },
  });

  // ─── Approvazioni pending (banner admin) ───────────────────────────────────
  const { data: pendingApprovals = [] } = useQuery({
    queryKey: ["analisi-pending-approvals", companyId],
    enabled: !!companyId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_approvals")
        .select("id, quote_id, sconto_richiesto_pct, importo_preventivo, requested_at")
        .eq("company_id", companyId!)
        .is("decision", null)
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return data as Array<{ id: string; quote_id: string; sconto_richiesto_pct: number; importo_preventivo: number; requested_at: string }>;
    },
  });

  // ─── Arricchimento tabella con sconto/provv (join lato client) ─────────────
  const { data: quotesExtra = [] } = useQuery({
    queryKey: ["analisi-quotes-extra", companyId, dati?.preventivi.map((p) => p.quote_id).join(",")],
    enabled: !!companyId && !!dati && dati.preventivi.length > 0,
    queryFn: async () => {
      const ids = dati!.preventivi.map((p) => p.quote_id);
      const { data, error } = await supabase
        .from("quotes")
        .select("id, discount_percent, commission_amount_snapshot, approval_status, salesperson_id")
        .eq("company_id", companyId!)
        .in("id", ids);
      if (error) throw error;
      return data as Array<{ id: string; discount_percent: number | null; commission_amount_snapshot: number | null; approval_status: string | null; salesperson_id: string | null }>;
    },
  });

  const quotesExtraById = new Map(quotesExtra.map((q) => [q.id, q]));

  // ─── Legge il target margine dalle impostazioni aziendali ──────────────────
  const { data: impostazioni } = useQuery({
    queryKey: ["preventivo-impostazioni", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // Colonne reali di preventivo_impostazioni (prima si chiedevano
      // margine_minimo/target_percentuale, inesistenti → 400).
      const { data } = await (supabase.from("preventivo_impostazioni") as any)
        .select("margine_target_default, margine_minimo_percentuale")
        .eq("company_id", companyId)
        .maybeSingle();
      return data as { margine_target_default: number | null; margine_minimo_percentuale: number | null } | null;
    },
  });

  const margineTarget = impostazioni?.margine_target_default ?? 25;
  const margineMin = impostazioni?.margine_minimo_percentuale ?? 15;

  // ─── Carica KPI / dati strutturati al cambio periodo ──────────────────────
  useEffect(() => {
    if (!companyId) return;
    setLoadingKpi(true);
    setAnalisi(null);         // B2: reset analisi stale al cambio periodo
    setAnalisiTimestamp(null);
    setShowAllRows(false);
    const mesiKpi = parseInt(periodoMesi, 10) || 12;
    supabase.functions
      .invoke("ai-analisi-preventivi", {
        body: { company_id: companyId, periodo_mesi: mesiKpi },
      })
      .then(({ data, error }) => {
        if (error) {
          toast.error("Errore nel caricamento dei dati");
        } else if (data) {
          setDati(data.dati ?? data);
        }
      })
      .finally(() => setLoadingKpi(false));
  }, [companyId, periodoMesi]);

  // ─── Analisi AI ───────────────────────────────────────────────────────────
  const handleAnalizza = useCallback(async (domandaOverride?: string) => {
    if (!companyId) {
      toast.error("Azienda non caricata, riprova");
      return;
    }
    setLoading(true);
    const domandaEffettiva =
      domandaOverride !== undefined ? domandaOverride : domanda.trim() || undefined;
    try {
      const { data, error } = await supabase.functions.invoke("ai-analisi-preventivi", {
        body: {
          company_id: companyId,
          periodo_mesi: parseInt(periodoMesi, 10) || 12,
          domanda: domandaEffettiva,
        },
      });
      if (error) {
        toast.error("Errore durante l'analisi AI");
      } else if (data) {
        setAnalisi(data.analisi ?? null);
        setDati(data.dati ?? data);
        if (data.analisi) setAnalisiTimestamp(new Date());
      }
    } catch {
      toast.error("Errore imprevisto durante l'analisi");
    } finally {
      setLoading(false);
    }
  }, [companyId, periodoMesi, domanda]);

  // ─── Copy analisi ─────────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    if (!analisi) return;
    navigator.clipboard.writeText(analisi).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [analisi]);

  // ─── Guard admin — DOPO tutti i hook ──────────────────────────────────────
  if (!authLoading && !isAdmin) return <Navigate to="/azienda/marketing" replace />;

  // ─── Chart data ───────────────────────────────────────────────────────────
  const chartData = dati?.preventivi
    ? Object.values(
        dati.preventivi.reduce<Record<string, { tipo: string; count: number; margine_sum: number }>>(
          (acc, p) => {
            const key = p.tipo_lavoro || "Non specificato";
            if (!acc[key]) acc[key] = { tipo: key, count: 0, margine_sum: 0 };
            acc[key].count++;
            acc[key].margine_sum += p.margine_pct || 0;
            return acc;
          },
          {},
        ),
      ).map((v) => ({
        tipo: v.tipo,
        margine: v.count > 0 ? Math.round((v.margine_sum / v.count) * 10) / 10 : 0,
      }))
    : [];

  // ─── Insights avanzati (v3) ───────────────────────────────────────────────
  const insightsV3 = (() => {
    if (!dati || dati.preventivi.length === 0) return null;
    const preventivi = dati.preventivi;

    // Distribuzione margine: ottimo (≥25%), ok (15-25%), critico (<15%)
    const marginBuckets = { ottimo: 0, ok: 0, critico: 0, nd: 0 };
    preventivi.forEach((p) => {
      if (p.margine_pct == null) { marginBuckets.nd++; return; }
      if (p.margine_pct >= 25) marginBuckets.ottimo++;
      else if (p.margine_pct >= 15) marginBuckets.ok++;
      else marginBuckets.critico++;
    });

    // Top commerciali per valore/margine medio
    const bySalesperson = new Map<string, { name: string; count: number; ricavoTot: number; marginSum: number; marginCount: number }>();
    quotesExtra.forEach((q) => {
      const spId = q.salesperson_id ?? "none";
      const name = spId === "none" ? "Senza commerciale" : salespeopleList.find((s) => s.id === spId)?.first_name + " " + salespeopleList.find((s) => s.id === spId)?.last_name || "?";
      const prev = preventivi.find((p) => p.quote_id === q.id);
      if (!prev) return;
      const entry = bySalesperson.get(spId) ?? { name, count: 0, ricavoTot: 0, marginSum: 0, marginCount: 0 };
      entry.count++;
      entry.ricavoTot += prev.ricavo_totale ?? 0;
      if (prev.margine_pct != null) { entry.marginSum += prev.margine_pct; entry.marginCount++; }
      bySalesperson.set(spId, entry);
    });
    const topSalespeople = Array.from(bySalesperson.values())
      .map((e) => ({ ...e, marginAvg: e.marginCount > 0 ? e.marginSum / e.marginCount : 0 }))
      .sort((a, b) => b.ricavoTot - a.ricavoTot)
      .slice(0, 5);

    // Distribuzione sconti: 0-5, 5-10, 10-20, >20
    const discountBuckets = { noSconto: 0, lieve: 0, medio: 0, forte: 0 };
    quotesExtra.forEach((q) => {
      const d = q.discount_percent ?? 0;
      if (d === 0) discountBuckets.noSconto++;
      else if (d < 10) discountBuckets.lieve++;
      else if (d < 20) discountBuckets.medio++;
      else discountBuckets.forte++;
    });

    // Trend margine (per mese - derivato da quote_id prefisso OFF-YYYY-NNN)
    // Non abbiamo created_at qui → skip per ora.

    return { marginBuckets, topSalespeople, discountBuckets };
  })();

  const MARGIN_COLORS = { ottimo: "#16a34a", ok: "#eab308", critico: "#ef4444", nd: "#94a3b8" };
  const DISCOUNT_COLORS = { noSconto: "#16a34a", lieve: "#3b82f6", medio: "#f97316", forte: "#ef4444" };

  const preventiviFiltered = (dati?.preventivi ?? []).filter((p) => {
    const extra = quotesExtraById.get(p.quote_id);
    if (spFilter !== "tutti") {
      if (spFilter === "none" && extra?.salesperson_id) return false;
      if (spFilter !== "none" && extra?.salesperson_id !== spFilter) return false;
    }
    if (statusRowFilter !== "tutti") {
      if ((extra?.approval_status ?? "not_required") !== statusRowFilter) return false;
    }
    return true;
  });
  const righeVisibili = showAllRows
    ? preventiviFiltered
    : preventiviFiltered.slice(0, 10);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center shrink-0">
            <BrainCircuit className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Analisi preventivi <span className="text-violet-600">AI</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Insights intelligenti sui tuoi preventivi storici
            </p>
          </div>
        </div>
      </div>

      {/* Filtri compatti */}
      <div className="flex items-center gap-2 flex-wrap p-3 border rounded-lg bg-muted/30">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mr-2">
          Filtri
        </span>
        <Select value={periodoMesi} onValueChange={setPeriodoMesi}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Ultimi 3 mesi</SelectItem>
            <SelectItem value="6">Ultimi 6 mesi</SelectItem>
            <SelectItem value="12">Ultimo anno</SelectItem>
            <SelectItem value="24">Ultimi 2 anni</SelectItem>
          </SelectContent>
        </Select>
        <Select value={spFilter} onValueChange={setSpFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Commerciale" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i commerciali</SelectItem>
            <SelectItem value="none">Senza commerciale</SelectItem>
            {salespeopleList.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.first_name} {s.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusRowFilter} onValueChange={setStatusRowFilter}>
          <SelectTrigger className="w-[170px] h-8 text-xs">
            <SelectValue placeholder="Stato approvazione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti gli stati</SelectItem>
            <SelectItem value="not_required">Normali</SelectItem>
            <SelectItem value="pending">In approvazione</SelectItem>
            <SelectItem value="approved">Approvati</SelectItem>
            <SelectItem value="rejected">Rifiutati</SelectItem>
            <SelectItem value="counter_proposed">Contro-proposta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isAdmin && pendingApprovals.length > 0 && (
        <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 dark:border-orange-900/50">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center shrink-0">
              <Percent className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <p className="font-medium text-sm">
                {pendingApprovals.length} richiest
                {pendingApprovals.length === 1 ? "a" : "e"} di sconto in attesa
              </p>
              <p className="text-xs text-muted-foreground">
                Totale impattato:{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(
                    pendingApprovals.reduce(
                      (s, p) => s + (p.importo_preventivo ?? 0),
                      0
                    )
                  )}
                </span>
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="bg-orange-600 hover:bg-orange-700">
            <Link to="/azienda/marketing/preventivi?tab=approvazioni">
              Gestisci richieste
            </Link>
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="overflow-hidden border-l-4 border-l-slate-400">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Analizzati
              </p>
              <Users className="h-4 w-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold mt-1.5">
              {loadingKpi ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                dati?.totalPreventivi ?? "—"
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">preventivi nel periodo</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Ricavo totale
              </p>
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold mt-1.5 truncate">
              {loadingKpi ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : dati?.ricavoTotale != null ? (
                formatCurrency(dati.ricavoTotale)
              ) : (
                "—"
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">su preventivi chiusi</p>
          </CardContent>
        </Card>
        <Card
          className={`overflow-hidden border-l-4 ${
            dati?.margineMediano != null
              ? dati.margineMediano >= margineTarget
                ? "border-l-emerald-500"
                : dati.margineMediano >= margineMin
                ? "border-l-amber-500"
                : "border-l-red-500"
              : "border-l-slate-400"
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Margine medio
              </p>
              <Target
                className={`h-4 w-4 ${
                  dati?.margineMediano != null
                    ? dati.margineMediano >= margineTarget
                      ? "text-emerald-500"
                      : dati.margineMediano >= margineMin
                      ? "text-amber-500"
                      : "text-red-500"
                    : "text-slate-500"
                }`}
              />
            </div>
            <div className="text-2xl font-bold mt-1.5 tabular-nums">
              {loadingKpi ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : dati?.margineMediano != null ? (
                `${dati.margineMediano.toFixed(1)}%`
              ) : (
                "—"
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              target {margineTarget}% · min {margineMin}%
            </p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Valore medio
              </p>
              <Award className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold mt-1.5 truncate">
              {loadingKpi ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : dati?.valoreMediano != null ? (
                formatCurrency(dati.valoreMediano)
              ) : (
                "—"
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">per preventivo</p>
          </CardContent>
        </Card>
      </div>

      {/* AI Panel — redesign */}
      <Card className="border-violet-200 dark:border-violet-900/50 bg-gradient-to-br from-violet-50/30 to-transparent dark:from-violet-950/20">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
              <BrainCircuit className="h-5 w-5 text-violet-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold">Chiedi all'AI</h3>
              <p className="text-xs text-muted-foreground">
                Fai una domanda sul tuo storico — o usa un suggerimento rapido
              </p>
            </div>
          </div>

          {/* Domande rapide */}
          <div className="flex flex-wrap gap-1.5">
            {DOMANDE_RAPIDE.map((q) => (
              <Button
                key={q}
                variant="outline"
                size="sm"
                className="h-7 text-xs border-violet-200 dark:border-violet-900/50 hover:bg-violet-50 hover:border-violet-400 dark:hover:bg-violet-950/40"
                onClick={() => {
                  setDomanda(q);
                  setTimeout(() => handleAnalizza(q), 0);
                }}
                disabled={loading}
              >
                {q}
              </Button>
            ))}
          </div>

          <div className="flex gap-2 items-stretch">
            <Textarea
              placeholder="Scrivi la tua domanda o scegli un suggerimento sopra… (Cmd/Ctrl+Enter per inviare)"
              value={domanda}
              onChange={(e) => setDomanda(e.target.value)}
              rows={2}
              className="flex-1 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAnalizza();
              }}
            />
            <div className="flex flex-col gap-1.5 shrink-0">
              <Button
                onClick={() => handleAnalizza()}
                disabled={loading}
                className="bg-violet-600 hover:bg-violet-700"
                size="sm"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <BrainCircuit className="h-4 w-4 mr-1" />
                )}
                Analizza
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDomanda("");
                  handleAnalizza("");
                }}
                disabled={loading}
                className="text-xs h-7"
                title="Genera un'analisi completa senza domanda specifica"
              >
                Generale
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 gap-1 border-violet-200 hover:bg-violet-50"
                onClick={() => {
                  // Apri chat Silvio con prompt pre-popolato
                  const prompt = domanda?.trim()
                    ? `Analisi preventivi (ultimi ${periodoMesi} mesi): ${domanda.trim()}`
                    : `Analizza i miei preventivi degli ultimi ${periodoMesi} mesi: tipi di lavoro più redditizi, win-rate, suggerimenti operativi.`;
                  // Salva nel localStorage per pre-fill chat
                  try { sessionStorage.setItem("silvio_prefill_message", prompt); } catch { /* ignore */ }
                  window.location.href = "/azienda/chat";
                }}
              >
                ✨ Chiedi a Silvio
              </Button>
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 px-3 rounded-md bg-violet-50/50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900/50">
              <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
              L'AI sta analizzando {dati?.totalPreventivi ?? ""} preventivi…
            </div>
          )}

          {analisi && !loading && (
            <div className="relative rounded-lg border border-violet-200 dark:border-violet-900/50 bg-white dark:bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-violet-100 dark:border-violet-900/50 px-4 py-2 bg-violet-50/40 dark:bg-violet-950/20 rounded-t-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-violet-900 dark:text-violet-200">
                  <BrainCircuit className="h-3.5 w-3.5" />
                  Risposta AI
                  {analisiTimestamp && (
                    <span className="font-normal text-muted-foreground">
                      ·{" "}
                      {format(analisiTimestamp, "d MMM 'ore' HH:mm", {
                        locale: it,
                      })}
                    </span>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={handleCopy}
                  title="Copia analisi"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="p-4 text-sm whitespace-pre-wrap leading-relaxed">
                {analisi}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Empty state — nessun dato */}
      {!dati && !loadingKpi && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BrainCircuit className="h-12 w-12 mx-auto mb-4 text-violet-300" />
            <p className="font-medium">Nessun dato disponibile</p>
            <p className="text-sm mt-1">Accetta alcuni preventivi per iniziare l'analisi</p>
            <Button className="mt-4" onClick={() => handleAnalizza()}>
              Prova l'analisi
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state — dati presenti ma nessun preventivo */}
      {dati && (!dati.preventivi || dati.preventivi.length === 0) && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="font-medium">Nessun preventivo accettato nel periodo selezionato</p>
            <p className="text-sm mt-1">Prova ad allargare il range temporale</p>
          </CardContent>
        </Card>
      )}

      {/* Insights v3 — distribuzioni e leaderboard */}
      {insightsV3 && dati && dati.preventivi.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-violet-600" />
                Salute margine
              </CardTitle>
              <p className="text-xs text-muted-foreground">Distribuzione dei preventivi per fascia di margine</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Ottimo (≥25%)", value: insightsV3.marginBuckets.ottimo, color: MARGIN_COLORS.ottimo },
                      { name: "OK (15-25%)", value: insightsV3.marginBuckets.ok, color: MARGIN_COLORS.ok },
                      { name: "Critico (<15%)", value: insightsV3.marginBuckets.critico, color: MARGIN_COLORS.critico },
                      { name: "N/D", value: insightsV3.marginBuckets.nd, color: MARGIN_COLORS.nd },
                    ].filter((d) => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    outerRadius={65}
                    dataKey="value"
                    label={(e) => `${e.value}`}
                  >
                    {[MARGIN_COLORS.ottimo, MARGIN_COLORS.ok, MARGIN_COLORS.critico, MARGIN_COLORS.nd].map((c, i) => (
                      <Cell key={i} fill={c} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Percent className="h-4 w-4 text-orange-500" />
                Distribuzione sconti
              </CardTitle>
              <p className="text-xs text-muted-foreground">Quanto stai scontando in media</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={[
                    { name: "0%", value: insightsV3.discountBuckets.noSconto, color: DISCOUNT_COLORS.noSconto },
                    { name: "<10%", value: insightsV3.discountBuckets.lieve, color: DISCOUNT_COLORS.lieve },
                    { name: "10-20%", value: insightsV3.discountBuckets.medio, color: DISCOUNT_COLORS.medio },
                    { name: "≥20%", value: insightsV3.discountBuckets.forte, color: DISCOUNT_COLORS.forte },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value">
                    {[DISCOUNT_COLORS.noSconto, DISCOUNT_COLORS.lieve, DISCOUNT_COLORS.medio, DISCOUNT_COLORS.forte].map((c, i) => (
                      <Cell key={i} fill={c} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {insightsV3.discountBuckets.forte > 0 && (
                <div className="mt-2 p-2 rounded bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    {insightsV3.discountBuckets.forte} preventivo{insightsV3.discountBuckets.forte > 1 ? "i" : ""} con sconto ≥20%: verifica che siano autorizzati correttamente.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="h-4 w-4 text-green-600" />
                Top commerciali per ricavo
              </CardTitle>
              <p className="text-xs text-muted-foreground">Chi sta performando meglio</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {insightsV3.topSalespeople.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun commerciale assegnato ai preventivi del periodo.</p>
              ) : (
                insightsV3.topSalespeople.map((sp, i) => (
                  <div key={sp.name + i} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${i === 0 ? "bg-yellow-100 text-yellow-800" : i === 1 ? "bg-slate-100 text-slate-700" : i === 2 ? "bg-orange-100 text-orange-800" : "bg-muted text-muted-foreground"}`}>
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{sp.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {sp.count} preventivi · margine medio {sp.marginAvg.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold shrink-0">{formatCurrency(sp.ricavoTot)}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bar Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Margine per tipo di lavoro</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${Number(v).toFixed(1)}%`, "Margine medio"]} />
                {/* Linea target reale dalle impostazioni aziendali */}
                <ReferenceLine
                  y={margineTarget}
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  label={{ value: `Target ${margineTarget}%`, position: "right", fontSize: 10 }}
                />
                {/* Linea soglia minima */}
                {margineMin !== margineTarget && (
                  <ReferenceLine
                    y={margineMin}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{ value: `Min ${margineMin}%`, position: "right", fontSize: 10 }}
                  />
                )}
                <Bar
                  dataKey="margine"
                  fill="#8b5cf6"
                  radius={[4, 4, 0, 0]}
                  label={{ position: "top", formatter: (v: number) => `${Number(v).toFixed(0)}%`, fontSize: 10 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Preventivi table */}
      {dati?.preventivi && dati.preventivi.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Preventivi analizzati</CardTitle>
              <span className="text-sm text-muted-foreground">
                {showAllRows
                  ? `${dati.preventivi.length} preventivi`
                  : `Mostrando 10 di ${dati.preventivi.length}`}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {/* 9 colonne: su mobile la tabella scrolla in orizzontale (min-w) invece
                di schiacciare le colonne fino a renderle illeggibili. */}
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Tipo lavoro</TableHead>
                  <TableHead className="text-right">Ricavo</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Sconto</TableHead>
                  <TableHead className="text-right">Margine %</TableHead>
                  <TableHead className="text-right">Provv.</TableHead>
                  <TableHead>Approv.</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {righeVisibili.map((p) => {
                  const extra = quotesExtraById.get(p.quote_id);
                  return (
                  <TableRow key={p.quote_id}>
                    <TableCell className="font-mono text-xs">{p.quote_number}</TableCell>
                    <TableCell>{p.tipo_lavoro || "—"}</TableCell>
                    <TableCell className="text-right">{p.ricavo_totale != null ? formatCurrency(p.ricavo_totale) : "—"}</TableCell>
                    <TableCell className="text-right">{p.costo_totale != null ? formatCurrency(p.costo_totale) : "—"}</TableCell>
                    <TableCell className="text-right">
                      {extra?.discount_percent != null && extra.discount_percent > 0
                        ? <span className="text-orange-600">{extra.discount_percent}%</span>
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.margine_pct != null ? (
                        <span
                          className={`font-medium ${
                            p.margine_pct >= margineTarget
                              ? "text-green-600"
                              : p.margine_pct >= margineMin
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {Number(p.margine_pct).toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {extra?.commission_amount_snapshot != null ? formatCurrency(extra.commission_amount_snapshot) : "—"}
                    </TableCell>
                    <TableCell>
                      {extra?.approval_status === "pending" && <Badge variant="outline" className="border-orange-500 text-orange-600">Pending</Badge>}
                      {extra?.approval_status === "approved" && <Badge className="bg-green-600">OK</Badge>}
                      {extra?.approval_status === "rejected" && <Badge variant="destructive">Rifiutato</Badge>}
                      {extra?.approval_status === "counter_proposed" && <Badge className="bg-blue-600">Contro</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`/azienda/marketing/preventivi/${p.quote_id}`}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {dati.preventivi.length > 10 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2 text-muted-foreground"
                onClick={() => setShowAllRows((v) => !v)}
              >
                {showAllRows ? (
                  <><ChevronUp className="h-4 w-4 mr-1" /> Mostra meno</>
                ) : (
                  <><ChevronDown className="h-4 w-4 mr-1" /> Mostra tutti ({dati.preventivi.length})</>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

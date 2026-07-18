/**
 * CrmHotTable — "Da lavorare adesso": i lead più caldi e le opportunità più
 * calde in una tabella interattiva (sparkline engagement, pill fonte/stadio,
 * probabilità a barrette, azione al volo, selezione multipla + export CSV).
 *
 * Dati reali:
 *  - Lead: marketing_contacts ordinati per ai_score (fallback: attività recente)
 *  - Sparkline: marketing_contact_activities aggregate per settimana (8 bucket)
 *  - Opportunità: marketing_opportunities aperte ordinate per valore×probabilità
 *
 * Sostituisce CrmHotLeadsCard (griglia statica di card).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Flame, Target, ArrowUpRight, Download, X, Loader2, CalendarClock, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ────────────────────────── formatters ────────────────────────── */

const eurCompact = (n: number) => {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 1_000_000) return `€ ${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (Math.abs(v) >= 1000) return `€ ${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1).replace(".", ",")}k`;
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
};

const shortDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(d);
};

const normProb = (p: number | null) => {
  const v = p ?? 0;
  return v > 1 ? v / 100 : v;
};

/* ────────────────────────── tipi riga ────────────────────────── */

interface LeadRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company_name: string | null;
  ai_score: number | null;
  ai_score_tier: string | null;
  ai_next_action: string | null;
  ai_predicted_value_eur: number | null;
  source: string | null;
  last_activity_at: string | null;
  created_at: string | null;
}

interface OppRow {
  id: string;
  name: string | null;
  company_name: string | null;
  value: number | null;
  probability: number | null;
  stage_id: string | null;
  next_action: string | null;
  next_action_date: string | null;
  last_activity_at: string | null;
  updated_at: string | null;
  contact_id: string | null;
}

type Heat = "hot" | "warm" | "cold";

const leadHeat = (l: LeadRow): Heat => {
  const t = (l.ai_score_tier || "").toLowerCase();
  const s = l.ai_score ?? 0;
  if (t.includes("cald") || t.includes("hot") || s >= 70) return "hot";
  if (t.includes("tiep") || t.includes("warm") || s >= 40) return "warm";
  return "cold";
};

const oppHeat = (p: number): Heat => (p >= 0.6 ? "hot" : p >= 0.3 ? "warm" : "cold");

/* ────────────────────────── pill helpers ────────────────────────── */

const HEAT_STYLES: Record<Heat, { pill: string; label: string; bars: number }> = {
  hot: {
    pill: "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800/30",
    label: "ALTA",
    bars: 3,
  },
  warm: {
    pill: "bg-yellow-50 text-yellow-600 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800/30",
    label: "MEDIA",
    bars: 2,
  },
  cold: {
    pill: "bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800/30",
    label: "BASSA",
    bars: 1,
  },
};

/** Fonti "organiche" (verde) vs campagne/strumenti (blu). */
const ORGANIC_SOURCES = ["manuale", "manual", "organic", "organico", "referral", "passaparola", "import", "csv"];

function SourcePill({ source }: { source: string | null }) {
  const s = (source || "—").trim();
  const isOrganic = ORGANIC_SOURCES.some((o) => s.toLowerCase().includes(o));
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-lg border px-2 py-1 text-[11px] font-medium",
        isOrganic
          ? "border-green-200 bg-green-50 text-green-600 dark:border-green-800/30 dark:bg-green-900/20 dark:text-green-400"
          : "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800/30 dark:bg-blue-900/20 dark:text-blue-400",
      )}
      title={s}
    >
      <span className="truncate">{s.toUpperCase()}</span>
      {!isOrganic && <ArrowUpRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />}
    </span>
  );
}

function ProbabilityPill({ heat, extra }: { heat: Heat; extra?: string }) {
  const cfg = HEAT_STYLES[heat];
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-[11px] font-medium", cfg.pill)}>
      <span className="flex items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={cn("w-1 rounded-full", bar <= cfg.bars ? "bg-current" : "bg-current/25")}
            style={{ height: bar === 1 ? 4 : bar === 2 ? 8 : 12 }}
          />
        ))}
      </span>
      <span className="tracking-wide">{cfg.label}</span>
      {extra && <span className="font-normal opacity-70">{extra}</span>}
    </span>
  );
}

function ScorePill({ score, heat }: { score: number | null; heat: Heat }) {
  const cfg = HEAT_STYLES[heat];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold", cfg.pill)}>
      {heat === "hot" && <Flame className="h-3 w-3" aria-hidden="true" />}
      {score != null ? Math.round(score) : "—"}
    </span>
  );
}

/** Sparkline 8 punti: trend su → verde, giù → rosso, piatta → grigio. */
function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const flat = max === 0;
  const up = data[data.length - 1] >= data[0];
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 60},${18 - ((v - min) / range) * 14}`)
    .join(" ");
  const lastY = 18 - ((data[data.length - 1] - min) / range) * 14;
  return (
    <span
      className={cn(
        "inline-block",
        flat
          ? "text-muted-foreground/40"
          : up
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400",
      )}
      title={flat ? "Nessuna attività tracciata" : `Attività ultime 8 settimane (${data.reduce((s, v) => s + v, 0)})`}
    >
      <svg width="60" height="20" viewBox="0 0 60 20" className="overflow-visible" aria-hidden="true">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {!flat && <circle cx={60} cy={lastY} r="2.5" fill="currentColor" />}
      </svg>
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/30 bg-muted/40 text-xs font-semibold text-muted-foreground">
      {initials || "?"}
    </span>
  );
}

/* ────────────────────────── data hooks ────────────────────────── */

const SPARK_WEEKS = 8;
const WEEK_MS = 7 * 86_400_000;

function useHotLeads(companyId: string, nowMs: number) {
  const leads = useQuery({
    queryKey: ["crm-dash", "hot-table-leads", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select(
          "id,first_name,last_name,email,company_name,ai_score,ai_score_tier,ai_next_action,ai_predicted_value_eur,source,last_activity_at,created_at",
        )
        .eq("company_id", companyId)
        .order("ai_score", { ascending: false, nullsFirst: false })
        .order("last_activity_at", { ascending: false, nullsFirst: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as LeadRow[];
    },
  });

  const ids = (leads.data ?? []).map((l) => l.id);
  const acts = useQuery({
    queryKey: ["crm-dash", "hot-table-acts", companyId, ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const sinceIso = new Date(nowMs - SPARK_WEEKS * WEEK_MS).toISOString();
      const { data, error } = await supabase
        .from("marketing_contact_activities")
        .select("contact_id,created_at")
        .eq("company_id", companyId)
        .in("contact_id", ids)
        .gte("created_at", sinceIso)
        .limit(4000);
      if (error) return new Map<string, number[]>();
      const map = new Map<string, number[]>();
      for (const id of ids) map.set(id, Array.from({ length: SPARK_WEEKS }, () => 0));
      for (const a of (data ?? []) as { contact_id: string | null; created_at: string }[]) {
        if (!a.contact_id) continue;
        const arr = map.get(a.contact_id);
        if (!arr) continue;
        const weeksAgo = Math.floor((nowMs - new Date(a.created_at).getTime()) / WEEK_MS);
        const i = SPARK_WEEKS - 1 - weeksAgo;
        if (i >= 0 && i < SPARK_WEEKS) arr[i]++;
      }
      return map;
    },
  });

  return { leads, sparkByContact: acts.data ?? new Map<string, number[]>() };
}

function useHotOpps(companyId: string) {
  const stages = useQuery({
    queryKey: ["crm-dash", "stages", companyId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_pipeline_stages")
        .select("id,name,position")
        .eq("company_id", companyId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string | null; position: number | null }[];
    },
  });

  const opps = useQuery({
    queryKey: ["crm-dash", "hot-table-opps", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("id,name,company_name,value,probability,stage_id,next_action,next_action_date,last_activity_at,updated_at,contact_id,status")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .limit(2000);
      if (error) throw error;
      const open = ((data ?? []) as (OppRow & { status: string | null })[]).filter(
        (o) => (o.status ?? "open") === "open",
      );
      // Caldo = forecast pesato (valore × probabilità); a parità vince chi si muove.
      open.sort((a, b) => {
        const fa = (a.value ?? 0) * normProb(a.probability);
        const fb = (b.value ?? 0) * normProb(b.probability);
        if (fb !== fa) return fb - fa;
        return (b.last_activity_at ?? b.updated_at ?? "").localeCompare(a.last_activity_at ?? a.updated_at ?? "");
      });
      return open.slice(0, 8);
    },
  });

  const stageName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stages.data ?? []) m.set(s.id, s.name ?? "—");
    return m;
  }, [stages.data]);

  return { opps, stageName };
}

/* ────────────────────────── componente ────────────────────────── */

type View = "leads" | "opps";

export function CrmHotTable({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [nowMs] = useState(() => Date.now());
  const [view, setView] = useState<View>("leads");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const { leads, sparkByContact } = useHotLeads(companyId, nowMs);
  const { opps, stageName } = useHotOpps(companyId);

  const leadRows = leads.data ?? [];
  const oppRows = opps.data ?? [];
  const rows = view === "leads" ? leadRows.map((l) => l.id) : oppRows.map((o) => o.id);
  const isLoading = view === "leads" ? leads.isLoading : opps.isLoading;

  const allSelected = rows.length > 0 && rows.every((id) => selected.has(id));
  const someSelected = rows.some((id) => selected.has(id));

  const toggleAll = () => {
    setSelected((prev) => {
      if (rows.every((id) => prev.has(id))) return new Set([...prev].filter((id) => !rows.includes(id)));
      return new Set([...prev, ...rows]);
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const switchView = (v: View) => {
    setView(v);
    setSelected(new Set());
  };

  const leadName = (l: LeadRow) =>
    [l.first_name, l.last_name].filter(Boolean).join(" ").trim() || l.company_name || "Contatto";

  const exportCsv = () => {
    const sep = ";";
    let csv: string;
    if (view === "leads") {
      const sel = leadRows.filter((l) => selected.has(l.id));
      csv = ["Nome;Email;Azienda;Fonte;Punteggio AI;Valore previsto;Prossima azione;Ultima attività"]
        .concat(
          sel.map((l) =>
            [
              leadName(l), l.email ?? "", l.company_name ?? "", l.source ?? "",
              l.ai_score ?? "", l.ai_predicted_value_eur ?? "", l.ai_next_action ?? "",
              l.last_activity_at ?? "",
            ].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(sep),
          ),
        )
        .join("\n");
    } else {
      const sel = oppRows.filter((o) => selected.has(o.id));
      csv = ["Opportunità;Azienda;Stadio;Valore;Probabilità %;Forecast;Prossima azione;Scadenza azione"]
        .concat(
          sel.map((o) =>
            [
              o.name ?? "", o.company_name ?? "", stageName.get(o.stage_id ?? "") ?? "",
              o.value ?? 0, Math.round(normProb(o.probability) * 100),
              Math.round((o.value ?? 0) * normProb(o.probability)),
              o.next_action ?? "", o.next_action_date ?? "",
            ].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(sep),
          ),
        )
        .join("\n");
    }
    // BOM esplicito: Excel apre il CSV UTF-8 con gli accenti corretti.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = view === "leads" ? "lead-caldi.csv" : "opportunita-calde.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const containerVariants = {
    hidden: {},
    visible: { transition: reduceMotion ? {} : { staggerChildren: 0.04, delayChildren: 0.05 } },
  };
  const rowVariants = {
    hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.99, filter: "blur(3px)" },
    visible: {
      opacity: 1, y: 0, scale: 1, filter: "blur(0px)",
      transition: { type: "spring" as const, stiffness: 400, damping: 26, mass: 0.7 },
    },
  };

  const scoredLeads = leadRows.filter((l) => (l.ai_score ?? 0) > 0).length;

  return (
    <Card className="overflow-hidden">
      {/* Header: titolo + switch Lead/Opportunità */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Flame className="h-4 w-4 text-orange-500" aria-hidden="true" />
          Da lavorare adesso
        </div>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {view === "leads"
            ? scoredLeads > 0
              ? "i lead più caldi per punteggio AI"
              : "nessun punteggio AI: ordinati per attività recente"
            : "le opportunità con più valore in gioco"}
        </span>
        <div className="ml-auto inline-flex overflow-hidden rounded-lg border">
          {(
            [
              { key: "leads", label: "Lead caldi", icon: Flame, count: leadRows.length },
              { key: "opps", label: "Opportunità", icon: Target, count: oppRows.length },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchView(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                view === t.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-semibold",
                  view === t.key ? "bg-primary/15" : "bg-muted",
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-14 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-12 text-center">
          <Flame className="h-6 w-6 text-muted-foreground/40" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {view === "leads"
              ? "Nessun contatto nel CRM: importa lead o attiva lo scraper."
              : "Nessuna opportunità aperta in pipeline."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[960px]">
            {/* Intestazioni */}
            {view === "leads" ? (
              <div className="grid grid-cols-[auto_2fr_1fr_1fr_1fr_1fr_1fr_1.4fr] items-center gap-3 border-b border-border/30 bg-muted/20 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 sm:px-5">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Seleziona tutti"
                />
                <div>Lead</div>
                <div>Fonte</div>
                <div>Punteggio AI</div>
                <div>Valore previsto</div>
                <div>Interesse 8 sett.</div>
                <div>Probabilità</div>
                <div>Prossima mossa</div>
              </div>
            ) : (
              <div className="grid grid-cols-[auto_2fr_1.2fr_1fr_1fr_1fr_1.6fr] items-center gap-3 border-b border-border/30 bg-muted/20 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 sm:px-5">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Seleziona tutte"
                />
                <div>Opportunità</div>
                <div>Stadio</div>
                <div>Valore</div>
                <div>Forecast</div>
                <div>Probabilità</div>
                <div>Prossima azione</div>
              </div>
            )}

            {/* Righe */}
            <motion.div key={view} variants={containerVariants} initial="hidden" animate="visible">
              {view === "leads"
                ? leadRows.map((l, i) => {
                    const heat = leadHeat(l);
                    const name = leadName(l);
                    const spark = sparkByContact.get(l.id) ?? Array.from({ length: SPARK_WEEKS }, () => 0);
                    return (
                      <motion.div key={l.id} variants={rowVariants}>
                        <div
                          className={cn(
                            "group grid cursor-pointer grid-cols-[auto_2fr_1fr_1fr_1fr_1fr_1fr_1.4fr] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30 sm:px-5",
                            selected.has(l.id) && "bg-primary/5",
                            i < leadRows.length - 1 && "border-b border-border/20",
                          )}
                          onMouseEnter={() => setHoveredRow(l.id)}
                          onMouseLeave={() => setHoveredRow(null)}
                          onClick={() => navigate(`/admin/marketing/contatti/${l.id}`)}
                        >
                          <span onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selected.has(l.id)}
                              onCheckedChange={() => toggleOne(l.id)}
                              aria-label={`Seleziona ${name}`}
                            />
                          </span>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar name={name} />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {l.email || l.company_name || "—"}
                              </div>
                            </div>
                          </div>
                          <div className="min-w-0"><SourcePill source={l.source} /></div>
                          <div><ScorePill score={l.ai_score} heat={heat} /></div>
                          <div className="text-sm font-semibold">
                            {l.ai_predicted_value_eur ? eurCompact(l.ai_predicted_value_eur) : <span className="text-muted-foreground">—</span>}
                          </div>
                          <div><Sparkline data={spark} /></div>
                          <div><ProbabilityPill heat={heat} /></div>
                          <div className="min-w-0">
                            <AnimatePresence mode="wait" initial={false}>
                              {hoveredRow === l.id ? (
                                <motion.span
                                  key="action"
                                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8, filter: "blur(3px)" }}
                                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8, filter: "blur(3px)" }}
                                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                                >
                                  Apri contatto <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                                </motion.span>
                              ) : (
                                <motion.span
                                  key="info"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.08 }}
                                  className="block truncate text-xs text-muted-foreground"
                                  title={l.ai_next_action ?? undefined}
                                >
                                  {l.ai_next_action || `Ultima attività: ${shortDate(l.last_activity_at ?? l.created_at)}`}
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                : oppRows.map((o, i) => {
                    const prob = normProb(o.probability);
                    const heat = oppHeat(prob);
                    const forecast = (o.value ?? 0) * prob;
                    const overdue = o.next_action_date ? new Date(o.next_action_date).getTime() < nowMs - 86_400_000 : false;
                    return (
                      <motion.div key={o.id} variants={rowVariants}>
                        <div
                          className={cn(
                            "group grid cursor-pointer grid-cols-[auto_2fr_1.2fr_1fr_1fr_1fr_1.6fr] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30 sm:px-5",
                            selected.has(o.id) && "bg-primary/5",
                            i < oppRows.length - 1 && "border-b border-border/20",
                          )}
                          onMouseEnter={() => setHoveredRow(o.id)}
                          onMouseLeave={() => setHoveredRow(null)}
                          onClick={() => navigate("/admin/marketing/opportunita")}
                        >
                          <span onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selected.has(o.id)}
                              onCheckedChange={() => toggleOne(o.id)}
                              aria-label={`Seleziona ${o.name ?? "opportunità"}`}
                            />
                          </span>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar name={o.name ?? o.company_name ?? "?"} />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{o.name || "Opportunità"}</div>
                              <div className="truncate text-xs text-muted-foreground">{o.company_name || "—"}</div>
                            </div>
                          </div>
                          <div className="min-w-0">
                            <span className="inline-flex max-w-full items-center truncate rounded-lg border border-border/60 bg-muted/40 px-2 py-1 text-[11px] font-medium text-foreground/80">
                              <span className="truncate">{stageName.get(o.stage_id ?? "") ?? "—"}</span>
                            </span>
                          </div>
                          <div className="text-sm font-semibold">{eurCompact(o.value ?? 0)}</div>
                          <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                            {eurCompact(forecast)}
                          </div>
                          <div><ProbabilityPill heat={heat} extra={`${Math.round(prob * 100)}%`} /></div>
                          <div className="min-w-0">
                            <AnimatePresence mode="wait" initial={false}>
                              {hoveredRow === o.id ? (
                                <motion.span
                                  key="action"
                                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8, filter: "blur(3px)" }}
                                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8, filter: "blur(3px)" }}
                                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                                >
                                  Apri pipeline <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                                </motion.span>
                              ) : (
                                <motion.span
                                  key="info"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.08 }}
                                  className={cn(
                                    "flex min-w-0 items-center gap-1 text-xs",
                                    overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground",
                                  )}
                                  title={o.next_action ?? undefined}
                                >
                                  {overdue ? (
                                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  ) : (
                                    <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  )}
                                  <span className="truncate">
                                    {o.next_action
                                      ? `${o.next_action}${o.next_action_date ? ` · ${shortDate(o.next_action_date)}` : ""}`
                                      : `Aggiornata: ${shortDate(o.last_activity_at ?? o.updated_at)}`}
                                  </span>
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
            </motion.div>
          </div>
        </div>
      )}

      {/* Barra azioni selezione */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { y: 60, opacity: 0, filter: "blur(6px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { y: 60, opacity: 0, filter: "blur(6px)" }}
            transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
          >
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/95 px-4 py-2 shadow-2xl backdrop-blur-lg">
              <span className="text-xs font-medium">
                {selected.size} {view === "leads" ? (selected.size === 1 ? "lead" : "lead") : (selected.size === 1 ? "opportunità" : "opportunità")} selezionat{selected.size === 1 ? "a" : "e"}
              </span>
              {/* Export CSV: nascosto su mobile (regola no-export mobile,
                  feedback_no_mobile_export) — resta su tablet/desktop. */}
              <button
                type="button"
                onClick={exportCsv}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> Esporta CSV
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted/70"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" /> Deseleziona
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

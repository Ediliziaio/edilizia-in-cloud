/**
 * Tab Dashboard — Stato Azienda sintetico.
 *
 * Schermata di apertura: 6 KPI macro + alert + mini-chart andamento mensile.
 * Pensata per dare un colpo d'occhio "salute aziendale" all'imprenditore.
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { useCEriclassificato, useBEP } from "@/hooks/controlloGestione/useCEriclassificato";
import { useStatoPatrimoniale, useRating } from "@/hooks/controlloGestione/useStatoPatrimoniale";
import { useCashFlow } from "@/hooks/controlloGestione/useCashFlow";
import { usePFN } from "@/hooks/controlloGestione/usePFN";
import { useIndiciAvanzati } from "@/hooks/controlloGestione/useIndiciAvanzati";
import { useMarginalitaCommesse } from "@/hooks/controlloGestione/useMarginalitaCommesse";
import { useBudgetForecast } from "@/hooks/controlloGestione/useBudget";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp,
  Banknote, Building, Briefcase, Calendar, Shield,
  TrendingDown, TrendingUp, Wallet,
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface Props {
  anno: number;
}

const MESI_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export function TabDashboard({ anno }: Props) {
  const ce  = useCEriclassificato(anno, 1, 12);
  const sp  = useStatoPatrimoniale(anno);
  const cf  = useCashFlow(anno, 1, 12);
  const pfn = usePFN(anno);
  const idx = useIndiciAvanzati(anno);
  const com = useMarginalitaCommesse(anno);
  const bep = useBEP(anno);
  const bdg = useBudgetForecast(anno);
  const rt  = useRating(anno);

  const isLoading =
    ce.isLoading || sp.isLoading || cf.isLoading || pfn.isLoading
    || idx.isLoading || com.isLoading || bep.isLoading || bdg.isLoading || rt.isLoading;

  // Estrai voci CE
  const findCe = (codice: string) =>
    ce.data?.voci.find((v) => v.codice === codice)?.valore ?? 0;
  const ricavi = findCe("01");
  const ebitda = findCe("E");
  const ebit   = findCe("F");
  const utile  = findCe("L");

  // Mini chart andamento ricavi mensile YTD
  const chartData = useMemo(() => {
    if (!cf.data) return [];
    return cf.data.mesi.map((m) => ({
      mese: MESI_LABELS[m.mese - 1],
      saldo: m.saldo_fine,
      entrate: m.entrate_totali,
      uscite: -m.uscite_totali,
    }));
  }, [cf.data]);

  // Alerts
  const alerts = useMemo(() => {
    const out: Array<{ severity: "rosso" | "giallo" | "verde"; testo: string; href?: string }> = [];

    if (cf.data) {
      const sottoZeroMonths = cf.data.mesi.filter((m) => m.sotto_zero);
      if (sottoZeroMonths.length > 0) {
        const primo = sottoZeroMonths[0];
        out.push({
          severity: "rosso",
          testo: `Cassa sotto zero a ${MESI_LABELS[primo.mese - 1]} (${formatCurrency(primo.saldo_fine)}). Verifica scadenze ed entrate previste.`,
          href: "/azienda/controllo-gestione/cash-flow",
        });
      }
    }

    if (com.data && com.data.kpi.n_in_perdita > 0) {
      out.push({
        severity: "rosso",
        testo: `${com.data.kpi.n_in_perdita} commesse stimate in perdita a fine cantiere. Richiede revisione preventivi.`,
        href: "/azienda/controllo-gestione/commesse",
      });
    }

    if (bep.data && bep.data.bep_data && !bep.data.gia_raggiunto) {
      out.push({
        severity: "giallo",
        testo: `Break Even Point previsto per il ${formatDate(bep.data.bep_data)} (${bep.data.giorni_residui} giorni residui).`,
      });
    }

    if (idx.data?.altman.classe === "distress") {
      out.push({
        severity: "rosso",
        testo: `Z-score Altman in area distress (${idx.data.altman.z_score?.toFixed(2)}). Rischio default elevato.`,
        href: "/azienda/controllo-gestione/indici",
      });
    } else if (idx.data?.altman.classe === "grey") {
      out.push({
        severity: "giallo",
        testo: `Z-score Altman in area grigia (${idx.data.altman.z_score?.toFixed(2)}). Monitora con attenzione.`,
        href: "/azienda/controllo-gestione/indici",
      });
    }

    if (idx.data?.dscr.valore != null && idx.data.dscr.valore < 1.2 && idx.data.dscr.classe !== "na") {
      out.push({
        severity: "giallo",
        testo: `DSCR ${idx.data.dscr.valore.toFixed(2)}x sotto soglia banca (1.20). Difficoltà a rinnovare/ottenere mutui.`,
        href: "/azienda/controllo-gestione/indici",
      });
    }

    // Variance budget critica
    if (bdg.data) {
      const ricaviBdg = bdg.data.voci.find((v) => v.codice === "01");
      if (ricaviBdg && ricaviBdg.semaforo === "rosso") {
        out.push({
          severity: "rosso",
          testo: `Forecast ricavi ${ricaviBdg.variance_pct?.toFixed(0)}% vs budget. Sotto target.`,
          href: "/azienda/controllo-gestione/budget",
        });
      }
    }

    if (out.length === 0) {
      out.push({ severity: "verde", testo: "Nessuna criticità rilevata. Tutti gli indicatori in range." });
    }
    return out;
  }, [cf.data, com.data, bep.data, idx.data, bdg.data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (ce.isError || sp.isError) return <ErrorBlock onRetry={() => { ce.refetch(); sp.refetch(); }} />;

  return (
    <div className="space-y-4">
      {/* Top: 6 KPI macro */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KPIMacro
          label="Ricavi"
          value={formatCurrency(ricavi)}
          sub={`Esercizio ${anno}`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="blue"
          href="/azienda/controllo-gestione/ce"
        />
        <KPIMacro
          label="EBITDA"
          value={formatCurrency(ebitda)}
          sub={ricavi > 0 ? `${((ebitda / ricavi) * 100).toFixed(1)}% margine` : "—"}
          icon={<Activity className="h-4 w-4" />}
          tone={ebitda >= 0 ? "green" : "red"}
          href="/azienda/controllo-gestione/ce"
        />
        <KPIMacro
          label="Utile previsto"
          value={formatCurrency(utile)}
          sub={ricavi > 0 ? `${((utile / ricavi) * 100).toFixed(1)}% sul fatturato` : "—"}
          icon={<Wallet className="h-4 w-4" />}
          tone={utile >= 0 ? "green" : "red"}
          href="/azienda/controllo-gestione/ce"
        />
        <KPIMacro
          label="Cassa fine anno"
          value={cf.data ? formatCurrency(cf.data.meta.saldo_chiusura) : "—"}
          sub={cf.data ? `Da apertura ${formatCurrency(cf.data.meta.saldo_apertura)}` : "—"}
          icon={<Banknote className="h-4 w-4" />}
          tone={cf.data && cf.data.meta.saldo_chiusura >= 0 ? "green" : "red"}
          href="/azienda/controllo-gestione/cash-flow"
        />
        <KPIMacro
          label="PFN"
          value={pfn.data ? formatCurrency(pfn.data.pfn) : "—"}
          sub={pfn.data && pfn.data.pfn > 0 ? "Indebitamento netto" : "Cassa netta"}
          icon={pfn.data && pfn.data.pfn > 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
          tone={pfn.data && pfn.data.pfn > 0 ? "amber" : "green"}
          href="/azienda/controllo-gestione/pfn-debiti"
        />
        <KPIMacro
          label="Rating bancario"
          value={rt.data?.classe ?? "—"}
          sub={rt.data ? `Score ${rt.data.score.toFixed(1)} / livello: ${rt.data.livello}` : "—"}
          icon={<Shield className="h-4 w-4" />}
          tone={rt.data && (rt.data.classe === "AAA" || rt.data.classe === "AA" || rt.data.classe === "A") ? "green"
                : rt.data && (rt.data.classe === "BBB" || rt.data.classe === "BB") ? "blue"
                : "red"}
          href="/azienda/controllo-gestione/rating"
        />
      </div>

      {/* Alert panel */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" /> Alert e segnalazioni
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-sm",
                  a.severity === "rosso"  && "border-rose-200 bg-rose-50 text-rose-900",
                  a.severity === "giallo" && "border-amber-200 bg-amber-50 text-amber-900",
                  a.severity === "verde"  && "border-emerald-200 bg-emerald-50 text-emerald-900",
                )}
              >
                <span
                  className={cn(
                    "mt-1 inline-block h-2 w-2 shrink-0 rounded-full",
                    a.severity === "rosso"  && "bg-rose-500",
                    a.severity === "giallo" && "bg-amber-500",
                    a.severity === "verde"  && "bg-emerald-500",
                  )}
                />
                <p className="flex-1">{a.testo}</p>
                {a.href && (
                  <Link
                    to={a.href}
                    className="shrink-0 text-xs font-medium underline underline-offset-2"
                  >
                    Approfondisci →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Mini-chart cash flow + commesse aside */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cassa: andamento previsto {anno}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Saldo a fine mese atteso, considerando entrate e uscite.
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mese" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v)}
                    labelFormatter={(l) => `Mese: ${l}`}
                  />
                  <Line type="monotone" dataKey="saldo" stroke="#2563eb" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cantieri attivi</CardTitle>
          </CardHeader>
          <CardContent>
            {com.data ? (
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">In corso</span>
                  <Badge variant="outline">{com.data.kpi.n_in_corso}</Badge>
                </li>
                <li className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Completate</span>
                  <Badge variant="outline">{com.data.kpi.n_completate}</Badge>
                </li>
                <li className="flex items-center gap-2 text-rose-700">
                  <ArrowDown className="h-4 w-4" />
                  <span className="flex-1">In perdita</span>
                  <Badge variant="destructive">{com.data.kpi.n_in_perdita}</Badge>
                </li>
                <li className="border-t pt-2 text-xs text-muted-foreground">
                  Margine atteso totale:{" "}
                  <strong className="text-foreground tabular-nums">
                    {formatCurrency(com.data.kpi.margine_atteso_totale)}
                  </strong>
                </li>
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nessun dato.</p>
            )}
            <Link
              to="/azienda/controllo-gestione/commesse"
              className="mt-4 block text-center text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Vedi tutte le commesse →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPIMacro({
  label, value, sub, icon, tone, href,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone: "blue" | "green" | "red" | "amber" | "neutral";
  href?: string;
}) {
  const palette = {
    blue: "bg-blue-50",
    green: "bg-emerald-50",
    red: "bg-rose-50",
    amber: "bg-amber-50",
    neutral: "bg-muted/40",
  } as const;

  const inner = (
    <Card className={cn("rounded-2xl border-0 transition hover:shadow-sm", palette[tone])}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );

  return href ? <Link to={href}>{inner}</Link> : inner;
}

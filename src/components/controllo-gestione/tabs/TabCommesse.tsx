/**
 * Tab Commesse — marginalità per cantiere/commessa.
 *
 * Mostra:
 *  • KPI aggregati (numero, preventivo, margine, commesse in perdita)
 *  • Tabella commesse con: preventivo | consuntivo | %avanz | margine corrente
 *    | proiezione finale (margine atteso a chiusura) | semaforo
 *  • Filtro per stato (tutti / in corso / completate)
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import {
  useMarginalitaCommesse, type Semaforo, type CommessaRiga,
} from "@/hooks/controlloGestione/useMarginalitaCommesse";
import { useMarginData } from "@/hooks/useMarginData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Hammer, AlertTriangle, Timer } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ExportButton } from "@/components/controllo-gestione/ui/ExportButton";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";
import {
  mesiApertura, margineAlMese, mesiSostenibili, mesiRitardo, costoRitardo, fmtMesi,
} from "@/lib/controlloGestione/tempoCommessa";

interface Props {
  anno: number;
}

const SEMAFORO_COLORS: Record<Semaforo, string> = {
  verde:  "bg-emerald-500",
  giallo: "bg-amber-500",
  rosso:  "bg-rose-500",
  grigio: "bg-muted-foreground/40",
};

const SEMAFORO_BG: Record<Semaforo, string> = {
  verde:  "bg-emerald-50 text-emerald-700",
  giallo: "bg-amber-50 text-amber-700",
  rosso:  "bg-rose-50 text-rose-700",
  grigio: "bg-muted/40 text-muted-foreground",
};

const SEMAFORO_LABEL: Record<Semaforo, string> = {
  verde:  "Marginalità ≥ 15%",
  giallo: "Marginalità 0–15%",
  rosso:  "In perdita",
  grigio: "Non valutabile",
};

export function TabCommesse({ anno }: Props) {
  const [filter, setFilter] = useState<"all" | "in_corso" | "completato">("all");
  const [sortBy, setSortBy] = useState<"preventivo" | "manodopera">("preventivo");
  const statusFilter = filter === "all" ? null : filter;
  const q = useMarginalitaCommesse(anno, statusFilter);
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Costi fissi mensili dalla STESSA fonte di Costi e Punto di Pareggio
  // (useMarginData). Per la quota struttura serve però la struttura
  // NON-manodopera: la manodopera imputata alle commesse sta GIÀ nei
  // consuntivi di questa tabella, contarla anche nella quota la
  // raddoppierebbe. Manodopera = chi ha ore imputate (order_employees);
  // il resto del personale (ufficio) è struttura.
  const margin = useMarginData();

  const strutturaQuery = useQuery({
    queryKey: ["cg", "struttura-non-manodopera", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [operativiRes, attiviRes] = await Promise.all([
        (supabase as any)
          .from("order_employees")
          .select("employee_id, orders!inner(company_id)")
          .eq("orders.company_id", companyId!)
          .limit(2000),
        supabase
          .from("employees")
          .select("id, gross_salary, inps_rate")
          .eq("company_id", companyId!)
          .eq("is_active", true),
      ]);
      if (operativiRes.error) throw operativiRes.error;
      if (attiviRes.error) throw attiviRes.error;
      const operativi = new Set(
        ((operativiRes.data ?? []) as Array<{ employee_id: string }>).map((r) => r.employee_id),
      );
      let stipendiUfficio = 0;
      for (const e of attiviRes.data ?? []) {
        if (operativi.has(e.id)) continue;
        const lordo = Number(e.gross_salary) || 0;
        stipendiUfficio += lordo * (1 + (Number(e.inps_rate) || 28) / 100);
      }
      return { stipendiUfficio, nOperativi: operativi.size };
    },
  });

  // Consegna promessa per commessa: la RPC non la espone, la leggiamo a parte
  // (una query leggera) per calcolare il costo del ritardo. La data-ancora
  // "oggi" viaggia col risultato: il react-compiler vieta new Date() nel render.
  const promesseQuery = useQuery({
    queryKey: ["cg", "commesse-promesse", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, expected_date")
        .eq("company_id", companyId!)
        .not("expected_date", "is", null)
        .limit(2000);
      if (error) throw error;
      return {
        perId: new Map((data || []).map((o) => [o.id as string, o.expected_date as string])),
        oggi: new Date().toLocaleDateString("en-CA"),
      };
    },
  });
  const promesse = promesseQuery.data?.perId;
  const oggi = promesseQuery.data?.oggi ?? "";

  // Quota di struttura per cantiere (definizione del controllo di gestione:
  // struttura NON-manodopera ÷ cantieri paralleli): fissi aziendali senza
  // gli stipendi, più i soli stipendi di chi NON viene imputato ai cantieri.
  // Null (mai zero finto) finché mancano i fissi.
  const strutturaNonManodopera = useMemo(() => {
    if (strutturaQuery.data === undefined) return null;
    const fissiNonPersonale = margin.totalFixedCostsMonthly - margin.salariesMonthly;
    return fissiNonPersonale + strutturaQuery.data.stipendiUfficio;
  }, [margin.totalFixedCostsMonthly, margin.salariesMonthly, strutturaQuery.data]);

  const quotaStruttura = useMemo(() => {
    const attivi = q.data?.kpi.n_in_corso ?? 0;
    if (strutturaNonManodopera === null || strutturaNonManodopera <= 0 || attivi <= 0) return null;
    return strutturaNonManodopera / attivi;
  }, [strutturaNonManodopera, q.data?.kpi.n_in_corso]);

  const counts = useMemo(() => {
    if (!q.data) return null;
    const bySem: Record<Semaforo, number> = { verde: 0, giallo: 0, rosso: 0, grigio: 0 };
    q.data.righe.forEach((r) => {
      bySem[r.semaforo] = (bySem[r.semaforo] ?? 0) + 1;
    });
    return bySem;
  }, [q.data]);

  // Manodopera aggregata: soldi (€), tempo (ore) e incidenza sui costi diretti.
  const labor = useMemo(() => {
    if (!q.data) return null;
    let costo = 0, ore = 0, consuntivo = 0;
    q.data.righe.forEach((r) => {
      costo += r.costo_manodopera ?? 0;
      ore += r.ore_manodopera ?? 0;
      consuntivo += r.consuntivo ?? 0;
    });
    return { costo, ore, incidenza: consuntivo > 0 ? (costo / consuntivo) * 100 : null };
  }, [q.data]);

  // Ordine tabella: default per valore contratto, oppure per incidenza manodopera
  // (dove la manodopera pesa di più sul costo della commessa).
  const righeSorted = useMemo(() => {
    if (!q.data) return [];
    const arr = [...q.data.righe];
    if (sortBy === "manodopera") {
      const incid = (r: CommessaRiga) => (r.consuntivo > 0 ? (r.costo_manodopera ?? 0) / r.consuntivo : 0);
      arr.sort((a, b) => incid(b) - incid(a) || (b.costo_manodopera ?? 0) - (a.costo_manodopera ?? 0));
    }
    return arr;
  }, [q.data, sortBy]);

  if (q.isLoading) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }
  if (q.isError) return <ErrorBlock onRetry={() => q.refetch()} />;
  if (!q.data) return null;

  const { kpi } = q.data;
  const righe = righeSorted;

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
        <KPIMini
          label="Commesse"
          value={String(kpi.n_commesse)}
          sub={`${kpi.n_in_corso} in corso · ${kpi.n_completate} completate`}
        />
        <KPIMini
          label="Preventivato"
          value={formatCurrency(kpi.preventivo_totale)}
          sub="Valore contratti"
          tone="blue"
        />
        <KPIMini
          label="Consuntivato"
          value={formatCurrency(kpi.consuntivo_totale)}
          sub="Costi diretti sostenuti"
          tone="amber"
        />
        <KPIMini
          label="Manodopera"
          value={labor ? formatCurrency(labor.costo) : "—"}
          sub={
            labor
              ? `${labor.ore.toLocaleString("it-IT")} ore${labor.incidenza !== null ? ` · ${labor.incidenza.toFixed(0)}% dei costi` : ""}`
              : "—"
          }
          tone="amber"
        />
        <KPIMini
          label="Margine atteso fine"
          value={formatCurrency(kpi.margine_atteso_totale)}
          sub={
            kpi.preventivo_totale > 0
              ? `${((kpi.margine_atteso_totale / kpi.preventivo_totale) * 100).toFixed(1)}% sul preventivo`
              : "—"
          }
          tone={kpi.margine_atteso_totale > 0 ? "green" : "red"}
        />
        <KPIMini
          label="Commesse in perdita"
          value={String(kpi.n_in_perdita)}
          sub={kpi.n_in_perdita > 0 ? "Richiede attenzione" : "Tutte ok"}
          tone={kpi.n_in_perdita > 0 ? "red" : "green"}
        />
        {quotaStruttura !== null ? (
          <KPIMini
            label="Quota struttura"
            value={`${formatCurrency(quotaStruttura)}/mese`}
            sub={`${formatCurrency(strutturaNonManodopera ?? 0)} struttura (senza manodopera) ÷ ${kpi.n_in_corso} in corso`}
            tone="blue"
          />
        ) : (
          <Card className="rounded-2xl border-dashed bg-muted/30">
            <CardContent className="p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Quota struttura</p>
              <p className="mt-0.5 text-lg font-bold text-muted-foreground">—</p>
              <p className="text-[11px] text-muted-foreground">
                {kpi.n_in_corso <= 0 ? (
                  "Nessun cantiere in corso"
                ) : (
                  <Link to="/azienda/costi" className="font-medium text-primary hover:underline">
                    Inserisci i costi fissi →
                  </Link>
                )}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filtro stato + ordinamento + semaforo summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => v && setFilter(v as typeof filter)}
          >
            <ToggleGroupItem value="all" variant="outline" size="sm">Tutte</ToggleGroupItem>
            <ToggleGroupItem value="in_corso" variant="outline" size="sm">In corso</ToggleGroupItem>
            <ToggleGroupItem value="completato" variant="outline" size="sm">Completate</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Ordina:</span>
            <ToggleGroup
              type="single"
              value={sortBy}
              onValueChange={(v) => v && setSortBy(v as typeof sortBy)}
            >
              <ToggleGroupItem value="preventivo" variant="outline" size="sm">Valore</ToggleGroupItem>
              <ToggleGroupItem value="manodopera" variant="outline" size="sm">Incidenza manodopera</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {counts && (
          <div className="flex flex-wrap gap-2 text-xs">
            {(Object.keys(SEMAFORO_LABEL) as Semaforo[]).map((s) => (
              counts[s] > 0 && (
                <Badge key={s} variant="outline" className={cn("text-[11px]", SEMAFORO_BG[s])}>
                  <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full", SEMAFORO_COLORS[s])} />
                  {SEMAFORO_LABEL[s]}: {counts[s]}
                </Badge>
              )
            ))}
          </div>
        )}
      </div>

      {/* Tabella commesse */}
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Marginalità per cantiere</CardTitle>
            <p className="text-xs text-muted-foreground">
              Margine atteso = Preventivo − (Consuntivo / % avanzamento), stimato dal 20% di avanzamento in su
              (sotto è troppo presto → «non valutabile»). Semaforo verde se ≥ 15%, rosso se &lt; 0.
              La colonna Tempo mostra il margine <em>al mese</em>: sotto la quota di struttura, il cantiere
              non sta pagando l'affitto dell'azienda.
            </p>
          </div>
          <ExportButton
            onExport={async () => {
              await exportXlsx({
                filename: `commesse_${anno}.xlsx`,
                brand: { title: "Marginalità Commesse", subtitle: `Esercizio ${anno}` },
                sheets: [{
                  name: `Commesse ${anno}`,
                  columns: [
                    { header: "Codice", key: "order_code", width: 12 },
                    { header: "Descrizione", key: "description", width: 35 },
                    { header: "Cliente", key: "cliente", width: 25 },
                    { header: "Stato", key: "status", width: 12 },
                    { header: "% avanz.", key: "pct_disp", width: 10 },
                    { header: "Preventivo", key: "preventivo", width: 14, type: "number" },
                    { header: "Consuntivo", key: "consuntivo", width: 14, type: "number" },
                    { header: "Manodopera €", key: "costo_manodopera", width: 14, type: "number" },
                    { header: "Ore manodopera", key: "ore_manodopera", width: 14, type: "number" },
                    { header: "Incid. manodopera %", key: "incid_mo", width: 16 },
                    { header: "Margine ora", key: "margine", width: 14, type: "number" },
                    { header: "Costo atteso", key: "costo_atteso", width: 14, type: "number" },
                    { header: "Margine fine", key: "margine_atteso", width: 14, type: "number" },
                    { header: "Margine fine %", key: "margine_atteso_perc", width: 12 },
                    { header: "Mesi apertura", key: "mesi_apertura", width: 12 },
                    { header: "Margine €/mese", key: "margine_mese", width: 14, type: "number" },
                    { header: "Costo ritardo €", key: "costo_ritardo", width: 14, type: "number" },
                    { header: "Semaforo", key: "semaforo", width: 10 },
                  ],
                  rows: righe.map((r) => {
                    const mesi = oggi ? mesiApertura(r.work_start, r.work_end, oggi) : null;
                    const alMese = mesi !== null ? margineAlMese(r.margine, mesi) : null;
                    const rit = costoRitardo(
                      oggi ? mesiRitardo(promesse?.get(r.id) ?? null, r.work_end, oggi) : 0,
                      quotaStruttura,
                    );
                    return {
                      ...r,
                      pct_disp: `${(r.pct_avanzamento * 100).toFixed(0)}%`,
                      incid_mo: r.consuntivo > 0
                        ? `${((r.costo_manodopera / r.consuntivo) * 100).toFixed(0)}%`
                        : "—",
                      mesi_apertura: mesi !== null ? fmtMesi(mesi) : "—",
                      margine_mese: alMese !== null ? Math.round(alMese) : null,
                      costo_ritardo: rit !== null ? Math.round(rit) : null,
                    };
                  }),
                }],
              });
            }}
          />
        </CardHeader>
        <CardContent>
          {righe.length === 0 ? (
            <EmptyState
              title="Nessuna commessa"
              description={
                filter === "all"
                  ? `Per il ${anno} non ci sono commesse registrate.`
                  : "Nessuna commessa per questo filtro."
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="w-2 px-1 py-2"></th>
                    <th className="min-w-[200px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">Commessa</th>
                    <th className="min-w-[120px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">Preventivo</th>
                    <th className="min-w-[120px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">Consuntivo</th>
                    <th className="min-w-[130px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">Manodopera</th>
                    <th className="min-w-[120px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">Avanz.</th>
                    <th className="min-w-[130px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">Tempo</th>
                    <th className="min-w-[120px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">Margine ora</th>
                    <th className="min-w-[140px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">Margine fine prev.</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/20">
                      <td className="px-1">
                        <span className={cn("block h-8 w-1.5 rounded-r", SEMAFORO_COLORS[r.semaforo])} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <Hammer className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {r.order_code && (
                                <span className="mr-1 font-mono text-xs text-muted-foreground">
                                  {r.order_code}
                                </span>
                              )}
                              {r.description}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {r.cliente ?? "—"}
                              {r.work_start && ` · dal ${formatDate(r.work_start)}`}
                              {r.work_end && ` al ${formatDate(r.work_end)}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(r.preventivo)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(r.consuntivo)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.costo_manodopera > 0 ? (
                          <>
                            {formatCurrency(r.costo_manodopera)}
                            <span
                              className={cn(
                                "ml-1 block text-[10px]",
                                r.consuntivo > 0 && r.costo_manodopera / r.consuntivo >= 0.4
                                  ? "font-medium text-amber-600"
                                  : "text-muted-foreground",
                              )}
                            >
                              {r.consuntivo > 0 && `${((r.costo_manodopera / r.consuntivo) * 100).toFixed(0)}% costi`}
                              {r.ore_manodopera > 0 && ` · ${r.ore_manodopera.toLocaleString("it-IT")} h`}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(r.pct_avanzamento * 100, 100)} className="h-2 w-16" />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {(r.pct_avanzamento * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <CellaTempo
                        riga={r}
                        promessa={promesse?.get(r.id) ?? null}
                        oggi={oggi}
                        quotaStruttura={quotaStruttura}
                      />
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          r.margine < 0 && "text-rose-700",
                          r.margine > 0 && "text-emerald-700",
                        )}
                      >
                        {formatCurrency(r.margine)}
                        {r.margine_perc !== 0 && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({r.margine_perc.toFixed(1)}%)
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          r.margine_atteso !== null && r.margine_atteso < 0 && "text-rose-700 font-semibold",
                          r.margine_atteso !== null && r.margine_atteso > 0 && "text-emerald-700",
                        )}
                      >
                        {r.margine_atteso !== null ? (
                          <>
                            {r.margine_atteso < 0 && (
                              <AlertTriangle className="mr-1 inline h-3 w-3" />
                            )}
                            {formatCurrency(r.margine_atteso)}
                            {r.margine_atteso_perc !== null && (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                ({r.margine_atteso_perc.toFixed(1)}%)
                              </span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  );
}

/**
 * Colonna "Tempo": mesi di apertura, margine al mese (ambra se sotto la quota
 * di struttura: il cantiere non sta pagando l'affitto dell'azienda) e costo
 * del ritardo sulla consegna promessa. Tooltip con la scomposizione completa.
 */
function CellaTempo({
  riga, promessa, oggi, quotaStruttura,
}: {
  riga: CommessaRiga;
  promessa: string | null;
  oggi: string;
  quotaStruttura: number | null;
}) {
  const mesi = oggi ? mesiApertura(riga.work_start, riga.work_end, oggi) : null;
  const alMese = mesi !== null ? margineAlMese(riga.margine, mesi) : null;
  const ritardoMesi = oggi ? mesiRitardo(promessa, riga.work_end, oggi) : 0;
  const ritardoEur = costoRitardo(ritardoMesi, quotaStruttura);
  const sostenibili = mesiSostenibili(riga.margine, quotaStruttura);
  const sottoQuota =
    alMese !== null && quotaStruttura !== null && alMese < quotaStruttura;

  if (mesi === null) {
    return (
      <td className="px-3 py-2 text-right">
        <span
          className="text-xs text-muted-foreground"
          title="Compila la data di inizio lavori sulla commessa"
        >
          —
        </span>
      </td>
    );
  }

  return (
    <td className="px-3 py-2 text-right">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex cursor-default flex-col items-end gap-0.5">
            <span className="inline-flex items-center gap-1 text-sm tabular-nums">
              <Timer className="h-3 w-3 text-muted-foreground" />
              {fmtMesi(mesi)} mesi
            </span>
            {alMese !== null ? (
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  sottoQuota ? "font-medium text-amber-600" : "text-muted-foreground",
                )}
              >
                {formatCurrency(alMese)}/mese
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">appena aperta</span>
            )}
            {ritardoEur !== null && (
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                ritardo −{formatCurrency(ritardoEur)}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[260px] space-y-1 text-xs">
          <p>
            Aperta da <strong>{fmtMesi(mesi)} mesi</strong>
            {riga.work_end ? " (chiusa)" : ""}.
          </p>
          {alMese !== null && quotaStruttura !== null && (
            <p>
              Rende <strong>{formatCurrency(alMese)}/mese</strong> contro una quota di
              struttura di {formatCurrency(quotaStruttura)}/mese
              {sottoQuota && " — sotto quota: il cantiere non paga l'affitto dell'azienda"}.
            </p>
          )}
          {sostenibili !== null && (
            <p>
              Il margine attuale paga la struttura per{" "}
              <strong>{fmtMesi(sostenibili)} mesi</strong>.
            </p>
          )}
          {ritardoEur !== null && (
            <p className="text-rose-600 dark:text-rose-400">
              {fmtMesi(ritardoMesi)} mesi oltre la consegna promessa
              {promessa ? ` (${formatDate(promessa)})` : ""}: ≈{formatCurrency(ritardoEur)} di
              struttura consumata in più.
            </p>
          )}
          {quotaStruttura === null && (
            <p className="text-muted-foreground">
              Inserisci i costi fissi in Costi per vedere quota di struttura e costo del
              ritardo.
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </td>
  );
}

function KPIMini({
  label, value, sub, tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "blue" | "green" | "amber" | "red";
}) {
  const palette: Record<typeof tone, string> = {
    neutral: "bg-muted/40",
    blue: "bg-blue-50",
    green: "bg-emerald-50",
    amber: "bg-amber-50",
    red: "bg-rose-50",
  };
  return (
    <Card className={cn("rounded-2xl border-0", palette[tone])}>
      <CardContent className="p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

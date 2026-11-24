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
import { Link, useNavigate } from "react-router-dom";
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
import { useCompanyStructure } from "@/hooks/controlloGestione/useCompanyStructure";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/formatters";
import { percIt } from "@/lib/controlloGestione/formatoCG";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Hammer, AlertTriangle, Timer } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ExportButton } from "@/components/controllo-gestione/ui/ExportButton";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";
import {
  mesiApertura, margineAlMese, mesiSostenibili, mesiRitardo, costoRitardo, fmtMesi,
} from "@/lib/controlloGestione/tempoCommessa";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
  const [filter, setFilter] = useState<"all" | "in_corso" | "completato" | "assistenza">("all");
  const [sortBy, setSortBy] = useState<"preventivo" | "manodopera" | "perdita">("preventivo");
  // Mobile: numeri senza spiegazioni, filtro di stato e una riga per cantiere
  // (nome, cliente, margine a fine lavori). Ordinamento, semaforo riassunto,
  // formula ed esportazione restano al desktop.
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const statusFilter = filter === "all" ? null : filter;
  const q = useMarginalitaCommesse(anno, statusFilter);
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Formula condivisa con il dettaglio commessa. I costi legati a un ordine e
  // gli operai già imputati restano costi diretti: qui entra solo la struttura.
  const structure = useCompanyStructure();

  // Consegna promessa per commessa: la RPC non la espone, la leggiamo a parte
  // (una query leggera) per calcolare il costo del ritardo. La data-ancora
  // "oggi" viaggia col risultato: il react-compiler vieta new Date() nel render.
  const promesseQuery = useQuery({
    queryKey: ["cg", "commesse-promesse", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // A pagine da mille: PostgREST non ne dà di più per richiesta, e con
      // .limit(2000) le commesse oltre la millesima perdevano il costo del ritardo.
      const righe: { id: string; expected_date: string }[] = [];
      for (let da = 0; ; da += 1000) {
        const { data, error } = await supabase
          .from("orders")
          .select("id, expected_date")
          .eq("company_id", companyId!)
          .not("expected_date", "is", null)
          .order("id")
          .range(da, da + 999);
        if (error) throw error;
        righe.push(...((data ?? []) as { id: string; expected_date: string }[]));
        if (!data || data.length < 1000) break;
      }
      return {
        perId: new Map(righe.map((o) => [o.id, o.expected_date])),
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
  const strutturaNonManodopera = structure.data?.monthlyStructure ?? null;
  const quotaStruttura = structure.data?.monthlyPerActiveOrder ?? null;
  const cantieriAttiviStruttura = structure.data?.activeOrders ?? 0;

  const counts = useMemo(() => {
    if (!q.data) return null;
    const bySem: Record<Semaforo, number> = { verde: 0, giallo: 0, rosso: 0, grigio: 0 };
    let senzaDati = 0;
    q.data.righe.forEach((r) => {
      bySem[r.semaforo] = (bySem[r.semaforo] ?? 0) + 1;
      if (r.semaforo === "grigio" && !r.dati_economici_completi) senzaDati++;
    });
    // «Non valutabile» = senza costi o preventivo, oppure ancora sotto il 20% di avanzamento.
    return { ...bySem, senzaDati, troppoPresto: bySem.grigio - senzaDati };
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
    if (sortBy === "perdita") {
      // Prima le commesse in perdita, dalla perdita più grande.
      const chiave = (r: CommessaRiga) => (r.margine_atteso !== null && r.margine_atteso < 0 ? r.margine_atteso : Infinity);
      arr.sort((a, b) => chiave(a) - chiave(b));
    } else if (sortBy === "manodopera") {
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
      <p className="text-xs text-muted-foreground">
        {t("{n} commesse aperte nel {anno}", { n: kpi.n_anno ?? kpi.n_commesse, anno })}
        {(kpi.n_pregresso ?? 0) > 0 && <>{" "}{t("+ {n} degli anni prima ancora da chiudere", { n: kpi.n_pregresso ?? 0 })}</>}.{" "}{t("Clicca una riga per aprirla.")}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <KPIMini
          label={t("Commesse")}
          value={String(kpi.n_commesse)}
          sub={t("{inCorso} in lavorazione · {finite} finite · {assistenza} in assistenza", { inCorso: kpi.n_in_corso, finite: kpi.n_completate, assistenza: kpi.n_assistenza ?? 0 })}
        />
        <KPIMini
          label={t("Preventivato")}
          value={formatCurrency(kpi.preventivo_totale)}
          sub={t("Contratti più varianti approvate, senza IVA")}
          tone="blue"
        />
        <KPIMini
          label={t("Costi sostenuti")}
          value={formatCurrency(kpi.consuntivo_totale)}
          sub={t("Costi diretti delle commesse valutabili")}
          tone="amber"
        />
        <KPIMini
          label={t("Manodopera")}
          value={labor ? formatCurrency(labor.costo) : "—"}
          sub={
            labor
              ? `${t("{n} ore", { n: labor.ore.toLocaleString(intlCampo()) })}${labor.incidenza !== null ? ` · ${t("{valore} dei costi", { valore: percIt(labor.incidenza, 0) })}` : ""}`
              : "—"
          }
          tone="amber"
        />
        <KPIMini
          label={t("Margine atteso a fine lavori")}
          value={(kpi.preventivo_con_margine_atteso ?? kpi.preventivo_valutabile) > 0 ? formatCurrency(kpi.margine_atteso_totale) : "—"}
          sub={
            (kpi.preventivo_con_margine_atteso ?? kpi.preventivo_valutabile) > 0
              ? t("{valore} sulle commesse valutabili", { valore: percIt((kpi.margine_atteso_totale / (kpi.preventivo_con_margine_atteso ?? kpi.preventivo_valutabile)) * 100) })
              : t("Costi da completare")
          }
          tone="neutral"
        />
        <KPIMini
          label={t("Stimate in perdita")}
          value={String(kpi.n_in_perdita)}
          sub={kpi.n_in_perdita > 0 ? t("A fine lavori i costi supereranno il preventivo") : t("Nessuna commessa in perdita")}
          tone="neutral"
          onClick={kpi.n_in_perdita > 0 ? () => setSortBy("perdita") : undefined}
        />
        <KPIMini
          label={t("Non valutabili")}
          value={String(counts?.grigio ?? 0)}
          sub={counts && counts.grigio > 0
            ? t("{senzaDati} senza costi o preventivo · {troppoPresto} sotto il 20% di avanzamento", { senzaDati: counts.senzaDati, troppoPresto: counts.troppoPresto })
            : t("Tutte valutabili")}
          tone="neutral"
        />
        {isMobile ? null : quotaStruttura !== null ? (
          <KPIMini
            label={t("Quota struttura")}
            value={t("{importo}/mese", { importo: formatCurrency(quotaStruttura) })}
            sub={t("{importo} struttura ÷ {n} cantieri attivi", { importo: formatCurrency(strutturaNonManodopera ?? 0), n: cantieriAttiviStruttura })}
            tone="blue"
          />
        ) : (
          <Card className="min-w-0 rounded-2xl border-dashed bg-muted/30">
            <CardContent className="p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("Quota struttura")}</p>
              <p className="mt-0.5 text-lg font-bold text-muted-foreground">—</p>
              <p className="text-[11px] text-muted-foreground">
                {structure.isError ? (
                  t("Dati struttura non disponibili")
                ) : cantieriAttiviStruttura <= 0 ? (
                  t("Nessun cantiere in corso")
                ) : (
                  <Link to="/azienda/costi" className="font-medium text-primary hover:underline">
                    {t("Inserisci i costi fissi →")}
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
            <ToggleGroupItem value="all" variant="outline" size="sm" className="tap-compact">{t("Tutte")}</ToggleGroupItem>
            <ToggleGroupItem value="in_corso" variant="outline" size="sm" className="tap-compact">{t("Da completare")}</ToggleGroupItem>
            <ToggleGroupItem value="assistenza" variant="outline" size="sm">{t("Assistenza")}</ToggleGroupItem>
            <ToggleGroupItem value="completato" variant="outline" size="sm" className="tap-compact">{t("Completate")}</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-1.5 max-sm:hidden">
            <span className="text-xs text-muted-foreground">{t("Ordina:")}</span>
            <ToggleGroup
              type="single"
              value={sortBy}
              onValueChange={(v) => v && setSortBy(v as typeof sortBy)}
            >
              <ToggleGroupItem value="preventivo" variant="outline" size="sm">{t("Valore")}</ToggleGroupItem>
              <ToggleGroupItem value="manodopera" variant="outline" size="sm">{t("Incidenza manodopera")}</ToggleGroupItem>
              <ToggleGroupItem value="perdita" variant="outline" size="sm">{t("Prima le perdite")}</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {counts && (
          <div className="flex flex-wrap gap-2 text-xs max-sm:hidden">
            {(Object.keys(SEMAFORO_LABEL) as Semaforo[]).map((s) => (
              counts[s] > 0 && (
                <Badge key={s} variant="outline" className={cn("text-[11px]", SEMAFORO_BG[s])}>
                  <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full", SEMAFORO_COLORS[s])} />
                  {t(SEMAFORO_LABEL[s])}: {counts[s]}
                </Badge>
              )
            ))}
          </div>
        )}
      </div>

      {isMobile && righe.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {righe.map((r) => (
            <li key={r.id}>
              <Link to={`/azienda/ordini/${r.id}`} className="flex items-center gap-2.5 py-2 pl-0 pr-3 active:bg-muted/40">
              <span className={cn("block h-9 w-1 shrink-0 rounded-r", SEMAFORO_COLORS[r.semaforo])} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium leading-tight">{r.description || r.order_code}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {r.cliente ?? "—"} · {percIt(r.pct_avanzamento * 100, 0)}
                </p>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <p className={cn(
                  "text-[13px] font-semibold leading-tight",
                  r.margine_atteso !== null && r.margine_atteso < 0 && "text-amber-700",
                )}>
                  {r.margine_atteso !== null ? formatCurrencyCompact(r.margine_atteso) : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {r.margine_atteso_perc !== null ? percIt(r.margine_atteso_perc, 0) : t("non valutabile")}
                </p>
              </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Tabella commesse */}
      <Card className={cn("rounded-2xl", isMobile && righe.length > 0 && "hidden")}>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">{t("Marginalità per cantiere")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("Margine a fine lavori = preventivo − costi ÷ avanzamento, dal 20% di avanzamento in su. Tempo: margine al mese contro la quota di struttura.")}
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
                    { header: "Margine diretto ora", key: "margine_export", width: 16, type: "number" },
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
                      margine_export: r.dati_economici_completi ? r.margine : null,
                      pct_disp: percIt(r.pct_avanzamento * 100, 0),
                      incid_mo: r.consuntivo > 0
                        ? percIt((r.costo_manodopera / r.consuntivo) * 100, 0)
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
              title={t("Nessuna commessa")}
              description={
                filter === "all"
                  ? t("Per il {anno} non ci sono commesse registrate.", { anno: String(anno ?? "") })
                  : t("Nessuna commessa per questo filtro.")
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="w-2 px-1 py-2"></th>
                    <th className="min-w-[200px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("Commessa")}</th>
                    <th className="min-w-[120px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("Preventivo")}</th>
                    <th className="min-w-[120px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("Consuntivo")}</th>
                    <th className="min-w-[130px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("Manodopera")}</th>
                    <th className="min-w-[120px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("Avanz.")}</th>
                    <th className="min-w-[130px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("Tempo")}</th>
                    <th className="min-w-[140px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("Margine diretto ora")}</th>
                    <th className="min-w-[140px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("Margine fine prev.")}</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r) => (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-t hover:bg-muted/20"
                      onClick={(e) => {
                        // Il link del nome gestisce da solo il clic (anche con Ctrl/Cmd).
                        if ((e.target as HTMLElement).closest("a")) return;
                        navigate(`/azienda/ordini/${r.id}`);
                      }}
                    >
                      <td className="px-1">
                        <span className={cn("block h-8 w-1.5 rounded-r", SEMAFORO_COLORS[r.semaforo])} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <Hammer className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <Link to={`/azienda/ordini/${r.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                              {r.order_code && (
                                <span className="mr-1 font-mono text-xs text-muted-foreground">
                                  {r.order_code}
                                </span>
                              )}
                              {r.description}
                            </Link>
                            {r.creation_year !== undefined && r.creation_year < anno && (
                              <Badge variant="outline" className="mt-0.5 text-[10px] font-normal">
                                {t("Del {anno}", { anno: r.creation_year })} · {r.work_state === "completed" ? t("rate da incassare") : t("ancora aperta")}
                              </Badge>
                            )}
                            <p className="truncate text-xs text-muted-foreground">
                              {r.cliente ?? "—"}
                              {r.work_start && ` · ${t("dal {data}", { data: formatDate(r.work_start) })}`}
                              {r.work_end && ` ${t("al {data}", { data: formatDate(r.work_end) })}`}
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
                              {r.consuntivo > 0 && t("{valore} dei costi", { valore: percIt((r.costo_manodopera / r.consuntivo) * 100, 0) })}
                              {r.ore_manodopera > 0 && ` · ${r.ore_manodopera.toLocaleString(intlCampo())} h`}
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
                            {percIt(r.pct_avanzamento * 100, 0)}
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
                          r.margine < 0 && "text-amber-700",
                          r.margine > 0 && "text-emerald-700",
                        )}
                      >
                        {r.dati_economici_completi ? (
                          <>
                            {formatCurrency(r.margine)}
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              ({percIt(r.margine_perc)})
                            </span>
                          </>
                        ) : (
                          <span className="text-xs font-medium text-amber-700">{t("Costi da completare")}</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          r.margine_atteso !== null && r.margine_atteso < 0 && "text-amber-700 font-semibold",
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
                                ({percIt(r.margine_atteso_perc)})
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {r.dati_economici_completi ? t("Sotto il 20%: troppo presto") : "—"}
                          </span>
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
  const t = useT();
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
          title={t("Compila la data di inizio lavori sulla commessa")}
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
              {t("{n} mesi", { n: fmtMesi(mesi) })}
            </span>
            {alMese !== null ? (
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  sottoQuota ? "font-medium text-amber-600" : "text-muted-foreground",
                )}
              >
                {t("{importo}/mese", { importo: formatCurrency(alMese) })}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">{t("appena aperta")}</span>
            )}
            {ritardoEur !== null && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">{t("ritardo −{ritardoEur}", { ritardoEur: formatCurrency(ritardoEur) })}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[260px] space-y-1 text-xs">
          <p>
            {t("Aperta da")} <strong>{t("{n} mesi", { n: fmtMesi(mesi) })}</strong>
            {riga.work_end ? ` ${t("(chiusa)")}` : ""}.
          </p>
          {alMese !== null && quotaStruttura !== null && (
            <p>
              {t("Rende {importo}/mese contro una quota di struttura di {quota}/mese", { importo: formatCurrency(alMese), quota: formatCurrency(quotaStruttura) })}
              {sottoQuota && ` ${t("— sotto quota: il cantiere non paga l'affitto dell'azienda")}`}.
            </p>
          )}
          {sostenibili !== null && (
            <p>
              {t("Il margine attuale paga la struttura per")}{" "}
              <strong>{t("{n} mesi", { n: fmtMesi(sostenibili) })}</strong>.
            </p>
          )}
          {ritardoEur !== null && (
            <p>
              {t("{n} mesi oltre la consegna promessa{data}: ≈{importo} di struttura consumata in più.", { n: fmtMesi(ritardoMesi), data: promessa ? ` (${formatDate(promessa)})` : "", importo: formatCurrency(ritardoEur) })}
            </p>
          )}
          {quotaStruttura === null && (
            <p className="text-muted-foreground">
              {t("Inserisci i costi fissi in Costi per vedere quota di struttura e costo del ritardo.")}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </td>
  );
}

function KPIMini({
  label, value, sub, tone = "neutral", onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "blue" | "green" | "amber" | "red";
  onClick?: () => void;
}) {
  const palette: Record<typeof tone, string> = {
    neutral: "bg-muted/40",
    blue: "bg-blue-50",
    green: "bg-emerald-50",
    amber: "bg-amber-50",
    red: "bg-rose-50",
  };
  return (
    <Card
      className={cn("min-w-0 rounded-2xl border-0", palette[tone], onClick && "cursor-pointer hover:ring-1 hover:ring-primary/30")}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <CardContent className="p-3 max-sm:py-2.5">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words text-lg font-bold leading-tight tabular-nums max-sm:text-base">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground max-sm:hidden">{sub}</p>}
      </CardContent>
    </Card>
  );
}

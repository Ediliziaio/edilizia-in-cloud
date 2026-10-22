import { Fragment, memo, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, LogOut, Route } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { getDateRange } from "@/lib/dateRangeUtils";
import { cn } from "@/lib/utils";
import type { DashboardFiltersState } from "@/hooks/useMarketingDashboard";
import { fmt, fmtCur } from "./utils";

/** Risposta di marketing_percorso_lead (20281021220000). */
interface Conteggi {
  arrivati: number;
  presi: number;
  ore_presa_mediana: number | null;
  in_pipeline: number;
  appuntamenti: number;
  preventivi: number;
  vinti: number;
  persi: number;
  scartati: number;
  aperti: number;
  valore_vinto: number;
  giorni_vendita: number | null;
}
export interface Commerciale extends Conteggi {
  user_id: string | null;
  name: string;
  /** stage_id → lead del commerciale arrivati almeno fin lì */
  fasi: Record<string, number>;
}
interface Fase {
  stage_id: string;
  name: string;
  position: number;
  raggiunte: number;
  ferme_qui: number;
  giorni_medi: number | null;
}
interface Uscita {
  stage_id: string;
  name: string;
  tipo: "lost" | "abandoned" | "altro";
  lead: number;
}
export interface PercorsoFonte extends Omit<Conteggi, "in_pipeline" | "preventivi"> {
  fonte: string;
  /** spesa del periodo (campaign_costs); null se non c'è o se si filtra un commerciale */
  spesa: number | null;
}
export interface Percorso {
  pipeline: { id: string; name: string } | null;
  pipelines: number;
  fasi: Fase[];
  uscite: Uscita[];
  fonti: PercorsoFonte[];
  commerciali: Commerciale[];
  totale: Conteggi;
}

interface Props {
  filters: DashboardFiltersState;
  assignedUserIds: string[] | null;
}

export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
export const pctTxt = (v: number | null) => (v === null ? "—" : `${v}%`);

/** 0,4 → «24 min»; 5 → «5 h»; 60 → «2,5 gg» */
export function tempo(ore: number | null): string {
  if (ore === null || ore === undefined) return "—";
  if (ore < 1) return `${Math.max(1, Math.round(ore * 60))} min`;
  if (ore < 48) return `${Math.round(ore)} h`;
  return `${(ore / 24).toLocaleString("it-IT", { maximumFractionDigits: 1 })} gg`;
}

const giorni = (g: number | null) =>
  g === null || g === undefined ? "—" : `${g.toLocaleString("it-IT", { maximumFractionDigits: 1 })} gg`;

export function usePercorsoLead(filters: DashboardFiltersState, assignedUserIds: string[] | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const range = getDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
  const da = range.from.toISOString();
  const a = range.to.toISOString();
  return useQuery({
    queryKey: ["marketing-percorso-lead", companyId, da.slice(0, 13), a.slice(0, 13), assignedUserIds, filters.sources, filters.pipelineId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("marketing_percorso_lead" as never, {
        p_company_id: companyId,
        p_date_from: da,
        p_date_to: a,
        p_assigned_user_ids: assignedUserIds,
        p_sources: filters.sources.length > 0 ? filters.sources : null,
        p_pipeline_id: filters.pipelineId,
      } as never);
      if (error) throw error;
      return data as unknown as Percorso;
    },
    enabled: !!companyId,
    staleTime: 3 * 60 * 1000,
  });
}

/**
 * I lead arrivati nel periodo e cosa è successo dopo: presi in carico, fino a
 * quale fase, in quanto tempo, vinti, persi e scartati — in totale e per
 * commerciale. Le fasi sono il percorso della pipeline (le uscite a parte).
 */
export const PercorsoLead = memo(function PercorsoLead({ filters, assignedUserIds }: Props) {
  const { data, isLoading, error } = usePercorsoLead(filters, assignedUserIds);
  const isMobile = useIsMobile();
  const [aperto, setAperto] = useState<string | null>(null);

  const totale = data?.totale;
  const fasi = data?.fasi ?? [];
  const massimo = Math.max(totale?.arrivati ?? 0, 1);

  const uscitaTotale = useMemo(() => (data?.uscite ?? []).reduce((s, u) => s + u.lead, 0), [data?.uscite]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Percorso dei lead</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </CardContent>
      </Card>
    );
  }
  if (error || !data || !totale) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Non riesco a caricare il percorso dei lead.
        </CardContent>
      </Card>
    );
  }
  if (totale.arrivati === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Percorso dei lead</CardTitle></CardHeader>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">Nessun lead arrivato nel periodo.</CardContent>
      </Card>
    );
  }

  const chiusura = pct(totale.vinti, totale.vinti + totale.persi);
  const sintesi: { label: string; valore: string; nota?: string; soloComputer?: boolean }[] = [
    { label: "Arrivati", valore: fmt(totale.arrivati) },
    { label: "Presi in carico", valore: pctTxt(pct(totale.presi, totale.arrivati)), nota: `${fmt(totale.presi)} · in ${tempo(totale.ore_presa_mediana)}` },
    { label: "Con appuntamento", valore: pctTxt(pct(totale.appuntamenti, totale.arrivati)), nota: fmt(totale.appuntamenti), soloComputer: true },
    { label: "Vinti", valore: fmt(totale.vinti), nota: totale.valore_vinto > 0 ? fmtCur(totale.valore_vinto) : undefined },
    { label: "Lead → vendita", valore: pctTxt(pct(totale.vinti, totale.arrivati)), nota: totale.giorni_vendita !== null ? `in ${giorni(totale.giorni_vendita)}` : undefined },
    { label: "Chiusura", valore: pctTxt(chiusura), nota: `${fmt(totale.persi)} persi · ${fmt(totale.scartati)} scartati`, soloComputer: true },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-muted-foreground" />
            Percorso dei lead
          </CardTitle>
          <p className="text-xs text-muted-foreground max-sm:hidden">
            Lead arrivati nel periodo e cosa è successo dopo, fino a oggi
            {data.pipeline && data.pipelines > 1 && <> · fasi di «{data.pipeline.name}»</>}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Sintesi */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {sintesi.map((s) => (
            <div key={s.label} className={cn("rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2", s.soloComputer && "max-sm:hidden")}>
              <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</div>
              <div className="text-lg font-bold tabular-nums text-slate-900">{s.valore}</div>
              {s.nota && <div className="truncate text-[11px] text-muted-foreground">{s.nota}</div>}
            </div>
          ))}
        </div>

        {/* Il percorso, fase per fase, e dove escono */}
        {/* telefono: le fasi (anche 13) e le uscite sono analisi da computer */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_260px] max-sm:hidden">
          <div className="space-y-1">
            <div className="hidden grid-cols-[minmax(0,1fr)_56px_56px_64px_56px] gap-2 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:grid">
              <span>Fase</span>
              <span className="text-right">Lead</span>
              <span className="text-right">Passano</span>
              <span className="text-right">Tempo</span>
              <span className="text-right">Fermi</span>
            </div>
            {fasi.map((f, i) => {
              const prima = i === 0 ? totale.in_pipeline : fasi[i - 1].raggiunte;
              const passano = pct(f.raggiunte, prima);
              const calo = passano !== null && passano < 50 && prima >= 5;
              return (
                <div key={f.stage_id} className="grid grid-cols-[minmax(0,1fr)_56px_56px] items-center gap-2 rounded-md px-1 py-1 text-xs sm:grid-cols-[minmax(0,1fr)_56px_56px_64px_56px]">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-700">{f.name}</div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.max(2, (f.raggiunte / massimo) * 100)}%` }} />
                    </div>
                  </div>
                  <span className="text-right font-semibold tabular-nums">{fmt(f.raggiunte)}</span>
                  <span className={cn("text-right tabular-nums", calo ? "font-semibold text-red-600" : "text-muted-foreground")}>{pctTxt(passano)}</span>
                  <span className="hidden text-right tabular-nums text-muted-foreground sm:block">{giorni(f.giorni_medi)}</span>
                  <span className="hidden text-right tabular-nums text-muted-foreground sm:block">{f.ferme_qui > 0 ? fmt(f.ferme_qui) : "—"}</span>
                </div>
              );
            })}
            <div className="grid grid-cols-[minmax(0,1fr)_56px_56px] items-center gap-2 rounded-md bg-emerald-50 px-1 py-1 text-xs sm:grid-cols-[minmax(0,1fr)_56px_56px_64px_56px]">
              <div className="min-w-0">
                <div className="font-semibold text-emerald-700">Vinti</div>
                <div className="mt-1 h-1.5 rounded-full bg-emerald-100">
                  <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.max(2, (totale.vinti / massimo) * 100)}%` }} />
                </div>
              </div>
              <span className="text-right font-semibold tabular-nums text-emerald-700">{fmt(totale.vinti)}</span>
              <span className="text-right tabular-nums text-muted-foreground">{pctTxt(pct(totale.vinti, fasi.at(-1)?.raggiunte ?? totale.in_pipeline))}</span>
              <span className="hidden text-right tabular-nums text-muted-foreground sm:block">{giorni(totale.giorni_vendita)}</span>
              <span className="hidden sm:block" />
            </div>
            <p className="px-1 pt-1 text-[11px] text-muted-foreground max-sm:hidden">
              «Passano» = quota arrivata dalla fase prima; «Tempo» = giorni medi nella fase; «Fermi» = ancora lì oggi.
            </p>
          </div>

          {data.uscite.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <LogOut className="h-3.5 w-3.5 text-slate-400" />
                Dove escono
                <span className="ml-auto font-normal text-muted-foreground">{fmt(uscitaTotale)} lead</span>
              </div>
              <div className="space-y-1.5">
                {data.uscite.slice(0, isMobile ? 4 : 8).map((u) => (
                  <div key={u.stage_id} className="text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="truncate text-slate-600">{u.name}</span>
                      <span className="shrink-0 tabular-nums font-semibold">{fmt(u.lead)}</span>
                    </div>
                    <div className="mt-0.5 h-1 rounded-full bg-slate-100">
                      <div className={cn("h-1 rounded-full", u.tipo === "lost" ? "bg-red-400" : "bg-slate-400")} style={{ width: `${(u.lead / Math.max(uscitaTotale, 1)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Per commerciale */}
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-800">Per commerciale</h4>
          {isMobile ? (
            <div className="space-y-1.5">
              {data.commerciali.slice(0, 5).map((c) => (
                <div key={c.user_id ?? "nessuno"} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  <span className={cn("truncate font-medium", !c.user_id && "text-amber-700")}>{c.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {fmt(c.arrivati)} lead · <b className="text-slate-900">{fmt(c.vinti)}</b> vinti · {pctTxt(pct(c.vinti, c.arrivati))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Commerciale</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Arrivati</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Presi in carico</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">1° contatto</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Appuntam.</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Vinti</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Persi</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Scartati</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Aperti</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Lead → vendita</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Chiusura</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Giorni</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Valore</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.commerciali.map((c) => {
                    const chiave = c.user_id ?? "nessuno";
                    const espanso = aperto === chiave;
                    const conv = pct(c.vinti, c.arrivati);
                    const convTot = pct(totale.vinti, totale.arrivati);
                    return (
                      <Fragment key={chiave}>
                        <TableRow className="cursor-pointer" onClick={() => setAperto(espanso ? null : chiave)}>
                          <TableCell className="whitespace-nowrap text-sm font-medium">
                            <span className="inline-flex items-center gap-1">
                              {espanso ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              <span className={cn(!c.user_id && "text-amber-700")}>{c.name}</span>
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{fmt(c.arrivati)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{fmt(c.presi)} <span className="text-xs text-muted-foreground">({pctTxt(pct(c.presi, c.arrivati))})</span></TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{tempo(c.ore_presa_mediana)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{fmt(c.appuntamenti)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums">{fmt(c.vinti)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{fmt(c.persi)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{fmt(c.scartati)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{fmt(c.aperti)}</TableCell>
                          <TableCell className={cn("whitespace-nowrap text-right text-sm tabular-nums",
                            conv !== null && convTot !== null && c.arrivati >= 5 && conv > convTot && "font-semibold text-emerald-600",
                            conv !== null && convTot !== null && c.arrivati >= 5 && conv < convTot / 2 && "text-red-600")}>{pctTxt(conv)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{pctTxt(pct(c.vinti, c.vinti + c.persi))}</TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{giorni(c.giorni_vendita)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{c.valore_vinto > 0 ? fmtCur(c.valore_vinto) : "—"}</TableCell>
                        </TableRow>
                        {espanso && (
                          <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                            <TableCell colSpan={13} className="py-3">
                              <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
                                {fasi.map((f, i) => {
                                  const n = c.fasi?.[f.stage_id] ?? 0;
                                  const prima = i === 0 ? c.in_pipeline : (c.fasi?.[fasi[i - 1].stage_id] ?? 0);
                                  return (
                                    <div key={f.stage_id} className="flex items-center justify-between gap-2 text-xs">
                                      <span className="truncate text-slate-600">{f.name}</span>
                                      <span className="shrink-0 tabular-nums">
                                        <b>{fmt(n)}</b> <span className="text-muted-foreground">{pctTxt(pct(n, prima))}</span>
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Commerciale = chi ha in carico il lead, altrimenti chi ha l'opportunità, altrimenti chi l'ha lavorato per primo.
                Chiusura = vinti ÷ (vinti + persi), gli scartati non contano. Clic su una riga per le sue fasi.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

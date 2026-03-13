import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronUp, ChevronDown, Crown, Medal, Award, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallCenterKPI } from "@/hooks/useCallCenterReport";

type SortField =
  | "appuntamenti_fissati" | "tasso_app_su_assegnati"
  | "tasso_contatto" | "avg_speed_to_lead_min"
  | "tentativi_per_contatto" | "chiamate_per_giorno"
  | "tasso_app_su_contattati" | "pct_lead_lavorati";

const SORT_OPTIONS: { value: SortField; label: string; inverti?: boolean }[] = [
  { value: "appuntamenti_fissati",    label: "Appuntamenti fissati" },
  { value: "tasso_app_su_assegnati",  label: "App % su lead totali" },
  { value: "tasso_app_su_contattati", label: "App % su contattati" },
  { value: "tasso_contatto",          label: "Tasso di contatto" },
  { value: "avg_speed_to_lead_min",   label: "Speed to Lead (più veloce)", inverti: true },
  { value: "tentativi_per_contatto",  label: "Efficienza (meno tentativi)", inverti: true },
  { value: "chiamate_per_giorno",     label: "Volume chiamate/giorno" },
  { value: "pct_lead_lavorati",       label: "Lead lavorati %" },
];

function semaforoClass(field: string, val: number): string {
  if (field === "tasso_contatto")
    return val >= 60 ? "text-green-700 bg-green-50" : val >= 40 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50";
  if (field === "tasso_app_su_contattati" || field === "tasso_app_su_assegnati")
    return val >= 20 ? "text-green-700 bg-green-50" : val >= 10 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50";
  if (field === "avg_speed_to_lead_min")
    return val <= 10 ? "text-green-700 bg-green-50" : val <= 60 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50";
  if (field === "tentativi_per_contatto")
    return val <= 2.5 ? "text-green-700 bg-green-50" : val <= 4 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50";
  if (field === "pct_lead_lavorati")
    return val >= 90 ? "text-green-700 bg-green-50" : val >= 70 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50";
  return "";
}

function CellBadge({ val, field, suffix = "" }: { val: number; field: string; suffix?: string }) {
  const cls = semaforoClass(field, val);
  if (!cls) return <span>{val}{suffix}</span>;
  return <span className={cn("px-1.5 py-0.5 rounded text-xs font-semibold", cls)}>{val}{suffix}</span>;
}

const RANK_ICONS = [Crown, Medal, Award];
const RANK_COLORS = ["text-yellow-500", "text-gray-400", "text-amber-600"];

interface Props {
  kpiList: CallCenterKPI[];
  isLoading: boolean;
}

export function OperatoriRanking({ kpiList, isLoading }: Props) {
  const [sortBy, setSortBy] = useState<SortField>("appuntamenti_fissati");
  const [ascending, setAscending] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (!kpiList.length) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-center text-muted-foreground">Nessun operatore trovato nel periodo</p>
        </CardContent>
      </Card>
    );
  }

  const sortOpt = SORT_OPTIONS.find(o => o.value === sortBy);
  const shouldInvert = sortOpt?.inverti ?? false;

  const sorted = [...kpiList].sort((a, b) => {
    const av = (a[sortBy] as number) ?? 0;
    const bv = (b[sortBy] as number) ?? 0;
    return (ascending !== shouldInvert) ? av - bv : bv - av;
  });

  const len = sorted.length;
  const teamAvg = (field: keyof CallCenterKPI) =>
    Math.round(sorted.reduce((a, k) => a + ((k[field] as number) ?? 0), 0) / len * 10) / 10;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Classifica Operatori
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Ordina per:</span>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
              <SelectTrigger className="w-[220px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => setAscending(!ascending)}
            >
              {ascending ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="text-xs ml-1">{ascending ? "Cresc." : "Decr."}</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Operatore</TableHead>
                <TableHead className="text-right">Lead</TableHead>
                <TableHead className="text-right">Lav. %</TableHead>
                <TableHead className="text-right">Cont. %</TableHead>
                <TableHead className="text-right">STL</TableHead>
                <TableHead className="text-right">Tent/C</TableHead>
                <TableHead className="text-right">App.</TableHead>
                <TableHead className="text-right">App%C</TableHead>
                <TableHead className="text-right">App%L</TableHead>
                <TableHead className="text-right">Show%</TableHead>
                <TableHead className="text-right">Call/gg</TableHead>
                <TableHead className="text-right">Dur.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((k, idx) => {
                const RankIcon = idx < 3 ? RANK_ICONS[idx] : undefined;
                const speedFmt = k.avg_speed_to_lead_min < 60
                  ? `${k.avg_speed_to_lead_min}m`
                  : `${Math.round(k.avg_speed_to_lead_min / 60 * 10) / 10}h`;

                return (
                  <TableRow key={k.operatore_id}>
                    <TableCell>
                      {RankIcon
                        ? <RankIcon className={cn("h-4 w-4", RANK_COLORS[idx])} />
                        : <span className="text-muted-foreground text-xs">{idx + 1}</span>}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{k.nome_operatore}</div>
                      <div className="text-xs text-muted-foreground">{k.email_operatore}</div>
                    </TableCell>
                    <TableCell className="text-right">{k.lead_assegnati}</TableCell>
                    <TableCell className="text-right">
                      <CellBadge val={k.pct_lead_lavorati} field="pct_lead_lavorati" suffix="%" />
                    </TableCell>
                    <TableCell className="text-right">
                      <CellBadge val={k.tasso_contatto} field="tasso_contatto" suffix="%" />
                    </TableCell>
                    <TableCell className="text-right">
                      <CellBadge val={k.avg_speed_to_lead_min} field="avg_speed_to_lead_min" />
                      <div className="text-xs text-muted-foreground">{speedFmt}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <CellBadge val={k.tentativi_per_contatto} field="tentativi_per_contatto" />
                    </TableCell>
                    <TableCell className="text-right font-semibold">{k.appuntamenti_fissati}</TableCell>
                    <TableCell className="text-right">
                      <CellBadge val={k.tasso_app_su_contattati} field="tasso_app_su_contattati" suffix="%" />
                    </TableCell>
                    <TableCell className="text-right">
                      <CellBadge val={k.tasso_app_su_assegnati} field="tasso_app_su_assegnati" suffix="%" />
                    </TableCell>
                    <TableCell className="text-right">{k.tasso_show_up}%</TableCell>
                    <TableCell className="text-right">{k.chiamate_per_giorno}</TableCell>
                    <TableCell className="text-right">{k.durata_media_min}m</TableCell>
                  </TableRow>
                );
              })}

              {/* Team average footer */}
              {len > 1 && (
                <TableRow className="bg-muted/50 font-medium border-t-2">
                  <TableCell />
                  <TableCell className="text-sm">Media Team</TableCell>
                  <TableCell className="text-right">{Math.round(teamAvg("lead_assegnati"))}</TableCell>
                  <TableCell className="text-right">{teamAvg("pct_lead_lavorati")}%</TableCell>
                  <TableCell className="text-right">{teamAvg("tasso_contatto")}%</TableCell>
                  <TableCell className="text-right">{teamAvg("avg_speed_to_lead_min")}m</TableCell>
                  <TableCell className="text-right">{teamAvg("tentativi_per_contatto").toFixed(1)}</TableCell>
                  <TableCell className="text-right">{Math.round(teamAvg("appuntamenti_fissati"))}</TableCell>
                  <TableCell className="text-right">{teamAvg("tasso_app_su_contattati")}%</TableCell>
                  <TableCell className="text-right">{teamAvg("tasso_app_su_assegnati")}%</TableCell>
                  <TableCell className="text-right">{teamAvg("tasso_show_up")}%</TableCell>
                  <TableCell className="text-right">{Math.round(teamAvg("chiamate_per_giorno"))}/gg</TableCell>
                  <TableCell className="text-right">{teamAvg("durata_media_min").toFixed(1)}m</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Legend */}
        <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Ottimo</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Da migliorare</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Critico</span>
        </div>
      </CardContent>
    </Card>
  );
}

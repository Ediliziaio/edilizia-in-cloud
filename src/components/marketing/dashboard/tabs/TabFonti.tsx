import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Radio } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { fmt, fmtCur } from "@/components/marketing/dashboard/utils";
import { usePercorsoLead, pct, pctTxt, tempo } from "@/components/marketing/dashboard/PercorsoLead";
import type { DashboardStats, DashboardFiltersState } from "@/hooks/useMarketingDashboard";

/*
 * Tab «Fonti & ROI»: per ogni fonte, i lead arrivati nel periodo e cosa ne è
 * stato — presi in carico, in quanto tempo, appuntamenti, vendite, valore — con
 * la spesa: costo per lead, costo per vendita e ROI. Le stesse regole del
 * percorso dei lead (scheda Pipeline), così i numeri tornano tra le schede.
 */

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
  filters: DashboardFiltersState;
  assignedUserIds: string[] | null;
}

export const TabFonti = memo(function TabFonti({ filters, assignedUserIds }: Props) {
  const { data, isLoading } = usePercorsoLead(filters, assignedUserIds);
  const isMobile = useIsMobile();

  if (isLoading || !data) {
    return <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}</div>;
  }

  const fonti = data.fonti ?? [];
  const conSpesa = fonti.some((f) => (f.spesa ?? 0) > 0);
  const spesaTot = fonti.reduce((s, f) => s + (f.spesa ?? 0), 0);
  const tot = data.totale;
  const convTot = pct(tot.vinti, tot.arrivati);
  // la fonte che converte meglio, tra quelle con abbastanza lead da dire qualcosa
  const migliore = [...fonti].filter((f) => f.arrivati >= 10)
    .sort((a, b) => b.vinti / b.arrivati - a.vinti / a.arrivati)[0];

  const sintesi = [
    { label: "Lead arrivati", valore: fmt(tot.arrivati), nota: `${fonti.length} fonti` },
    { label: "Vendite", valore: fmt(tot.vinti), nota: `${pctTxt(convTot)} dei lead` },
    { label: "Valore venduto", valore: fmtCur(tot.valore_vinto) },
    conSpesa
      ? { label: "Spesa", valore: fmtCur(spesaTot), nota: tot.vinti > 0 ? `${fmtCur(spesaTot / tot.vinti)} per vendita` : undefined }
      : { label: "Converte meglio", valore: migliore?.fonte ?? "—", nota: migliore ? `${pctTxt(pct(migliore.vinti, migliore.arrivati))} dei lead` : "servono almeno 10 lead" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {sintesi.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</div>
            <div className="truncate text-lg font-bold tabular-nums text-slate-900">{s.valore}</div>
            {s.nota && <div className="truncate text-[11px] text-muted-foreground">{s.nota}</div>}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Radio className="h-4 w-4 text-muted-foreground" /> Fonti
          </CardTitle>
          <p className="text-xs text-muted-foreground">Lead arrivati nel periodo, per fonte, e cosa ne è stato fino a oggi</p>
        </CardHeader>
        <CardContent className="pt-0">
          {fonti.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nessun lead nel periodo.</p>
          ) : isMobile ? (
            <div className="space-y-1.5">
              {fonti.map((f) => (
                <div key={f.fonte} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  <span className="truncate font-medium">{f.fonte}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {fmt(f.arrivati)} lead · <b className="text-slate-900">{fmt(f.vinti)}</b> vendite · {pctTxt(pct(f.vinti, f.arrivati))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Fonte</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Lead</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Presi in carico</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">1° contatto</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Appuntamento</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Vendite</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Lead → vendita</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Scartati</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Valore</TableHead>
                    {conSpesa && <TableHead className="whitespace-nowrap text-right text-xs">Spesa</TableHead>}
                    {conSpesa && <TableHead className="whitespace-nowrap text-right text-xs">Costo/lead</TableHead>}
                    {conSpesa && <TableHead className="whitespace-nowrap text-right text-xs">Costo/vendita</TableHead>}
                    {conSpesa && <TableHead className="whitespace-nowrap text-right text-xs font-semibold">ROI</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fonti.map((f) => {
                    const conv = pct(f.vinti, f.arrivati);
                    const spesa = f.spesa ?? 0;
                    const roi = spesa > 0 ? Math.round(((f.valore_vinto - spesa) / spesa) * 100) : null;
                    return (
                      <TableRow key={f.fonte}>
                        <TableCell className="whitespace-nowrap text-sm font-medium">{f.fonte}</TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums">{fmt(f.arrivati)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{pctTxt(pct(f.presi, f.arrivati))}</TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{tempo(f.ore_presa_mediana)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{fmt(f.appuntamenti)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums">{fmt(f.vinti)}</TableCell>
                        <TableCell className={cn("text-right text-sm tabular-nums",
                          conv !== null && convTot !== null && f.arrivati >= 10 && conv > convTot && "font-semibold text-emerald-600",
                          conv !== null && convTot !== null && f.arrivati >= 10 && conv < convTot / 2 && "text-red-600")}>{pctTxt(conv)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{fmt(f.scartati)} <span className="text-xs text-muted-foreground">({pctTxt(pct(f.scartati, f.arrivati))})</span></TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{f.valore_vinto > 0 ? fmtCur(f.valore_vinto) : "—"}</TableCell>
                        {conSpesa && <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{spesa > 0 ? fmtCur(spesa) : "—"}</TableCell>}
                        {conSpesa && <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{spesa > 0 && f.arrivati > 0 ? fmtCur(spesa / f.arrivati) : "—"}</TableCell>}
                        {conSpesa && <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{spesa > 0 && f.vinti > 0 ? fmtCur(spesa / f.vinti) : "—"}</TableCell>}
                        {conSpesa && <TableCell className={cn("whitespace-nowrap text-right text-sm font-semibold tabular-nums", roi !== null && (roi >= 0 ? "text-emerald-600" : "text-red-600"))}>{roi === null ? "—" : `${roi}%`}</TableCell>}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {conSpesa
                  ? "Spesa dai costi campagna del periodo. ROI = (valore venduto − spesa) ÷ spesa."
                  : assignedUserIds
                    ? "La spesa è della fonte, non della persona: con un commerciale scelto non si mostra."
                    : "Nessuna spesa registrata nel periodo: aggiungi i costi delle campagne per vedere costo per lead, per vendita e ROI."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

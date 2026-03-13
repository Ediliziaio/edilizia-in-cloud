import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart2, TrendingUp, AlertTriangle } from "lucide-react";
import type { FonteLeadPerf } from "@/hooks/useCallCenterReport";

const qualityBadge: Record<string, { variant: "default" | "secondary" | "destructive"; label: string; dot: string }> = {
  ottima: { variant: "default", label: "Ottima", dot: "bg-green-500" },
  buona: { variant: "secondary", label: "Buona", dot: "bg-blue-500" },
  scarsa: { variant: "destructive", label: "Scarsa", dot: "bg-red-500" },
};

interface Props {
  data: FonteLeadPerf[];
  isLoading: boolean;
}

export function FonteLeadTable({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-2">
          <p className="text-muted-foreground font-medium">Nessuna fonte lead con dati sufficienti nel periodo.</p>
          <p className="text-sm text-muted-foreground">Verifica che i contatti abbiano il campo "fonte" compilato.</p>
        </CardContent>
      </Card>
    );
  }

  const maxAppRate = Math.max(...data.map(f => f.tasso_appuntamento), 1);

  // Best/worst insights
  const best = data.reduce((a, b) => a.tasso_appuntamento > b.tasso_appuntamento ? a : b);
  const worst = data.reduce((a, b) => a.tasso_appuntamento < b.tasso_appuntamento ? a : b);

  return (
    <div className="space-y-4">
      {/* Explanatory header */}
      <p className="text-sm text-muted-foreground">
        Analisi per fonte lead: capire quale canale porta lead più "caldi" aiuta a ottimizzare il budget marketing e a prioritizzare i lead da chiamare per primi.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary" />
            Performance per Fonte Lead
          </CardTitle>
          <p className="text-sm text-muted-foreground">Solo fonti con almeno 3 lead nel periodo</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonte</TableHead>
                <TableHead className="text-right">Lead</TableHead>
                <TableHead className="text-right">Contattati</TableHead>
                <TableHead className="text-right">% Contatto</TableHead>
                <TableHead className="text-right">App.</TableHead>
                <TableHead className="text-right min-w-[140px]">% App.</TableHead>
                <TableHead className="text-right">Avg STL</TableHead>
                <TableHead>Qualità</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(d => {
                const badge = qualityBadge[d.qualita_fonte] ?? qualityBadge.scarsa;
                const barWidth = Math.round(d.tasso_appuntamento / maxAppRate * 100);
                return (
                  <TableRow key={d.fonte}>
                    <TableCell className="font-medium">{d.fonte}</TableCell>
                    <TableCell className="text-right">{d.lead_totali}</TableCell>
                    <TableCell className="text-right">{d.lead_contattati}</TableCell>
                    <TableCell className={`text-right font-medium ${
                      (d.tasso_contatto ?? 0) >= 60 ? "text-green-600" : (d.tasso_contatto ?? 0) >= 40 ? "text-amber-600" : "text-red-500"
                    }`}>
                      {d.tasso_contatto ?? 0}%
                    </TableCell>
                    <TableCell className="text-right font-semibold">{d.appuntamenti}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold min-w-[32px] ${
                          (d.tasso_appuntamento ?? 0) >= 20 ? "text-green-600" : (d.tasso_appuntamento ?? 0) >= 10 ? "text-amber-600" : "text-red-500"
                        }`}>
                          {d.tasso_appuntamento ?? 0}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={`text-right ${
                      (d.avg_speed_to_lead_min ?? 0) <= 5 ? "text-green-600" : (d.avg_speed_to_lead_min ?? 0) <= 60 ? "text-amber-600" : "text-red-500"
                    }`}>
                      {(d.avg_speed_to_lead_min ?? 0) < 60
                        ? `${d.avg_speed_to_lead_min ?? 0} min`
                        : `${Math.round((d.avg_speed_to_lead_min ?? 0) / 60 * 10) / 10}h`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant} className="gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        {badge.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Insights */}
      {data.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start gap-2">
                <TrendingUp className="h-4 w-4 text-green-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-green-800">🏆 Fonte migliore: {best.fonte}</p>
                  <p className="text-xs text-green-700 mt-1">
                    Tasso appuntamento del {best.tasso_appuntamento}% su {best.lead_totali} lead.
                    Prioritizza questa fonte nei budget advertising.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {worst.fonte !== best.fonte && worst.lead_totali >= 10 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">⚠️ Fonte da rivalutare: {worst.fonte}</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Solo {worst.tasso_appuntamento}% di conversione su {worst.lead_totali} lead.
                      Considera se il targeting o il messaggio va ottimizzato.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

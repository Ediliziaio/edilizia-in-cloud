import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { FonteLeadPerf } from "@/hooks/useCallCenterReport";

const qualityBadge: Record<string, { variant: "default" | "secondary" | "destructive"; label: string }> = {
  ottima: { variant: "default", label: "Ottima" },
  buona: { variant: "secondary", label: "Buona" },
  scarsa: { variant: "destructive", label: "Scarsa" },
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Performance per Fonte Lead</CardTitle>
        <p className="text-sm text-muted-foreground">Solo fonti con almeno 3 lead nel periodo</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">Nessun dato disponibile</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonte</TableHead>
                <TableHead className="text-right">Lead</TableHead>
                <TableHead className="text-right">Contattati</TableHead>
                <TableHead className="text-right">App.</TableHead>
                <TableHead className="text-right">% Contatto</TableHead>
                <TableHead className="text-right">% App.</TableHead>
                <TableHead className="text-right">Avg STL</TableHead>
                <TableHead>Qualità</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(d => {
                const badge = qualityBadge[d.qualita_fonte] ?? qualityBadge.scarsa;
                return (
                  <TableRow key={d.fonte}>
                    <TableCell className="font-medium">{d.fonte}</TableCell>
                    <TableCell className="text-right">{d.lead_totali}</TableCell>
                    <TableCell className="text-right">{d.lead_contattati}</TableCell>
                    <TableCell className="text-right">{d.appuntamenti}</TableCell>
                    <TableCell className={`text-right font-medium ${
                      (d.tasso_contatto ?? 0) >= 60 ? "text-green-600" : (d.tasso_contatto ?? 0) >= 40 ? "text-amber-600" : "text-red-500"
                    }`}>
                      {d.tasso_contatto ?? 0}%
                    </TableCell>
                    <TableCell className={`text-right font-medium ${
                      (d.tasso_appuntamento ?? 0) >= 20 ? "text-green-600" : (d.tasso_appuntamento ?? 0) >= 10 ? "text-amber-600" : "text-red-500"
                    }`}>
                      {d.tasso_appuntamento ?? 0}%
                    </TableCell>
                    <TableCell className={`text-right ${
                      (d.avg_speed_to_lead_min ?? 0) <= 5 ? "text-green-600" : (d.avg_speed_to_lead_min ?? 0) <= 60 ? "text-amber-600" : "text-red-500"
                    }`}>
                      {d.avg_speed_to_lead_min ?? 0} min
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CohortRow } from "@/hooks/useAdminRevenueData";

function getCellColor(pct: number): string {
  if (pct >= 80) return "bg-green-600 text-white";
  if (pct >= 60) return "bg-green-500 text-white";
  if (pct >= 40) return "bg-yellow-500 text-white";
  if (pct >= 20) return "bg-orange-500 text-white";
  if (pct > 0) return "bg-red-500 text-white";
  return "bg-muted text-muted-foreground";
}

interface Props {
  data: CohortRow[];
}

export function AdminCohortAnalysis({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cohort Analysis</CardTitle>
          <CardDescription>Dati insufficienti per generare le coorti</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const maxMonths = Math.max(...data.map((d) => d.retainedPct.length));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Cohort Analysis — Retention</CardTitle>
        <CardDescription>Percentuale di aziende ancora attive per mese di acquisizione</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background z-10 min-w-[80px]">Coorte</TableHead>
              <TableHead className="text-center min-w-[50px]">Tot</TableHead>
              {Array.from({ length: Math.min(maxMonths, 12) }, (_, i) => (
                <TableHead key={i} className="text-center min-w-[50px]">M{i}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.cohort}>
                <TableCell className="sticky left-0 bg-background z-10 font-medium text-xs whitespace-nowrap">
                  {row.cohort}
                </TableCell>
                <TableCell className="text-center text-xs font-medium">{row.total}</TableCell>
                {Array.from({ length: Math.min(maxMonths, 12) }, (_, i) => {
                  const pct = row.retainedPct[i];
                  if (pct === undefined) {
                    return <TableCell key={i} className="text-center" />;
                  }
                  return (
                    <TableCell
                      key={i}
                      className={`text-center text-xs font-medium ${getCellColor(pct)}`}
                      title={`${Math.round(row.total * pct / 100)} di ${row.total} aziende attive`}
                    >
                      {pct}%
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

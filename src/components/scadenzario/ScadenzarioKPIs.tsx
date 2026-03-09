import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CalendarClock, Clock, TrendingDown, TrendingUp } from "lucide-react";
import type { ScadenzarioSummary } from "@/hooks/useScadenzario";

const fmtEur = (n: number) => `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`;

interface Props {
  summary: ScadenzarioSummary | undefined;
  isLoading: boolean;
}

export default function ScadenzarioKPIs({ summary, isLoading }: Props) {
  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}><CardContent className="pt-4 pb-3"><div className="h-14 animate-pulse bg-muted rounded" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const saldoNetto = summary.entrate_previste - summary.uscite_previste;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className={summary.scadute_count > 0 ? "border-destructive" : ""}>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-xs text-muted-foreground">Scadute</p>
          </div>
          <p className="text-xl font-bold text-destructive">{fmtEur(summary.scadute_amount)}</p>
          <p className="text-xs text-muted-foreground">{summary.scadute_count} scadenz{summary.scadute_count === 1 ? "a" : "e"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="h-4 w-4 text-amber-600" />
            <p className="text-xs text-muted-foreground">Questa settimana</p>
          </div>
          <p className="text-xl font-bold text-amber-600">{fmtEur(summary.questa_settimana_amount)}</p>
          <p className="text-xs text-muted-foreground">{summary.questa_settimana_count} scadenz{summary.questa_settimana_count === 1 ? "a" : "e"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-blue-600" />
            <p className="text-xs text-muted-foreground">Prossimi 30gg</p>
          </div>
          <p className="text-xl font-bold">{fmtEur(summary.prossimi_30gg_amount)}</p>
          <p className="text-xs text-muted-foreground">{summary.prossimi_30gg_count} scadenz{summary.prossimi_30gg_count === 1 ? "a" : "e"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 mb-1">
            {saldoNetto >= 0
              ? <TrendingUp className="h-4 w-4 text-green-600" />
              : <TrendingDown className="h-4 w-4 text-destructive" />
            }
            <p className="text-xs text-muted-foreground">Saldo netto atteso</p>
          </div>
          <p className={`text-xl font-bold ${saldoNetto >= 0 ? "text-green-600" : "text-destructive"}`}>
            {fmtEur(saldoNetto)}
          </p>
          <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
            <span className="text-green-600">↑ {fmtEur(summary.entrate_attese)}</span>
            <span className="text-destructive">↓ {fmtEur(summary.uscite_attese)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

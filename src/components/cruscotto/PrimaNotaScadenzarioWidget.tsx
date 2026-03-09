import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, CalendarClock, Wallet, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { usePrimaNota } from "@/hooks/usePrimaNota";
import { useScadenzario } from "@/hooks/useScadenzario";

const fmtEur = (n: number) => `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`;

export function PrimaNotaScadenzarioWidget() {
  const navigate = useNavigate();
  const { saldo, isSaldoLoading } = usePrimaNota();
  const { summary, isSummaryLoading } = useScadenzario();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Prima Nota Saldo */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Saldo Prima Nota</p>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate("/azienda/prima-nota")}>
              Vai <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
          {isSaldoLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : (
            <>
              <p className={`text-2xl font-bold ${(saldo?.saldo || 0) >= 0 ? "text-green-600" : "text-destructive"}`}>
                {fmtEur(saldo?.saldo || 0)}
              </p>
              <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  {fmtEur(saldo?.entrate || 0)}
                </span>
                <span className="flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 text-destructive" />
                  {fmtEur(saldo?.uscite || 0)}
                </span>
                <span>{saldo?.entry_count || 0} movimenti</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Scadenzario urgenze */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Scadenze</p>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate("/azienda/scadenzario")}>
              Vai <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
          {isSummaryLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : (
            <>
              {(summary?.scadute_count || 0) > 0 ? (
                <p className="text-2xl font-bold text-destructive">
                  {summary?.scadute_count} scadut{summary?.scadute_count === 1 ? "a" : "e"} · {fmtEur(summary?.scadute_amount || 0)}
                </p>
              ) : (
                <p className="text-2xl font-bold text-green-600">Tutto in regola</p>
              )}
              <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                <span>{summary?.questa_settimana_count || 0} questa settimana</span>
                <span>{summary?.prossimi_30gg_count || 0} prossimi 30gg</span>
              </div>
              <div className="flex gap-4 mt-0.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Wallet className="h-3 w-3" />
                  Entrate: {fmtEur(summary?.entrate_previste || 0)}
                </span>
                <span>Uscite: {fmtEur(summary?.uscite_previste || 0)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

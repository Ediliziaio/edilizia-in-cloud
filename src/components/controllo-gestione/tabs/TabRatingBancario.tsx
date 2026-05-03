import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useRating, type RatingIndicatore } from "@/hooks/controlloGestione/useStatoPatrimoniale";
import { RatingGauge } from "@/components/controllo-gestione/ui/RatingGauge";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";

interface TabRatingBancarioProps {
  anno: number;
}

function formatValore(ind: RatingIndicatore): string {
  if (ind.codice === "oneri_finanziari" || ind.codice === "indipendenza") {
    return `${(ind.valore * 100).toFixed(1)}%`;
  }
  return ind.valore.toFixed(2);
}

function formatSoglia(ind: RatingIndicatore): string {
  if (ind.codice === "oneri_finanziari" || ind.codice === "indipendenza") {
    return `${(ind.soglia_top * 100).toFixed(1)}%`;
  }
  return ind.soglia_top.toFixed(2);
}

export function TabRatingBancario({ anno }: TabRatingBancarioProps) {
  const { data, isLoading, isError, refetch } = useRating(anno);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-[400px] rounded-2xl lg:col-span-1" />
        <div className="space-y-3 lg:col-span-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }
  if (isError) return <ErrorBlock onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="rounded-2xl lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rating bancario {data.anno}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <RatingGauge score={data.score} classe={data.classe} />
          <p className="text-xs text-muted-foreground text-center">
            Trend storico disponibile dal 2° mese di tracciamento
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3 lg:col-span-2">
        {data.indicatori.map((ind) => {
          const pctScore = (ind.punteggio / 25) * 100;
          const tone =
            ind.punteggio >= 18 ? "text-emerald-600"
              : ind.punteggio >= 12 ? "text-amber-600"
                : "text-destructive";
          return (
            <Card key={ind.codice} className="rounded-2xl">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {ind.codice}
                    </Badge>
                    <p className="text-sm font-medium">{ind.label}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Soglia top: {formatSoglia(ind)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:gap-6">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Valore
                    </p>
                    <p className="text-base font-bold tabular-nums">
                      {formatValore(ind)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Punteggio
                    </p>
                    <p className={`text-base font-bold tabular-nums ${tone}`}>
                      {ind.punteggio}/25
                    </p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {pctScore.toFixed(0)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

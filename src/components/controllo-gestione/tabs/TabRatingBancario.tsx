import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRating } from "@/hooks/controlloGestione/useStatoPatrimoniale";
import { RatingGauge } from "@/components/controllo-gestione/ui/RatingGauge";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import {
  formatObiettivoIndicatore,
  formatValoreIndicatore,
  indicatoreCalcolabile,
  INDICATORI_RATING,
  type CodiceIndicatoreRating,
} from "@/lib/controlloGestione/indiciBanca";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

interface TabRatingBancarioProps {
  anno: number;
}

// Il database fino alla migrazione 20281022104300 scriveva la differenza senza
// formattarla («differenza 1346331.55 €»): la si rende leggibile qui.
function motivoLeggibile(m: string): string {
  return m.replace(/(-?\d+(?:\.\d+)?)\s*€/g, (_, n: string) =>
    `${new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n))} €`,
  );
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

  const attendibile = data.attendibile === true;
  const motivi = (data.motivi ?? []).map(motivoLeggibile);
  const annoInCorso = anno === new Date().getFullYear();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="rounded-2xl lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rating bancario {data.anno}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Una stima interna di come una banca giudica l'azienda: 4 indicatori da 0 a 25 punti, per un totale su 100.
            Non è il rating ufficiale della banca né della Centrale Rischi.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {/* Il quadrante solo per una valutazione validata: un AAA su dati
              non riconciliati non deve sembrare un giudizio vero. */}
          {attendibile ? (
            <RatingGauge score={data.score} classe={data.classe} />
          ) : (
            <div role="alert" className="w-full rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-4 w-4" /> Valutazione provvisoria · Non validato
              </p>
              <p className="mt-1">
                Punteggio indicativo: {data.classe} con {data.score} punti su 100. Non usarlo con la banca finché i dati
                non sono a posto.
              </p>
              {(motivi.length > 0 ? motivi : ["Verifica la completezza dei dati nel Health-check."]).map((m) => (
                <p key={m} className="mt-2">{m}</p>
              ))}
              <Link className="mt-3 inline-block font-medium underline" to="/azienda/controllo-gestione/health">
                Apri controlli e riconciliazione
              </Link>
            </div>
          )}
          {annoInCorso && (
            <p className="text-center text-xs text-muted-foreground">
              Anno in corso: utile e ammortamenti sono riportati all'anno intero.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3 lg:col-span-2">
        {data.indicatori.map((ind) => {
          const meta = INDICATORI_RATING[ind.codice as CodiceIndicatoreRating];
          const calcolabile = indicatoreCalcolabile(ind);
          const tone =
            ind.punteggio >= 18 ? "text-emerald-600" : ind.punteggio >= 12 ? "text-amber-600" : "text-destructive";
          return (
            <Card key={ind.codice} className="rounded-2xl">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-semibold">{meta?.nome ?? ind.label}</p>
                  <p className="text-xs text-muted-foreground">{meta?.formula ?? ind.label}</p>
                  {meta && <p className="text-xs text-muted-foreground">{meta.spiegazione}</p>}
                  <p className="text-xs text-muted-foreground">
                    Punteggio pieno: {formatObiettivoIndicatore(ind.codice, ind.soglia_top)}
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-4 sm:gap-6">
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground">Valore</p>
                    <p className="text-base font-bold tabular-nums">{formatValoreIndicatore(ind)}</p>
                    {!calcolabile && <p className="text-[10px] text-muted-foreground">mancano i dati</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground">Punti</p>
                    <p className={cn("text-base font-bold tabular-nums", tone)}>{ind.punteggio} su 25</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        <p className="px-1 text-xs text-muted-foreground">
          Classi: AAA da 90 punti, AA da 80, A da 70, BBB da 55, BB da 40, B da 20, CCC sotto 20. Il Piano industriale
          proietta lo stesso rating sugli anni futuri.
        </p>
      </div>
    </div>
  );
}

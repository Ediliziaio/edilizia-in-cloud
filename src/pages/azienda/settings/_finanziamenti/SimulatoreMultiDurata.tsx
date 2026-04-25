/**
 * Simulatore multi-durata: dato un importo, mostra il calcolo per TUTTE le
 * durate disponibili nella tabella, fianco a fianco.
 *
 * Aiuta il venditore a presentare al cliente un confronto:
 * "se vuoi finanziare 10.000 €, in 24 mesi paghi X, in 60 mesi Y, in 120 Z…"
 * Con highlight della durata "rata più bassa" e "TAEG più basso".
 */

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, Trophy, TrendingDown } from "lucide-react";
import { calcolaFinanziamento } from "@/lib/finanziamenti/calcolaFinanziamento";
import type { RigaTabellaFinanziamento } from "@/lib/finanziamenti/types";

interface Props {
  /** Importo finanziato richiesto (€). */
  importo: number | null;
  /** Durate disponibili nella tabella (mesi). */
  durateDisponibili: number[];
  /** Tutte le righe della tabella per il lookup. */
  righe: RigaTabellaFinanziamento[];
}

export function SimulatoreMultiDurata({
  importo,
  durateDisponibili,
  righe,
}: Props) {
  const risultati = useMemo(() => {
    if (!importo || importo <= 0 || durateDisponibili.length === 0) return [];
    return durateDisponibili.map((d) => ({
      durata: d,
      calc: calcolaFinanziamento({
        importo,
        numero_rate: d,
        righe,
      }),
    }));
  }, [importo, durateDisponibili, righe]);

  // Identifica i "vincitori" per evidenziarli
  const winners = useMemo(() => {
    const validi = risultati.filter((r) => r.calc.modalita !== "errore");
    if (validi.length === 0) {
      return { rataPiuBassa: null, taegPiuBasso: null, totalePiuBasso: null };
    }
    const rataMin = Math.min(...validi.map((r) => r.calc.rata_completa ?? Infinity));
    const taegMin = Math.min(...validi.map((r) => r.calc.taeg ?? Infinity));
    const totMin = Math.min(...validi.map((r) => r.calc.importo_totale_dovuto ?? Infinity));
    return {
      rataPiuBassa: validi.find((r) => r.calc.rata_completa === rataMin)?.durata ?? null,
      taegPiuBasso: validi.find((r) => r.calc.taeg === taegMin)?.durata ?? null,
      totalePiuBasso: validi.find((r) => r.calc.importo_totale_dovuto === totMin)?.durata ?? null,
    };
  }, [risultati]);

  if (!importo || importo <= 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Inserisci un importo</AlertTitle>
        <AlertDescription>
          Il simulatore confronta tutte le durate disponibili in tabella per
          l&apos;importo che inserisci.
        </AlertDescription>
      </Alert>
    );
  }

  if (durateDisponibili.length === 0) {
    return (
      <Alert variant="destructive">
        <Info className="h-4 w-4" />
        <AlertTitle>Nessuna durata disponibile</AlertTitle>
        <AlertDescription>
          La tabella selezionata non ha righe caricate.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Durata</TableHead>
                <TableHead className="text-right">Rata mensile</TableHead>
                <TableHead className="text-right">Sp. incasso</TableHead>
                <TableHead className="text-right">Rata totale</TableHead>
                <TableHead className="text-right">Totale dovuto</TableHead>
                <TableHead className="text-right">Interessi</TableHead>
                <TableHead className="text-right">TAN</TableHead>
                <TableHead className="text-right">TAEG</TableHead>
                <TableHead className="text-right">Provv. dealer</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {risultati.map(({ durata, calc }) => {
                const isError = calc.modalita === "errore";
                const isInterp = calc.modalita === "interpolato";
                const isRataMin = winners.rataPiuBassa === durata;
                const isTaegMin = winners.taegPiuBasso === durata;
                const isTotMin = winners.totalePiuBasso === durata;

                return (
                  <TableRow
                    key={durata}
                    className={
                      isRataMin || isTaegMin
                        ? "bg-primary/5 hover:bg-primary/10"
                        : ""
                    }
                  >
                    <TableCell className="font-medium whitespace-nowrap">
                      {durata} mesi
                    </TableCell>
                    {isError ? (
                      <TableCell colSpan={8} className="text-xs text-muted-foreground italic">
                        {calc.messaggio}
                      </TableCell>
                    ) : (
                      <>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          € {fmt(calc.importo_rata ?? 0, 2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          € {fmt(calc.spese_incasso_rata ?? 0, 2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold">
                          € {fmt(calc.rata_completa ?? 0, 2)}
                          {isRataMin && (
                            <Trophy className="h-3 w-3 inline ml-1 text-emerald-600" />
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          € {fmt(calc.importo_totale_dovuto ?? 0, 2)}
                          {isTotMin && (
                            <TrendingDown className="h-3 w-3 inline ml-1 text-emerald-600" />
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          € {fmt(calc.interessi_cliente ?? 0, 2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {(calc.tan ?? 0).toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {(calc.taeg ?? 0).toFixed(2)}%
                          {isTaegMin && (
                            <TrendingDown className="h-3 w-3 inline ml-1 text-emerald-600" />
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          € {fmt(calc.provvigione_dealer ?? 0, 2)}
                        </TableCell>
                        <TableCell>
                          {isInterp && (
                            <Badge
                              variant="outline"
                              className="bg-amber-50 text-amber-800 border-amber-200 text-xs"
                            >
                              interpolato
                            </Badge>
                          )}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs">
        {winners.rataPiuBassa != null && (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
            <Trophy className="h-3 w-3 mr-1" />
            Rata mensile più bassa: {winners.rataPiuBassa} mesi
          </Badge>
        )}
        {winners.taegPiuBasso != null &&
          winners.taegPiuBasso !== winners.rataPiuBassa && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              <TrendingDown className="h-3 w-3 mr-1" />
              TAEG più basso: {winners.taegPiuBasso} mesi
            </Badge>
          )}
        {winners.totalePiuBasso != null &&
          winners.totalePiuBasso !== winners.rataPiuBassa &&
          winners.totalePiuBasso !== winners.taegPiuBasso && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              <TrendingDown className="h-3 w-3 mr-1" />
              Totale dovuto più basso: {winners.totalePiuBasso} mesi
            </Badge>
          )}
      </div>
    </div>
  );
}

function fmt(n: number, frac = 0): string {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  });
}

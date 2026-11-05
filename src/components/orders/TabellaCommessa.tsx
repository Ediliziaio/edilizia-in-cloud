/**
 * La stessa veste per le viste di «Materiali e acquisti»: riquadro con titolo e azioni, numeri in cima, tabella.
 * Da telefono la tabella diventa una scheda per riga: stesso DOM, così niente è scritto due volte.
 */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ColonnaTabella<T> {
  titolo: string;
  /** Al posto del titolo, in testata: per una casella «seleziona tutti». */
  intestazione?: ReactNode;
  cella: (riga: T) => ReactNode;
  destra?: boolean;
  /** Da telefono è il titolo della scheda: senza etichetta, a tutta larghezza. */
  principale?: boolean;
}

export function TabellaCommessa<T>({ etichetta, colonne, righe, chiave }: {
  etichetta: string; colonne: ColonnaTabella<T>[]; righe: T[]; chiave: (riga: T) => string;
}) {
  return (
    <div className="sm:overflow-x-auto">
      <table aria-label={etichetta} className="w-full text-sm max-sm:block">
        <thead className="max-sm:hidden">
          <tr className="border-b">
            {colonne.map(c => (
              <th key={c.titolo} scope="col" className={cn("whitespace-nowrap px-2 pb-2 text-left text-xs font-medium text-muted-foreground", c.destra && "text-right")}>{c.intestazione ?? c.titolo}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y max-sm:block">
          {righe.map(r => (
            <tr key={chiave(r)} className="hover:bg-muted/40 max-sm:block max-sm:py-2">
              {colonne.map(c => (
                <td key={c.titolo} data-etichetta={c.titolo}
                  className={cn("px-2 py-2.5 align-top sm:first:pl-2",
                    c.destra && "text-right tabular-nums",
                    c.principale
                      ? "max-sm:block max-sm:px-0 max-sm:py-0.5 max-sm:text-left max-sm:font-semibold"
                      : "max-sm:flex max-sm:items-start max-sm:justify-between max-sm:gap-3 max-sm:px-0 max-sm:py-0.5 max-sm:text-right max-sm:before:shrink-0 max-sm:before:text-xs max-sm:before:font-normal max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-etichetta)] max-sm:empty:hidden")}>
                  {c.cella(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TONI = {
  verde: "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300",
  ambra: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  rosso: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300",
  blu: "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  grigio: "bg-muted text-muted-foreground",
} as const;
export type TonoStato = keyof typeof TONI;

export function StatoPill({ tono, children }: { tono: TonoStato; children: ReactNode }) {
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONI[tono])}>{children}</span>;
}

/** Il riquadro comune: icona, titolo, quante righe, un riassunto, le azioni; sotto i numeri e il contenuto. */
export function RiquadroCommessa({ icona, titolo, conteggio, riassunto, azioni, numeri, children, id }: {
  icona: ReactNode; titolo: string; conteggio?: number; riassunto?: ReactNode; azioni?: ReactNode; numeri?: ReactNode; children: ReactNode; id?: string;
}) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader className="space-y-2 pb-3 max-sm:p-3 max-sm:pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base">
            {icona}{titolo}
            {!!conteggio && <Badge variant="outline">{conteggio}</Badge>}
            {riassunto && <span className="text-sm font-normal text-muted-foreground">· {riassunto}</span>}
          </CardTitle>
          {azioni && <div className="flex flex-wrap items-center gap-2">{azioni}</div>}
        </div>
        {numeri}
      </CardHeader>
      <CardContent className="max-sm:p-3 max-sm:pt-0">{children}</CardContent>
    </Card>
  );
}

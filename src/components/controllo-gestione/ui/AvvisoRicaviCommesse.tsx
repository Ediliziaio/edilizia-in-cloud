/**
 * «In questo periodo non ci sono fatture emesse.»
 *
 * Fino al 9 novembre 2026 il Controllo di Gestione, per le aziende senza
 * fatture, prendeva il valore delle commesse e lo chiamava ricavo. Era un
 * numero inventato: l'intero contratto messo nel giorno in cui la commessa è
 * stata inserita in EiC, cancellate comprese.
 *
 * Ora i ricavi sono solo le fatture. Per chi non fattura dentro EiC il conto
 * economico resta quindi senza ricavi, e questo avviso dice perché e che cosa
 * c'è al suo posto: il portafoglio commesse, chiamato col suo nome.
 */
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import type { RicaviProvenienza } from "@/hooks/controlloGestione/useCEriclassificato";

interface AvvisoRicaviCommesseProps {
  provenienza: RicaviProvenienza | null | undefined;
  periodoLabel: string;
  anno: number;
}

/** Vero quando l'avviso ha qualcosa da dire: nessuna fattura, ma commesse sì. */
export function serveAvvisoRicavi(p: RicaviProvenienza | null | undefined): boolean {
  if (!p) return false;
  return p.fatture_righe === 0 && p.commesse_righe > 0;
}

export function AvvisoRicaviCommesse({
  provenienza,
  periodoLabel,
  anno,
}: AvvisoRicaviCommesseProps) {
  if (!serveAvvisoRicavi(provenienza) || !provenienza) return null;
  const periodo = periodoLabel === "Anno completo" ? String(anno) : `${periodoLabel} ${anno}`;

  return (
    <Card className="rounded-2xl border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">
              Nessuna fattura emessa nel periodo {periodo}: senza fatture i ricavi non si
              possono calcolare.
            </p>
            <p className="text-muted-foreground">
              Hai {provenienza.commesse_righe}{" "}
              {provenienza.commesse_righe === 1 ? "commessa" : "commesse"} per{" "}
              {formatCurrency(provenienza.commesse_valore)}: è il portafoglio, non un ricavo —
              il ricavo nasce quando fatturi. Emetti le fatture in EiC, o importale, e il conto
              economico si popola da solo.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to="/azienda/fatturazione">Vai a Fatturazione</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

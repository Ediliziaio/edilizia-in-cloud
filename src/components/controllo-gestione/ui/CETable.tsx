import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { formatPct } from "@/lib/controlloGestione/formatCG";
import { vociLeggibili } from "@/lib/controlloGestione/contoEconomico";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import type { VoceCE } from "@/hooks/controlloGestione/useCEriclassificato";

interface CETableProps {
  voci: VoceCE[];
  isVoceClickable?: (voce: VoceCE) => boolean;
  onVoceClick?: (voce: VoceCE) => void;
  /** Spiegazione per codice voce (es. come sono stimate le imposte). */
  spiegazioni?: Record<string, string | null | undefined>;
}

export function CETable({ voci, isVoceClickable, onVoceClick, spiegazioni }: CETableProps) {
  // Nomi chiari («Valore della produzione», non «PRODOTTO INTERNO LORDO») e la
  // percentuale su OGNI riga: prima c'era solo sui cinque margini.
  const righe = vociLeggibili(voci);
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Voce</TableHead>
            <TableHead className="text-right">Importo</TableHead>
            <TableHead className="w-24 text-right" title="Percentuale sul valore della produzione (ricavi più variazione dei lavori in corso)">
              % sui ricavi
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {righe.map((v) => {
            const isGrasso = v.tipo === "subtot_grasso";
            const isSub = v.tipo === "subtot";
            const negativo = v.valore < 0;
            const clickable = isVoceClickable?.(v) ?? false;
            const spiegazione = spiegazioni?.[v.codice] ?? null;
            return (
              <TableRow
                key={v.codice}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                title={clickable ? `Apri il dettaglio di ${v.label}` : undefined}
                onClick={clickable ? () => onVoceClick?.(v) : undefined}
                onKeyDown={
                  clickable
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onVoceClick?.(v);
                        }
                      }
                    : undefined
                }
                className={cn(
                  isGrasso && "bg-primary/5 font-bold",
                  isSub && "bg-muted/50 font-semibold",
                  clickable && "cursor-pointer hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <TableCell className={cn(!isGrasso && !isSub && "pl-6")}>
                  <span className="inline-flex items-center gap-1.5">
                    {v.label}
                    {spiegazione && (
                      <span title={spiegazione} aria-label={spiegazione} className="text-muted-foreground">
                        <Info className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    negativo && "text-destructive",
                  )}
                >
                  {formatCurrency(v.valore)}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                  {v.valore === 0 ? "—" : formatPct(v.incidenza)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

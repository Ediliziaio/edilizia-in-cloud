import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { VoceCE } from "@/hooks/controlloGestione/useCEriclassificato";

interface CETableProps {
  voci: VoceCE[];
  isVoceClickable?: (voce: VoceCE) => boolean;
  onVoceClick?: (voce: VoceCE) => void;
}

function formatPct(p?: number): string {
  if (p === undefined || p === null || Number.isNaN(p)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(p / 100);
}

export function CETable({ voci, isVoceClickable, onVoceClick }: CETableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Cod.</TableHead>
            <TableHead>Voce</TableHead>
            <TableHead className="text-right">Valore</TableHead>
            <TableHead className="w-20 text-right">% PIL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {voci.map((v) => {
            const isGrasso = v.tipo === "subtot_grasso";
            const isSub = v.tipo === "subtot";
            const negativo = v.valore < 0;
            const clickable = isVoceClickable?.(v) ?? false;
            return (
              <TableRow
                key={v.codice}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                title={clickable ? `Apri dettaglio ${v.label}` : undefined}
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
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {v.codice}
                </TableCell>
                <TableCell>{v.label}</TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    negativo && "text-destructive",
                  )}
                >
                  {formatCurrency(v.valore)}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                  {formatPct(v.pct_pil)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

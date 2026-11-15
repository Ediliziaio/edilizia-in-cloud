import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { SPAttivo, SPPassivo } from "@/hooks/controlloGestione/useStatoPatrimoniale";
import { buildAttivo, buildPassivo, type Riga } from "@/lib/controlloGestione/spRighe";

interface SPColumnsProps {
  attivo: SPAttivo;
  passivo: SPPassivo;
  /** Voci senza fonte nel gestionale: a zero si legge «da inserire», non 0,00 €. */
  vociManuali?: Set<string>;
  /** Attivo − passivo: se diversa da zero compare in fondo alle fonti. */
  differenza?: number;
}

function ColumnSP({
  titolo, righe, vociManuali, differenza,
}: {
  titolo: string;
  righe: Riga[];
  vociManuali?: Set<string>;
  differenza?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b bg-muted/40 px-4 py-2.5">
        <h3 className="text-sm font-semibold">{titolo}</h3>
      </div>
      <div className="divide-y">
        {righe.map((r) => {
          const negativo = r.valore < 0;
          const daInserire = r.livello === "voce" && r.valore === 0 && vociManuali?.has(r.chiave);
          return (
            <div
              key={r.chiave}
              className={cn(
                "flex items-center justify-between gap-3 px-4 py-2 text-sm",
                r.livello === "voce" && "pl-7",
                r.livello === "subtot" && "border-t-2 border-muted bg-muted/50 font-semibold",
                r.livello === "totale" && "bg-primary/10 py-3 text-base font-bold",
              )}
            >
              <span className={cn("min-w-0", r.spiegazione && "cursor-help")} title={r.spiegazione}>
                {r.label}
              </span>
              {daInserire ? (
                <span className="shrink-0 text-xs italic text-muted-foreground" title="Il gestionale non ha ancora una fonte per questa voce: chiedi il dato al commercialista.">
                  da inserire a mano
                </span>
              ) : (
                <span className={cn("shrink-0 tabular-nums", negativo && "font-medium")}>
                  {formatCurrency(r.valore)}
                </span>
              )}
            </div>
          );
        })}
        {differenza != null && Math.abs(differenza) >= 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-dashed px-4 py-2.5 text-sm text-muted-foreground">
            <span title="Impieghi meno fonti: quello che il gestionale non riesce ancora a spiegare.">
              Differenza da spiegare
            </span>
            <span className="shrink-0 tabular-nums">{formatCurrency(Math.abs(differenza))}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function SPColumns({ attivo, passivo, vociManuali, differenza }: SPColumnsProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <ColumnSP
        titolo="Impieghi: dove sono i soldi"
        righe={buildAttivo(attivo)}
        vociManuali={vociManuali}
        differenza={differenza != null && differenza < 0 ? differenza : undefined}
      />
      <ColumnSP
        titolo="Fonti: da dove vengono"
        righe={buildPassivo(passivo)}
        vociManuali={vociManuali}
        differenza={differenza != null && differenza > 0 ? differenza : undefined}
      />
    </div>
  );
}

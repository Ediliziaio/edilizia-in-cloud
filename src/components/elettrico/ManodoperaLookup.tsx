/**
 * ManodoperaLookup — componente READ-ONLY riusabile.
 *
 * Dati regione (+ provincia/anno opzionali), mostra il costo orario ufficiale
 * delle 4 qualifiche manodopera edile (comune / qualificato / specializzato /
 * quarto livello). Legge da `manodopera_tariffa` via `useManodoperaLookup`
 * (RLS: SELECT a tutti gli autenticati).
 *
 * NON è montato in nessuna pagina: sarà agganciato in seguito (es. computo
 * Elettrico, accanto alla voce manodopera). Qui deve solo compilare.
 *
 * Se per la stessa qualifica esistono più righe (es. province diverse quando si
 * filtra per sola regione), mostra la più recente per anno e segnala l'ambiguità.
 */
import { useMemo } from "react";
import { HardHat, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  useManodoperaLookup,
  QUALIFICHE_ORDINE,
  QUALIFICA_LABEL,
} from "@/lib/prezzario/manodopera";
import type { ManodoperaTariffa, QualificaManodopera } from "@/lib/prezzario/tipi";

export interface ManodoperaLookupProps {
  regione?: string;
  provincia?: string;
  anno?: number;
  /** Classi extra sul contenitore. */
  className?: string;
}

const fmtEuro = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : `€ ${Number(n).toFixed(2)}/h`;

export function ManodoperaLookup({
  regione,
  provincia,
  anno,
  className,
}: ManodoperaLookupProps) {
  const { data, isLoading, error } = useManodoperaLookup(regione, provincia, anno);

  // Per ogni qualifica scegli la riga "migliore": anno più recente (null in
  // fondo). Tieni traccia se ce n'era più d'una → badge "più fonti".
  const byQualifica = useMemo(() => {
    const map = new Map<
      QualificaManodopera,
      { row: ManodoperaTariffa; count: number }
    >();
    for (const row of data ?? []) {
      if (!row.qualifica) continue;
      const q = row.qualifica;
      const existing = map.get(q);
      if (!existing) {
        map.set(q, { row, count: 1 });
        continue;
      }
      const better = (row.anno ?? -Infinity) > (existing.row.anno ?? -Infinity);
      map.set(q, { row: better ? row : existing.row, count: existing.count + 1 });
    }
    return map;
  }, [data]);

  if (!regione) {
    return (
      <p className={`text-sm text-muted-foreground ${className ?? ""}`}>
        Seleziona una regione per vedere il costo orario della manodopera.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div
        className={`flex items-center gap-2 text-sm text-muted-foreground ${className ?? ""}`}
      >
        <Loader2 className="h-4 w-4 animate-spin" /> Caricamento tariffe…
      </div>
    );
  }

  if (error) {
    return (
      <p className={`text-sm text-destructive ${className ?? ""}`}>
        {error instanceof Error ? error.message : "Errore nel caricamento delle tariffe."}
      </p>
    );
  }

  const scopeLabel = [regione, provincia, anno ? String(anno) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <HardHat className="h-4 w-4 text-muted-foreground" />
        <span>Costo orario manodopera</span>
        {scopeLabel && (
          <span className="text-xs font-normal text-muted-foreground">{scopeLabel}</span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {QUALIFICHE_ORDINE.map((q) => {
          const entry = byQualifica.get(q);
          return (
            <div
              key={q}
              className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm">{QUALIFICA_LABEL[q]}</div>
                {entry?.row.fonte && (
                  <div className="truncate text-xs text-muted-foreground" title={entry.row.fonte}>
                    {entry.row.fonte}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {entry && entry.count > 1 && (
                  <Badge variant="outline" title="Più righe per questa qualifica: mostrata la più recente">
                    più fonti
                  </Badge>
                )}
                <span className="tabular-nums text-sm font-medium">
                  {fmtEuro(entry?.row.costo_orario)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {byQualifica.size === 0 && (
        <p className="text-sm text-muted-foreground">
          Nessuna tariffa disponibile per questo ambito.
        </p>
      )}
    </div>
  );
}

export default ManodoperaLookup;

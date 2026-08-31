/**
 * Stato vuoto compatto — una riga, non un riquadro.
 *
 * Perche' esiste: misurando la pagina commessa, il 43% dell'altezza dei tab
 * (2.817px su 6.626) era occupato da card che dicevano "non c'e' niente".
 * Alcune erano enormi per non dire nulla: "Pagamenti Fornitori" 715px,
 * "Lavorazioni / Manodopera" 663px. Una card vuota pesava quanto una piena, e
 * il contenuto vero finiva sommerso.
 *
 * Qui il vuoto diventa una riga alta ~44px: icona, frase e l'eventuale azione
 * sulla stessa linea. Quello che c'e' davvero torna a risaltare.
 *
 * ATTENZIONE — non va usato dove il vuoto E' il bersaglio: l'area di
 * caricamento file deve restare generosa, perche' e' li' che si trascina.
 */
import type { LucideIcon } from "lucide-react";

interface EmptyRowProps {
  /** Icona a sinistra (stessa famiglia lucide del resto della pagina). */
  icon?: LucideIcon;
  /** La frase principale. Tienila corta: e' una riga. */
  children: React.ReactNode;
  /** Azione a destra (un bottone piccolo, di solito "Aggiungi…"). */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyRow({ icon: Icon, children, action, className = "" }: EmptyRowProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/20 px-3 py-2.5 ${className}`}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />}
        {/* line-clamp-2, non truncate: una frase appena piu' lunga veniva
            tagliata con "…" a meta' parola (visto a schermo). Due righe bastano
            e la riga resta compatta. */}
        <span className="line-clamp-2">{children}</span>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default EmptyRow;

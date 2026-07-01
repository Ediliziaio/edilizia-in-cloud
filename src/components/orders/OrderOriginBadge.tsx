/**
 * OrderOriginBadge — riga compatta che indica l'origine della commessa.
 *
 * Se la commessa nasce da un preventivo (quoteId presente) mostra un link
 * "Nato da preventivo #…" al documento; altrimenti "Ordine diretto".
 * Nessun wrapper Card: una sola riga, pensata per stare vicino al titolo.
 */
import { Link } from "react-router-dom";
import { GitBranch } from "lucide-react";

export interface OrderOriginBadgeProps {
  quoteId?: string | null;
  quoteNumber?: string | null;
}

export function OrderOriginBadge({ quoteId, quoteNumber }: OrderOriginBadgeProps) {
  if (!quoteId) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <GitBranch className="h-3.5 w-3.5" />
        Ordine diretto
      </span>
    );
  }

  return (
    <Link
      to={`/azienda/documenti/${quoteId}`}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-secondary-foreground hover:underline"
    >
      <GitBranch className="h-3.5 w-3.5" />
      Nato da preventivo #{quoteNumber ?? "—"}
    </Link>
  );
}

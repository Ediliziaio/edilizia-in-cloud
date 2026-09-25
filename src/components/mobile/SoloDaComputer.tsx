import { Link } from "react-router-dom";
import { ChevronRight, Monitor } from "lucide-react";

interface AvvisoSoloDaComputerProps {
  /** Cosa non si fa da qui, detto in una riga. */
  titolo: string;
  /** Dove andare invece: la cosa che da telefono si può fare. */
  azione?: { etichetta: string; to: string };
}

/**
 * Al posto di un builder o di una configurazione, da telefono. Regola
 * dell'utente (25/09/2026): dal telefono si guarda e si usa, ma corsi,
 * portale, automazioni, calendari e sistema di fatturazione si creano e si
 * impostano da computer o tablet. Una riga, e se c'è, il posto giusto.
 */
export function AvvisoSoloDaComputer({ titolo, azione }: AvvisoSoloDaComputerProps) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 p-3">
        <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">{titolo}</p>
      </div>
      {azione && (
        <Link
          to={azione.to}
          className="flex items-center justify-between gap-3 px-3 py-3 text-sm font-medium text-primary"
        >
          {azione.etichetta}
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

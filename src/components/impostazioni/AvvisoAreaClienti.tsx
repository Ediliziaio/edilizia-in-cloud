import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

/**
 * Le scelte che riguardano l'area clienti (documenti visibili al cliente, email a ogni cambio di stato) si possono
 * fare anche se l'area clienti non è accesa: la accende solo Edilizia in Cloud, su richiesta. Finché è spenta
 * quelle scelte non hanno nessun effetto, e la pagina deve dirlo invece di parlarne come se funzionasse.
 * Se l'area clienti è accesa non scrive niente.
 */
export function AvvisoAreaClienti({ className }: { className?: string }) {
  const { effectiveCompany } = useAuth();
  if (effectiveCompany?.customer_portal_enabled === true) return null;
  return (
    <p role="note" className={cn("text-xs text-muted-foreground", className)}>
      L&apos;area clienti non è attiva per la tua azienda: questa scelta avrà effetto quando la attiviamo.
    </p>
  );
}

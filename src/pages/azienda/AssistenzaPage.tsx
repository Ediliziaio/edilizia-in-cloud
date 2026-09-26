/**
 * Assistenza: una porta sola (26/09/2026, richiesta del founder «uni Assistenza
 * e Manutenzione chiamando solo Assistenza»).
 *
 * Non c'è una barra a parte: la scheda «Manutenzioni» sta nella stessa fila di
 * Tutti/Supporto/Interventi/Emergenze dentro TicketsList, e con ?vista=manutenzioni
 * al suo posto mostra impianti, contratti e scadenze. Qui scegliamo solo cosa
 * rendere in base ai permessi: chi vede solo la manutenzione va dritto a quella.
 */
import { lazy, Suspense } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { Skeleton } from "@/components/ui/skeleton";

const TicketsList = lazy(() => import("@/pages/azienda/TicketsList"));
const ManutenzioneList = lazy(() => import("@/pages/azienda/ManutenzioneList"));

export default function AssistenzaPage() {
  const perms = usePermissions();
  // Chi può vedere solo le manutenzioni (niente ticket) va dritto a quella
  // pagina, con la sua testata.
  const soloManutenzione = perms.canViewTickets !== true && perms.canViewManutenzione === true;

  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      {soloManutenzione ? <ManutenzioneList /> : <TicketsList />}
    </Suspense>
  );
}

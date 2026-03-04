import { Clock } from "lucide-react";
import { ComingSoonPlaceholder } from "./ComingSoonPlaceholder";

export function UserAvailabilityTab() {
  return (
    <ComingSoonPlaceholder
      icon={Clock}
      title="Disponibilità Utente"
      description="Configura gli orari di lavoro e la disponibilità dell'utente"
      comingSoonText="La gestione degli orari di lavoro settimanali, date specifiche e fuso orario sarà disponibile a breve."
    />
  );
}

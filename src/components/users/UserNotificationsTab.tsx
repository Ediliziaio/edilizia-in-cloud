import { Bell } from "lucide-react";
import { ComingSoonPlaceholder } from "./ComingSoonPlaceholder";

export function UserNotificationsTab() {
  return (
    <ComingSoonPlaceholder
      icon={Bell}
      title="Impostazioni Notifiche"
      description="Configura le preferenze di notifica per questo utente"
      comingSoonText="La matrice notifiche (Task, Calendario, Ordini, Lead) per canale (In-app, Email, SMS) sarà disponibile a breve."
    />
  );
}

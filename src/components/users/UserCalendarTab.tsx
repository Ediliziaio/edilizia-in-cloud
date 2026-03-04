import { Calendar } from "lucide-react";
import { ComingSoonPlaceholder } from "./ComingSoonPlaceholder";

export function UserCalendarTab() {
  return (
    <div>
      <ComingSoonPlaceholder
        icon={Calendar}
        title="Calendario"
        description="Collega calendari esterni e configura la sincronizzazione"
        comingSoonText="Il collegamento con Google Calendar, Outlook e la sincronizzazione bidirezionale saranno disponibili a breve."
      />
    </div>
  );
}

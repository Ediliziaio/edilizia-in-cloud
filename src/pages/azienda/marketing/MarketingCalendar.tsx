import { CalendarDays } from "lucide-react";

export default function MarketingCalendar() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <CalendarDays className="h-16 w-16 text-muted-foreground/40" />
      <h1 className="text-2xl font-bold">Calendario Marketing</h1>
      <p className="text-muted-foreground max-w-md">
        Questa sezione è in fase di sviluppo. Presto potrai pianificare appuntamenti commerciali e follow-up.
      </p>
    </div>
  );
}

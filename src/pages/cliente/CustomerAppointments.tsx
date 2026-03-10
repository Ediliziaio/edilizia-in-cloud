import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomerAppointments() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Appuntamenti</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-5 w-5 text-primary" />
            I tuoi appuntamenti
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Qui troverai i tuoi appuntamenti confermati e lo storico.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

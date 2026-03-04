import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Construction } from "lucide-react";

export function UserAvailabilityTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Disponibilità Utente
        </CardTitle>
        <CardDescription>
          Configura gli orari di lavoro e la disponibilità dell'utente
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Construction className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-muted-foreground">Prossimamente</h3>
          <p className="text-sm text-muted-foreground mt-1">
            La gestione degli orari di lavoro settimanali, date specifiche e fuso orario sarà disponibile a breve.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

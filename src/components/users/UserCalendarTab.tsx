import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Construction } from "lucide-react";

export function UserCalendarTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Calendario
        </CardTitle>
        <CardDescription>
          Collega calendari esterni e configura la sincronizzazione
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Construction className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-muted-foreground">Prossimamente</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Il collegamento con Google Calendar, Outlook e la sincronizzazione bidirezionale saranno disponibili a breve.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

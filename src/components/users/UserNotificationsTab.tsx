import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Construction } from "lucide-react";

export function UserNotificationsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Impostazioni Notifiche
        </CardTitle>
        <CardDescription>
          Configura le preferenze di notifica per questo utente
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Construction className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-muted-foreground">Prossimamente</h3>
          <p className="text-sm text-muted-foreground mt-1">
            La matrice notifiche (Task, Calendario, Ordini, Lead) per canale (In-app, Email, SMS) sarà disponibile a breve.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * CampoImpostazioni — Pagina impostazioni per operai e subappaltatori.
 * In cima le notifiche sul telefono (26/09/2026: prima in /campo non c'era modo
 * di accenderle o spegnerle, solo il banner in home); sotto riutilizza MioProfilo
 * (profilo, sicurezza, calendari).
 */
import { Card, CardContent } from "@/components/ui/card";
import { NotificheSuQuestoDispositivo } from "@/components/notifications/NotificheSuQuestoDispositivo";
import MioProfilo from "@/pages/azienda/impostazioni/MioProfilo";

export default function CampoImpostazioni() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 max-sm:mb-3">
        <h1 className="text-xl font-semibold tracking-tight">Impostazioni</h1>
        <p className="text-sm text-muted-foreground mt-0.5 max-sm:hidden">
          Gestisci il tuo profilo, sicurezza, calendari e notifiche
        </p>
      </div>
      <Card className="mb-4 max-sm:mb-3">
        <CardContent className="p-4 max-sm:p-3">
          <NotificheSuQuestoDispositivo />
        </CardContent>
      </Card>
      <MioProfilo />
    </div>
  );
}

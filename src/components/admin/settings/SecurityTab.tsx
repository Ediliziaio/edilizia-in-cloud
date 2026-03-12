import { Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function SecurityTab() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sicurezza</h1>
        <p className="text-muted-foreground">Cambio password, sessioni attive e controllo accessi</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Shield className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">Impostazioni di sicurezza</h3>
          <p className="text-sm text-muted-foreground max-w-md mt-2">
            Il modulo di gestione sicurezza sarà disponibile nella prossima
            release. Includerà cambio password, gestione sessioni attive e
            autenticazione a due fattori.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

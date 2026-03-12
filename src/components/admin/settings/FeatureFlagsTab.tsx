import { Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function FeatureFlagsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Feature Flags</h1>
        <p className="text-muted-foreground">Abilita o disabilita funzionalità per azienda specifica o globalmente</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Zap className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">Feature Flags in arrivo</h3>
          <p className="text-sm text-muted-foreground max-w-md mt-2">
            Il modulo di gestione feature flags sarà disponibile nella prossima
            release. Permetterà di abilitare funzionalità beta per aziende
            specifiche o percentuali del totale.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AddonNotActivePlaceholder() {
  return (
    <div className="px-3 sm:px-4 py-6">
      <Card className="rounded-2xl border-orange-200 bg-orange-50/40">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-100">
            <Lock className="h-7 w-7 text-orange-600" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Modulo Controllo di Gestione non attivo</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Questo add-on consente di analizzare conto economico riclassificato, stato
              patrimoniale, rating bancario e proiezioni del piano industriale. Per attivarlo
              contatta il supporto: ti aiuteremo nella configurazione iniziale.
            </p>
          </div>
          <Button disabled variant="outline" className="gap-2">
            Contatta il supporto per attivarlo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

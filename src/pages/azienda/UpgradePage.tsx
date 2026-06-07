import { Link, useLocation } from "react-router-dom";
import { Lock, Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";

/**
 * UpgradePage — fallback mostrato da `FeatureRoute` quando l'utente tenta
 * di accedere a una sezione non disponibile con il piano corrente (o con
 * override `is_enabled=false`).
 *
 * Riceve `deniedFeature` via `location.state` (settato da `<Navigate>` in
 * `FeatureRoute`). Mostra piano corrente, feature negata e CTA verso
 * abbonamento/commerciale. Volutamente minimale.
 */
export default function UpgradePage() {
  const location = useLocation();
  const { currentPlan } = useSubscriptionLimits();

  const deniedFeature = (location.state as { deniedFeature?: string } | null)?.deniedFeature;
  const planName = currentPlan?.name ?? "Piano corrente";

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
              <Lock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <CardTitle>Funzionalità non inclusa</CardTitle>
              <CardDescription>
                Piano attivo: <strong>{planName}</strong>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {deniedFeature ? (
            <p className="text-sm text-muted-foreground">
              La sezione richiesta (<code className="px-1.5 py-0.5 rounded bg-muted text-foreground">{deniedFeature}</code>)
              non è attiva sul tuo piano o è stata disabilitata per la tua azienda.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              La sezione richiesta non è attualmente disponibile per la tua azienda.
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            Contatta il commerciale per attivare la funzionalità, oppure consulta i
            piani disponibili dalla sezione abbonamento.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button asChild variant="default">
              <Link to="/azienda/impostazioni/abbonamento">
                Vedi piani e abbonamento
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href="mailto:commerciale@ediliziaincloud.com?subject=Richiesta%20attivazione%20funzionalità">
                <Mail className="mr-2 h-4 w-4" />
                Contatta commerciale
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

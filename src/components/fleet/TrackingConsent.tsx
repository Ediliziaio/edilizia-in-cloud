import { Shield, MapPin, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GPS_CONSENT_VERSION } from "@/types/fleet";

interface TrackingConsentProps {
  onAccept: () => Promise<void>;
  onDecline?: () => void;
  isAccepting?: boolean;
}

/**
 * Schermata di consenso GDPR obbligatoria prima di avviare il tracciamento GPS.
 */
export function TrackingConsent({
  onAccept,
  onDecline,
  isAccepting = false,
}: TrackingConsentProps) {
  return (
    <Card className="max-w-md mx-auto border-amber-200 bg-amber-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-800">
          <Shield className="h-5 w-5" />
          Consenso al tracciamento GPS
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 text-sm text-amber-700">
          <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Questa app vuole accedere alla tua posizione GPS <strong>in modo continuo</strong>{" "}
            durante l'orario di lavoro per registrare i tuoi percorsi e inviarli all'azienda.
          </p>
        </div>

        <div className="rounded-md bg-white border border-amber-200 p-3 space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground flex items-center gap-1">
            <Info className="h-3.5 w-3.5" /> Informativa trattamento dati (v{GPS_CONSENT_VERSION})
          </p>
          <ul className="space-y-1 list-disc list-inside">
            <li>I dati GPS sono trattati dal tuo datore di lavoro ai sensi dell'art. 6 GDPR.</li>
            <li>Le posizioni vengono conservate per <strong>30 giorni</strong> e poi cancellate automaticamente.</li>
            <li>Il tracciamento avviene solo durante l'uso attivo dell'app.</li>
            <li>Puoi revocare il consenso in qualsiasi momento dalle impostazioni.</li>
          </ul>
        </div>

        <div className="flex gap-2">
          {onDecline && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={onDecline}
              disabled={isAccepting}
            >
              Rifiuta
            </Button>
          )}
          <Button
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={onAccept}
            disabled={isAccepting}
          >
            {isAccepting ? "..." : "Acconsento"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

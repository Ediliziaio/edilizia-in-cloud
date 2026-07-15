/**
 * OffertaGrazie — atterraggio dopo il pagamento Stripe (success_url).
 * L'attivazione dell'azienda avviene via webhook Stripe (asincrona), quindi
 * qui mostriamo conferma + invito ad accedere.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import logoEic from "@/assets/edilizia-in-cloud-logo-small.webp";

export default function OffertaGrazie() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-muted/40 to-background p-6">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-eic-orange to-eic-orange-soft" />
        <img src={logoEic} alt="Edilizia in Cloud" width={150} height={38} className="h-8 w-auto mx-auto mb-6" />
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Pagamento ricevuto 🎉</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Grazie! Stiamo attivando il tuo account Edilizia in Cloud. Riceverai la conferma via email
          entro pochi istanti. Puoi già accedere con l'email e la password che hai scelto.
        </p>
        <Button asChild className="mt-6 w-full h-11 text-base bg-eic-orange hover:bg-eic-orange/90 text-white">
          <Link to="/login">Accedi al tuo gestionale</Link>
        </Button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Se l'accesso mostra "attiva il pagamento", attendi un minuto e ricarica: l'attivazione è in corso.
        </p>
      </div>
    </div>
  );
}

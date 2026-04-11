/**
 * CampoImpostazioni — Pagina impostazioni per operai e subappaltatori.
 * Riutilizza il componente MioProfilo (profilo, sicurezza, calendari, notifiche).
 */
import MioProfilo from "@/pages/azienda/impostazioni/MioProfilo";

export default function CampoImpostazioni() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Impostazioni</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gestisci il tuo profilo, sicurezza, calendari e notifiche
        </p>
      </div>
      <MioProfilo />
    </div>
  );
}

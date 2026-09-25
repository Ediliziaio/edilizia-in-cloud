import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Al posto di una pagina delle impostazioni che il piano dell'azienda non
 * comprende (21/09/2026). Il menu non la mostra più; chi ci arriva da un
 * vecchio link o scrivendo l'indirizzo trova il motivo e, se è
 * l'amministratore, dove cambiare piano.
 */
export function NonNelPiano({
  titolo,
  serve,
  puoCambiarePiano,
}: {
  /** Il nome della pagina, come nel menu. */
  titolo: string;
  /** I moduli che la aprirebbero, a parole («Commesse o Magazzino»). */
  serve: string;
  /** Solo l'amministratore vede i piani (e non dall'app iOS). */
  puoCambiarePiano: boolean;
}) {
  const piuDiUno = serve.includes(" o ");
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center shadow-sm" role="status">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold">Non incluso nel tuo piano</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {piuDiUno
          ? `«${titolo}» serve con ${serve}: il piano della tua azienda non ne comprende nessuno.`
          : `«${titolo}» fa parte di ${serve || "un modulo"}, che il piano della tua azienda non comprende.`}
      </p>
      {puoCambiarePiano ? (
        <>
          {/* Dal telefono il piano non si cambia (regola dell'utente, 25/09/2026). */}
          <Button asChild className="mt-4 max-md:hidden">
            <Link to="/azienda/impostazioni/abbonamento">Vedi i piani</Link>
          </Button>
          <p className="mt-3 text-xs text-muted-foreground md:hidden">Il piano si cambia dal computer.</p>
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Per attivarlo chiedi all&apos;amministratore dell&apos;azienda.</p>
      )}
    </div>
  );
}

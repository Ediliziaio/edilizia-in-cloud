/**
 * CalendarOAuthCallbackPage — pagina di atterraggio dopo Google Calendar OAuth.
 *
 * Aperta in popup dalla settings tab Google Calendar. La edge function
 * `google-calendar-auth` finisce il token exchange e redirige qui con
 * `?status=success|error&provider=google_calendar`.
 *
 * Compiti:
 *  1. Leggi status + error dalla query
 *  2. window.opener.postMessage({ type: "GOOGLE_OAUTH_RESULT", ... })
 *     su TUTTI gli origin consentiti (siamo dentro popup, l'origin parent
 *     può essere diverso se siamo in preview)
 *  3. window.close() automatico dopo 800ms
 *  4. UI minimale + bottone fallback "Chiudi" se window.close non funziona
 *
 * Non sostituisce il polling del parent: se postMessage fallisce o il popup
 * è chiuso prima, il parent ricarica comunque via invalidate query.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const TRUSTED_ORIGINS = [
  "https://app.ediliziaincloud.com",
  "https://www.app.ediliziaincloud.com",
];

function postResultToOpener(status: "success" | "error", error: string | null) {
  if (!window.opener) return;
  const msg = { type: "GOOGLE_OAUTH_RESULT", status, error };
  const origins = [...TRUSTED_ORIGINS, window.location.origin];
  for (const origin of origins) {
    try {
      window.opener.postMessage(msg, origin);
    } catch {
      // origin non valido, ignora
    }
  }
}

export default function CalendarOAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status") === "success" ? "success" : "error";
  const error = searchParams.get("error");
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    postResultToOpener(status as "success" | "error", error);
    // Chiudo dopo 800ms così l'utente vede brevemente l'esito.
    const handle = setTimeout(() => {
      setClosing(true);
      try { window.close(); } catch { /* fallthrough */ }
    }, 800);
    return () => clearTimeout(handle);
  }, [status, error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-orange-50 p-6">
      <div className="w-full max-w-md rounded-3xl border border-blue-100 bg-white p-8 text-center shadow-xl">
        {status === "success" ? (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Google Calendar collegato</h1>
            <p className="mt-2 text-sm text-slate-600">
              Tutto fatto. Puoi chiudere questa finestra — l'app si aggiorna da sola.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
              <XCircle className="h-7 w-7 text-rose-600" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Collegamento non riuscito</h1>
            <p className="mt-2 text-sm text-slate-600">
              {error
                ? `Errore: ${error}`
                : "Si è verificato un problema con il collegamento. Riprova dalle impostazioni."}
            </p>
          </>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
          {closing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Chiudo la finestra…
            </>
          ) : (
            <>Chiusura automatica in corso…</>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 rounded-xl"
          onClick={() => {
            try { window.close(); } catch { /* ignore */ }
            // Fallback: se window.close non funziona (window non aperta via window.open)
            // facciamo redirect alle impostazioni.
            window.location.href = "/azienda/impostazioni/mio-profilo?tab=calendari";
          }}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Chiudi finestra
        </Button>
      </div>
    </div>
  );
}

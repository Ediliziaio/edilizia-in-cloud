/**
 * GoogleAdsOAuthCallbackPage — pagina di atterraggio dopo Google Ads OAuth.
 *
 * 2026-05-27: identico pattern a CalendarOAuthCallbackPage e
 * GbpOAuthCallbackPage. Necessario perché il gateway Supabase forza
 * Content-Type:text/plain + CSP:sandbox su edge function con verify_jwt=false
 * → script inline bloccato → postMessage mai eseguito → parent bloccato in
 * "Connessione in corso..." (segnalazione utente 2026-05-27).
 *
 * Flow:
 *   1. Edge function google-ads-oauth?action=callback fa 302 redirect a:
 *      https://app.ediliziaincloud.com/azienda/impostazioni/integrazioni/google-ads-callback?status=ok|error&message=...
 *   2. Questa pagina riceve i query param, fa postMessage al parent (window.opener)
 *      su multiple trusted origins, poi window.close().
 *   3. Il parent (GoogleAdsConnectionCard) riceve il messaggio e invalida la query.
 *
 * Il payload deve matchare il listener: { source: "google-ads-oauth", status, message }.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const TRUSTED_ORIGINS = [
  "https://app.ediliziaincloud.com",
  "https://www.app.ediliziaincloud.com",
];

function postResultToOpener(status: "ok" | "error", message: string | null) {
  if (!window.opener) return;
  const payload = { source: "google-ads-oauth", status, message };
  const origins = [...TRUSTED_ORIGINS, window.location.origin];
  for (const origin of origins) {
    try {
      window.opener.postMessage(payload, origin);
    } catch {
      // origin non valido, ignora
    }
  }
}

export default function GoogleAdsOAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const status: "ok" | "error" = searchParams.get("status") === "ok" ? "ok" : "error";
  const message = searchParams.get("message");
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    postResultToOpener(status, message);
    const handle = setTimeout(() => {
      setClosing(true);
      try { window.close(); } catch { /* fallthrough */ }
    }, 800);
    return () => clearTimeout(handle);
  }, [status, message]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-orange-50 p-6">
      <div className="w-full max-w-md rounded-3xl border border-blue-100 bg-white p-8 text-center shadow-xl">
        {status === "ok" ? (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Google Ads collegato</h1>
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
              {message
                ? `Errore: ${message}`
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
            window.location.href = "/azienda/impostazioni/integrazioni";
          }}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Chiudi finestra
        </Button>
      </div>
    </div>
  );
}

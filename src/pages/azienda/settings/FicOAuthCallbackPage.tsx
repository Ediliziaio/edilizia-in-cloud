/**
 * FicOAuthCallbackPage — atterraggio dopo l'OAuth di Fatture in Cloud.
 *
 * Fatture in Cloud reindirizza qui (FIC_REDIRECT_URI deve puntare a
 * .../azienda/impostazioni/integrazioni/fic-callback) con ?code=<authorization_code>.
 * Questa pagina è dentro l'app (stessa origin → ha la sessione Supabase): scambia
 * il code con il token chiamando billing-connect action 'fic_oauth_callback'
 * (server-side), poi avvisa l'opener via postMessage e si chiude.
 *
 * Payload all'opener: { source: "fic-oauth", status: "ok"|"error", message, companyName }.
 * Stesso pattern di GbpOAuthCallbackPage, ma qui lo scambio code→token avviene
 * lato pagina perché FIC torna con ?code (non con uno status già risolto).
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const TRUSTED_ORIGINS = [
  "https://app.ediliziaincloud.com",
  "https://www.app.ediliziaincloud.com",
];

function postResultToOpener(status: "ok" | "error", message: string | null, companyName?: string | null) {
  if (!window.opener) return;
  const payload = { source: "fic-oauth", status, message, companyName: companyName ?? null };
  const origins = [...TRUSTED_ORIGINS, window.location.origin];
  for (const origin of origins) {
    try {
      window.opener.postMessage(payload, origin);
    } catch {
      // origin non valido, ignora
    }
  }
}

export default function FicOAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<"exchanging" | "ok" | "error">("exchanging");
  const [message, setMessage] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // evita doppia esecuzione (StrictMode)
    ran.current = true;

    const code = searchParams.get("code");
    const oauthError = searchParams.get("error_description") || searchParams.get("error");
    // company_id è codificato nello `state` generato da get_fic_auth_url ({company_id, ts}).
    let companyIdFromState: string | null = null;
    try {
      const stateRaw = searchParams.get("state");
      if (stateRaw) companyIdFromState = (JSON.parse(atob(stateRaw)) as { company_id?: string })?.company_id ?? null;
    } catch { /* state non decodificabile: la function userà l'azienda effettiva */ }

    (async () => {
      if (oauthError || !code) {
        const msg = oauthError || "Codice di autorizzazione mancante";
        setMessage(msg);
        setPhase("error");
        postResultToOpener("error", msg);
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("billing-connect", {
          body: { action: "fic_oauth_callback", code, company_id: companyIdFromState },
        });
        const errBody = data as { error?: string; company_name?: string } | null;
        if (error || errBody?.error) {
          const msg = errBody?.error || error?.message || "Scambio token non riuscito";
          setMessage(msg);
          setPhase("error");
          postResultToOpener("error", msg);
          return;
        }
        setPhase("ok");
        setMessage(errBody?.company_name ?? null);
        postResultToOpener("ok", null, errBody?.company_name ?? null);
      } catch (e) {
        const msg = (e as Error).message || "Errore imprevisto durante il collegamento";
        setMessage(msg);
        setPhase("error");
        postResultToOpener("error", msg);
      }
    })();
  }, [searchParams]);

  // Chiusura automatica dopo l'esito.
  useEffect(() => {
    if (phase === "exchanging") return;
    const t = setTimeout(() => {
      try { window.close(); } catch { /* fallthrough */ }
    }, phase === "ok" ? 1200 : 3000);
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-6">
      <div className="w-full max-w-md rounded-3xl border border-blue-100 bg-white p-8 text-center shadow-xl">
        {phase === "exchanging" && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Collegamento a Fatture in Cloud…</h1>
            <p className="mt-2 text-sm text-slate-600">Sto completando l'autorizzazione, un istante.</p>
          </>
        )}

        {phase === "ok" && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Fatture in Cloud collegato</h1>
            <p className="mt-2 text-sm text-slate-600">
              {message ? `Account: ${message}. ` : ""}Puoi chiudere questa finestra — l'app si aggiorna da sola.
            </p>
          </>
        )}

        {phase === "error" && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
              <XCircle className="h-7 w-7 text-rose-600" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Collegamento non riuscito</h1>
            <p className="mt-2 text-sm text-slate-600">
              {message ? `Errore: ${message}` : "Si è verificato un problema. Riprova dalle impostazioni."}
            </p>
          </>
        )}

        {phase !== "exchanging" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-6 rounded-xl"
            onClick={() => {
              try { window.close(); } catch { /* ignore */ }
              window.location.href = "/azienda/impostazioni/integrazioni";
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Chiudi finestra
          </Button>
        )}
      </div>
    </div>
  );
}

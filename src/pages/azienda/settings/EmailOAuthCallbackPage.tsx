/**
 * EmailOAuthCallbackPage — GAP 7b
 *
 * Riceve il redirect OAuth (Google/Microsoft) con `code` + `state` nella URL,
 * chiama email-oauth-callback per scambiare i tokens, mostra esito e
 * redirige alla pagina da cui l'utente ha avviato la connessione.
 *
 * Mounted on /azienda/impostazioni/integrazioni/email-callback
 */
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// Niente parole tecniche per chi collega la casella (founder, 25/09/2026: un
// cliente ha pensato che Gmail non funzionasse per un avviso tecnico). Il
// dettaglio resta visibile solo al super admin, sotto il messaggio.
const RIPROVA = "Riprova tra qualche minuto; se succede ancora, scrivici e lo sistemiamo noi.";

export default function EmailOAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState<string>("Sto completando la connessione…");
  const [emailAddress, setEmailAddress] = useState<string | null>(null);
  const [dettaglio, setDettaglio] = useState<string | null>(null);
  const { userRoles } = useAuth();
  const isSuperAdmin = userRoles?.includes("super_admin") ?? false;

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const errorParam = params.get("error");

    if (errorParam) {
      setStatus("error");
      setMessage(errorParam === "access_denied"
        ? "Hai annullato l'accesso, quindi la casella non è stata collegata. Puoi riprovare quando vuoi."
        : `Non abbiamo ricevuto il permesso di collegare la casella. ${RIPROVA}`);
      setDettaglio(`errore dal provider: ${errorParam}`);
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setMessage("Il collegamento non si è completato. Torna al tuo profilo e riprova.");
      setDettaglio("parametri code/state mancanti nel ritorno");
      return;
    }

    // CSRF check: state deve matchare quello salvato in sessionStorage
    const expectedState = sessionStorage.getItem("oauth_state");
    if (expectedState && expectedState !== state) {
      setStatus("error");
      setMessage("Il collegamento è scaduto o è stato aperto in un'altra finestra. Torna al tuo profilo e riprova da lì.");
      setDettaglio("state diverso da quello salvato all'avvio");
      return;
    }

    // Il redirect_uri dello scambio token DEVE essere identico a quello usato
    // all'avvio, e l'avvio ne usa due: /azienda/... per le aziende e /admin/...
    // per la piattaforma. Questa pagina E' quell'indirizzo: basta leggerlo da
    // se' stessa. Il valore fisso su /azienda/ faceva fallire ogni collegamento
    // partito dall'area admin con "redirect_uri mismatch".
    const redirectUri = `${window.location.origin}${window.location.pathname}`;

    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<{
          success: boolean;
          connection_id?: string;
          email_address?: string;
          provider?: string;
          error?: string;
        }>("email-oauth-callback", {
          body: { code, state, redirect_uri: redirectUri },
        });

        if (error) throw new Error(error.message);
        if (!data?.success) throw new Error(data?.error ?? "callback_failed");

        sessionStorage.removeItem("oauth_state");
        sessionStorage.removeItem("oauth_provider");
        // Fallback return_to context-aware: se la callback è in /admin/* torna in admin
        const isAdminCallback = window.location.pathname.startsWith("/admin/");
        const fallbackReturn = isAdminCallback ? "/admin/email" : "/azienda/email";
        const returnTo = sessionStorage.getItem("email_oauth_return_to") || fallbackReturn;
        sessionStorage.removeItem("email_oauth_return_to");
        setStatus("success");
        setEmailAddress(data.email_address ?? null);
        setMessage(`${data.email_address} collegato. Puoi tornare alla tua area email.`);

        // Redirect automatico dopo 3s
        setTimeout(() => {
          navigate(returnTo);
        }, 3000);
      } catch (e) {
        setStatus("error");
        setMessage(`Non siamo riusciti a completare il collegamento. ${RIPROVA}`);
        setDettaglio(e instanceof Error ? e.message : String(e));
        console.error("[email-oauth-callback]", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          {status === "processing" && (
            <>
              <Loader2 className="h-12 w-12 mx-auto animate-spin text-violet-600" />
              <h2 className="text-lg font-semibold">Sto completando la connessione…</h2>
              <p className="text-sm text-muted-foreground">{message}</p>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-600" />
              <h2 className="text-lg font-semibold">Account collegato</h2>
              <p className="text-sm text-muted-foreground">
                <strong>{emailAddress}</strong> è ora collegato.
              </p>
              <p className="text-xs text-muted-foreground">
                Entro 10 minuti le tue email compaiono nell'area email. Ti riportiamo lì tra un attimo…
              </p>
              <Button onClick={() => navigate(sessionStorage.getItem("email_oauth_return_to") || (window.location.pathname.startsWith("/admin/") ? "/admin/email" : "/azienda/email"))} className="mt-2">
                Torna alle email
              </Button>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="h-12 w-12 mx-auto text-rose-600" />
              <h2 className="text-lg font-semibold">Casella non collegata</h2>
              <p className="text-sm text-muted-foreground">{message}</p>
              {isSuperAdmin && dettaglio && (
                <p className="text-xs text-muted-foreground/80">Dettaglio (lo vedi solo tu): {dettaglio}</p>
              )}
              <Button onClick={() => navigate(sessionStorage.getItem("email_oauth_return_to") || (window.location.pathname.startsWith("/admin/") ? "/admin/email" : "/azienda/email"))} variant="outline">
                Torna alle email
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

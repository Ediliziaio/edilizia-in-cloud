/**
 * EmailOAuthCallbackPage — GAP 7b
 *
 * Riceve il redirect OAuth (Google/Microsoft) con `code` + `state` nella URL,
 * chiama email-oauth-callback per scambiare i tokens, mostra esito e
 * redirige a /azienda/impostazioni/integrazioni.
 *
 * Mounted on /azienda/impostazioni/integrazioni/email-callback
 */
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

export default function EmailOAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState<string>("Sto completando la connessione…");
  const [emailAddress, setEmailAddress] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const errorParam = params.get("error");

    if (errorParam) {
      setStatus("error");
      setMessage(`Provider ha rifiutato: ${errorParam}`);
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setMessage("Parametri OAuth mancanti nella callback.");
      return;
    }

    // CSRF check: state deve matchare quello salvato in sessionStorage
    const expectedState = sessionStorage.getItem("oauth_state");
    if (expectedState && expectedState !== state) {
      setStatus("error");
      setMessage("State CSRF mismatch — possibile attacco. Riprova.");
      return;
    }

    const redirectUri = `${window.location.origin}/azienda/impostazioni/integrazioni/email-callback`;

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
        setStatus("success");
        setEmailAddress(data.email_address ?? null);
        setMessage(`${data.email_address} collegato. Puoi tornare alla pagina integrazioni.`);

        // Redirect automatico dopo 3s
        setTimeout(() => {
          navigate("/azienda/impostazioni/integrazioni");
        }, 3000);
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Errore sconosciuto");
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
                L'AI inizierà a triagiare le email entro 10 minuti. Verrai rediretto…
              </p>
              <Button onClick={() => navigate("/azienda/impostazioni/integrazioni")} className="mt-2">
                Torna alle integrazioni
              </Button>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="h-12 w-12 mx-auto text-rose-600" />
              <h2 className="text-lg font-semibold">Connessione fallita</h2>
              <p className="text-sm text-muted-foreground">{message}</p>
              <Button onClick={() => navigate("/azienda/impostazioni/integrazioni")} variant="outline">
                Torna alle integrazioni
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

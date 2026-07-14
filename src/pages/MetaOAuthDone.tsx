/**
 * Pagina di atterraggio del popup OAuth Meta.
 *
 * Il callback edge (meta-oauth-callback) NON può servire HTML eseguibile:
 * la piattaforma Supabase riscrive le risposte HTML sul dominio condiviso
 * *.supabase.co (text/plain + CSP sandbox). Quindi il callback fa un 302 qui,
 * sulla STESSA origin dell'app: questa pagina consegna il risultato
 * all'opener (OAuthStep ascolta META_OAUTH_RESULT) e chiude il popup.
 *
 * I parametri viaggiano nell'HASH (#status=...&detail=...) così non finiscono
 * in log/referrer.
 */
import { useEffect, useMemo } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

function parseHash(): { status: "success" | "error"; detail: string } {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return {
    status: params.get("status") === "success" ? "success" : "error",
    detail: params.get("detail") ?? "",
  };
}

export default function MetaOAuthDone() {
  const result = useMemo(parseHash, []);

  useEffect(() => {
    if (window.opener) {
      try {
        window.opener.postMessage(
          { type: "META_OAUTH_RESULT", status: result.status, detail: result.detail },
          window.location.origin,
        );
      } catch {
        // opener non raggiungibile: resta visibile il messaggio sotto
      }
      window.close();
    }
  }, [result]);

  const ok = result.status === "success";
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        {ok ? (
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
        ) : (
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
        )}
        <h1 className="text-lg font-semibold">
          {ok ? "Account Meta collegato" : "Collegamento non riuscito"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ok
            ? "Puoi chiudere questa finestra e tornare a Edilizia in Cloud per scegliere le pagine da collegare."
            : `Qualcosa è andato storto${result.detail ? ` (${result.detail})` : ""}. Chiudi questa finestra e riprova dal pannello Integrazioni.`}
        </p>
      </div>
    </div>
  );
}

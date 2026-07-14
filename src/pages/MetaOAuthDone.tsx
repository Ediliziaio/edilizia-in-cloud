/**
 * Pagina di atterraggio dei popup OAuth (Meta, Outlook, …).
 *
 * I callback edge NON possono servire HTML eseguibile: la piattaforma
 * Supabase riscrive le risposte HTML sul dominio condiviso *.supabase.co
 * (text/plain + CSP sandbox) — il popup mostrava il SORGENTE della pagina,
 * con dentro URL interni. Quindi i callback fanno un 302 qui, sulla STESSA
 * origin dell'app: questa pagina consegna il risultato all'opener e chiude
 * il popup. L'utente non vede mai codice né dettagli tecnici.
 *
 * I parametri viaggiano nell'HASH (#kind=...&status=...&detail=...) così non
 * finiscono in log/referrer. `kind` seleziona la forma del messaggio:
 *   - meta (default) → { type: "META_OAUTH_RESULT", status, detail }
 *   - outlook        → { source: "outlook-calendar-oauth", status, message }
 */
import { useEffect, useMemo } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

// Codici errore noti → messaggio cortese. Tutto il resto (incluso
// "internal_error") cade sul generico: mai stringhe tecniche a schermo.
const ERROR_LABELS: Record<string, string> = {
  access_denied: "Hai annullato l'autorizzazione. Puoi riprovare quando vuoi.",
  missing_params: "Risposta incompleta dal provider. Riprova il collegamento.",
  invalid_state: "Sessione di collegamento non valida. Riprova dal pannello Integrazioni.",
  invalid_state_signature: "Sessione di collegamento non valida. Riprova dal pannello Integrazioni.",
  invalid_state_company: "Sessione di collegamento non valida per questa azienda.",
  state_expired: "Il collegamento è scaduto (più di 10 minuti). Riprova.",
  token_exchange_failed: "Il provider non ha confermato l'autorizzazione. Riprova.",
  db_error: "Errore temporaneo nel salvataggio. Riprova tra qualche istante.",
  credentials_storage_failed: "Errore temporaneo nel salvataggio. Riprova tra qualche istante.",
};

type PopupResult = {
  kind: "meta" | "outlook";
  status: "success" | "error";
  detail: string;
};

function parseHash(): PopupResult {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const rawStatus = params.get("status");
  return {
    kind: params.get("kind") === "outlook" ? "outlook" : "meta",
    // Outlook usa "ok", Meta usa "success": normalizziamo qui.
    status: rawStatus === "success" || rawStatus === "ok" ? "success" : "error",
    detail: params.get("detail") ?? params.get("message") ?? "",
  };
}

function buildOpenerMessage(r: PopupResult): Record<string, unknown> {
  if (r.kind === "outlook") {
    return {
      source: "outlook-calendar-oauth",
      status: r.status === "success" ? "ok" : "error",
      message: r.detail || null,
    };
  }
  return { type: "META_OAUTH_RESULT", status: r.status, detail: r.detail };
}

export default function MetaOAuthDone() {
  const result = useMemo(parseHash, []);

  useEffect(() => {
    if (window.opener) {
      try {
        window.opener.postMessage(buildOpenerMessage(result), window.location.origin);
      } catch {
        // opener non raggiungibile: resta visibile il messaggio sotto
      }
      window.close();
    }
  }, [result]);

  const ok = result.status === "success";
  const errorLabel =
    ERROR_LABELS[result.detail] ??
    "Qualcosa è andato storto. Chiudi questa finestra e riprova dal pannello Integrazioni.";
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        {ok ? (
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
        ) : (
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
        )}
        <h1 className="text-lg font-semibold">
          {ok ? "Account collegato" : "Collegamento non riuscito"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ok
            ? "Puoi chiudere questa finestra e tornare a Edilizia in Cloud."
            : errorLabel}
        </p>
      </div>
    </div>
  );
}

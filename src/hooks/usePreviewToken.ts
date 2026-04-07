/**
 * usePreviewToken — rilevamento modalità SuperAdmin-preview nei portali separati.
 * Usato da CustomerLayout e CampoLayout per:
 * 1. Mostrare il banner di preview
 * 2. Caricare i dati del targetUserId invece dell'utente loggato
 * 3. Disabilitare le azioni di scrittura
 *
 * Sicurezza: il token viene rimosso dall'URL subito dopo la lettura e invalidato
 * server-side (monouso). La sessione preview non sopravvive a un refresh.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PreviewSession {
  isPreview: boolean;
  isValidating: boolean;
  targetUserId: string | null;
  targetRole: string | null;
  companyId: string | null;
  error: string | null;
}

const INITIAL_STATE: PreviewSession = {
  isPreview: false,
  isValidating: false,
  targetUserId: null,
  targetRole: null,
  companyId: null,
  error: null,
};

export function usePreviewToken(): PreviewSession {
  const [session, setSession] = useState<PreviewSession>(INITIAL_STATE);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("preview_token");

    if (!token) return;

    // Rimuovi il token dall'URL immediatamente (sicurezza: non rimane nella history)
    const url = new URL(window.location.href);
    url.searchParams.delete("preview_token");
    window.history.replaceState(null, "", url.toString());

    // Inizia validazione
    setSession((prev) => ({ ...prev, isValidating: true }));

    supabase.functions
      .invoke("validate-preview-token", { body: { token } })
      .then(({ data, error }) => {
        if (error) {
          setSession({
            isPreview: false,
            isValidating: false,
            targetUserId: null,
            targetRole: null,
            companyId: null,
            error: "Errore di validazione token",
          });
          return;
        }

        const result = data as {
          valid: boolean;
          targetUserId?: string;
          targetRole?: string;
          companyId?: string;
          reason?: string;
        };

        if (!result?.valid) {
          setSession({
            isPreview: false,
            isValidating: false,
            targetUserId: null,
            targetRole: null,
            companyId: null,
            error: result?.reason ?? "Token non valido o scaduto",
          });
          return;
        }

        setSession({
          isPreview: true,
          isValidating: false,
          targetUserId: result.targetUserId ?? null,
          targetRole: result.targetRole ?? null,
          companyId: result.companyId ?? null,
          error: null,
        });
      })
      .catch(() => {
        setSession({
          isPreview: false,
          isValidating: false,
          targetUserId: null,
          targetRole: null,
          companyId: null,
          error: "Impossibile contattare il server",
        });
      });
  }, []); // Eseguito solo al mount — il token è monouso

  return session;
}

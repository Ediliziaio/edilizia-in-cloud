/**
 * SSOButtons — v8.6.92
 *
 * Bottoni login social via Supabase OAuth providers (Google, Microsoft).
 * Mostrati sotto il form email/password con divider "oppure".
 *
 * Configurazione: i provider devono essere abilitati su Supabase Dashboard
 *   Authentication → Providers → Google / Azure (Microsoft).
 *
 * Se nessun provider è abilitato lato Supabase, i bottoni si mostrano
 * comunque ma il click produce un errore controllato (gestito da onError).
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface Props {
  disabled?: boolean;
  onError?: (msg: string) => void;
}

export function SSOButtons({ disabled = false, onError }: Props) {
  // 2026-05-27: rimosso login Microsoft per scelta prodotto — la quota di
  // imprese edili italiane con Microsoft 365 personale è marginale, complica UX
  // senza beneficio. L'account Microsoft resta usabile per la sincronizzazione
  // Outlook Calendar (separata, in Settings → Calendari → Collegamenti).
  const [pending, setPending] = useState<boolean>(false);

  const handleGoogleOAuth = async () => {
    if (disabled || pending) return;
    setPending(true);
    try {
      // v8.6.93 — redirect alla root; AuthProvider monta la sessione e ridirige
      // l'utente alla sua dashboard appropriata (no route /auth/callback dedicata).
      const redirectTo = `${window.location.origin}/`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          // Forza la selezione account ad ogni login (no SSO silent)
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        const msg = error.message.includes("provider is not enabled")
          ? "Login Google non ancora configurato. Contatta il supporto."
          : `Errore SSO: ${error.message}`;
        onError?.(msg);
        setPending(false);
      }
      // Se non c'è errore, l'utente viene rediretto al provider OAuth
    } catch (e) {
      onError?.((e as Error).message);
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-2 text-muted-foreground">oppure continua con</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={disabled || pending}
        onClick={handleGoogleOAuth}
        className="w-full h-10"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GoogleIcon className="h-4 w-4 mr-2" />
        )}
        Accedi con Google
      </Button>
    </div>
  );
}

// ── SVG icons (inline, no extra deps) ──────────────────────────────────────
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// MicrosoftIcon rimossa con il login Microsoft (2026-05-27).
// Se serve riattivare in futuro, recuperala dalla cronologia git.

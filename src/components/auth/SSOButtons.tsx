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
  const [pending, setPending] = useState<"google" | "azure" | null>(null);

  const handleOAuth = async (provider: "google" | "azure") => {
    if (disabled || pending) return;
    setPending(provider);
    try {
      // v8.6.93 — redirect alla root; AuthProvider monta la sessione e ridirige
      // l'utente alla sua dashboard appropriata (no route /auth/callback dedicata).
      const redirectTo = `${window.location.origin}/`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          // Forza la selezione account ad ogni login (no SSO silent)
          queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
        },
      });
      if (error) {
        const msg =
          error.message.includes("provider is not enabled")
            ? `Login ${provider === "google" ? "Google" : "Microsoft"} non ancora configurato. Contatta il supporto.`
            : `Errore SSO: ${error.message}`;
        onError?.(msg);
        setPending(null);
      }
      // Se non c'è errore, l'utente viene rediretto al provider OAuth
    } catch (e) {
      onError?.((e as Error).message);
      setPending(null);
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

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || pending !== null}
          onClick={() => handleOAuth("google")}
          className="h-10"
        >
          {pending === "google" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon className="h-4 w-4 mr-2" />
          )}
          Google
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || pending !== null}
          onClick={() => handleOAuth("azure")}
          className="h-10"
        >
          {pending === "azure" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MicrosoftIcon className="h-4 w-4 mr-2" />
          )}
          Microsoft
        </Button>
      </div>
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

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.4 11.4H1V1h10.4v10.4z" fill="#F25022" />
      <path d="M23 11.4H12.6V1H23v10.4z" fill="#7FBA00" />
      <path d="M11.4 23H1V12.6h10.4V23z" fill="#00A4EF" />
      <path d="M23 23H12.6V12.6H23V23z" fill="#FFB900" />
    </svg>
  );
}

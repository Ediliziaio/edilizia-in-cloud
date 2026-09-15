// WhatsAppEmbeddedSignupButton — entry-point per il flusso Meta Embedded Signup.
//
// Riusa l'hook `useWhatsAppEmbeddedSignup` che gestisce:
// - Fetch config (meta_app_id + whatsapp_config_id) da platform_settings
// - Lazy-load Facebook JS SDK
// - FB.login con la configurazione «Iscrizione integrata di WhatsApp» (v4)
// - Scambio code via `whatsapp-connect` edge function (esistente)
//
// Pensato per essere mostrato come PRIMA opzione nel ConnectNumberWizard,
// con il flusso manuale (phone_number_id + token) come fallback per chi non
// usa l'app Meta verificata o vuole un controllo finer-grained.

import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import { useWhatsAppEmbeddedSignup, isEmbeddedSignupSupported } from "@/hooks/whatsapp/useWhatsAppEmbeddedSignup";
import type { WAPurpose } from "@/hooks/whatsapp/useWhatsAppNumbers";

interface Props {
  purpose: WAPurpose;
  displayName?: string;
  onSuccess?: () => void;
  disabled?: boolean;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function WhatsAppEmbeddedSignupButton({
  purpose,
  displayName,
  onSuccess,
  disabled,
  variant = "default",
  size = "default",
  className,
}: Props) {
  const { connect, phase } = useWhatsAppEmbeddedSignup();

  // Etichette dettagliate per ogni fase — l'utente capisce sempre dove siamo.
  const label =
    phase === "loading-sdk"
      ? "1/3 Caricamento Facebook SDK…"
      : phase === "popup"
        ? "2/3 Completa onboarding nel popup Meta…"
        : phase === "connecting"
          ? "3/3 Registrazione numero…"
          : "Collega con Meta (rapido)";

  const isBusy = connect.isPending || phase !== "idle";
  const errorMessage = connect.error instanceof Error ? connect.error.message : null;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={disabled || isBusy || !isEmbeddedSignupSupported}
        title={
          !isEmbeddedSignupSupported
            ? "Embedded Signup non disponibile su mobile — usa il flusso manuale"
            : undefined
        }
        onClick={() => {
          connect.reset();
          connect.mutate(
            { purpose, display_name: displayName },
            { onSuccess: () => onSuccess?.() },
          );
        }}
      >
        {isBusy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4" />
        )}
        {label}
      </Button>

      {/* Diagnostic visibile sotto il bottone quando si blocca in loading-sdk.
          Spiega esplicitamente cosa controllare se la barra resta appesa. */}
      {phase === "loading-sdk" && (
        <p className="text-xs text-muted-foreground text-center">
          Sto scaricando connect.facebook.net… se si blocca per più di 10s c'è
          un blocco di rete (ad-blocker, CSP, firewall aziendale).
        </p>
      )}

      {phase === "popup" && (
        <p className="text-xs text-muted-foreground text-center">
          Si è aperta una finestra popup di Meta — completa il login e la
          selezione del numero WhatsApp. Se non vedi popup, il browser l'ha
          bloccata: cerca l'icona "popup bloccato" nella barra indirizzi.
        </p>
      )}

      {/* Errore visibile inline (non solo toast effimero) */}
      {errorMessage && !isBusy && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Errore Embedded Signup</p>
            <p className="opacity-90 break-words">{errorMessage}</p>
            <p className="text-[10px] opacity-70">
              Apri la Console del browser (F12 → Console) per i log dettagliati
              prefissati con [wa-embedded].
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// WhatsAppEmbeddedSignupButton — entry-point per il flusso Meta Embedded Signup.
//
// Riusa l'hook `useWhatsAppEmbeddedSignup` che gestisce:
// - Fetch config (meta_app_id + whatsapp_config_id) da platform_settings
// - Lazy-load Facebook JS SDK
// - FB.login con feature 'whatsapp_embedded_signup'
// - Scambio code via `whatsapp-connect` edge function (esistente)
//
// Pensato per essere mostrato come PRIMA opzione nel ConnectNumberWizard,
// con il flusso manuale (phone_number_id + token) come fallback per chi non
// usa l'app Meta verificata o vuole un controllo finer-grained.

import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { useWhatsAppEmbeddedSignup } from "@/hooks/whatsapp/useWhatsAppEmbeddedSignup";
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

  const label =
    phase === "loading-sdk"
      ? "Caricamento Meta…"
      : phase === "popup"
        ? "Completa onboarding…"
        : phase === "connecting"
          ? "Registrazione numero…"
          : "Collega con Meta (rapido)";

  const isBusy = connect.isPending || phase !== "idle";

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || isBusy}
      onClick={() => {
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
  );
}

/**
 * SubscriptionBanner — v8.6.87
 *
 * Banner sticky in alto che notifica stati critici dell'abbonamento:
 *   - trial (con countdown + warning ultimi 3gg + expired)
 *   - past_due (pagamento fallito) → CTA aggiorna metodo via Stripe Portal
 *   - cancellation_pending (sub cancellata, attiva fino X) → CTA riattiva
 *   - suspended → CTA contatta supporto
 *   - expired → CTA rinnova
 *
 * Tutte le CTA portano a destinazioni concrete (no bottoni morti).
 */
import { useNavigate } from "react-router-dom";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useAuth } from "@/contexts/AuthContext";
import { useOpenBillingPortal } from "@/hooks/useBilling";
import { AlertTriangle, Clock, XCircle, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type BannerVariant = "info" | "warning" | "danger";

interface BannerConfig {
  variant: BannerVariant;
  icon: React.ReactNode;
  message: string;
  ctaLabel?: string;
  ctaAction?: "upgrade" | "portal" | "support" | "renew";
}

export function SubscriptionBanner() {
  const navigate = useNavigate();
  const { isImpersonating, effectiveCompany } = useAuth();
  const { companyStatus, trialDaysLeft, trialExpired } = useSubscriptionLimits({ includeUsageCounts: false });
  const openPortal = useOpenBillingPortal();

  if (isImpersonating) return null;
  if (!effectiveCompany) return null;
  if (companyStatus === "active" || companyStatus === "free") return null;

  const config = resolveBannerConfig(companyStatus, trialDaysLeft, trialExpired);
  if (!config) return null;

  const handleCta = () => {
    switch (config.ctaAction) {
      case "upgrade":
      case "renew":
        navigate("/azienda/impostazioni/abbonamento");
        break;
      case "portal":
        openPortal.mutate();
        break;
      case "support":
        navigate("/azienda/assistenza");
        break;
    }
  };

  const styles: Record<BannerVariant, { bg: string; text: string; btn: string }> = {
    info: {
      bg: "bg-blue-500/10 border-blue-500/30",
      text: "text-blue-700 dark:text-blue-400",
      btn: "bg-blue-600 hover:bg-blue-700 text-white border-blue-600",
    },
    warning: {
      bg: "bg-orange-500/10 border-orange-500/30",
      text: "text-orange-700 dark:text-orange-400",
      btn: "bg-orange-600 hover:bg-orange-700 text-white border-orange-600",
    },
    danger: {
      // Errore pagamento: barra ROSSA PIENA + testo bianco grassetto (massima evidenza, desktop+mobile).
      bg: "bg-destructive border-destructive",
      text: "text-destructive-foreground font-bold",
      btn: "bg-white hover:bg-white/90 text-destructive border-white",
    },
  };
  const s = styles[config.variant];

  return (
    <div className={`px-4 py-2.5 flex items-center justify-between gap-3 border-b flex-wrap ${s.bg}`}>
      <div className={`flex items-center gap-2 min-w-0 ${s.text}`}>
        {config.icon}
        <span className="text-sm font-semibold">{config.message}</span>
      </div>
      {config.ctaLabel && config.ctaAction && (
        <Button
          size="sm"
          onClick={handleCta}
          disabled={openPortal.isPending}
          className={`text-xs h-7 shrink-0 ${s.btn}`}
        >
          {openPortal.isPending && config.ctaAction === "portal" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : null}
          {config.ctaLabel}
        </Button>
      )}
    </div>
  );
}

function resolveBannerConfig(
  status: string,
  trialDaysLeft: number | null,
  trialExpired: boolean,
): BannerConfig | null {
  if (status === "trial") {
    if (trialExpired) {
      return {
        variant: "danger",
        icon: <XCircle className="h-4 w-4 shrink-0" />,
        message: "Il periodo di prova è scaduto. Attiva un piano per continuare.",
        ctaLabel: "Attiva piano",
        ctaAction: "upgrade",
      };
    }
    if (trialDaysLeft !== null && trialDaysLeft <= 3) {
      return {
        variant: "warning",
        icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
        message: `Il tuo periodo di prova scade tra ${trialDaysLeft} giorn${trialDaysLeft === 1 ? "o" : "i"}.`,
        ctaLabel: "Attiva piano",
        ctaAction: "upgrade",
      };
    }
    return {
      variant: "info",
      icon: <Clock className="h-4 w-4 shrink-0" />,
      message: `Stai usando il piano di prova. Rimangono ${trialDaysLeft ?? "?"} giorni.`,
      ctaLabel: "Scegli un piano",
      ctaAction: "upgrade",
    };
  }
  if (status === "past_due") {
    return {
      variant: "danger",
      icon: <CreditCard className="h-4 w-4 shrink-0" />,
      message: "Errore pagamento — pagamento non riuscito. Aggiorna il metodo entro 7 giorni per evitare la sospensione.",
      ctaLabel: "Aggiorna pagamento",
      ctaAction: "portal",
    };
  }
  if (status === "suspended") {
    return {
      variant: "danger",
      icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
      message: "Errore pagamento — abbonamento sospeso. Email, WhatsApp, AI, render e firma sono disattivati: rinnova per riattivarli.",
      ctaLabel: "Rinnova",
      ctaAction: "renew",
    };
  }
  if (status === "expired" || status === "canceled") {
    return {
      variant: "danger",
      icon: <XCircle className="h-4 w-4 shrink-0" />,
      message: "Errore pagamento — abbonamento scaduto. Rinnova per riattivare la piattaforma.",
      ctaLabel: "Rinnova",
      ctaAction: "renew",
    };
  }
  if (status === "cancellation_pending") {
    return {
      variant: "warning",
      icon: <Clock className="h-4 w-4 shrink-0" />,
      message: "Abbonamento in cancellazione. Continuerà ad essere attivo fino alla data di scadenza.",
      ctaLabel: "Riattiva",
      ctaAction: "portal",
    };
  }
  return null;
}

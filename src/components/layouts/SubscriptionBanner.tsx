/**
 * SubscriptionBanner — v8.6.87
 *
 * Banner sticky in alto che notifica stati critici dell'abbonamento:
 *   - trial (con countdown + warning ultimi 3gg + expired)
 *   - past_due (pagamento fallito) → CTA aggiorna metodo via Stripe Portal
 *   - cancellation_pending (sub cancellata, attiva fino X) → CTA riattiva
 *   - suspended → CTA contatta supporto
 *   - expired → CTA rinnova
 *   - dati di fatturazione mancanti → CTA compila l'anagrafica (23/09/2026)
 *
 * Tutte le CTA portano a destinazioni concrete (no bottoni morti).
 */
import { useNavigate } from "react-router-dom";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useAuth } from "@/contexts/AuthContext";
import { useOpenBillingPortal } from "@/hooks/useBilling";
import { useBillingActivationGate } from "@/hooks/useBillingActivationGate";
import { useState } from "react";
import { AlertTriangle, Clock, XCircle, CreditCard, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

type BannerVariant = "info" | "warning" | "danger";

interface BannerConfig {
  variant: BannerVariant;
  icon: React.ReactNode;
  message: string;
  /** Su mobile l'avviso e' un popup: serve un titolo corto e il resto sotto. */
  titolo: string;
  dettaglio: string;
  ctaLabel?: string;
  ctaAction?: "upgrade" | "portal" | "support" | "renew" | "dati";
}

/**
 * Anagrafica incompleta: la fattura dell'abbonamento non si può emettere. Prima
 * questo mancante chiudeva fuori tutta l'azienda (vedi useBillingActivationGate);
 * ora è un avviso, e lo vede solo chi può compilarla.
 */
const BANNER_DATI_FATTURAZIONE: BannerConfig = {
  variant: "warning",
  icon: <Building2 className="h-4 w-4 shrink-0" />,
  message: "Mancano i dati di fatturazione dell'azienda (ragione sociale, P.IVA, sede legale): servono per la fattura.",
  titolo: "Mancano i dati di fatturazione",
  dettaglio: "Ragione sociale, partita IVA e sede legale servono per emettere la fattura dell'abbonamento.",
  ctaLabel: "Completa",
  ctaAction: "dati",
};

export function SubscriptionBanner() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { isImpersonating, effectiveCompany } = useAuth();
  const { companyStatus, trialDaysLeft, trialExpired } = useSubscriptionLimits({ includeUsageCounts: false });
  const { needsBillingData, canManage } = useBillingActivationGate();
  const openPortal = useOpenBillingPortal();

  if (isImpersonating) return null;
  if (!effectiveCompany) return null;

  // Lo stato dell'abbonamento viene prima: un pagamento fallito conta più
  // dell'anagrafica da completare.
  const config =
    resolveBannerConfig(companyStatus, trialDaysLeft, trialExpired) ??
    (needsBillingData && canManage ? BANNER_DATI_FATTURAZIONE : null);
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
      case "dati":
        navigate("/azienda/impostazioni/profilo");
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

  // Su mobile niente fascia fissa: si prendeva 137 px su 812 in OGNI pagina,
  // cioe' un sesto dello schermo, prima ancora del contenuto. Diventa un
  // popup che sale dal basso una volta per sessione. Lo stato puramente
  // informativo (prova in corso con giorni davanti) su mobile non si mostra
  // affatto: e' consultabile in Impostazioni → Abbonamento.
  if (isMobile) {
    if (config.variant === "info") return null;
    return (
      <AvvisoAbbonamentoMobile
        key={`${effectiveCompany.id}:${config.titolo}`}
        config={config}
        chiave={`${effectiveCompany.id}:${config.titolo}`}
        onCta={handleCta}
        inCorso={openPortal.isPending && config.ctaAction === "portal"}
      />
    );
  }

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

/**
 * L'avviso su mobile: un pannello dal basso, una volta per sessione e per
 * stato. Chiuso con «Più tardi» non torna finché non si riapre l'app; se lo
 * stato cambia (da «pagamento non riuscito» a «sospeso») torna, perche' e' un
 * avviso diverso.
 */
function AvvisoAbbonamentoMobile({
  config, chiave, onCta, inCorso,
}: {
  config: BannerConfig;
  chiave: string;
  onCta: () => void;
  inCorso: boolean;
}) {
  const storageKey = `avviso-abbonamento-visto:${chiave}`;
  // Letto una volta al montaggio; se lo stato cambia il genitore rimonta il
  // componente (key = chiave), quindi il nuovo avviso riparte da capo.
  const [aperto, setAperto] = useState(() => {
    try { return sessionStorage.getItem(storageKey) !== "1"; } catch { return true; }
  });

  const chiudi = () => {
    try { sessionStorage.setItem(storageKey, "1"); } catch { /* storage bloccato */ }
    setAperto(false);
  };

  const grave = config.variant === "danger";

  return (
    <Sheet open={aperto} onOpenChange={(o) => { if (!o) chiudi(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="text-left space-y-2">
          <div className={`flex items-center gap-2 ${grave ? "text-destructive" : "text-orange-600"}`}>
            {config.icon}
            <SheetTitle className={grave ? "text-destructive" : "text-orange-700"}>{config.titolo}</SheetTitle>
          </div>
          <SheetDescription className="text-sm leading-relaxed">{config.dettaglio}</SheetDescription>
        </SheetHeader>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="h-11" onClick={chiudi}>Più tardi</Button>
          {config.ctaLabel && config.ctaAction && (
            <Button
              className={`h-11 flex-1 ${grave ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}`}
              onClick={() => { chiudi(); onCta(); }}
              disabled={inCorso}
            >
              {inCorso ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {config.ctaLabel}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
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
        titolo: "Periodo di prova scaduto",
        dettaglio: "Attiva un piano per continuare a usare la piattaforma.",
        ctaLabel: "Attiva piano",
        ctaAction: "upgrade",
      };
    }
    if (trialDaysLeft !== null && trialDaysLeft <= 3) {
      return {
        variant: "warning",
        icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
        message: `Il tuo periodo di prova scade tra ${trialDaysLeft} giorn${trialDaysLeft === 1 ? "o" : "i"}.`,
        titolo: "La prova sta per finire",
        dettaglio: `Scade tra ${trialDaysLeft} giorn${trialDaysLeft === 1 ? "o" : "i"}: scegli un piano per non perdere l'accesso.`,
        ctaLabel: "Attiva piano",
        ctaAction: "upgrade",
      };
    }
    return {
      variant: "info",
      icon: <Clock className="h-4 w-4 shrink-0" />,
      message: `Stai usando il piano di prova. Rimangono ${trialDaysLeft ?? "?"} giorni.`,
      titolo: "Piano di prova",
      dettaglio: `Rimangono ${trialDaysLeft ?? "?"} giorni.`,
      ctaLabel: "Scegli un piano",
      ctaAction: "upgrade",
    };
  }
  if (status === "past_due") {
    return {
      variant: "danger",
      icon: <CreditCard className="h-4 w-4 shrink-0" />,
      message: "Errore pagamento — pagamento non riuscito. Aggiorna il metodo entro 7 giorni per evitare la sospensione.",
      titolo: "Pagamento non riuscito",
      dettaglio: "Aggiorna il metodo di pagamento entro 7 giorni per evitare la sospensione.",
      ctaLabel: "Aggiorna pagamento",
      ctaAction: "portal",
    };
  }
  if (status === "suspended") {
    return {
      variant: "danger",
      icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
      message: "Errore pagamento — abbonamento sospeso. Email, WhatsApp, AI, render e firma sono disattivati: rinnova per riattivarli.",
      titolo: "Abbonamento sospeso",
      dettaglio: "Email, WhatsApp, AI, render e firma sono disattivati. Rinnova per riattivarli.",
      ctaLabel: "Rinnova",
      ctaAction: "renew",
    };
  }
  if (status === "expired" || status === "canceled") {
    return {
      variant: "danger",
      icon: <XCircle className="h-4 w-4 shrink-0" />,
      message: "Errore pagamento — abbonamento scaduto. Rinnova per riattivare la piattaforma.",
      titolo: "Abbonamento scaduto",
      dettaglio: "Rinnova per riattivare la piattaforma.",
      ctaLabel: "Rinnova",
      ctaAction: "renew",
    };
  }
  if (status === "cancellation_pending") {
    return {
      variant: "warning",
      icon: <Clock className="h-4 w-4 shrink-0" />,
      message: "Abbonamento in cancellazione. Continuerà ad essere attivo fino alla data di scadenza.",
      titolo: "Abbonamento in cancellazione",
      dettaglio: "Resta attivo fino alla data di scadenza.",
      ctaLabel: "Riattiva",
      ctaAction: "portal",
    };
  }
  return null;
}

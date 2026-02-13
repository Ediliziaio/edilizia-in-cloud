import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, Clock, XCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubscriptionBanner() {
  const { isImpersonating } = useAuth();
  const { companyStatus, trialDaysLeft, trialExpired } = useSubscriptionLimits();

  if (isImpersonating) return null;
  if (companyStatus === "active") return null;

  let bgColor = "";
  let textColor = "";
  let icon: React.ReactNode = null;
  let message = "";
  let showUpgrade = false;

  if (companyStatus === "trial") {
    if (trialExpired) {
      bgColor = "bg-destructive/10 border-destructive/30";
      textColor = "text-destructive";
      icon = <XCircle className="h-4 w-4 shrink-0" />;
      message = "Il periodo di prova è scaduto. Attiva un piano per continuare.";
      showUpgrade = true;
    } else if (trialDaysLeft !== null && trialDaysLeft <= 3) {
      bgColor = "bg-orange-500/10 border-orange-500/30";
      textColor = "text-orange-700 dark:text-orange-400";
      icon = <AlertTriangle className="h-4 w-4 shrink-0" />;
      message = `Il tuo periodo di prova scade tra ${trialDaysLeft} giorn${trialDaysLeft === 1 ? "o" : "i"}! Attiva un piano.`;
      showUpgrade = true;
    } else {
      bgColor = "bg-blue-500/10 border-blue-500/30";
      textColor = "text-blue-700 dark:text-blue-400";
      icon = <Clock className="h-4 w-4 shrink-0" />;
      message = `Stai usando il piano di prova. Rimangono ${trialDaysLeft} giorni.`;
      showUpgrade = true;
    }
  } else if (companyStatus === "suspended") {
    bgColor = "bg-orange-500/10 border-orange-500/30";
    textColor = "text-orange-700 dark:text-orange-400";
    icon = <AlertTriangle className="h-4 w-4 shrink-0" />;
    message = "Il tuo abbonamento è sospeso. Contatta il supporto.";
  } else if (companyStatus === "expired") {
    bgColor = "bg-destructive/10 border-destructive/30";
    textColor = "text-destructive";
    icon = <XCircle className="h-4 w-4 shrink-0" />;
    message = "Il tuo abbonamento è scaduto. Rinnova per continuare a usare la piattaforma.";
    showUpgrade = true;
  }

  if (!message) return null;

  return (
    <div className={`px-4 py-2.5 flex items-center justify-between border-b ${bgColor}`}>
      <div className={`flex items-center gap-2 ${textColor}`}>
        {icon}
        <span className="text-sm font-medium">{message}</span>
      </div>
      {showUpgrade && (
        <Button size="sm" variant="outline" className="text-xs h-7">
          Upgrade
        </Button>
      )}
    </div>
  );
}

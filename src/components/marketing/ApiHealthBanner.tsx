import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, X } from "lucide-react";
import { useApiHealth, type ApiServices } from "@/hooks/useApiHealth";

const SERVICE_LABELS: Record<keyof ApiServices, string> = {
  whatsapp: "WhatsApp Business",
  googlemaps: "Google Maps",
  meta: "Meta Ads / Lead Ads",
  email: "Email Provider",
  email_marketing: "Email Marketing",
  email_transactional: "Email Transazionale",
  elevenlabs: "ElevenLabs (Agente AI Vocale)",
};

const SESSION_KEY = "api-health-dismissed";

function getDismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "[]");
  } catch {
    return [];
  }
}

function setDismissed(services: string[]) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(services));
}

interface ApiHealthBannerProps {
  filter: (keyof ApiServices)[];
}

export function ApiHealthBanner({ filter }: ApiHealthBannerProps) {
  const { services, isLoading } = useApiHealth();
  const navigate = useNavigate();
  const [dismissed, setDismissedState] = useState<string[]>(getDismissed);

  if (isLoading) return null;

  const missing = filter.filter((key) => !services[key] && !dismissed.includes(key));
  if (missing.length === 0) return null;

  const handleDismiss = (key: string) => {
    const next = [...dismissed, key];
    setDismissedState(next);
    setDismissed(next);
  };

  return (
    <div className="space-y-2">
      {missing.map((key) => (
        <Alert key={key} variant="destructive" className="flex items-center gap-3 py-2.5">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <AlertDescription className="flex-1 text-sm">
            <strong>{SERVICE_LABELS[key]}</strong> non configurato — alcune funzionalità potrebbero non funzionare.
          </AlertDescription>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 h-7 text-xs"
            onClick={() => navigate("/piattaforma/impostazioni")}
          >
            Configura ora
          </Button>
          <button
            onClick={() => handleDismiss(key)}
            className="shrink-0 p-1 rounded-sm hover:bg-destructive/20 text-destructive"
            aria-label="Chiudi"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </Alert>
      ))}
    </div>
  );
}

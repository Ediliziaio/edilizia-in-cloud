import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

interface OAuthStepProps {
  onSuccess: () => void;
  hook: any;
}

export function OAuthStep({ onSuccess, hook }: OAuthStepProps) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "META_OAUTH_RESULT") {
        if (event.data.status === "success") {
          onSuccess();
        }
        setLoading(false);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onSuccess]);

  const handleConnect = async () => {
    setLoading(true);
    const oauthUrl = await hook.startOAuth();
    if (oauthUrl) {
      const w = 600, h = 700;
      const left = (screen.width - w) / 2;
      const top = (screen.height - h) / 2;
      window.open(oauthUrl, "meta_oauth", `width=${w},height=${h},left=${left},top=${top}`);
    } else {
      setLoading(false);
    }
  };

  return (
    <div className="text-center space-y-4 py-8">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-8 w-8" fill="none">
          <rect width="36" height="36" rx="8" fill="hsl(var(--primary))" />
          <text x="18" y="24" textAnchor="middle" fill="white" fontSize="18" fontWeight="700" fontFamily="system-ui">M</text>
        </svg>
      </div>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Collega il tuo account Facebook per importare automaticamente i lead
          dai moduli Lead Ads delle tue pagine.
        </p>
        <p className="text-xs text-muted-foreground">
          Verranno richiesti i permessi per: lettura pagine, lead forms, e gestione ads.
        </p>
      </div>
      <Button onClick={handleConnect} disabled={loading} className="gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Collega con Facebook
      </Button>
    </div>
  );
}

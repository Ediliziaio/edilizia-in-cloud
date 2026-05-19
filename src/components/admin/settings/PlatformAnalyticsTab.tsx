/**
 * PlatformAnalyticsTab — v8.6.89
 *
 * Pannello super-admin per configurare PostHog (product analytics).
 * Le 3 chiavi vivono in `platform_settings`:
 *   - posthog_api_key      (vuoto = analytics OFF)
 *   - posthog_host         (default EU cloud)
 *   - analytics_enabled    ("true"/"false" master switch)
 *
 * Una volta salvate, gli utenti devono ricaricare per vedere effetto
 * (config cached 30min nel AnalyticsProvider).
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChartBar, Save, Loader2, ExternalLink, Eye, EyeOff } from "lucide-react";

const KEYS = ["posthog_api_key", "posthog_host", "analytics_enabled"] as const;

export function PlatformAnalyticsTab() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [host, setHost] = useState("https://eu.i.posthog.com");
  const [enabled, setEnabled] = useState(true);
  const [showKey, setShowKey] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "analytics-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", [...KEYS]);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.key, r.value]));
    },
  });

  useEffect(() => {
    if (!data) return;
    setApiKey(data.get("posthog_api_key") ?? "");
    setHost(data.get("posthog_host") ?? "https://eu.i.posthog.com");
    setEnabled((data.get("analytics_enabled") ?? "true") !== "false");
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const rows = [
        { key: "posthog_api_key", value: apiKey.trim() },
        { key: "posthog_host", value: host.trim() || "https://eu.i.posthog.com" },
        { key: "analytics_enabled", value: enabled ? "true" : "false" },
      ];
      for (const r of rows) {
        const { error } = await supabase
          .from("platform_settings")
          .upsert(r, { onConflict: "key" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Impostazioni analytics salvate", {
        description: "Gli utenti vedranno effetto al prossimo refresh (cache 30min).",
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "analytics-settings"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-config"] });
    },
    onError: (e: Error) => toast.error("Errore salvataggio", { description: e.message }),
  });

  const apiKeyMasked = apiKey ? apiKey.slice(0, 6) + "•".repeat(Math.max(0, apiKey.length - 10)) + apiKey.slice(-4) : "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChartBar className="h-5 w-5 text-primary" />
            Product Analytics (PostHog)
          </CardTitle>
          <CardDescription>
            Tracciamento eventi prodotto, funnel di attivazione, retention cohort.
            GDPR-friendly (EU host, no PII raw, opt-out utente).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription className="text-sm">
              Crea un progetto su{" "}
              <a
                href="https://eu.posthog.com/signup"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1 hover:underline"
              >
                eu.posthog.com <ExternalLink className="h-3 w-3" />
              </a>
              {" "}(gratis fino a 1M eventi/mese), copia la Project API key e incollala qui.
              Lascia vuoto per disabilitare completamente.
            </AlertDescription>
          </Alert>

          <div className="grid gap-2">
            <Label htmlFor="ph-key">API Key del progetto</Label>
            <div className="flex gap-2">
              <Input
                id="ph-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="phc_..."
                disabled={isLoading}
                className="font-mono text-sm"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setShowKey(!showKey)}
                aria-label="Mostra/nascondi"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {!showKey && apiKey && (
              <p className="text-xs text-muted-foreground font-mono">{apiKeyMasked}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ph-host">Host PostHog</Label>
            <Input
              id="ph-host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="https://eu.i.posthog.com"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Default: EU cloud. Cambia se usi self-hosted PostHog.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="ph-enabled" className="text-sm font-medium">
                Analytics attivo
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Master switch — disattiva tutto senza rimuovere la API key
              </p>
            </div>
            <Switch id="ph-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={isLoading} />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
              {save.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salva impostazioni
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eventi tracciati</CardTitle>
          <CardDescription>
            Riferimento eventi e KPI rilevati automaticamente nei flussi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• <code>signup_completed</code> — nuovo account creato</li>
            <li>• <code>onboarding_step_completed</code> — checklist Quick Start</li>
            <li>• <code>order_created</code> — nuova commessa salvata</li>
            <li>• <code>first_render_generated</code> — primo render AI</li>
            <li>• <code>upgrade_cta_clicked</code> — click su CTA piano</li>
            <li>• <code>preview_feature_blocked</code> — azione bloccata in demo</li>
            <li>• <code>unlock_requested</code> — richiesta sblocco al consulente</li>
            <li>• <code>payment_failed</code> — Stripe webhook</li>
            <li>• <code>subscription_canceled</code> — Stripe webhook</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

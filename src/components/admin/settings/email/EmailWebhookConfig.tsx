import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Info,
  Loader2,
  ShieldCheck,
  Webhook,
} from "lucide-react";

type WebhookSecretSource = "env" | "platform_settings" | "missing";

interface ApiHealthPayload {
  email_webhook?: {
    secretConfigured: boolean;
    secretSource: WebhookSecretSource;
  };
}

const WEBHOOK_SECRET_KEY = "email_provider_webhook_secret";

export function EmailWebhookConfig() {
  const queryClient = useQueryClient();
  const [showSecret, setShowSecret] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState("");

  const { data: health } = useQuery<ApiHealthPayload>({
    queryKey: queryKeys.apiHealth.all,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("check-api-health");
      if (error) throw error;
      return data as ApiHealthPayload;
    },
    staleTime: 60_000,
  });

  const { data: storedSecret } = useQuery({
    queryKey: [...queryKeys.admin.platformSettingsEmail(), "webhook-secret"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings" as never)
        .select("value")
        .eq("key" as never, WEBHOOK_SECRET_KEY as never)
        .maybeSingle();
      if (error) throw error;
      return (data as { value?: string } | null)?.value ?? "";
    },
  });

  useEffect(() => {
    setWebhookSecret(storedSecret ?? "");
  }, [storedSecret]);

  const secretSource = health?.email_webhook?.secretSource ?? "missing";
  const secretConfigured = health?.email_webhook?.secretConfigured ?? false;
  const baseWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL || ""}/functions/v1/email-provider-webhook`;

  const effectiveDisplaySecret = secretSource === "platform_settings" ? webhookSecret.trim() : "";

  const webhookUrls = useMemo(() => ({
    marketing: `${baseWebhookUrl}?stream=marketing${effectiveDisplaySecret
      ? `&secret=${encodeURIComponent(effectiveDisplaySecret)}`
      : secretSource === "env"
        ? "&secret=<SUPABASE_WEBHOOK_SECRET>"
        : "&secret=<configura-secret>"}`,
    transactional: `${baseWebhookUrl}?stream=transactional${effectiveDisplaySecret
      ? `&secret=${encodeURIComponent(effectiveDisplaySecret)}`
      : secretSource === "env"
        ? "&secret=<SUPABASE_WEBHOOK_SECRET>"
        : "&secret=<configura-secret>"}`,
  }), [baseWebhookUrl, effectiveDisplaySecret, secretSource]);

  const copyValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiato`);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = webhookSecret.trim();
      if (!trimmed) {
        const { error } = await supabase
          .from("platform_settings" as never)
          .delete()
          .eq("key" as never, WEBHOOK_SECRET_KEY as never);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("platform_settings" as never)
        .upsert(
          {
            key: WEBHOOK_SECRET_KEY,
            value: trimmed,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "key" as never },
        );
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.platformSettingsEmail(), "webhook-secret"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.apiHealth.all }),
      ]);
      toast.success("Webhook email aggiornato");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Errore salvataggio webhook");
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Webhook className="h-4 w-4" />
              Webhook Provider Email
            </CardTitle>
            <CardDescription>
              Centralizza open, click, bounce, unsubscribe e complaint per Elastic Email e gli altri provider.
            </CardDescription>
          </div>
          <Badge variant={secretConfigured ? "default" : "destructive"} className="gap-1">
            {secretConfigured ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {secretConfigured ? "Webhook protetto" : "Secret mancante"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {secretSource === "env" && (
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Il webhook usa un secret già configurato nei secret di Supabase. Gli URL qui sotto mostrano un placeholder:
              per copiare il link completo devi usare il valore reale del secret deployato.
            </AlertDescription>
          </Alert>
        )}

        {secretSource === "missing" && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              In questo momento il webhook email risponde con errore finché non configuri un secret.
              Puoi salvarlo qui sotto oppure impostare `WEBHOOK_SECRET` nei secret Supabase.
            </AlertDescription>
          </Alert>
        )}

        {secretSource === "platform_settings" && (
          <Alert className="border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-xs text-emerald-700 dark:text-emerald-300">
              Il webhook sta usando il secret salvato nella piattaforma. Gli URL qui sotto sono completi e copiabili.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
          <div className="space-y-2">
            <Label>Webhook secret globale</Label>
            <div className="relative">
              <Input
                type={showSecret ? "text" : "password"}
                value={webhookSecret}
                onChange={(event) => setWebhookSecret(event.target.value)}
                placeholder="Inserisci un secret condiviso per i webhook email"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => setShowSecret((current) => !current)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Elastic Email invia i webhook su URL complete: `?stream=marketing&secret=...`. Se usi il secret salvato qui, il copy funziona subito.
            </p>
          </div>

          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">Checklist rapida Elastic Email</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>1. Piano PRO per attivare le Notification settings.</li>
              <li>2. API key con permesso `SendHttp`.</li>
              <li>3. Notifiche consigliate: Sent, Opened, Clicked, Unsubscribed, Complaints, Bounce/Error.</li>
              <li>4. Il webhook deve rispondere `200 OK` anche in GET.</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva webhook
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">URL webhook marketing</Label>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => copyValue(webhookUrls.marketing, "Webhook marketing")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Input readOnly value={webhookUrls.marketing} className="bg-muted font-mono text-xs" />
            <p className="text-xs text-muted-foreground">
              Da usare per Elastic Email marketing e provider bulk. Lato Elastic Email le Notification settings sono disponibili sui piani PRO.
            </p>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">URL webhook transazionale</Label>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => copyValue(webhookUrls.transactional, "Webhook transazionale")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Input readOnly value={webhookUrls.transactional} className="bg-muted font-mono text-xs" />
            <p className="text-xs text-muted-foreground">
              Da usare per eventi di delivery dei provider di sistema. Il parser è unico e distingue automaticamente lo stream.
            </p>
          </div>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Se il tracking opens/clicks di Elastic Email è attivo, il dominio marketing deve avere SPF e DKIM verificati e il CNAME `tracking`
            deve puntare a `api.elasticemail.com`.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

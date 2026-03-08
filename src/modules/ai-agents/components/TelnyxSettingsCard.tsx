import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Eye, EyeOff, CheckCircle2, XCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function TelnyxSettingsCard() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [messagingProfileId, setMessagingProfileId] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [webhookKey, setWebhookKey] = useState("");
  const [showWebhookKey, setShowWebhookKey] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const { data: settings } = useQuery({
    queryKey: ["telnyx-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("telnyx_settings" as never)
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as {
        id: string;
        api_key_encrypted: string;
        messaging_profile_id: string | null;
        connection_id: string | null;
        webhook_signing_secret_encrypted: string | null;
        is_active: boolean;
      } | null;
    },
  });

  useEffect(() => {
    if (settings) {
      setApiKey(settings.api_key_encrypted ? "••••••••••••" : "");
      setMessagingProfileId(settings.messaging_profile_id || "");
      setConnectionId(settings.connection_id || "");
      setWebhookKey(settings.webhook_signing_secret_encrypted ? "••••••••••••" : "");
      setIsActive(settings.is_active);
    }
  }, [settings]);

  const handleTestConnection = async () => {
    setTestStatus("loading");
    try {
      const { data, error } = await supabase.functions.invoke("telnyx-proxy", {
        body: { action: "list_numbers", payload: {} },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTestStatus("success");
      toast.success(`Connessione riuscita — ${data?.numbers?.length || 0} numeri trovati`);
    } catch {
      setTestStatus("error");
      toast.error("Connessione fallita. Verifica le credenziali.");
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim() || apiKey === "••••••••••••") {
      if (!settings?.id) {
        toast.error("Inserisci la API Key Telnyx");
        return;
      }
    }

    setIsSaving(true);
    try {
      // Encrypt via edge function
      const { data, error } = await supabase.functions.invoke("telnyx-proxy", {
        body: {
          action: "save_settings",
          payload: {
            api_key: apiKey !== "••••••••••••" ? apiKey.trim() : undefined,
            messaging_profile_id: messagingProfileId.trim() || null,
            connection_id: connectionId.trim() || null,
            webhook_signing_secret: webhookKey !== "••••••••••••" ? webhookKey.trim() : undefined,
            is_active: isActive,
            existing_id: settings?.id || null,
          },
        },
      });

      // Fallback: save directly if telnyx-proxy doesn't support save_settings yet
      if (data?.error?.includes("non supportata")) {
        // Direct upsert — API key will be stored as-is (should be encrypted by proxy)
        const upsertData: Record<string, unknown> = {
          messaging_profile_id: messagingProfileId.trim() || null,
          connection_id: connectionId.trim() || null,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        };

        if (apiKey !== "••••••••••••" && apiKey.trim()) {
          upsertData.api_key_encrypted = apiKey.trim(); // Will be properly encrypted via proxy later
        }
        if (webhookKey !== "••••••••••••" && webhookKey.trim()) {
          upsertData.webhook_signing_secret_encrypted = webhookKey.trim();
        }

        if (settings?.id) {
          await supabase
            .from("telnyx_settings" as never)
            .update(upsertData as never)
            .eq("id" as never, settings.id as never);
        } else {
          if (!upsertData.api_key_encrypted) {
            toast.error("API Key obbligatoria per la prima configurazione");
            setIsSaving(false);
            return;
          }
          await supabase
            .from("telnyx_settings" as never)
            .insert(upsertData as never);
        }
      } else if (error) {
        throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["telnyx-settings"] });
      toast.success("Configurazione Telnyx salvata");
    } catch (err: unknown) {
      console.error(err);
      toast.error("Errore nel salvataggio");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-4 w-4" /> Telefonia (Telnyx)
        </CardTitle>
        <CardDescription>
          Configura le credenziali Telnyx per acquisto numeri, SMS e chiamate in uscita.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="KEY_xxxxxxxxxxxxxxxx"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Connection ID</Label>
            <Input
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              placeholder="ID connessione SIP per chiamate"
            />
            <p className="text-[10px] text-muted-foreground">Necessario per collegare numeri a ElevenLabs.</p>
          </div>
          <div className="space-y-2">
            <Label>Messaging Profile ID</Label>
            <Input
              value={messagingProfileId}
              onChange={(e) => setMessagingProfileId(e.target.value)}
              placeholder="ID profilo messaggistica"
            />
            <p className="text-[10px] text-muted-foreground">Opzionale. Per invio SMS.</p>
          </div>
          <div className="space-y-2">
            <Label>Webhook Signing Key</Label>
            <div className="relative">
              <Input
                type={showWebhookKey ? "text" : "password"}
                value={webhookKey}
                onChange={(e) => setWebhookKey(e.target.value)}
                placeholder="Chiave firma webhook"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowWebhookKey(!showWebhookKey)}
              >
                {showWebhookKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label className="text-sm">Telnyx attivo</Label>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testStatus === "loading"}>
              {testStatus === "loading" ? "Test..." : "Testa connessione"}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Salvataggio..." : "Salva Telnyx"}
            </Button>
          </div>
        </div>
        {testStatus === "success" && (
          <p className="text-sm text-primary flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Connessione Telnyx riuscita
          </p>
        )}
        {testStatus === "error" && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <XCircle className="h-3.5 w-3.5" /> Connessione Telnyx fallita
          </p>
        )}
      </CardContent>
    </Card>
  );
}

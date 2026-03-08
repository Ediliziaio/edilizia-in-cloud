import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, Copy, CheckCircle2, Loader2 } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://guqgszwelffntrgtsycm.supabase.co";

const META_KEYS = ["meta_app_id", "meta_app_secret", "meta_webhook_verify_token"] as const;

export default function AdminSettingsIntegrations() {
  const [values, setValues] = useState<Record<string, string>>({
    meta_app_id: "",
    meta_app_secret: "",
    meta_webhook_verify_token: "",
  });
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const webhookUrl = `${SUPABASE_URL}/functions/v1/meta-webhook`;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", [...META_KEYS]);

      const map: Record<string, string> = {};
      for (const row of data || []) {
        map[row.key] = row.value || "";
      }
      setValues((prev) => ({ ...prev, ...map }));
      setLoaded(true);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const key of META_KEYS) {
        await supabase.from("platform_settings").upsert(
          { key, value: values[key] || "" },
          { onConflict: "key" }
        );
      }
      toast.success("Credenziali Meta salvate");
    } catch (e: any) {
      toast.error("Errore nel salvataggio: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const appId = values.meta_app_id;
      if (!appId) {
        toast.error("Inserisci un App ID prima di testare");
        return;
      }
      const res = await fetch(`https://graph.facebook.com/v21.0/${appId}?fields=id,name&access_token=${appId}|${values.meta_app_secret}`);
      const data = await res.json();
      if (data.error) {
        toast.error(`Errore Meta: ${data.error.message}`);
      } else {
        toast.success(`Connessione riuscita! App: ${data.name || data.id}`);
      }
    } catch (e: any) {
      toast.error("Errore di connessione: " + e.message);
    } finally {
      setTesting(false);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL copiato negli appunti");
  };

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Meta (Facebook & Instagram)</CardTitle>
          <CardDescription>
            Configura le credenziali della Meta App per abilitare OAuth, Lead Ads webhook e API Ads nelle aziende.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="meta_app_id">App ID</Label>
            <Input
              id="meta_app_id"
              value={values.meta_app_id}
              onChange={(e) => setValues((v) => ({ ...v, meta_app_id: e.target.value }))}
              placeholder="1234567890"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meta_app_secret">App Secret</Label>
            <div className="relative">
              <Input
                id="meta_app_secret"
                type={showSecret ? "text" : "password"}
                value={values.meta_app_secret}
                onChange={(e) => setValues((v) => ({ ...v, meta_app_secret: e.target.value }))}
                placeholder="••••••••"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="meta_webhook_verify_token">Webhook Verify Token</Label>
            <Input
              id="meta_webhook_verify_token"
              value={values.meta_webhook_verify_token}
              onChange={(e) => setValues((v) => ({ ...v, meta_webhook_verify_token: e.target.value }))}
              placeholder="my-verify-token"
            />
          </div>

          <div className="space-y-2">
            <Label>Webhook Callback URL</Label>
            <div className="flex items-center gap-2">
              <Input value={webhookUrl} readOnly className="bg-muted text-xs font-mono" />
              <Button variant="outline" size="icon" onClick={copyWebhookUrl} className="shrink-0">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Inserisci questo URL nella sezione Webhooks della tua Meta App.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salva credenziali
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing || !values.meta_app_id}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Verifica connessione
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

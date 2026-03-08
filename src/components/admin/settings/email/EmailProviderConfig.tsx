import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, Mail, Send, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Props {
  stream: "marketing" | "transactional";
}

const STREAM_LABELS = {
  marketing: { title: "Email Marketing", desc: "Provider per campagne, newsletter e bulk email (es. Elastic Email)", icon: "📧" },
  transactional: { title: "Email Transazionali", desc: "Provider per email di sistema: notifiche, password reset, conferme (es. SendGrid)", icon: "⚡" },
};

const PROVIDERS = [
  { value: "elasticemail", label: "Elastic Email" },
  { value: "sendgrid", label: "SendGrid" },
  { value: "brevo", label: "Brevo (Sendinblue)" },
  { value: "resend", label: "Resend" },
  { value: "mailgun", label: "Mailgun" },
];

export function EmailProviderConfig({ stream }: Props) {
  const queryClient = useQueryClient();
  const suffix = stream === "transactional" ? "_transactional" : "";
  const providerKey = `email_provider${suffix}`;
  const apiKeyKey = `email_provider_api_key${suffix}`;
  const fromKey = `email_default_from${suffix}`;

  const [provider, setProvider] = useState(stream === "marketing" ? "elasticemail" : "sendgrid");
  const [apiKey, setApiKey] = useState("");
  const [defaultFrom, setDefaultFrom] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["platform-settings-email", stream],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings" as never)
        .select("key, value")
        .in("key" as never, [providerKey, apiKeyKey, fromKey] as never);
      return (data as unknown as { key: string; value: string }[]) ?? [];
    },
  });

  useEffect(() => {
    if (settings) {
      const p = settings.find((s) => s.key === providerKey)?.value;
      const k = settings.find((s) => s.key === apiKeyKey)?.value;
      const f = settings.find((s) => s.key === fromKey)?.value;
      if (p) setProvider(p);
      if (k) setApiKey(k);
      if (f) setDefaultFrom(f);
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const pairs = [
        { key: providerKey, value: provider },
        { key: apiKeyKey, value: apiKey.trim() },
        { key: fromKey, value: defaultFrom.trim() },
      ];
      for (const pair of pairs) {
        if (!pair.value) continue;
        const { error } = await supabase
          .from("platform_settings" as never)
          .upsert(
            { key: pair.key, value: pair.value, updated_at: new Date().toISOString() } as never,
            { onConflict: "key" as never }
          );
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["platform-settings-email"] });
      toast.success(`Provider ${STREAM_LABELS[stream].title} salvato`);
    } catch {
      toast.error("Errore nel salvataggio");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail || !apiKey) {
      toast.error("Inserisci un'email di test e configura la API key");
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: {
          to: testEmail,
          campaignId: null,
          testMode: true,
          stream,
          provider,
          subject: `[TEST ${stream.toUpperCase()}] Email di verifica`,
          html: `<html><body><h2>✅ Test ${STREAM_LABELS[stream].title}</h2><p>Questa è un'email di test inviata tramite <strong>${provider}</strong> (stream: ${stream}).</p><p>Timestamp: ${new Date().toISOString()}</p></body></html>`,
        },
      });
      if (error) throw error;
      setTestResult({ ok: true, message: "Email di test inviata con successo!" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Errore sconosciuto";
      setTestResult({ ok: false, message });
    } finally {
      setIsTesting(false);
    }
  };

  const label = STREAM_LABELS[stream];
  const hasApiKey = !!settings?.find((s) => s.key === apiKeyKey)?.value;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <span>{label.icon}</span> {label.title}
            </CardTitle>
            <CardDescription>{label.desc}</CardDescription>
          </div>
          {hasApiKey ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Configurato
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" /> Non configurato
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Inserisci la chiave API"
              />
              <Button
                variant="ghost" size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Mittente predefinito</Label>
            <Input
              value={defaultFrom}
              onChange={(e) => setDefaultFrom(e.target.value)}
              placeholder="noreply@tuodominio.it"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Input
              placeholder="test@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="w-64"
            />
            <Button variant="outline" size="sm" onClick={handleTest} disabled={isTesting}>
              {isTesting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Invia Test
            </Button>
            {testResult && (
              <span className={`text-sm ${testResult.ok ? "text-green-600" : "text-destructive"}`}>
                {testResult.message}
              </span>
            )}
          </div>
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            {isSaving ? "Salvataggio..." : "Salva"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Send, CheckCircle2, XCircle, Loader2, Info, Circle, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Props {
  stream: "marketing" | "transactional";
}

const STREAM_LABELS = {
  marketing: {
    title: "Email Marketing",
    desc: "Provider per campagne, newsletter e bulk email",
    icon: "📧",
  },
  transactional: {
    title: "Email Transazionali",
    desc: "Provider per email di sistema: notifiche, password reset, conferme",
    icon: "⚡",
  },
};

const PROVIDERS = [
  { value: "elastic_email", label: "Elastic Email" },
  { value: "sendgrid", label: "SendGrid" },
  { value: "brevo", label: "Brevo (Sendinblue)" },
  { value: "resend", label: "Resend" },
  { value: "mailgun", label: "Mailgun" },
];

type ConnectionStatus = "configured" | "tested_ok" | "tested_fail" | "not_configured";

export function EmailProviderConfig({ stream }: Props) {
  const queryClient = useQueryClient();
  const prefix = `email_${stream}`;
  const providerKey = `${prefix}_provider`;
  const apiKeyKey = `${prefix}_api_key`;
  const fromAddressKey = `${prefix}_from_address`;
  const fromNameKey = `${prefix}_from_name`;
  const domainKey = `${prefix}_domain`;
  const lastTestKey = `${prefix}_last_test`;
  const lastTestStatusKey = `${prefix}_last_test_status`;

  const allKeys = [providerKey, apiKeyKey, fromAddressKey, fromNameKey, domainKey, lastTestKey, lastTestStatusKey];

  const [provider, setProvider] = useState(stream === "marketing" ? "elastic_email" : "sendgrid");
  const [apiKey, setApiKey] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [domain, setDomain] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data: settings } = useQuery({
    queryKey: queryKeys.admin.platformSettingsEmail(stream),
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings" as never)
        .select("key, value")
        .in("key" as never, allKeys as never);
      return (data as unknown as { key: string; value: string }[]) ?? [];
    },
  });

  useEffect(() => {
    if (settings) {
      const get = (k: string) => settings.find((s) => s.key === k)?.value || "";
      if (get(providerKey)) setProvider(get(providerKey));
      if (get(apiKeyKey)) setApiKey(get(apiKeyKey));
      if (get(fromAddressKey)) setFromAddress(get(fromAddressKey));
      if (get(fromNameKey)) setFromName(get(fromNameKey));
      if (get(domainKey)) setDomain(get(domainKey));
    }
  }, [settings]);

  // Connection status badge
  const getConnectionStatus = (): { status: ConnectionStatus; lastTest?: string } => {
    if (!settings) return { status: "not_configured" };
    const hasKey = !!settings.find((s) => s.key === apiKeyKey)?.value;
    if (!hasKey) return { status: "not_configured" };
    const lastTestStatus = settings.find((s) => s.key === lastTestStatusKey)?.value;
    const lastTestDate = settings.find((s) => s.key === lastTestKey)?.value;
    if (lastTestStatus === "ok") return { status: "tested_ok", lastTest: lastTestDate };
    if (lastTestStatus === "fail") return { status: "tested_fail", lastTest: lastTestDate };
    return { status: "configured" };
  };

  const connStatus = getConnectionStatus();

  const statusBadge = () => {
    switch (connStatus.status) {
      case "tested_ok":
        return (
          <Badge variant="default" className="gap-1 bg-green-600">
            <Circle className="h-2 w-2 fill-current" /> Connesso
          </Badge>
        );
      case "tested_fail":
        return (
          <Badge variant="destructive" className="gap-1">
            <Circle className="h-2 w-2 fill-current" /> Errore
          </Badge>
        );
      case "configured":
        return (
          <Badge variant="secondary" className="gap-1">
            <Circle className="h-2 w-2 fill-current" /> Da verificare
          </Badge>
        );
      default:
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" /> Non configurato
          </Badge>
        );
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const pairs = [
        { key: providerKey, value: provider },
        { key: apiKeyKey, value: apiKey.trim() },
        { key: fromAddressKey, value: fromAddress.trim() },
        { key: fromNameKey, value: fromName.trim() },
        { key: domainKey, value: domain.trim() },
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
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.platformSettingsEmail() });
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
          html: `<html><body><h2>✅ Test ${STREAM_LABELS[stream].title}</h2><p>Questa è un'email di test inviata tramite <strong>${PROVIDERS.find(p => p.value === provider)?.label || provider}</strong> (stream: ${stream}).</p><p>Timestamp: ${new Date().toISOString()}</p></body></html>`,
        },
      });
      if (error) throw error;
      setTestResult({ ok: true, message: "Email di test inviata con successo!" });

      // Save test status
      const now = new Date().toISOString();
      await supabase.from("platform_settings" as never).upsert(
        { key: lastTestKey, value: now, updated_at: now } as never,
        { onConflict: "key" as never }
      );
      await supabase.from("platform_settings" as never).upsert(
        { key: lastTestStatusKey, value: "ok", updated_at: now } as never,
        { onConflict: "key" as never }
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.platformSettingsEmail() });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Errore sconosciuto";
      setTestResult({ ok: false, message });

      // Save failed test status
      const now = new Date().toISOString();
      await supabase.from("platform_settings" as never).upsert(
        { key: lastTestStatusKey, value: "fail", updated_at: now } as never,
        { onConflict: "key" as never }
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.platformSettingsEmail() });
    } finally {
      setIsTesting(false);
    }
  };

  // Webhook URL (read-only)
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL || ""}/functions/v1/email-provider-webhook?stream=${stream}`;

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL webhook copiato");
  };

  const label = STREAM_LABELS[stream];

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
          <div className="flex flex-col items-end gap-1">
            {statusBadge()}
            {connStatus.lastTest && (
              <span className="text-[10px] text-muted-foreground">
                Ultimo test: {new Date(connStatus.lastTest).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Transactional info note */}
        {stream === "transactional" && (
          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-xs text-blue-700 dark:text-blue-300">
              Le email transazionali sono messaggi di sistema inviati automaticamente: notifiche, conferme, reset password, inviti utente.
              Queste email non contano come crediti marketing e utilizzano un provider separato per garantire alta deliverability.
            </AlertDescription>
          </Alert>
        )}

        {/* Row 1: Provider + API Key */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>

        {/* Row 2: From Address + From Name + Domain (Mailgun only) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Email Mittente</Label>
            <Input
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="noreply@tuodominio.it"
            />
          </div>
          <div className="space-y-2">
            <Label>Nome Mittente</Label>
            <Input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="EdiliziaCloud"
            />
          </div>
          {provider === "mailgun" && (
            <div className="space-y-2">
              <Label>Dominio Mailgun</Label>
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="mg.tuodominio.it"
              />
            </div>
          )}
        </div>

        {/* Webhook URL (read-only) */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">URL Webhook (da configurare nel provider)</Label>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={webhookUrl}
              className="font-mono text-xs bg-muted"
            />
            <Button variant="outline" size="icon" className="shrink-0" onClick={copyWebhook}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Test + Save */}
        <div className="flex items-center justify-between flex-wrap gap-2">
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

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Info,
  Loader2,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { logger } from "@/utils/logger";

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
type ProviderHealthStatus = "healthy" | "degraded" | "down" | "unconfigured";

interface EmailHealthPayload {
  email_streams?: Partial<Record<"marketing" | "transactional", {
    provider: string;
    providerLabel: string;
    status: ProviderHealthStatus;
    responseMs: number | null;
    error: string | null;
    webhookSecretConfigured: boolean;
    webhookSecretSource: "env" | "platform_settings" | "missing";
    failoverProviders?: string[];
  }>>;
}

const PROVIDER_DOCS: Partial<Record<(typeof PROVIDERS)[number]["value"], string>> = {
  elastic_email: "https://help.elasticemail.com/en/articles/2376694-how-to-send-emails-via-api",
  sendgrid: "https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send",
  resend: "https://resend.com/docs/api-reference/emails/send-email",
  brevo: "https://developers.brevo.com/reference/sendtransacemail",
  mailgun: "https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages/post-v3--domain-name--messages",
};

const PROVIDER_ENDPOINT_HINTS: Record<"marketing" | "transactional", Partial<Record<(typeof PROVIDERS)[number]["value"], string>>> = {
  marketing: {
    elastic_email: "POST /v4/emails",
    sendgrid: "POST /v3/mail/send",
    resend: "POST /emails",
    brevo: "POST /v3/smtp/email",
    mailgun: "POST /v3/<domain>/messages",
  },
  transactional: {
    elastic_email: "POST /v4/emails/transactional",
    sendgrid: "POST /v3/mail/send",
    resend: "POST /emails",
    brevo: "POST /v3/smtp/email",
    mailgun: "POST /v3/<domain>/messages",
  },
};

const healthBadge = (status?: ProviderHealthStatus) => {
  switch (status) {
    case "healthy":
      return <Badge className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" /> API OK</Badge>;
    case "degraded":
      return <Badge variant="secondary" className="gap-1"><AlertTriangle className="h-3 w-3" /> Degraded</Badge>;
    case "down":
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Down</Badge>;
    default:
      return <Badge variant="outline" className="gap-1">Non verificato</Badge>;
  }
};

const getProviderLabel = (value: string) =>
  PROVIDERS.find((provider) => provider.value === value)?.label || value;

export function EmailProviderConfig({ stream }: Props) {
  const queryClient = useQueryClient();
  const prefix = `email_${stream}`;
  const providerKey = `${prefix}_provider`;
  const apiKeyKey = `${prefix}_api_key`;
  const fromAddressKey = `${prefix}_from_address`;
  const fromNameKey = `${prefix}_from_name`;
  const domainKey = `${prefix}_domain`;
  const failoverProvidersKey = `${prefix}_failover_providers`;
  const lastTestKey = `${prefix}_last_test`;
  const lastTestStatusKey = `${prefix}_last_test_status`;

  const [provider, setProvider] = useState(stream === "marketing" ? "elastic_email" : "resend");
  const [apiKey, setApiKey] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [domain, setDomain] = useState("");
  const [failoverProviders, setFailoverProviders] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // SICUREZZA: NON scarichiamo mai il value della API key nel browser.
  // Per apiKeyKey selezioniamo solo l'esistenza della riga (has_value) e
  // mostriamo un placeholder bullet. Sul save, se l'input è uguale al
  // placeholder non trasmettiamo nulla (la key esistente resta).
  const API_KEY_PLACEHOLDER = "••••••••••••";
  const nonSecretKeys = [providerKey, fromAddressKey, fromNameKey, domainKey, failoverProvidersKey, lastTestKey, lastTestStatusKey];
  const secretKeys = [apiKeyKey];

  const { data: settings } = useQuery({
    queryKey: queryKeys.admin.platformSettingsEmail(stream),
    queryFn: async () => {
      // 1) Valori non-segreti
      const { data: rows } = await supabase
        .from("platform_settings" as never)
        .select("key, value")
        .in("key" as never, nonSecretKeys as never);

      // 2) Solo esistenza per le chiavi segrete (no value)
      const { data: secretRows } = await supabase
        .from("platform_settings" as never)
        .select("key")
        .in("key" as never, secretKeys as never);

      const nonSecret = (rows as unknown as { key: string; value: string }[]) ?? [];
      const secretsExist = new Set(
        ((secretRows as unknown as { key: string }[]) ?? []).map((r) => r.key)
      );

      // Normalizziamo nel formato atteso dal resto del componente: per le chiavi
      // segrete emettiamo value=placeholder se la riga esiste, altrimenti niente.
      const full: { key: string; value: string }[] = [...nonSecret];
      for (const k of secretKeys) {
        if (secretsExist.has(k)) full.push({ key: k, value: API_KEY_PLACEHOLDER });
      }
      return full;
    },
  });

  const { data: health } = useQuery<EmailHealthPayload>({
    queryKey: queryKeys.apiHealth.all,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("check-api-health");
      if (error) throw error;
      return data as EmailHealthPayload;
    },
    staleTime: 60_000,
  });

  // Flag "l'admin ha modificato qualcosa": finché è true l'effect di sync
  // NON sovrascrive i campi (un invalidate lanciato dall'altra card montata
  // insieme resettava l'input in corso di digitazione).
  const userEditedRef = useRef(false);
  const markEdited = () => { userEditedRef.current = true; };

  useEffect(() => {
    if (settings && !userEditedRef.current) {
      const get = (k: string) => settings.find((s) => s.key === k)?.value || "";
      if (get(providerKey)) setProvider(get(providerKey));
      if (get(apiKeyKey)) setApiKey(get(apiKeyKey));
      if (get(fromAddressKey)) setFromAddress(get(fromAddressKey));
      if (get(fromNameKey)) setFromName(get(fromNameKey));
      if (get(domainKey)) setDomain(get(domainKey));
      setFailoverProviders(get(failoverProvidersKey));
    }
  }, [apiKeyKey, domainKey, failoverProvidersKey, fromAddressKey, fromNameKey, providerKey, settings]);

  // Dirty = stato locale diverso dai valori salvati in DB. Il test invio
  // usa SEMPRE la configurazione salvata (send-test-email ignora il campo
  // provider del body), quindi con modifiche non salvate il test è bloccato.
  const getSavedValue = (k: string) => settings?.find((s) => s.key === k)?.value || "";
  const savedProvider = getSavedValue(providerKey) || (stream === "marketing" ? "elastic_email" : "resend");
  const isDirty =
    provider !== savedProvider ||
    apiKey.trim() !== getSavedValue(apiKeyKey) ||
    fromAddress.trim() !== getSavedValue(fromAddressKey) ||
    fromName.trim() !== getSavedValue(fromNameKey) ||
    domain.trim() !== getSavedValue(domainKey) ||
    failoverProviders.trim() !== getSavedValue(failoverProvidersKey);

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
  const streamHealth = health?.email_streams?.[stream];
  const providerDocsUrl = PROVIDER_DOCS[provider];
  const endpointHint = PROVIDER_ENDPOINT_HINTS[stream][provider];
  // P2-7: validazione stretta dominio Mailgun lato UI.
  // `provision-custom-domain` e l'edge function accettano solo domini con
  // almeno un punto e caratteri validi (lowercase alnum/-/.). Il guard
  // client-side previene save di stringhe che poi falliranno a runtime.
  const isMailgunDomainValid =
    provider !== "mailgun" || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.trim());
  const senderReady =
    !!fromAddress.trim() &&
    (provider !== "mailgun" || (!!domain.trim() && isMailgunDomainValid));

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
      const trimmedKey = apiKey.trim();
      const pairs = [
        { key: providerKey, value: provider },
        // API key: non sovrascrive se è ancora il placeholder (= la chiave
        // esistente è valida e non è stata modificata)
        ...(trimmedKey && trimmedKey !== API_KEY_PLACEHOLDER
          ? [{ key: apiKeyKey, value: trimmedKey }]
          : []),
        { key: fromAddressKey, value: fromAddress.trim() },
        { key: fromNameKey, value: fromName.trim() },
        { key: domainKey, value: domain.trim() },
        { key: failoverProvidersKey, value: failoverProviders.trim() },
      ];
      for (const pair of pairs) {
        if (!pair.value) {
          if (pair.key !== providerKey) {
            const { error } = await supabase
              .from("platform_settings" as never)
              .delete()
              .eq("key" as never, pair.key as never);
            if (error) throw error;
          }
          continue;
        }
        const { error } = await supabase
          .from("platform_settings" as never)
          .upsert(
            { key: pair.key, value: pair.value, updated_at: new Date().toISOString() } as never,
            { onConflict: "key" as never }
          );
        if (error) throw error;
      }
      // Invalida SOLO la chiave di questo stream: il prefix-match senza
      // stream resettava lo stato locale delle altre card montate insieme.
      userEditedRef.current = false;
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.platformSettingsEmail(stream) });
      queryClient.invalidateQueries({ queryKey: queryKeys.apiHealth.all });
      toast.success(`Provider ${STREAM_LABELS[stream].title} salvato`);
    } catch (err) {
      logger.error("save email provider failed", err);
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
      const { error } = await supabase.functions.invoke("send-test-email", {
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

      // Save test status (auxiliary — log-only su errore, non interrompe feedback test)
      const now = new Date().toISOString();
      const r1 = await supabase.from("platform_settings" as never).upsert(
        { key: lastTestKey, value: now, updated_at: now } as never,
        { onConflict: "key" as never }
      );
      if (r1.error) logger.error("persist lastTestKey", r1.error);
      const r2 = await supabase.from("platform_settings" as never).upsert(
        { key: lastTestStatusKey, value: "ok", updated_at: now } as never,
        { onConflict: "key" as never }
      );
      if (r2.error) logger.error("persist lastTestStatusKey ok", r2.error);
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.platformSettingsEmail(stream) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Errore sconosciuto";
      setTestResult({ ok: false, message });

      // Save failed test status + data (auxiliary — log-only su errore):
      // senza la data, il badge Errore restava associato al timestamp del
      // test precedente.
      const now = new Date().toISOString();
      const r1 = await supabase.from("platform_settings" as never).upsert(
        { key: lastTestKey, value: now, updated_at: now } as never,
        { onConflict: "key" as never }
      );
      if (r1.error) logger.error("persist lastTestKey fail", r1.error);
      const r2 = await supabase.from("platform_settings" as never).upsert(
        { key: lastTestStatusKey, value: "fail", updated_at: now } as never,
        { onConflict: "key" as never }
      );
      if (r2.error) logger.error("persist lastTestStatusKey fail", r2.error);
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.platformSettingsEmail(stream) });
    } finally {
      setIsTesting(false);
    }
  };

  // Webhook URL (read-only)
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL || ""}/functions/v1/email-provider-webhook?stream=${stream}`;

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("URL webhook copiato");
    } catch {
      toast.error("Copia negli appunti non riuscita");
    }
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
              <span className="text-xs text-muted-foreground">
                Ultimo test: {new Date(connStatus.lastTest).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Transactional info note */}
        {stream === "transactional" && (
          <Alert className="border-blue-200 bg-blue-50">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-xs text-blue-700">
              Le email transazionali sono messaggi di sistema inviati automaticamente: notifiche, conferme, reset password, inviti utente.
              Queste email non contano come crediti marketing e utilizzano un provider separato per garantire alta deliverability.
            </AlertDescription>
          </Alert>
        )}
        {stream === "marketing" && provider === "elastic_email" && (
          <Alert className="border-emerald-200 bg-emerald-50">
            <Info className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-xs text-emerald-700">
              Elastic Email e il provider consigliato per campagne e newsletter. Configura una API key con permesso
              <strong> SendHttp</strong>, imposta il webhook qui sotto e usa un dominio marketing verificato per massimizzare deliverability e tracking.
            </AlertDescription>
          </Alert>
        )}

        {streamHealth && streamHealth.provider !== provider && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Hai cambiato provider ma non hai ancora salvato. La diagnostica API qui sotto si riferisce a
              <strong> {streamHealth.providerLabel}</strong>, cioe al provider attualmente attivo in produzione.
            </AlertDescription>
          </Alert>
        )}

        {streamHealth && !streamHealth.webhookSecretConfigured && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Il webhook email non e protetto o non e configurato: senza secret gli eventi open/click/bounce possono fallire.
              Usa la scheda webhook globale qui sopra per completare la configurazione.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Diagnostica provider</p>
              {healthBadge(streamHealth?.status)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Provider attivo: {streamHealth?.providerLabel || getProviderLabel(provider)}
            </p>
            {typeof streamHealth?.responseMs === "number" && (
              <p className="text-xs text-muted-foreground">Tempo risposta check: {streamHealth.responseMs}ms</p>
            )}
            {streamHealth?.error && (
              <p className="mt-1 text-xs text-destructive">{streamHealth.error}</p>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Webhook</p>
              <Badge variant={streamHealth?.webhookSecretConfigured ? "default" : "destructive"} className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                {streamHealth?.webhookSecretConfigured ? "Pronto" : "Da configurare"}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Secret sorgente: {streamHealth?.webhookSecretSource === "env"
                ? "Supabase Secret"
                : streamHealth?.webhookSecretSource === "platform_settings"
                  ? "Piattaforma"
                  : "Assente"}
            </p>
            <p className="text-xs text-muted-foreground">
              Per Elastic Email servono Notification settings con URL completa e piano PRO.
            </p>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Sender operativo</p>
              <Badge variant={senderReady ? "default" : "secondary"} className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {senderReady ? "Completo" : "Da completare"}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Endpoint check: {endpointHint || "n/d"}
            </p>
            <p className="text-xs text-muted-foreground">
              Mittente: {fromAddress || "non impostato"}
              {provider === "mailgun" && ` · Dominio: ${domain || "non impostato"}`}
            </p>
            {streamHealth?.failoverProviders?.length ? (
              <p className="text-xs text-muted-foreground">
                Failover: {streamHealth.failoverProviders.join(", ")}
              </p>
            ) : null}
          </div>
        </div>

        {/* Row 1: Provider + API Key */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v) => { markEdited(); setProvider(v); }}>
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
                onChange={(e) => { markEdited(); setApiKey(e.target.value); }}
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
              onChange={(e) => { markEdited(); setFromAddress(e.target.value); }}
              placeholder="noreply@tuodominio.it"
            />
          </div>
          <div className="space-y-2">
            <Label>Nome Mittente</Label>
            <Input
              value={fromName}
              onChange={(e) => { markEdited(); setFromName(e.target.value); }}
              placeholder="EdiliziaCloud"
            />
          </div>
          {provider === "mailgun" && (
            <div className="space-y-2">
              <Label>Dominio Mailgun</Label>
              <Input
                value={domain}
                onChange={(e) => { markEdited(); setDomain(e.target.value); }}
                placeholder="mg.tuodominio.it"
                aria-invalid={!isMailgunDomainValid}
              />
              {!isMailgunDomainValid && (
                <p className="text-xs text-destructive">
                  Dominio non valido. Deve essere nel formato{" "}
                  <code>sottodominio.tld</code> (es. <code>mg.tuazienda.it</code>).
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Failover provider</Label>
          <Input
            value={failoverProviders}
            onChange={(e) => { markEdited(); setFailoverProviders(e.target.value); }}
            placeholder={stream === "marketing" ? "brevo,sendgrid" : "mailgun,sendgrid"}
          />
          <p className="text-xs text-muted-foreground">
            Lista CSV o JSON di provider alternativi usati solo su timeout, rate-limit o 5xx. Le API key fallback restano in platform settings con prefisso
            {" "}<code>{prefix}_&lt;provider&gt;_api_key</code>.
          </p>
        </div>

        {provider === "elastic_email" && (
          <div className="rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">Supporto Elastic Email</p>
                <p className="text-xs text-muted-foreground">
                  Lato marketing usiamo l&apos;endpoint ufficiale piu adatto al bulk e teniamo il tracking applicativo sotto controllo.
                </p>
              </div>
              {providerDocsUrl && (
                <a
                  href={providerDocsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Docs ufficiali
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <ul className="mt-3 grid gap-1 text-xs text-muted-foreground">
              <li>1. API key con permesso <strong>SendHttp</strong>.</li>
              <li>2. Dominio mittente verificato con SPF + DKIM; tracking CNAME consigliato.</li>
              <li>3. Notification settings: Sent, Opened, Clicked, Unsubscribed, Complaints, Bounce/Error.</li>
              <li>4. Se cambi provider o key, salva e poi rilancia subito un test invio.</li>
            </ul>
          </div>
        )}

        {/* Webhook URL (read-only) */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Base webhook URL</Label>
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
          <p className="text-xs text-muted-foreground">
            Il link completo con `secret` lo trovi nella configurazione webhook globale. Qui manteniamo la base tecnica per lo stream {stream}.
          </p>
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* span wrapper: i bottoni disabilitati non emettono eventi mouse */}
                  <span>
                    <Button variant="outline" size="sm" onClick={handleTest} disabled={isTesting || isDirty}>
                      {isTesting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                      Invia Test
                    </Button>
                  </span>
                </TooltipTrigger>
                {isDirty && (
                  <TooltipContent>
                    Salva prima: il test usa la configurazione salvata
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
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

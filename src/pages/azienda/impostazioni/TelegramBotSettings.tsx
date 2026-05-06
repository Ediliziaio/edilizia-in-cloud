/**
 * TelegramBotSettings — MP-CHAN-01
 *
 * Pagina settings per:
 *   1. Configurare bot Telegram aziendale (token + username + webhook secret)
 *   2. Generare codice verifica per collegare il proprio account Telegram
 *   3. Visualizzare stato + utenti collegati
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Bot, ExternalLink, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

interface BotConfig {
  id: string;
  bot_username: string;
  bot_id: number | null;
  webhook_url: string | null;
  enabled: boolean;
  default_persona_key: string;
  max_messages_per_day: number;
}

interface UserMappingRow {
  id: string;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  is_verified: boolean;
  total_messages_received: number;
  total_messages_sent: number;
  last_message_at: string | null;
  active_persona_key: string;
}

export default function TelegramBotSettings() {
  const companyId = useEffectiveCompanyId();
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [mappings, setMappings] = useState<UserMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifyCode, setVerifyCode] = useState<{ code: string; bot_username: string; expires_at: string } | null>(null);

  // Form fields per nuova configurazione
  const [botToken, setBotToken] = useState("");
  const [botUsername, setBotUsername] = useState("");

  useEffect(() => {
    if (!companyId) return;
    void loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data: cfg } = await supabase
        .from("telegram_bot_configs" as never)
        .select("id, bot_username, bot_id, webhook_url, enabled, default_persona_key, max_messages_per_day")
        .eq("company_id", companyId!)
        .maybeSingle();

      setConfig((cfg as unknown as BotConfig) ?? null);

      if (cfg) {
        const { data: maps } = await supabase
          .from("telegram_user_mappings" as never)
          .select("id, telegram_username, telegram_first_name, telegram_last_name, is_verified, total_messages_received, total_messages_sent, last_message_at, active_persona_key")
          .eq("bot_config_id", (cfg as unknown as BotConfig).id)
          .order("last_message_at", { ascending: false, nullsFirst: false });
        setMappings(((maps ?? []) as unknown) as UserMappingRow[]);
      }
    } catch (e) {
      toast.error(`Errore caricamento config: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!companyId || !botToken.trim() || !botUsername.trim()) {
      toast.error("Bot token e username sono obbligatori");
      return;
    }
    setSaving(true);
    try {
      // Genera webhook secret crypto-secure
      const secretBytes = new Uint8Array(24);
      crypto.getRandomValues(secretBytes);
      const webhookSecret = Array.from(secretBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const supabaseUrl = (import.meta as { env: { VITE_SUPABASE_URL: string } }).env.VITE_SUPABASE_URL;
      const webhookUrl = `${supabaseUrl}/functions/v1/telegram-bot-processor`;

      const payload = {
        company_id: companyId,
        bot_token: botToken.trim(),
        bot_username: botUsername.trim().replace(/^@/, ""),
        webhook_url: webhookUrl,
        webhook_secret: webhookSecret,
        enabled: true,
      };

      const { error } = await supabase
        .from("telegram_bot_configs" as never)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(payload as any, { onConflict: "company_id" });

      if (error) throw new Error(error.message);

      // Setta webhook su Telegram
      const setWebhookUrl = `https://api.telegram.org/bot${botToken.trim()}/setWebhook`;
      const wh = await fetch(setWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: webhookSecret,
          allowed_updates: ["message", "callback_query"],
        }),
      });
      const whData = await wh.json();
      if (!whData.ok) {
        toast.warning(`Bot salvato ma webhook setup fallito: ${whData.description ?? "?"}`);
      } else {
        toast.success("Bot configurato e webhook attivo!");
      }

      setBotToken("");
      setBotUsername("");
      void loadConfig();
    } catch (e) {
      toast.error(`Errore salvataggio: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const generateCode = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("telegram_generate_verification_code");
      if (error) throw new Error(error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any;
      if (r?.error) throw new Error(r.error);
      setVerifyCode({
        code: r.code,
        bot_username: r.bot_username,
        expires_at: r.expires_at,
      });
      toast.success("Codice generato. Apri Telegram e segui le istruzioni.");
    } catch (e) {
      toast.error(`Errore generazione codice: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6" />
          Bot Telegram aziendale
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Estendi Silvio su Telegram per chattare con l'AI da qualsiasi dispositivo (gratis, no costi infrastruttura).
        </p>
      </div>

      {!config ? (
        <Card>
          <CardHeader>
            <CardTitle>Configurazione iniziale</CardTitle>
            <CardDescription>
              Crea il bot via{" "}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1 hover:underline"
              >
                @BotFather <ExternalLink className="h-3 w-3" />
              </a>{" "}
              poi incolla qui token e username.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTitle>Procedura BotFather</AlertTitle>
              <AlertDescription className="text-xs space-y-1 mt-2">
                <p>1. Apri Telegram, cerca <code className="bg-muted px-1">@BotFather</code></p>
                <p>2. Invia <code className="bg-muted px-1">/newbot</code> e segui le istruzioni</p>
                <p>3. Copia il token e l'username del bot qui sotto</p>
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="bot-token">Bot Token</Label>
              <Input
                id="bot-token"
                type="password"
                placeholder="123456789:AABBccDDeeFFggHHiiJJ..."
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bot-username">Bot Username (senza @)</Label>
              <Input
                id="bot-username"
                placeholder="ediliziacloud_bot"
                value={botUsername}
                onChange={(e) => setBotUsername(e.target.value.replace(/^@/, ""))}
              />
            </div>
            <Button onClick={saveConfig} disabled={saving || !botToken || !botUsername}>
              {saving ? "Configurazione…" : "Configura bot e attiva webhook"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Bot @{config.bot_username}</CardTitle>
                  <CardDescription>
                    {config.enabled ? "Attivo" : "Disabilitato"} · Persona default:{" "}
                    <code className="bg-muted px-1">{config.default_persona_key}</code>
                  </CardDescription>
                </div>
                <a
                  href={`https://t.me/${config.bot_username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
                >
                  Apri in Telegram <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Bot abilitato</span>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={async (v) => {
                    await supabase
                      .from("telegram_bot_configs" as never)
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      .update({ enabled: v } as any)
                      .eq("id", config.id);
                    void loadConfig();
                  }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Limite messaggi/giorno: {config.max_messages_per_day}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Collega il tuo account</CardTitle>
              <CardDescription>
                Genera un codice di verifica per collegare il tuo account Telegram a EiC.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!verifyCode ? (
                <Button onClick={generateCode}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Genera codice di verifica
                </Button>
              ) : (
                <Alert>
                  <Send className="h-4 w-4" />
                  <AlertTitle>Codice: {verifyCode.code}</AlertTitle>
                  <AlertDescription className="space-y-2 mt-2">
                    <p>
                      Apri Telegram, cerca{" "}
                      <a
                        href={`https://t.me/${verifyCode.bot_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        @{verifyCode.bot_username}
                      </a>
                      {" "}e invia:
                    </p>
                    <code className="block bg-muted p-2 rounded font-mono text-xs">
                      /verify {verifyCode.code}
                    </code>
                    <p className="text-xs text-muted-foreground">
                      Il codice scade alle{" "}
                      {new Date(verifyCode.expires_at).toLocaleTimeString("it-IT", {
                        hour: "2-digit", minute: "2-digit",
                      })}
                      .
                    </p>
                    <Button size="sm" variant="outline" onClick={generateCode}>
                      Genera nuovo codice
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Utenti collegati ({mappings.filter((m) => m.is_verified).length})</CardTitle>
            </CardHeader>
            <CardContent>
              {mappings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun utente ancora collegato.</p>
              ) : (
                <div className="space-y-2">
                  {mappings.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded border p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {m.telegram_first_name} {m.telegram_last_name}{" "}
                          {m.telegram_username && (
                            <span className="text-muted-foreground">@{m.telegram_username}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {m.is_verified ? "✅ Verificato" : "⏳ In attesa"} ·{" "}
                          Persona: <code className="bg-muted px-1">{m.active_persona_key}</code> ·{" "}
                          {m.total_messages_received} msg ricevuti
                        </p>
                      </div>
                      {m.last_message_at && (
                        <span className="text-xs text-muted-foreground">
                          Ultimo: {new Date(m.last_message_at).toLocaleDateString("it-IT")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

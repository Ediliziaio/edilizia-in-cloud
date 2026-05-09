/**
 * PublicChatbotSettings — pagina admin per configurare il chatbot pubblico
 *
 * Mostra:
 *  - Token widget pubblico (con copy)
 *  - Snippet HTML embed pronto
 *  - Settings: enabled, welcome message, primary color, bot name
 *  - Stats sessioni recenti (count, qualified, abandoned)
 *  - Live preview con <PublicChatWidget>
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, MessageCircle, RefreshCw } from "lucide-react";
import { PublicChatWidget } from "@/components/public-chat/PublicChatWidget";

interface ChatbotSettings {
  company_id: string;
  enabled: boolean;
  welcome_message: string;
  primary_color: string;
  bot_name: string;
  vertical_key: string | null;
  ai_persona: string;
  collect_phone_required: boolean;
  collect_email_required: boolean;
  auto_handoff_after_messages: number;
  daily_session_limit: number;
  rate_limit_per_minute: number;
  public_widget_token: string;
}

interface SessionStats {
  total: number;
  qualified: number;
  abandoned: number;
  active: number;
}

export function PublicChatbotSettings() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["public-chatbot-settings", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<ChatbotSettings | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("public_chatbot_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const statsQuery = useQuery({
    queryKey: ["public-chatbot-stats", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<SessionStats> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("public_chat_sessions")
        .select("status")
        .eq("company_id", companyId);
      const sessions = (data ?? []) as Array<{ status: string }>;
      return {
        total: sessions.length,
        qualified: sessions.filter((s) => s.status === "qualified").length,
        abandoned: sessions.filter((s) => s.status === "abandoned").length,
        active: sessions.filter((s) => s.status === "active").length,
      };
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<ChatbotSettings>) => {
      if (!companyId) throw new Error("company_id mancante");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("public_chatbot_settings")
        .upsert({ company_id: companyId, ...patch }, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Impostazioni salvate");
      queryClient.invalidateQueries({ queryKey: ["public-chatbot-settings", companyId] });
    },
    onError: (e) => {
      toast.error("Errore salvataggio", {
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("company_id mancante");
      const newToken = crypto.randomUUID();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("public_chatbot_settings")
        .upsert(
          { company_id: companyId, public_widget_token: newToken },
          { onConflict: "company_id" },
        );
      if (error) throw error;
      return newToken;
    },
    onSuccess: () => {
      toast.success("Token rigenerato — aggiorna lo snippet sul sito");
      queryClient.invalidateQueries({ queryKey: ["public-chatbot-settings", companyId] });
    },
  });

  const settings = settingsQuery.data;
  const stats = statsQuery.data;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiato`);
  };

  const embedSnippet = settings
    ? `<!-- Edilizia in Cloud — Public Chat Widget -->
<div id="eic-public-chat"></div>
<script type="module">
  import { mount } from 'https://unpkg.com/@eic/public-chat-widget@latest';
  mount({
    target: '#eic-public-chat',
    widgetToken: '${settings.public_widget_token}',
  });
</script>`
    : "";

  if (settingsQuery.isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> Sessioni chatbot pubblico
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsQuery.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
                <div className="text-xs text-muted-foreground">Sessioni totali</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-600">{stats?.qualified ?? 0}</div>
                <div className="text-xs text-muted-foreground">Lead qualificati</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{stats?.active ?? 0}</div>
                <div className="text-xs text-muted-foreground">Attive ora</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-muted-foreground">{stats?.abandoned ?? 0}</div>
                <div className="text-xs text-muted-foreground">Abbandonate</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Configurazione widget</span>
            <div className="flex items-center gap-2">
              <Label htmlFor="enabled" className="text-xs">Attivo</Label>
              <Switch
                id="enabled"
                checked={settings?.enabled ?? false}
                onCheckedChange={(checked) => updateMutation.mutate({ enabled: checked })}
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Token + regenerate */}
          <div className="space-y-2">
            <Label className="text-xs">Token widget pubblico</Label>
            <div className="flex gap-2">
              <Input
                value={settings?.public_widget_token ?? ""}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(settings?.public_widget_token ?? "", "Token")}
                disabled={!settings}
              >
                <Copy className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => regenerateTokenMutation.mutate()}
                disabled={regenerateTokenMutation.isPending}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              ⚠ Rigenerare invalida lo snippet sul sito web — devi ricopiarlo.
            </p>
          </div>

          {/* Bot name */}
          <div className="space-y-1.5">
            <Label htmlFor="bot_name" className="text-xs">Nome del bot</Label>
            <Input
              id="bot_name"
              value={settings?.bot_name ?? ""}
              onChange={(e) => updateMutation.mutate({ bot_name: e.target.value })}
              placeholder="Assistente Edile"
            />
          </div>

          {/* Welcome message */}
          <div className="space-y-1.5">
            <Label htmlFor="welcome" className="text-xs">Messaggio di benvenuto</Label>
            <Textarea
              id="welcome"
              value={settings?.welcome_message ?? ""}
              onChange={(e) => updateMutation.mutate({ welcome_message: e.target.value })}
              placeholder="Ciao! Posso aiutarti..."
              rows={2}
            />
          </div>

          {/* Primary color */}
          <div className="space-y-1.5">
            <Label htmlFor="color" className="text-xs">Colore primario</Label>
            <div className="flex gap-2 items-center">
              <Input
                id="color"
                type="color"
                value={settings?.primary_color ?? "#2563EB"}
                onChange={(e) => updateMutation.mutate({ primary_color: e.target.value })}
                className="h-10 w-20 p-1 cursor-pointer"
              />
              <Input
                value={settings?.primary_color ?? "#2563EB"}
                onChange={(e) => updateMutation.mutate({ primary_color: e.target.value })}
                className="font-mono text-sm flex-1"
              />
            </div>
          </div>

          {/* Required fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between border rounded-md p-2">
              <Label className="text-xs">Email obbligatoria</Label>
              <Switch
                checked={settings?.collect_email_required ?? true}
                onCheckedChange={(c) => updateMutation.mutate({ collect_email_required: c })}
              />
            </div>
            <div className="flex items-center justify-between border rounded-md p-2">
              <Label className="text-xs">Telefono obbligatorio</Label>
              <Switch
                checked={settings?.collect_phone_required ?? true}
                onCheckedChange={(c) => updateMutation.mutate({ collect_phone_required: c })}
              />
            </div>
          </div>

          {/* Limits */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Limit sessioni/giorno</Label>
              <Input
                type="number"
                value={settings?.daily_session_limit ?? 100}
                onChange={(e) =>
                  updateMutation.mutate({ daily_session_limit: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Limit msg/min</Label>
              <Input
                type="number"
                value={settings?.rate_limit_per_minute ?? 10}
                onChange={(e) =>
                  updateMutation.mutate({ rate_limit_per_minute: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Handoff dopo N msg</Label>
              <Input
                type="number"
                value={settings?.auto_handoff_after_messages ?? 8}
                onChange={(e) =>
                  updateMutation.mutate({ auto_handoff_after_messages: parseInt(e.target.value) || 0 })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Embed snippet */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Snippet HTML da incollare nel sito</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <pre className="bg-muted/40 rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
            {embedSnippet || "Token non disponibile"}
          </pre>
          <Button
            size="sm"
            onClick={() => copyToClipboard(embedSnippet, "Snippet")}
            disabled={!embedSnippet}
          >
            <Copy className="h-3 w-3 mr-2" />
            Copia snippet
          </Button>
          <p className="text-xs text-muted-foreground">
            Incolla questo snippet poco prima del <code>&lt;/body&gt;</code> nelle pagine del tuo sito web.
          </p>
        </CardContent>
      </Card>

      {/* Preview live */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Preview live</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPreview(!showPreview)}
              disabled={!settings?.enabled || !settings?.public_widget_token}
            >
              {showPreview ? <EyeOff className="h-3 w-3 mr-2" /> : <Eye className="h-3 w-3 mr-2" />}
              {showPreview ? "Nascondi" : "Mostra"} widget
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!settings?.enabled ? (
            <Badge variant="outline">Attiva prima il widget per vedere la preview</Badge>
          ) : !settings.public_widget_token ? (
            <Badge variant="outline">Token mancante</Badge>
          ) : showPreview ? (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                ↓ Il widget appare in basso a destra (FAB) — clicca per aprire la chat
              </p>
              <PublicChatWidget widgetToken={settings.public_widget_token} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Click "Mostra widget" per vederlo live in fondo a destra.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

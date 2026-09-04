import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Copy, CheckCircle2, AlertCircle, Send, Users, Settings2, ArrowUpRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link, useNavigate } from "react-router-dom";

export default function SettingsWhatsAppBot() {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [testNumber, setTestNumber] = useState("");

  const { data: config, isLoading, isError: isConfigError } = useQuery({
    queryKey: ["wa-bot-config", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("messaging_whatsapp_config")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: linkedEmployees = [] } = useQuery({
    queryKey: ["wa-bot-employees", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("employees")
        .select("id, first_name, last_name, phone, phone_whatsapp")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .not("phone_whatsapp", "is", null);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: botStats } = useQuery({
    queryKey: ["wa-bot-stats", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const [todayRes, weekRes] = await Promise.all([
        supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("direction", "inbound")
          .gte("created_at", today),
        supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("direction", "inbound")
          .gte("created_at", weekAgo),
      ]);
      return { today: todayRes.count || 0, week: weekRes.count || 0 };
    },
    enabled: !!companyId,
  });

  const updateConfig = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      if (!companyId || !config?.id) throw new Error("Config non trovata");
      const { error } = await supabase
        .from("messaging_whatsapp_config")
        .update(updates)
        .eq("id", config.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-bot-config", companyId] });
      toast.success("Configurazione salvata");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sendTestMessage = useMutation({
    mutationFn: async () => {
      if (!testNumber.trim()) throw new Error("Inserisci un numero");
      const { data: session } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("whatsapp-send", {
        body: {
          company_id: companyId,
          to: testNumber.replace(/[^0-9]/g, ""),
          type: "text",
          text: "Ciao! Test dal Bot WhatsApp di Edilizia in Cloud.",
        },
        headers: { Authorization: `Bearer ${session.data.session?.access_token}` },
      });
      if (res.error) {
        let errBody: any = null;
        try { const ctx = (res.error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? res.error.message ?? "Errore invio messaggio");
      }
      return res.data;
    },
    onSuccess: () => toast.success("Messaggio di test inviato!"),
    onError: (err: Error) => toast.error(err.message),
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiato!");
    } catch {
      toast.error("Impossibile copiare negli appunti");
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Caricamento...</div>;
  }

  if (isConfigError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" /> WhatsApp Bot AI</h1>
          <p className="text-muted-foreground mt-1">
            Configura il bot AI per ricevere rapportini, DDT e foto dai tuoi operai via WhatsApp.
          </p>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Errore di caricamento</AlertTitle>
          <AlertDescription>Errore nel caricamento della configurazione.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!config?.is_connected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" /> WhatsApp Bot AI</h1>
            <p className="text-muted-foreground mt-1">
            Configura il bot AI per ricevere rapportini, DDT e foto dai tuoi operai via WhatsApp.
          </p>
        </div>
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-lg font-medium">WhatsApp non connesso</p>
            <p className="text-muted-foreground max-w-md mx-auto">
              Prima di abilitare il bot AI, connetti WhatsApp Business dalla pagina
              Integrazioni. Il bot utilizza la stessa connessione WhatsApp.
            </p>
            <Button variant="outline" onClick={() => navigate("/azienda/impostazioni/integrazioni")}>
              Vai a Integrazioni
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6" /> WhatsApp Bot AI
        </h1>
        <p className="text-muted-foreground mt-1">
          Configura il bot AI per ricevere rapportini, DDT e foto dai tuoi operai via WhatsApp.
        </p>
      </div>

      {/* MP-FINAL: deprecation notice */}
      <Alert>
        <ArrowUpRight className="h-4 w-4" />
        <AlertTitle>Versione classica (1 solo numero, solo bot operativo)</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>
            Ora puoi gestire fino a 5 numeri WhatsApp con scopi diversi (assistenza,
            lead, marketing, notifiche) dal nuovo <b>Hub WhatsApp</b>.
          </span>
          <Button asChild variant="outline" size="sm">
            <Link to="/azienda/whatsapp">Vai al nuovo Hub</Link>
          </Button>
        </AlertDescription>
      </Alert>

      {/* Status overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Badge variant={config.bot_enabled ? "default" : "secondary"}>
                {config.bot_enabled ? "Attivo" : "Disattivato"}
              </Badge>
              <span className="text-sm font-medium">Bot AI</span>
            </div>
            <p className="text-2xl font-bold mt-2">{botStats?.today ?? 0}</p>
            <p className="text-xs text-muted-foreground">messaggi oggi</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Operai collegati</span>
            </div>
            <p className="text-2xl font-bold mt-2">{linkedEmployees.length}</p>
            <p className="text-xs text-muted-foreground">con WhatsApp configurato</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Settimana</span>
            </div>
            <p className="text-2xl font-bold mt-2">{botStats?.week ?? 0}</p>
            <p className="text-xs text-muted-foreground">messaggi ultimi 7 giorni</p>
          </CardContent>
        </Card>
      </div>

      {/* Main toggle */}
      <Card>
        <CardHeader>
          <CardTitle>Abilitazione Bot</CardTitle>
          <CardDescription>
            Quando attivo, i messaggi WhatsApp degli operai vengono processati dall'AI per estrarre
            rapportini, DDT, presenze e foto cantiere automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="bot-enabled">Bot AI attivo</Label>
            <Switch
              id="bot-enabled"
              checked={config.bot_enabled ?? false}
              onCheckedChange={(v) => updateConfig.mutate({ bot_enabled: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="ai-auto">Processing AI automatico</Label>
            <Switch
              id="ai-auto"
              checked={config.ai_auto_process ?? true}
              onCheckedChange={(v) => updateConfig.mutate({ ai_auto_process: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Webhook info */}
      <Card>
        <CardHeader>
          <CardTitle>Informazioni Tecniche</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Webhook URL</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input value={webhookUrl} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="ghost" onClick={() => copyToClipboard(webhookUrl)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Phone Number ID</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input value={config.phone_number_id || "N/A"} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="ghost" onClick={() => copyToClipboard(config.phone_number_id || "")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Linked employees */}
      <Card>
        <CardHeader>
          <CardTitle>Operai Collegati</CardTitle>
          <CardDescription>
            Operai con numero WhatsApp configurato. Per aggiungere un operaio, modifica la sua scheda
            in Personale e inserisci il numero WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkedEmployees.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nessun operaio con WhatsApp configurato.
            </p>
          ) : (
            <div className="space-y-2">
              {linkedEmployees.map((emp: any) => (
                <div key={emp.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{emp.first_name} {emp.last_name}</p>
                    <p className="text-xs text-muted-foreground">{emp.phone_whatsapp}</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test message */}
      <Card>
        <CardHeader>
          <CardTitle>Test Connessione</CardTitle>
          <CardDescription>Invia un messaggio di test per verificare il funzionamento.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="+39 333 1234567"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
              className="max-w-xs"
            />
            <Button
              onClick={() => sendTestMessage.mutate()}
              disabled={sendTestMessage.isPending || !testNumber.trim()}
            >
              <Send className="h-4 w-4 mr-2" />
              {sendTestMessage.isPending ? "Invio..." : "Invia Test"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

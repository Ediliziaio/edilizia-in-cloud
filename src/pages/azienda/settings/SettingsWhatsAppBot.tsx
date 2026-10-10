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
import { Copy, CheckCircle2, AlertCircle, Send, Users, Settings2, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "react-router-dom";
import { userErrorMessage } from "@/lib/userErrorMessage";

/**
 * Questa pagina è la versione vecchia del bot (un solo numero, tabella `messaging_whatsapp_config`). Il 09/10/2026 la
 * tabella ha 0 righe in tutto il database e il bot di cantiere non guarda le sue impostazioni: legge
 * `ai_whatsapp_numbers.operational_settings`, che si cambia dalla pagina di ogni numero in WhatsApp → Numeri.
 * La pagina resta (decisione di Florin) ma lo dice, per primo, in ogni suo stato.
 */
function AvvisoVersioneClassica() {
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertTitle>Questa pagina non è più in uso</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          È la versione vecchia del bot, con un solo numero: le sue impostazioni non comandano il bot di cantiere. Numeri e
          bot di WhatsApp si gestiscono ora in <b>WhatsApp → Numeri</b>.
        </span>
        <Button asChild variant="outline" size="sm">
          <Link to="/azienda/whatsapp">Apri WhatsApp</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default function SettingsWhatsAppBot() {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const queryClient = useQueryClient();
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
    onError: (err: Error) => toast.error(userErrorMessage(err, "Non sono riuscito a salvare. Riprova.")),
  });

  const sendTestMessage = useMutation({
    mutationFn: async () => {
      if (!testNumber.trim()) throw new Error("Scrivi un numero di telefono");
      const { data: session } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("whatsapp-send", {
        body: {
          company_id: companyId,
          to: testNumber.replace(/[^0-9]/g, ""),
          type: "text",
          text: "Ciao! Questo è un messaggio di prova da Edilizia in Cloud.",
        },
        headers: { Authorization: `Bearer ${session.data.session?.access_token}` },
      });
      if (res.error) {
        let errBody: any = null;
        try { const ctx = (res.error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? res.error.message ?? "Messaggio non inviato");
      }
      return res.data;
    },
    onSuccess: () => toast.success("Messaggio di prova inviato"),
    onError: (err: Error) => toast.error(userErrorMessage(err, "Non sono riuscito a mandare il messaggio. Riprova.")),
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiato!");
    } catch {
      toast.error("Non sono riuscito a copiare. Selezionalo e copialo a mano.");
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Caricamento…</div>;
  }

  if (isConfigError) {
    return (
      <div className="space-y-6">
        <AvvisoVersioneClassica />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Non riesco a leggere i dati</AlertTitle>
          <AlertDescription>Ricarica la pagina tra poco.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!config?.is_connected) {
    return (
      <div className="space-y-6">
        <AvvisoVersioneClassica />
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-lg font-medium">Nessun collegamento WhatsApp in questa pagina</p>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              I numeri si collegano e si controllano da WhatsApp → Numeri; lo stato lo vedi anche in Integrazioni.
            </p>
            <Button asChild variant="outline">
              <Link to="/azienda/impostazioni/integrazioni">Vai a Integrazioni</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  return (
    <div className="space-y-6">
      <AvvisoVersioneClassica />

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
          <CardTitle>Attivazione del bot</CardTitle>
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
            <Label htmlFor="ai-auto">Elaborazione automatica con l'AI</Label>
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
          <CardTitle>Dati tecnici</CardTitle>
          <CardDescription>Servono a chi collega il numero nel pannello di Meta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Indirizzo che riceve i messaggi (webhook)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input value={webhookUrl} readOnly aria-label="Indirizzo che riceve i messaggi" className="font-mono text-xs" />
              <Button size="icon" variant="ghost" onClick={() => copyToClipboard(webhookUrl)} aria-label="Copia l'indirizzo">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Codice del numero in Meta (Phone Number ID)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input value={config.phone_number_id || "Non disponibile"} readOnly aria-label="Codice del numero in Meta" className="font-mono text-xs" />
              <Button size="icon" variant="ghost" onClick={() => copyToClipboard(config.phone_number_id || "")} aria-label="Copia il codice del numero">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Linked employees */}
      <Card>
        <CardHeader>
          <CardTitle>Operai collegati</CardTitle>
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
          <CardTitle>Messaggio di prova</CardTitle>
          <CardDescription>Manda un messaggio a un numero per controllare che WhatsApp funzioni.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="+39 333 1234567"
              aria-label="Numero a cui mandare la prova"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
              className="max-w-xs"
            />
            <Button
              onClick={() => sendTestMessage.mutate()}
              disabled={sendTestMessage.isPending || !testNumber.trim()}
            >
              <Send className="h-4 w-4 mr-2" />
              {sendTestMessage.isPending ? "Invio…" : "Invia la prova"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

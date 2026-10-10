import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Trash2, Star, CheckCircle2, XCircle, RefreshCw, Plug, ScrollText, ExternalLink, AlertTriangle } from "lucide-react";

const PROVIDERS = [
  { value: "fattureincloud", label: "Fatture in Cloud", authType: "oauth", icon: "🇮🇹" },
  { value: "fattura24", label: "Fattura24", authType: "api_key", icon: "📄" },
  { value: "aruba", label: "Aruba Fatturazione", authType: "userpass", icon: "🅰️" },
  { value: "invoicetronic", label: "Invoicetronic", authType: "api_key", icon: "⚡" },
  { value: "itala", label: "ITALA (SDI)", authType: "bearer", icon: "🧾" },
  { value: "acube", label: "A-Cube (SDI) · beta", authType: "userpass", icon: "🧊" },
] as const;

// Provider che importano anche le fatture RICEVUTE (il "cassetto fiscale" di fatto:
// le fatture del cassetto AdE passano tutte dallo SDI, e questi provider le espongono).
const IMPORTA_RICEVUTE = new Set(["fattureincloud", "aruba"]);

// Istruzioni per-provider: dove l'azienda trova la PROPRIA chiave/token (ognuna
// usa le proprie credenziali, nessuna app a livello piattaforma serve qui).
const PROVIDER_HELP: Record<string, { text: string; link: string; linkLabel: string; warn?: string }> = {
  fattura24: {
    text: "Nel tuo account Fattura24: Configurazione → App e servizi esterni → API (gruppo \"E-commerce e API\") → imposta Attivo su SÌ e premi GENERA, poi incolla qui la Key.",
    link: "https://www.fattura24.com/api/introduzione/",
    linkLabel: "Guida API Fattura24",
  },
  invoicetronic: {
    text: "Registrati su Invoicetronic → Dashboard → API keys → copia la chiave di PRODUZIONE (inizia con ik_live_). La ik_test_ è solo per la sandbox.",
    link: "https://invoicetronic.com/en/docs/prerequisites/",
    linkLabel: "Doc Invoicetronic",
  },
  aruba: {
    text: "Usa le credenziali del tuo account Aruba Fatturazione Elettronica (lo stesso username e password con cui accedi al pannello). EiC legge le fatture EMESSE e RICEVUTE (cassetto SDI) e lo stato SDI — non lo stato di pagamento. Nota: la lista Aruba non include gli importi delle ricevute (sono nell'XML).",
    link: "https://fatturazioneelettronica.aruba.it/apidoc/docs.html",
    linkLabel: "Doc API Aruba",
    warn: "Servono le credenziali di un utente abilitato ai Web Service Aruba: verifica nel pannello Aruba che l'accesso alle API sia attivo.",
  },
  itala: {
    text: "Registrati su fattura-elettronica-api.it (intermediario SDI accreditato) e usa come chiave il Bearer token del tuo account. Importa fatture e stato SDI (non lo stato di pagamento).",
    link: "https://www.fattura-elettronica-api.it/documentazione/",
    linkLabel: "Doc ITALA REST 2.0",
  },
  acube: {
    text: "Beta: collega il tuo account A-Cube (acubeapi.com) con email e password. Importa fatture e stato SDI (campo 'marking'). Numero/data/importi sono best-effort, in validazione su account reale.",
    link: "https://docs.acubeapi.com/",
    linkLabel: "Doc A-Cube",
    warn: "Provider in validazione (beta): verifica i dati importati prima di farci affidamento.",
  },
};

/** Il testo di un errore da mostrare: quello che l'errore dice se è già una frase, altrimenti la traduzione. */
const messaggioErrore = (e: unknown): string =>
  e instanceof Error && e.message ? e.message : userErrorMessage(e, "Operazione non riuscita. Riprova tra poco.");

/* ─── Main page ──────────────────────────────────────────────── */
export default function SettingsBilling() {
  const { effectiveCompany } = useAuth();
  const { isNative } = useBillingMode();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  // Integrations
  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["billing_integrations", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_integrations")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Sync logs
  const { data: syncLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["billing_sync_log", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_sync_log")
        .select("*")
        .eq("company_id", companyId!)
        .order("executed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Add integration form
  const [showAdd, setShowAdd] = useState(false);
  const [newProvider, setNewProvider] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [newUsername, setNewUsername] = useState(""); // Aruba (e futuri provider user/password)
  const [newPassword, setNewPassword] = useState("");
  const [testing, setTesting] = useState<string | null>(null);

  // ── OAuth2 Fatture in Cloud: apre il popup di autorizzazione ──────────────
  const connectFic = async () => {
    const { data, error } = await supabase.functions.invoke("billing-connect", {
      body: { action: "get_fic_auth_url", company_id: companyId },
    });
    const res = data as { auth_url?: string; error?: string } | null;
    if (error || !res?.auth_url) {
      // Se manca la configurazione della piattaforma l'azienda non può farci niente: si dice a chi rivolgersi,
      // senza i nomi tecnici dei segreti.
      throw new Error(res?.error || "Il collegamento con Fatture in Cloud non è pronto: avvisa l'assistenza.");
    }
    const w = 620, h = 760;
    const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
    const popup = window.open(res.auth_url, "fic-oauth", `width=${w},height=${h},left=${left},top=${top}`);
    if (!popup) throw new Error("Popup bloccato dal browser: abilita i popup per questo sito e riprova.");
    popup.focus();
  };

  // Esito dell'OAuth FIC dalla pagina di callback (postMessage).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data as { source?: string; status?: string; message?: string; companyName?: string } | null;
      if (!d || d.source !== "fic-oauth") return;
      if (d.status === "ok") {
        toast.success("Fatture in Cloud collegato", {
          description: d.companyName ? `Account: ${d.companyName}` : undefined,
        });
        queryClient.invalidateQueries({ queryKey: ["billing_integrations"] });
      } else {
        toast.error("Collegamento Fatture in Cloud non riuscito", { description: d.message || undefined });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [queryClient]);

  // Fix #6: Use server-side validation via billing-connect edge function
  const addMutation = useMutation({
    mutationFn: async () => {
      if (newProvider === "fattureincloud") {
        // OAuth2 FIC: apre la finestra di autorizzazione. Il collegamento si
        // completa via postMessage dalla pagina di callback (fic-callback),
        // che scambia il code con il token (azione fic_oauth_callback).
        await connectFic();
        return;
      }
      // API key / bearer / user+password providers — validate server-side
      const cfg = PROVIDERS.find((p) => p.value === newProvider);
      const isUserPass = cfg?.authType === "userpass";
      const action = isUserPass ? `configure_${newProvider}` : "configure_apikey";
      const bodyPayload = isUserPass
        ? (newProvider === "acube"
            ? { email: newUsername.trim(), password: newPassword }
            : { username: newUsername.trim(), password: newPassword })
        : { provider: newProvider, api_key: newApiKey.trim() };
      const { data, error } = await supabase.functions.invoke("billing-connect", {
        body: { action, company_id: companyId, ...bodyPayload },
      });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      if (newProvider === "fattureincloud") {
        toast.info("Autorizza nella finestra di Fatture in Cloud", {
          description: "Completa l'accesso nel popup: al termine l'integrazione si attiva da sola.",
        });
      } else {
        toast.success("Integrazione aggiunta e verificata");
      }
      setShowAdd(false);
      setNewProvider("");
      setNewApiKey("");
      setNewUsername("");
      setNewPassword("");
      queryClient.invalidateQueries({ queryKey: ["billing_integrations"] });
    },
    onError: (e) => toast.error("Operazione non riuscita", { description: messaggioErrore(e) }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (provider: string) => {
      const { data, error } = await supabase.functions.invoke("billing-connect", {
        body: { action: "disconnect", provider },
      });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success("Integrazione rimossa");
      queryClient.invalidateQueries({ queryKey: ["billing_integrations"] });
    },
    onError: (e) => toast.error("Operazione non riuscita", { description: messaggioErrore(e) }),
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (provider: string) => {
      const { data, error } = await supabase.functions.invoke("billing-connect", {
        body: { action: "set_primary", provider },
      });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success("Provider primario aggiornato");
      queryClient.invalidateQueries({ queryKey: ["billing_integrations"] });
    },
    onError: (e) => toast.error("Operazione non riuscita", { description: messaggioErrore(e) }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("billing_integrations").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing_integrations"] });
    },
    onError: (e) => toast.error("Non sono riuscito ad aggiornare lo stato", { description: messaggioErrore(e) }),
  });

  const testConnection = async (integration: any) => {
    setTesting(integration.id);
    try {
      const { data, error } = await supabase.functions.invoke("billing-connect", {
        body: { company_id: companyId, action: "test_connection", provider: integration.provider },
      });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      if (data?.success) {
        toast.success("Connessione OK", { description: `Provider ${integration.provider} funzionante` });
      } else {
        toast.error("Test fallito", { description: data?.error || "Errore sconosciuto" });
      }
    } catch (e) {
      toast.error("Prova non riuscita", { description: messaggioErrore(e) });
    } finally {
      setTesting(null);
    }
  };

  const providerConfig = (p: string) => PROVIDERS.find((pr) => pr.value === p);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* La scelta «Come fatturi?» sta in cima alla pagina (ComeFatturi). Qui il programma collegato: se oggi si
          fattura con Edilizia in Cloud il collegamento resta, e continua a portare le fatture. */}
      {isNative && (
        <Alert>
          <AlertDescription className="text-sm">
            Oggi fatturi con Edilizia in Cloud. Il programma collegato qui sotto resta collegato e continua a portare le
            fatture, ma finché non torni a «Con un altro programma» non le vedrai nell'elenco.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="integrations">
        <TabsList>
          <TabsTrigger value="integrations">Programma collegato</TabsTrigger>
          <TabsTrigger value="logs">Sincronizzazioni</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-4 mt-4">
          {/* ── Cassetto fiscale (fatture ricevute) ─────────────────────
              L'Agenzia delle Entrate non espone API pubbliche per il cassetto
              fiscale (solo SPID/CIE/Entratel). Le stesse fatture però passano
              tutte dallo SDI: collegando un provider che le espone, emesse e
              ricevute arrivano qui in automatico. */}
          <Card className="border-blue-100 bg-blue-50/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                🗄️ Cassetto fiscale — fatture emesse e ricevute
              </CardTitle>
              <CardDescription>
                Le fatture del cassetto fiscale AdE passano tutte dallo SDI. L'Agenzia delle
                Entrate non offre un collegamento diretto (si entra solo con SPID/CIE): collega
                un provider con il bollino <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 text-[10px] align-middle">Emesse + Ricevute</Badge>{" "}
                e le trovi in <strong>Fatturazione → Fatture ricevute</strong>, senza inserirle a mano.
                Con gli altri provider vengono importate solo le emesse.
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Connected providers */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : integrations.length === 0 && !showAdd ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Plug className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Nessun programma collegato.</p>
                <p className="text-sm">Collegane uno per portare qui le fatture, oppure fattura con Edilizia in Cloud.</p>
                <Button className="mt-4" onClick={() => setShowAdd(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Aggiungi provider
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {integrations.map((integ: any) => {
                const cfg = providerConfig(integ.provider);
                return (
                  <Card key={integ.id} className={!integ.is_active ? "opacity-60" : ""}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{cfg?.icon || "🔌"}</span>
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              {cfg?.label || integ.provider}
                              {integ.is_primary && (
                                <Badge variant="secondary" className="text-xs"><Star className="h-3 w-3 mr-1" /> Primario</Badge>
                              )}
                              {integ.is_active ? (
                                <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">Attivo</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">Disattivato</Badge>
                              )}
                              {IMPORTA_RICEVUTE.has(integ.provider) && (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 text-xs">Emesse + Ricevute</Badge>
                              )}
                            </CardTitle>
                            <CardDescription className="text-xs">
                              {integ.company_external_id && `ID: ${integ.company_external_id} · `}
                              Aggiunto {format(new Date(integ.created_at), "dd/MM/yyyy", { locale: it })}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => testConnection(integ)}
                            disabled={testing === integ.id || !integ.is_active}
                          >
                            {testing === integ.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            <span className="ml-1.5">Test</span>
                          </Button>
                          {!integ.is_primary && integ.is_active && (
                            <Button variant="outline" size="sm" onClick={() => setPrimaryMutation.mutate(integ.provider)}>
                              <Star className="h-4 w-4 mr-1" /> Rendi primario
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Collegato prima del 19/09/2026: il permesso di registrare
                          gli incassi non era stato chiesto, «segna pagata» non
                          arriva a Fatture in Cloud finché non si ricollega. */}
                      {integ.provider === "fattureincloud" && integ.is_active && integ.scrittura_incassi_autorizzata === false && (
                        <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40 sm:flex-row sm:items-center sm:justify-between">
                          <p className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            Ricollega Fatture in Cloud per segnare pagate anche lì le fatture che incassi qui.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            onClick={() => connectFic().catch((e: unknown) => toast.error(messaggioErrore(e)))}
                          >
                            Ricollega
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              id={`attivo-${integ.id}`}
                              checked={integ.is_active}
                              onCheckedChange={(v) => toggleActiveMutation.mutate({ id: integ.id, active: v })}
                            />
                            <Label htmlFor={`attivo-${integ.id}`} className="text-sm">Attivo</Label>
                          </div>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-1" /> Rimuovi
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Rimuovere questa integrazione?</AlertDialogTitle>
                              <AlertDialogDescription>Le fatture già sincronizzate non verranno eliminate.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(integ.provider)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Rimuovi</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {!showAdd && (
                <Button variant="outline" onClick={() => setShowAdd(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Aggiungi provider
                </Button>
              )}
            </>
          )}

          {/* Add new */}
          {showAdd && (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">Nuovo provider</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Provider</Label>
                  <Select value={newProvider} onValueChange={setNewProvider}>
                    <SelectTrigger><SelectValue placeholder="Seleziona provider..." /></SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.icon} {p.label}{IMPORTA_RICEVUTE.has(p.value) ? " · Emesse + Ricevute" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {newProvider && newProvider !== "fattureincloud" && (
                  <div className="space-y-2">
                    {PROVIDER_HELP[newProvider] && (
                      <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground space-y-1.5">
                        <p className="font-medium text-foreground">Dove trovo la chiave</p>
                        <p>{PROVIDER_HELP[newProvider].text}</p>
                        {PROVIDER_HELP[newProvider].warn && (
                          <p className="text-amber-600">⚠ {PROVIDER_HELP[newProvider].warn}</p>
                        )}
                        <a
                          href={PROVIDER_HELP[newProvider].link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {PROVIDER_HELP[newProvider].linkLabel} <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {providerConfig(newProvider)?.authType === "userpass" ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label>{newProvider === "acube" ? "Email A-Cube" : "Username Aruba"}</Label>
                          <Input
                            type={newProvider === "acube" ? "email" : "text"}
                            autoComplete="off"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            placeholder={newProvider === "acube" ? "Email dell'account A-Cube" : "Username account Aruba FE"}
                          />
                        </div>
                        <div>
                          <Label>Password</Label>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder={newProvider === "acube" ? "Password account A-Cube" : "Password account Aruba FE"}
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Label>{newProvider === "itala" ? "Bearer Token" : "API Key"}</Label>
                        <Input
                          type="password"
                          value={newApiKey}
                          onChange={(e) => setNewApiKey(e.target.value)}
                          placeholder={newProvider === "itala" ? "Bearer token ITALA" : "Inserisci la chiave API"}
                        />
                      </div>
                    )}
                  </div>
                )}

                {newProvider === "fattureincloud" && (
                  <div className="bg-blue-50 dark:bg-blue-950/40 rounded-md p-3 text-sm text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Collegamento con OAuth</p>
                    <p>
                      Premi <strong>Connetti con OAuth</strong>: si apre la finestra di Fatture in Cloud dove
                      autorizzi l'accesso. Al termine torni qui e l'integrazione si attiva da sola — non serve inserire chiavi.
                    </p>
                    <p className="text-xs">
                      Le fatture emesse su Fatture in Cloud verranno importate e monitorate in EiC (numero, cliente,
                      importi, stato SDI e pagamento). Quando incassi una fattura qui, viene segnata pagata anche su
                      Fatture in Cloud: per questo il collegamento chiede anche il permesso di modificare le fatture.
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={() => addMutation.mutate()}
                    disabled={
                      !newProvider ||
                      (providerConfig(newProvider)?.authType === "userpass"
                        ? (!newUsername || !newPassword)
                        : newProvider !== "fattureincloud" && !newApiKey) ||
                      addMutation.isPending
                    }
                  >
                    {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {newProvider === "fattureincloud" ? "Connetti con OAuth" : "Salva"}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowAdd(false); setNewProvider(""); setNewApiKey(""); }}>
                    Annulla
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ScrollText className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Log sincronizzazione</CardTitle>
              </div>
              <CardDescription>Ultime 50 operazioni di sincronizzazione</CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
                </div>
              ) : syncLogs.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">Nessun log di sincronizzazione.</p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {syncLogs.map((log: any) => (
                    <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg border text-sm">
                      {log.status === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">{log.provider}</Badge>
                          <Badge variant="secondary" className="text-xs">{log.action}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {log.direction === "push" ? "→" : "←"} {log.direction}
                          </span>
                        </div>
                        {log.error_message && (
                          <p className="text-xs text-destructive mt-1 truncate">{log.error_message}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.executed_at), "dd/MM HH:mm", { locale: it })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

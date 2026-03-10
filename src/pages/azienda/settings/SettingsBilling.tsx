import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Trash2, Star, CheckCircle2, XCircle, RefreshCw, Plug, ScrollText } from "lucide-react";

const PROVIDERS = [
  { value: "fattureincloud", label: "Fatture in Cloud", authType: "oauth", icon: "🇮🇹" },
  { value: "fattura24", label: "Fattura24", authType: "api_key", icon: "📄" },
  { value: "aruba", label: "Aruba Fatturazione", authType: "bearer", icon: "🅰️" },
  { value: "invoicetronic", label: "Invoicetronic", authType: "api_key", icon: "⚡" },
] as const;

export default function SettingsBilling() {
  const { effectiveCompany } = useAuth();
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
        .order("created_at", { ascending: false })
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
  const [newCompanyExternalId, setNewCompanyExternalId] = useState("");
  const [testing, setTesting] = useState<string | null>(null);

  // Fix #6: Use server-side validation via billing-connect edge function
  const addMutation = useMutation({
    mutationFn: async () => {
      if (newProvider === "fattureincloud") {
        // OAuth flow — just save minimal record, user will complete OAuth separately
        const { error } = await supabase.from("billing_integrations").insert({
          company_id: companyId!,
          provider: newProvider,
          company_external_id: newCompanyExternalId || null,
          is_active: false, // Not active until OAuth completes
          is_primary: integrations.length === 0,
        } as any);
        if (error) throw error;
        return;
      }
      // API key / bearer providers — validate server-side
      const action = newProvider === "aruba" ? "configure_aruba" : "configure_apikey";
      const bodyPayload = newProvider === "aruba"
        ? { bearer_token: newApiKey }
        : { provider: newProvider, api_key: newApiKey };
      const { data, error } = await supabase.functions.invoke("billing-connect", {
        body: { action, ...bodyPayload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success("Integrazione aggiunta e verificata");
      setShowAdd(false);
      setNewProvider("");
      setNewApiKey("");
      setNewCompanyExternalId("");
      queryClient.invalidateQueries({ queryKey: ["billing_integrations"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (provider: string) => {
      const { data, error } = await supabase.functions.invoke("billing-connect", {
        body: { action: "disconnect", provider },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success("Integrazione rimossa");
      queryClient.invalidateQueries({ queryKey: ["billing_integrations"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (provider: string) => {
      const { data, error } = await supabase.functions.invoke("billing-connect", {
        body: { action: "set_primary", provider },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success("Provider primario aggiornato");
      queryClient.invalidateQueries({ queryKey: ["billing_integrations"] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("billing_integrations").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing_integrations"] });
    },
  });

  const testConnection = async (integration: any) => {
    setTesting(integration.id);
    try {
      const { data, error } = await supabase.functions.invoke("billing-connect", {
        body: { company_id: companyId, action: "test_connection", provider: integration.provider },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success("Connessione OK", { description: `Provider ${integration.provider} funzionante` });
      } else {
        toast.error("Test fallito", { description: data?.error || "Errore sconosciuto" });
      }
    } catch (e) {
      toast.error("Errore test", { description: String(e) });
    } finally {
      setTesting(null);
    }
  };

  const providerConfig = (p: string) => PROVIDERS.find((pr) => pr.value === p);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Plug className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold">Integrazioni Fatturazione</h1>
      </div>

      <Tabs defaultValue="integrations">
        <TabsList>
          <TabsTrigger value="integrations">Provider</TabsTrigger>
          <TabsTrigger value="logs">Log sincronizzazione</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-4 mt-4">
          {/* Connected providers */}
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : integrations.length === 0 && !showAdd ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Plug className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Nessuna integrazione configurata.</p>
                <p className="text-sm">Puoi utilizzare la fatturazione in modalità standalone o connettere un provider.</p>
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
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={integ.is_active}
                              onCheckedChange={(v) => toggleActiveMutation.mutate({ id: integ.id, active: v })}
                            />
                            <Label className="text-sm">Attivo</Label>
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
                          {p.icon} {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {newProvider && newProvider !== "fattureincloud" && (
                  <div>
                    <Label>{newProvider === "aruba" ? "Bearer Token" : "API Key"}</Label>
                    <Input
                      type="password"
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      placeholder={newProvider === "aruba" ? "Token di autenticazione Aruba" : "Inserisci la chiave API"}
                    />
                  </div>
                )}

                {newProvider === "fattureincloud" && (
                  <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground">
                    Per Fatture in Cloud è necessario completare il flusso OAuth.
                    Inserisci l'ID azienda e configura le credenziali OAuth nelle impostazioni avanzate.
                  </div>
                )}

                {newProvider && (
                  <div>
                    <Label>ID Azienda esterno (opzionale)</Label>
                    <Input
                      value={newCompanyExternalId}
                      onChange={(e) => setNewCompanyExternalId(e.target.value)}
                      placeholder="ID dell'azienda sul provider"
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={() => addMutation.mutate()}
                    disabled={!newProvider || (newProvider !== "fattureincloud" && !newApiKey) || addMutation.isPending}
                  >
                    {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Salva
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
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
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
                        {format(new Date(log.created_at), "dd/MM HH:mm", { locale: it })}
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

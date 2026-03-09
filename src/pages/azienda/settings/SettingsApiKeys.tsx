import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Key, Plus, Copy, Trash2, Activity, Shield, Book, Eye, EyeOff, RefreshCw } from "lucide-react";
import { ApiDocsTab } from "@/components/api/ApiDocsTab";
import { ApiUsageChart } from "@/components/api/ApiUsageChart";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  raw_key?: string;
}

const SCOPE_OPTIONS = [
  { value: "read", label: "Lettura", desc: "Accesso in sola lettura" },
  { value: "write", label: "Scrittura", desc: "Creazione e modifica dati" },
  { value: "orders", label: "Ordini", desc: "Gestione ordini" },
  { value: "contacts", label: "Contatti", desc: "Gestione contatti CRM" },
  { value: "webhooks", label: "Webhooks", desc: "Ricezione eventi" },
];

export default function SettingsApiKeys() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("Chiave API");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["read"]);
  const [newKeyRateMin, setNewKeyRateMin] = useState(60);
  const [newKeyRateDay, setNewKeyRateDay] = useState(10000);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["api-keys", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("api-gateway", {
        body: { action: "list_keys" },
      });
      if (error) throw error;
      return data as ApiKey[];
    },
  });

  const createKey = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("api-gateway", {
        body: {
          action: "generate_key",
          name: newKeyName,
          scopes: newKeyScopes,
          rate_limit_per_minute: newKeyRateMin,
          rate_limit_per_day: newKeyRateDay,
        },
      });
      if (error) throw error;
      return data as ApiKey;
    },
    onSuccess: (data) => {
      setGeneratedKey(data.raw_key || null);
      setShowKey(true);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Chiave API creata");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeKey = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await supabase.functions.invoke("api-gateway", {
        body: { action: "revoke_key", key_id: keyId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Chiave revocata");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("Copiata negli appunti");
  };

  const handleCreate = () => {
    setGeneratedKey(null);
    setShowKey(false);
    createKey.mutate();
  };

  const toggleScope = (scope: string) => {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API Platform</h1>
        <p className="text-muted-foreground">Gestisci le chiavi API, monitora l'utilizzo e consulta la documentazione</p>
      </div>

      <Tabs defaultValue="keys" className="space-y-4">
        <TabsList>
          <TabsTrigger value="keys" className="gap-2"><Key className="h-4 w-4" /> Chiavi API</TabsTrigger>
          <TabsTrigger value="usage" className="gap-2"><Activity className="h-4 w-4" /> Utilizzo</TabsTrigger>
          <TabsTrigger value="docs" className="gap-2"><Book className="h-4 w-4" /> Documentazione</TabsTrigger>
        </TabsList>

        {/* KEYS TAB */}
        <TabsContent value="keys" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {keys.filter(k => k.is_active).length} chiav{keys.filter(k => k.is_active).length === 1 ? "e" : "i"} attiv{keys.filter(k => k.is_active).length === 1 ? "a" : "e"}
            </p>
            <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setGeneratedKey(null); setShowKey(false); } }}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> Nuova chiave</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Crea nuova chiave API</DialogTitle>
                </DialogHeader>

                {generatedKey ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                      <p className="text-sm font-medium text-destructive mb-2">⚠️ Copia questa chiave ora — non sarà più visibile!</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-muted p-2 rounded font-mono break-all">
                          {showKey ? generatedKey : "••••••••••••••••••••••••••••••••"}
                        </code>
                        <Button size="icon" variant="ghost" onClick={() => setShowKey(!showKey)}>
                          {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleCopyKey(generatedKey)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => { setCreateOpen(false); setGeneratedKey(null); }}>Chiudi</Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label>Nome</Label>
                      <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Es. Integrazione ERP" />
                    </div>
                    <div>
                      <Label>Permessi (Scopes)</Label>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {SCOPE_OPTIONS.map((s) => (
                          <label key={s.value} className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-muted/50">
                            <Switch checked={newKeyScopes.includes(s.value)} onCheckedChange={() => toggleScope(s.value)} />
                            <div>
                              <p className="text-sm font-medium">{s.label}</p>
                              <p className="text-xs text-muted-foreground">{s.desc}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Rate limit / minuto</Label>
                        <Select value={String(newKeyRateMin)} onValueChange={(v) => setNewKeyRateMin(Number(v))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30">30</SelectItem>
                            <SelectItem value="60">60</SelectItem>
                            <SelectItem value="120">120</SelectItem>
                            <SelectItem value="300">300</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Rate limit / giorno</Label>
                        <Select value={String(newKeyRateDay)} onValueChange={(v) => setNewKeyRateDay(Number(v))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1000">1.000</SelectItem>
                            <SelectItem value="5000">5.000</SelectItem>
                            <SelectItem value="10000">10.000</SelectItem>
                            <SelectItem value="50000">50.000</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCreateOpen(false)}>Annulla</Button>
                      <Button onClick={handleCreate} disabled={createKey.isPending}>
                        {createKey.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                        Genera chiave
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Prefisso</TableHead>
                    <TableHead>Permessi</TableHead>
                    <TableHead>Rate Limit</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Ultimo uso</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Caricamento...</TableCell></TableRow>
                  ) : keys.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nessuna chiave API creata</TableCell></TableRow>
                  ) : keys.map((key) => (
                    <TableRow key={key.id} className={!key.is_active ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{key.key_prefix}...</code></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {key.scopes.map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{key.rate_limit_per_minute}/min · {key.rate_limit_per_day.toLocaleString()}/day</TableCell>
                      <TableCell>
                        <Badge variant={key.is_active ? "default" : "destructive"}>
                          {key.is_active ? "Attiva" : "Revocata"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {key.last_used_at ? format(new Date(key.last_used_at), "dd MMM yyyy HH:mm", { locale: it }) : "Mai"}
                      </TableCell>
                      <TableCell>
                        {key.is_active && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Revocare la chiave "{key.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Questa azione è irreversibile. Tutte le integrazioni che usano questa chiave smetteranno di funzionare.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                <AlertDialogAction onClick={() => revokeKey.mutate(key.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Revoca
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* USAGE TAB */}
        <TabsContent value="usage">
          <ApiUsageChart keys={keys} />
        </TabsContent>

        {/* DOCS TAB */}
        <TabsContent value="docs">
          <ApiDocsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

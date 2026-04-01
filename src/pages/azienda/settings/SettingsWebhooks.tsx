import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useWebhookDeliveries,
  useRetryDelivery,
} from "@/hooks/useWebhooks";
import type { Webhook } from "@/types/webhooks";
import { WEBHOOK_EVENTS } from "@/types/webhooks";
import { supabase } from "@/integrations/supabase/client";
import { formatRelativeTime } from "@/lib/formatters";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Plus, Globe, Pencil, Trash2, Activity, CheckCircle2,
  XCircle, Clock, RotateCcw, RefreshCw, Zap, Loader2,
} from "lucide-react";

// ===== WebhookFormDialog =====
function WebhookFormDialog({
  open,
  onOpenChange,
  webhook,
  companyId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  webhook: Webhook | null;
  companyId: string;
}) {
  const { toast } = useToast();
  const createMutation = useCreateWebhook(companyId);
  const updateMutation = useUpdateWebhook(companyId);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<{ status: string; http_status: number | null } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(webhook?.name || "");
      setUrl(webhook?.url || "");
      setSecret(webhook?.secret || "");
      setSelectedEvents(webhook?.events || []);
      setTestResult(null);
    }
  }, [open, webhook]);

  const allEvents = Object.values(WEBHOOK_EVENTS).flat() as string[];
  const allSelected = allEvents.every((e) => selectedEvents.includes(e));

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const toggleGroup = (events: readonly string[], enabled: boolean) => {
    setSelectedEvents((prev) => {
      const filtered = prev.filter((e) => !(events as readonly string[]).includes(e));
      return enabled ? [...filtered, ...events] : filtered;
    });
  };

  const generateSecret = () => {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    setSecret(Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join(""));
  };

  const handleTest = async () => {
    if (!url) return;
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await supabase.functions.invoke("send-webhook", {
        body: {
          webhook_id: webhook?.id ?? null,
          event_type: "test.ping",
          payload: { message: "Test da Sales OS", timestamp: new Date().toISOString() },
          is_test: true,
          test_url: webhook ? undefined : url,
        },
      });
      setTestResult({ status: data?.status, http_status: data?.http_status });
    } catch {
      setTestResult({ status: "failed", http_status: null });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    if (!name || !url || selectedEvents.length === 0) {
      toast({ title: "Campi obbligatori", description: "Inserisci nome, URL e seleziona almeno un evento.", variant: "destructive" });
      return;
    }
    try {
      if (webhook) {
        await updateMutation.mutateAsync({ id: webhook.id, name, url, secret: secret || null, events: selectedEvents });
      } else {
        await createMutation.mutateAsync({ name, url, secret: secret || null, events: selectedEvents });
      }
      toast({ title: webhook ? "Webhook aggiornato" : "Webhook creato" });
      onOpenChange(false);
    } catch {
      toast({ title: "Errore", description: "Impossibile salvare il webhook.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{webhook ? "Modifica Webhook" : "Crea Webhook"}</DialogTitle>
          <DialogDescription>Configura l'endpoint che riceverà le notifiche degli eventi.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label>Nome webhook *</Label>
            <Input placeholder="Es. Notifica CRM" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label>URL endpoint *</Label>
            <div className="flex gap-2">
              <Input placeholder="https://api.example.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1" />
              <Button variant="outline" size="sm" onClick={handleTest} disabled={!url || testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                <span className="ml-1">Test</span>
              </Button>
            </div>
            {testResult && (
              <div className={`flex items-center gap-2 text-sm ${testResult.status === "success" ? "text-green-600" : "text-destructive"}`}>
                {testResult.status === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {testResult.status === "success"
                  ? `Risposta ricevuta: HTTP ${testResult.http_status}`
                  : `Test fallito${testResult.http_status ? ` (HTTP ${testResult.http_status})` : ""}`}
              </div>
            )}
          </div>

          {/* Secret */}
          <div className="space-y-2">
            <Label>Secret HMAC (opzionale)</Label>
            <div className="flex gap-2">
              <Input placeholder="Signing secret" value={secret} onChange={(e) => setSecret(e.target.value)} className="flex-1 font-mono text-sm" />
              <Button variant="outline" size="sm" onClick={generateSecret}>
                <RefreshCw className="h-4 w-4 mr-1" />Genera
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Se impostato, ogni richiesta includerà l'header X-Webhook-Signature: sha256=…</p>
          </div>

          <Separator />

          {/* Events */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Eventi *</Label>
              <Button variant="ghost" size="sm" onClick={() => toggleGroup(allEvents, !allSelected)}>
                {allSelected ? "Deseleziona tutti" : "Seleziona tutti"}
              </Button>
            </div>
            {Object.entries(WEBHOOK_EVENTS).map(([group, events]) => {
              const groupSelected = events.filter((e) => selectedEvents.includes(e)).length;
              const allGroupSelected = groupSelected === events.length;
              return (
                <div key={group} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={allGroupSelected} onCheckedChange={(v) => toggleGroup(events, !!v)} />
                    <span className="font-medium text-sm">{group}</span>
                    <Badge variant="secondary" className="text-xs">{groupSelected}/{events.length}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1 pl-6">
                    {events.map((evt) => (
                      <div key={evt} className="flex items-center gap-2">
                        <Checkbox checked={selectedEvents.includes(evt)} onCheckedChange={() => toggleEvent(evt)} />
                        <span className="text-sm text-muted-foreground">{evt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
            {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {webhook ? "Salva modifiche" : "Crea webhook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== DeliveriesSheet =====
function DeliveriesSheet({
  open,
  onOpenChange,
  webhook,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  webhook: Webhook | null;
}) {
  const { data: deliveries = [], isLoading } = useWebhookDeliveries(open ? webhook?.id ?? null : null);
  const retryMutation = useRetryDelivery(webhook?.id ?? null);
  const { toast } = useToast();

  const statusConfig: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    success:  { label: "Successo",  className: "text-green-600 bg-green-100",  icon: CheckCircle2 },
    failed:   { label: "Fallito",   className: "text-destructive bg-red-100",  icon: XCircle },
    pending:  { label: "In attesa", className: "text-yellow-600 bg-yellow-100", icon: Clock },
    retrying: { label: "Retry",     className: "text-blue-600 bg-blue-100",    icon: RotateCcw },
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Log Delivery — {webhook?.name}
          </SheetTitle>
          <SheetDescription>Ultimi 100 invii per questo webhook.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nessun delivery trovato.</p>
          ) : (
            deliveries.map((d) => {
              const cfg = statusConfig[d.status] || statusConfig.failed;
              const Icon = cfg.icon;
              return (
                <div key={d.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={cfg.className}>
                        <Icon className="h-3 w-3 mr-1" />{cfg.label}
                      </Badge>
                      <span className="text-sm font-medium">{d.event_type}</span>
                      {d.http_status && <Badge variant="secondary">HTTP {d.http_status}</Badge>}
                      {d.duration_ms != null && <span className="text-xs text-muted-foreground">{d.duration_ms}ms</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatRelativeTime(d.created_at)}</span>
                      {d.status === "failed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await retryMutation.mutateAsync(d.id);
                              toast({ title: "Retry inviato" });
                            } catch {
                              toast({ title: "Errore retry", variant: "destructive" });
                            }
                          }}
                          disabled={retryMutation.isPending}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />Riprova
                        </Button>
                      )}
                    </div>
                  </div>
                  {d.response_body && (
                    <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-24 whitespace-pre-wrap break-all">
                      {d.response_body}
                    </pre>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ===== SettingsWebhooks (main page) =====
export default function SettingsWebhooks() {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id as string | undefined;
  const { toast } = useToast();

  const { data: webhooks = [], isLoading } = useWebhooks(companyId ?? "");
  const deleteMutation = useDeleteWebhook(companyId ?? "");
  const updateMutation = useUpdateWebhook(companyId ?? "");

  if (!companyId) return null;

  const [formOpen, setFormOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [logsWebhook, setLogsWebhook] = useState<Webhook | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  const openEdit = (w: Webhook) => { setEditingWebhook(w); setFormOpen(true); };
  const openCreate = () => { setEditingWebhook(null); setFormOpen(true); };
  const openLogs = (w: Webhook) => { setLogsWebhook(w); setLogsOpen(true); };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Webhook eliminato" });
    } catch {
      toast({ title: "Errore", description: "Impossibile eliminare il webhook.", variant: "destructive" });
    }
  };

  const handleToggleActive = async (w: Webhook) => {
    try {
      await updateMutation.mutateAsync({ id: w.id, is_active: !w.is_active });
    } catch {
      toast({ title: "Errore", description: "Impossibile aggiornare lo stato del webhook.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Webhook</h2>
          <p className="text-muted-foreground">Ricevi notifiche in tempo reale sugli eventi del tuo CRM su URL esterni.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />Crea Webhook
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : webhooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold">Nessun webhook configurato</h3>
            <p className="text-muted-foreground text-sm mb-4">Crea il tuo primo webhook per integrare sistemi esterni.</p>
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Crea Webhook</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {webhooks.map((w) => (
            <Card key={w.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4 min-w-0">
                  <Globe className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{w.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">{w.url}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="secondary">{w.events.length} eventi</Badge>
                      {w.secret && <Badge variant="outline">Firmato</Badge>}
                      <span className="text-xs text-muted-foreground">Creato {formatRelativeTime(w.created_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={w.is_active} onCheckedChange={() => handleToggleActive(w)} />
                  <Button variant="ghost" size="icon" onClick={() => openLogs(w)}><Activity className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(w)}><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Elimina webhook?</AlertDialogTitle>
                        <AlertDialogDescription>Verranno eliminati anche tutti i log di delivery. Questa azione è irreversibile.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(w.id)}>Elimina</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <WebhookFormDialog open={formOpen} onOpenChange={setFormOpen} webhook={editingWebhook} companyId={companyId} />
      <DeliveriesSheet open={logsOpen} onOpenChange={setLogsOpen} webhook={logsWebhook} />
    </div>
  );
}

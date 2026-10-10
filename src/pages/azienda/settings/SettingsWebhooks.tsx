import { useState } from "react";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  AlertTriangle, Webhook as WebhookIcon, ShieldCheck, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { userErrorMessage } from "@/lib/userErrorMessage";

type ValidatedWebhookUrl = { ok: true; url: string } | { ok: false; message: string };

const PRIVATE_HOST_PATTERNS = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
];

function validateWebhookUrl(rawUrl: string): ValidatedWebhookUrl {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: false, message: "Scrivi l'indirizzo a cui mandare l'avviso." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: "L'indirizzo non è valido: deve cominciare con https://" };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  if (parsed.username || parsed.password) {
    return { ok: false, message: "L'indirizzo non può contenere nome utente o password." };
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocalhost)) {
    return { ok: false, message: "L'indirizzo deve cominciare con https:// (http:// va bene solo per provare sul tuo computer)." };
  }
  if (!isLocalhost && (hostname === "localhost" || PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname)))) {
    return { ok: false, message: "Gli indirizzi di reti private o locali non sono consentiti, per sicurezza." };
  }
  if (hostname.endsWith(".local") || hostname === "metadata.google.internal") {
    return { ok: false, message: "Questo indirizzo non è consentito, per sicurezza." };
  }

  return { ok: true, url: parsed.toString() };
}

function sanitizeLogBody(body: string): string {
  return body
    .replace(/(authorization|api[_-]?key|token|secret|password)("?\s*[:=]\s*"?)[^",\s}]+/gi, "$1$2[redacted]")
    .slice(0, 1200);
}

// ===== WebhookFormDialog =====
function WebhookFormDialog({
  open,
  onOpenChange,
  webhook,
  companyId,
  canManage,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  webhook: Webhook | null;
  companyId: string;
  canManage: boolean;
}) {
  const { toast } = useToast();
  const createMutation = useCreateWebhook(companyId);
  const updateMutation = useUpdateWebhook(companyId);

  const [name, setName] = useState(webhook?.name || "");
  const [url, setUrl] = useState(webhook?.url || "");
  const [secret, setSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(webhook?.events || []);
  const [testResult, setTestResult] = useState<{ status: string; http_status: number | null } | null>(null);
  const [testing, setTesting] = useState(false);

  const busy = testing || createMutation.isPending || updateMutation.isPending;
  const dirty = name !== (webhook?.name || "") || url !== (webhook?.url || "") || !!secret ||
    JSON.stringify([...selectedEvents].sort()) !== JSON.stringify([...(webhook?.events || [])].sort());
  const confermaUscita = useSettingsDraftGuard(dirty || busy);

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
    if (busy) return;
    if (!canManage) {
      toast({ title: "Non puoi farlo", description: "Per mandare una prova serve il permesso «Integrazioni & Canali» in modifica.", variant: "destructive" });
      return;
    }
    const validatedUrl = validateWebhookUrl(url);
    if (!validatedUrl.ok) {
      toast({ title: "Indirizzo non valido", description: validatedUrl.message, variant: "destructive" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-webhook", {
        body: {
          webhook_id: webhook?.id ?? null,
          event_type: "test.ping",
          payload: { message: "Prova dal gestionale", timestamp: new Date().toISOString() },
          is_test: true,
          test_url: webhook ? undefined : validatedUrl.url,
        },
      });
      if (error) {
        let message = error.message || "Invio non riuscito";
        try {
          const context: unknown = error.context;
          if (context instanceof Response) {
            const body: unknown = await context.json();
            if (body && typeof body === "object" && "error" in body && typeof body.error === "string") message = body.error;
          }
        } catch { /* Se il corpo non è JSON rimane il messaggio di trasporto. */ }
        throw new Error(message);
      }
      setTestResult({ status: data?.status, http_status: data?.http_status });
    } catch {
      setTestResult({ status: "failed", http_status: null });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    if (busy) return;
    if (!canManage) {
      toast({ title: "Non puoi farlo", description: "Per salvare un webhook serve il permesso «Integrazioni & Canali» in modifica.", variant: "destructive" });
      return;
    }
    const trimmedName = name.trim();
    const normalizedEvents = Array.from(new Set(selectedEvents)).filter((event) => allEvents.includes(event));
    if (!trimmedName || !url || normalizedEvents.length === 0) {
      toast({ title: "Manca qualcosa", description: "Scrivi il nome e l'indirizzo e scegli almeno un evento.", variant: "destructive" });
      return;
    }
    if (trimmedName.length < 3 || trimmedName.length > 100) {
      toast({ title: "Nome non valido", description: "Il nome deve avere da 3 a 100 caratteri.", variant: "destructive" });
      return;
    }
    const validatedUrl = validateWebhookUrl(url);
    if (!validatedUrl.ok) {
      toast({ title: "Indirizzo non valido", description: validatedUrl.message, variant: "destructive" });
      return;
    }

    try {
      // Attesa massima e IP consentiti non si scrivono più da qui (non sono comandi di questa pagina). Le colonne restano com'erano.
      const basePayload = {
        name: trimmedName,
        url: validatedUrl.url,
        events: normalizedEvents,
      };

      if (webhook) {
        await updateMutation.mutateAsync({
          id: webhook.id,
          ...basePayload,
          ...(secret.trim() ? { secret: secret.trim() } : {}),
        });
      } else {
        await createMutation.mutateAsync({ ...basePayload, secret: secret.trim() || null });
      }
      toast({ title: webhook ? "Webhook aggiornato" : "Webhook creato" });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Non sono riuscito a salvare",
        description: userErrorMessage(e, "Non sono riuscito a salvare il webhook. Riprova."),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next || (!busy && confermaUscita())) onOpenChange(next); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{webhook ? "Modifica webhook" : "Nuovo webhook"}</DialogTitle>
          <DialogDescription>
            Scrivi l'indirizzo dell'altro programma che deve ricevere l'avviso e scegli per quali eventi.
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={busy || !canManage} className="min-w-0 space-y-5 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="webhook-name">Nome *</Label>
            <Input id="webhook-name" placeholder="Es. Notifica CRM" value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Indirizzo a cui mandare l'avviso *</Label>
            <div className="flex gap-2">
              <Input id="webhook-url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} className="min-w-0 flex-1" disabled={!canManage} />
              <Button variant="outline" size="sm" onClick={handleTest} disabled={!url || testing || !canManage}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                <span className="ml-1">Prova</span>
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
            <Label htmlFor="webhook-secret">Chiave di firma (facoltativa)</Label>
            <div className="flex gap-2">
              <Input
                id="webhook-secret"
                placeholder={webhook ? "Lascia vuoto per tenere la chiave di prima" : "Chiave di firma"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="flex-1 font-mono text-sm"
                disabled={!canManage}
              />
              <Button variant="outline" size="sm" onClick={generateSecret} disabled={!canManage}>
                <RefreshCw className="h-4 w-4 mr-1" />Genera
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Se la imposti, ogni avviso porta una firma (intestazione X-Webhook-Signature) con cui l'altro programma
              controlla che arriva da noi.
              {webhook ? " La chiave salvata non si vede più." : ""}
            </p>
          </div>

          <Separator />

          {/* Events */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Eventi *</Label>
              <Button variant="ghost" size="sm" onClick={() => toggleGroup(allEvents, !allSelected)} disabled={!canManage}>
                {allSelected ? "Deseleziona tutti" : "Seleziona tutti"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              La scelta si salva, ma oggi nessuno di questi eventi manda un avviso da solo: l'unico che parte è quello
              del pulsante «Prova» qui sopra.
            </p>
            {Object.entries(WEBHOOK_EVENTS).map(([group, events]) => {
              const groupSelected = events.filter((e) => selectedEvents.includes(e)).length;
              const allGroupSelected = groupSelected === events.length;
              return (
                <div key={group} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox aria-label={`Tutti gli eventi ${group}`} checked={allGroupSelected} onCheckedChange={(v) => toggleGroup(events, !!v)} disabled={!canManage} />
                    <span className="font-medium text-sm">{group}</span>
                    <Badge variant="secondary" className="text-xs">{groupSelected}/{events.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                    {events.map((evt) => (
                      <div key={evt} className="flex items-center gap-2">
                        <Checkbox aria-label={`Evento ${evt}`} checked={selectedEvents.includes(evt)} onCheckedChange={() => toggleEvent(evt)} disabled={!canManage} />
                        <span className="min-w-0 break-words text-sm text-muted-foreground">{evt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => { if (confermaUscita()) onOpenChange(false); }}>Annulla</Button>
          <Button onClick={handleSave} disabled={!canManage || busy || !name.trim() || !url.trim() || selectedEvents.length === 0}>
            {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {webhook ? "Salva modifiche" : "Crea webhook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== WebhookHealthIndicator (Circuit Breaker client-side) =====
/**
 * Mostra un alert quando le ultime N delivery sono tutte fallite.
 * Suggerisce auto-disable per evitare spam di chiamate verso un endpoint down.
 */
function WebhookHealthIndicator({
  webhook,
  onDisable,
  canManage,
}: {
  webhook: Webhook;
  onDisable: () => void;
  canManage: boolean;
}) {
  const { data: deliveries = [] } = useWebhookDeliveries(
    webhook.is_active ? webhook.id : null
  );

  // Soglia: se le ultime 10 delivery sono tutte FAILED → circuit breaker warning
  const CIRCUIT_THRESHOLD = 10;
  const recent = deliveries.slice(0, CIRCUIT_THRESHOLD);
  const allFailed = recent.length >= 5 && recent.every((d) => d.status === "failed");

  if (!webhook.is_active || !allFailed) return null;

  return (
    <div className="mx-4 mb-3 p-3 rounded-lg border border-destructive/40 bg-destructive/5 dark:bg-destructive/10">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 text-xs">
          <p className="font-medium text-destructive">
            L'indirizzo sembra non rispondere: {recent.length} invii falliti di fila
          </p>
          <p className="text-destructive/80 mt-0.5">
            Controlla l'indirizzo prima di ripetere gli invii. Puoi mettere in pausa il webhook; gli avvisi
            automatici, comunque, non sono ancora collegati.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-7 text-xs border-destructive/40 hover:bg-destructive/10"
            onClick={onDisable}
            disabled={!canManage}
          >
            Metti in pausa
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===== DeliveriesSheet =====
function DeliveriesSheet({
  open,
  onOpenChange,
  webhook,
  canManage,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  webhook: Webhook | null;
  canManage: boolean;
}) {
  const { data: deliveries = [], isLoading, isError, refetch } = useWebhookDeliveries(open ? webhook?.id ?? null : null);
  const retryMutation = useRetryDelivery(webhook?.id ?? null);
  const { toast } = useToast();
  const [visibleCount, setVisibleCount] = useState(20);

  // KPI successi/fallimenti su deliveries caricate
  const stats = (() => {
    const success = deliveries.filter((d) => d.status === "success").length;
    const failed = deliveries.filter((d) => d.status === "failed").length;
    const total = deliveries.length;
    const successRate = total > 0 ? Math.round((success / total) * 100) : null;
    return { success, failed, total, successRate };
  })();

  const visibleDeliveries = deliveries.slice(0, visibleCount);
  const hasMore = visibleCount < deliveries.length;

  const statusConfig: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    success:  { label: "Successo",  className: "text-green-600 bg-green-100 dark:bg-green-950/30 dark:text-green-400",  icon: CheckCircle2 },
    failed:   { label: "Fallito",   className: "text-destructive bg-red-100 dark:bg-red-950/30 dark:text-red-400",  icon: XCircle },
    pending:  { label: "In attesa", className: "text-yellow-600 bg-yellow-100 dark:bg-yellow-950/30 dark:text-yellow-400", icon: Clock },
    retrying: { label: "Nuovo tentativo", className: "text-blue-600 bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400",    icon: RotateCcw },
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Invii — {webhook?.name}
          </SheetTitle>
          <SheetDescription>Gli ultimi 100 invii di questo webhook.</SheetDescription>
        </SheetHeader>

        {/* KPI statistiche */}
        {!isLoading && !isError && deliveries.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-4 p-3 rounded-lg bg-muted/30 border">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Totali</p>
              <p className="text-lg font-bold tabular-nums">{stats.total}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Successi</p>
              <p className="text-lg font-bold tabular-nums text-emerald-600">{stats.success}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Riusciti</p>
              <p className={cn(
                "text-lg font-bold tabular-nums",
                stats.successRate != null && stats.successRate >= 95 ? "text-emerald-600"
                : stats.successRate != null && stats.successRate >= 80 ? "text-amber-600"
                : "text-destructive"
              )}>
                {stats.successRate != null ? `${stats.successRate}%` : "—"}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {isError ? <Alert variant="destructive"><AlertDescription>Invii non disponibili.<Button size="sm" variant="outline" onClick={() => refetch()}>Riprova invii</Button></AlertDescription></Alert> : isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
          ) : deliveries.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-medium">Nessun invio ancora</p>
              <p className="text-xs text-muted-foreground mt-1">Gli invii compaiono qui dopo la prima prova o il primo avviso mandato.</p>
            </div>
          ) : (
            visibleDeliveries.map((d) => {
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
                              toast({ title: "Nuovo invio riuscito" });
                            } catch (e) {
                              toast({
                                title: "Non sono riuscito a ripetere l'invio",
                                description: userErrorMessage(e, "Riprova tra poco."),
                                variant: "destructive",
                              });
                            }
                          }}
                          disabled={!canManage || retryMutation.isPending}
                        >
                          {retryMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3 mr-1" />
                          )}
                          Riprova
                        </Button>
                      )}
                    </div>
                  </div>
                  {d.response_body && (
                    <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-24 whitespace-pre-wrap break-all">
                      {sanitizeLogBody(d.response_body)}
                      {d.response_body.length > 1200 ? "\n...[troncato]" : ""}
                    </pre>
                  )}
                </div>
              );
            })
          )}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((n) => n + 20)}
              >
                Carica altri {Math.min(20, deliveries.length - visibleCount)}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ===== SettingsWebhooks (main page) =====
export default function SettingsWebhooks() {
  const { effectiveCompany, role } = useAuth();
  const companyId = effectiveCompany?.id;
  const { toast } = useToast();
  const permissions = usePermissions();
  // 13/7/2026: vale anche il permesso "Integrazioni & Canali" (Modifica), non solo il ruolo admin
  const canManageWebhooks = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsIntegrations;

  const [formOpen, setFormOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [logsWebhook, setLogsWebhook] = useState<Webhook | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  const { data: webhooks = [], isLoading, isError, refetch } = useWebhooks(companyId ?? "");
  const deleteMutation = useDeleteWebhook(companyId ?? "");
  const updateMutation = useUpdateWebhook(companyId ?? "");

  if (!companyId) return null;

  const openEdit = (w: Webhook) => { setEditingWebhook(w); setFormOpen(true); };
  const openCreate = () => { setEditingWebhook(null); setFormOpen(true); };
  const openLogs = (w: Webhook) => { setLogsWebhook(w); setLogsOpen(true); };

  const handleDelete = async (id: string) => {
    if (!canManageWebhooks) {
      toast({ title: "Non puoi farlo", description: "Per eliminare un webhook serve il permesso «Integrazioni & Canali» in modifica.", variant: "destructive" });
      return;
    }
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Webhook eliminato" });
    } catch (e) {
      toast({
        title: "Non sono riuscito a eliminarlo",
        description: userErrorMessage(e, "Riprova tra poco."),
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (w: Webhook) => {
    if (!canManageWebhooks) {
      toast({ title: "Non puoi farlo", description: "Per modificare un webhook serve il permesso «Integrazioni & Canali» in modifica.", variant: "destructive" });
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: w.id, is_active: !w.is_active });
    } catch (e) {
      toast({
        title: "Non sono riuscito ad aggiornarlo",
        description: userErrorMessage(e, "Riprova tra poco."),
        variant: "destructive",
      });
    }
  };

  const activeCount = webhooks.filter((w) => w.is_active).length;

  return (
    <div className="space-y-5">
      {/* La verità su cosa fa questa pagina, per prima. `send-webhook` è invocata da due soli posti: il pulsante «Prova»
          qui sotto e il rinvio manuale di un invio. Nessun evento del prodotto — ordine creato, opportunità vinta,
          pagamento ricevuto — la chiama. Chi costruisse un'integrazione sugli eventi sottoscritti resterebbe in
          attesa per sempre, e lo scoprirebbe solo dopo averla scritta. */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <p className="font-medium">Oggi gli avvisi non partono da soli.</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Un webhook è l'indirizzo di un altro programma a cui il gestionale può mandare un avviso quando succede
            qualcosa (un nuovo contatto, un pagamento…). Per ora puoi salvare l'indirizzo, mandare una «Prova» e
            ripetere un invio dal registro: gli avvisi automatici non sono ancora collegati.
          </p>
        </AlertDescription>
      </Alert>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {webhooks.length > 0
            ? <><span className="font-medium text-foreground">{activeCount}</span> attivi su {webhooks.length}</>
            : "Nessun webhook"}
        </p>
        <Button onClick={openCreate} className="h-9 self-start" size="sm" disabled={!canManageWebhooks || isLoading || isError}>
          <Plus className="h-4 w-4 mr-2" />Crea Webhook
        </Button>
      </div>

      {!canManageWebhooks && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            Stai solo consultando: per modificare, mandare prove o ripetere invii serve il permesso «Integrazioni &amp;
            Canali» in modifica (o essere amministratore).
          </AlertDescription>
        </Alert>
      )}

      {isError ? <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-2">Impossibile caricare i webhook. L'elenco non è vuoto: non è disponibile.<Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button></AlertDescription></Alert> : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : webhooks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-14">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <WebhookIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Nessun webhook configurato</h3>
            <p className="text-muted-foreground text-sm mb-4 text-center max-w-md">
              Puoi salvare un indirizzo e provarlo; l'invio automatico degli avvisi non è ancora collegato.
            </p>
            <Button onClick={openCreate} disabled={!canManageWebhooks}><Plus className="h-4 w-4 mr-2" />Crea il primo webhook</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {webhooks.map((w) => {
              // Colore border-l: verde se attivo, grigio se spento
              const borderColor = w.is_active ? "border-l-emerald-500" : "border-l-slate-300";
              const hasFailures = (w.consecutive_failures ?? 0) > 0;
              return (
                <Card key={w.id} className={cn("overflow-hidden border-l-4 transition-colors", borderColor)}>
                  <WebhookHealthIndicator
                    webhook={w}
                    onDisable={() => handleToggleActive(w)}
                    canManage={canManageWebhooks}
                  />
                  <CardContent className="flex flex-col items-stretch justify-between py-4 gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                        w.is_active ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-muted"
                      )}>
                        <Globe className={cn(
                          "h-4 w-4",
                          w.is_active ? "text-emerald-600" : "text-muted-foreground"
                        )} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate">{w.name}</h3>
                          {!w.is_active && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">In pausa</Badge>
                          )}
                          {hasFailures && (
                            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                              {w.consecutive_failures} errori
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate font-mono">{w.url}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Zap className="h-2.5 w-2.5" /> {w.events.length} event{w.events.length === 1 ? "o" : "i"}
                          </Badge>
                          {w.secret && (
                            <Badge variant="outline" className="text-[10px] gap-1 text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
                              <ShieldCheck className="h-2.5 w-2.5" /> Con firma
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">Creato {formatRelativeTime(w.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1 shrink-0">
                      <Switch
                        checked={w.is_active}
                        aria-label={`Attiva il webhook ${w.name}`}
                        onCheckedChange={() => handleToggleActive(w)}
                        disabled={!canManageWebhooks || updateMutation.isPending}
                      />
                      <Button variant="ghost" size="icon" onClick={() => openLogs(w)} title="Invii" aria-label={`Invii di ${w.name}`} className="h-11 w-11 sm:h-8 sm:w-8">
                        <Activity className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(w)} title="Modifica" aria-label={`Modifica ${w.name}`} className="h-11 w-11 sm:h-8 sm:w-8" disabled={!canManageWebhooks}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Elimina" aria-label={`Elimina ${w.name}`} className="h-11 w-11 sm:h-8 sm:w-8 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={!canManageWebhooks}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare il webhook «{w.name}»?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Sparisce anche il registro dei suoi invii. Non verrà più mandato nessun avviso a{" "}
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">{w.url}</code>. Non si può annullare.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(w.id)}
                              disabled={deleteMutation.isPending}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {deleteMutation.isPending ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Elimino…</>
                              ) : "Elimina"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {formOpen && <WebhookFormDialog key={editingWebhook?.id ?? "new"} open onOpenChange={setFormOpen} webhook={editingWebhook} companyId={companyId} canManage={canManageWebhooks} />}
      {logsOpen && <DeliveriesSheet key={logsWebhook?.id} open onOpenChange={setLogsOpen} webhook={logsWebhook} canManage={canManageWebhooks} />}
    </div>
  );
}

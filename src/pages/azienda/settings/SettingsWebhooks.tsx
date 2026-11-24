import {InboundAutomationWebhooks} from '@/components/settings/InboundAutomationWebhooks';
import { useEffect, useState } from "react";
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
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
      toast({ title: t("Non puoi farlo"), description: t("Per mandare una prova serve il permesso «Integrazioni & Canali» in modifica."), variant: "destructive" });
      return;
    }
    const validatedUrl = validateWebhookUrl(url);
    if (validatedUrl.ok === false) {
      toast({ title: t("Indirizzo non valido"), description: t(validatedUrl.message), variant: "destructive" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-webhook", {
        body: {
          webhook_id: webhook?.id ?? null,
          company_id: companyId,
          event_type: "test.ping",
          payload: { message: "Prova dal gestionale", timestamp: new Date().toISOString() },
          is_test: true,
          test_url: webhook ? undefined : validatedUrl.url,
          test_secret: webhook ? undefined : secret.trim() || undefined,
        },
      });
      if (error) {
        let message = error.message || t("Invio non riuscito");
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
      toast({ title: t("Non puoi farlo"), description: t("Per salvare un webhook serve il permesso «Integrazioni & Canali» in modifica."), variant: "destructive" });
      return;
    }
    const trimmedName = name.trim();
    const normalizedEvents = Array.from(new Set(selectedEvents)).filter((event) => allEvents.includes(event));
    if (!trimmedName || !url || normalizedEvents.length === 0) {
      toast({ title: t("Manca qualcosa"), description: t("Scrivi il nome e l'indirizzo e scegli almeno un evento."), variant: "destructive" });
      return;
    }
    if (trimmedName.length < 3 || trimmedName.length > 100) {
      toast({ title: t("Nome non valido"), description: t("Il nome deve avere da 3 a 100 caratteri."), variant: "destructive" });
      return;
    }
    const validatedUrl = validateWebhookUrl(url);
    if (validatedUrl.ok === false) {
      toast({ title: t("Indirizzo non valido"), description: t(validatedUrl.message), variant: "destructive" });
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
      toast({ title: webhook ? t("Webhook aggiornato") : t("Webhook creato") });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: t("Non sono riuscito a salvare"),
        description: userErrorMessage(e, t("Non sono riuscito a salvare il webhook. Riprova.")),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next || (!busy && confermaUscita())) onOpenChange(next); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{webhook ? t("Modifica webhook") : t("Nuovo webhook")}</DialogTitle>
          <DialogDescription>
            {t("Scrivi l'indirizzo dell'altro programma che deve ricevere l'avviso e scegli per quali eventi.")}
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={busy || !canManage} className="min-w-0 space-y-5 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="webhook-name">{t("Nome *")}</Label>
            <Input id="webhook-name" placeholder={t("Es. Notifica CRM")} value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="webhook-url">{t("Indirizzo a cui mandare l'avviso *")}</Label>
            <div className="flex gap-2">
              <Input id="webhook-url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} className="min-w-0 flex-1" disabled={!canManage} />
              <Button variant="outline" size="sm" onClick={handleTest} disabled={!url || testing || !canManage}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                <span className="ml-1">{t("Prova")}</span>
              </Button>
            </div>
            {testResult && (
              <div className={`flex items-center gap-2 text-sm ${testResult.status === "success" ? "text-green-600" : "text-destructive"}`}>
                {testResult.status === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {testResult.status === "success"
                  ? t("Risposta ricevuta: HTTP {http_status}", { http_status: String(testResult.http_status ?? "") })
                  : testResult.http_status ? t("Test fallito (HTTP {http_status})", { http_status: testResult.http_status }) : t("Test fallito")}
              </div>
            )}
          </div>

          {/* Secret */}
          <div className="space-y-2">
            <Label htmlFor="webhook-secret">{t("Chiave di firma (facoltativa)")}</Label>
            <div className="flex gap-2">
              <Input
                id="webhook-secret"
                placeholder={webhook ? t("Lascia vuoto per tenere la chiave di prima") : t("Chiave di firma")}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="flex-1 font-mono text-sm"
                disabled={!canManage}
              />
              <Button variant="outline" size="sm" onClick={generateSecret} disabled={!canManage}>
                <RefreshCw className="h-4 w-4 mr-1" />{t("Genera")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Se la imposti, ogni avviso porta una firma (intestazione X-Webhook-Signature) con cui l'altro programma controlla che arriva da noi.")}
              {webhook ? ` ${t("La chiave salvata non si vede più.")}` : ""}
            </p>
          </div>

          <Separator />

          {/* Events */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("Eventi *")}</Label>
              <Button variant="ghost" size="sm" onClick={() => toggleGroup(allEvents, !allSelected)} disabled={!canManage}>
                {allSelected ? t("Deseleziona tutti") : t("Seleziona tutti")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("La scelta si salva, ma oggi nessuno di questi eventi manda un avviso da solo: l'unico che parte è quello del pulsante «Prova» qui sopra.")}
            </p>
            {Object.entries(WEBHOOK_EVENTS).map(([group, events]) => {
              const groupSelected = events.filter((e) => selectedEvents.includes(e)).length;
              const allGroupSelected = groupSelected === events.length;
              return (
                <div key={group} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox aria-label={t("Tutti gli eventi {group}", { group: String(group ?? "") })} checked={allGroupSelected} onCheckedChange={(v) => toggleGroup(events, !!v)} disabled={!canManage} />
                    <span className="font-medium text-sm">{group}</span>
                    <Badge variant="secondary" className="text-xs">{groupSelected}/{events.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                    {events.map((evt) => (
                      <div key={evt} className="flex items-center gap-2">
                        <Checkbox aria-label={t("Evento {evt}", { evt: String(evt ?? "") })} checked={selectedEvents.includes(evt)} onCheckedChange={() => toggleEvent(evt)} disabled={!canManage} />
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
          <Button variant="outline" disabled={busy} onClick={() => { if (confermaUscita()) onOpenChange(false); }}>{t("Annulla")}</Button>
          <Button onClick={handleSave} disabled={!canManage || busy || !name.trim() || !url.trim() || selectedEvents.length === 0}>
            {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {webhook ? t("Salva modifiche") : t("Crea webhook")}
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
  const t = useT();
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
          <p className="font-medium text-destructive">{t("L'indirizzo sembra non rispondere: {n} invii falliti di fila", { n: recent.length })}</p>
          <p className="text-destructive/80 mt-0.5">
            {t("Controlla l'indirizzo prima di ripetere gli invii. I tentativi sono automatici; dopo troppi fallimenti consecutivi il webhook viene messo in pausa.")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-7 text-xs border-destructive/40 hover:bg-destructive/10"
            onClick={onDisable}
            disabled={!canManage}
          >
            {t("Metti in pausa")}
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
  const t = useT();
  const { data: deliveries = [], isLoading, isError, refetch } = useWebhookDeliveries(open ? webhook?.id ?? null : null, open);
  const retryMutation = useRetryDelivery(webhook?.id ?? null);
  const { toast } = useToast();
  const [visibleCount, setVisibleCount] = useState(20);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [open]);

  // KPI successi/fallimenti su deliveries caricate
  const stats = (() => {
    const success = deliveries.filter((d) => d.status === "success").length;
    const failed = deliveries.filter((d) => d.status === "failed").length;
    const total = deliveries.length;
    const completed = success + failed;
    const successRate = completed > 0 ? Math.round((success / completed) * 100) : null;
    return { success, failed, total, successRate };
  })();

  const visibleDeliveries = deliveries.slice(0, visibleCount);
  const hasMore = visibleCount < deliveries.length;

  const statusConfig: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    success:  { label: t("Successo"),  className: "text-green-600 bg-green-100 dark:bg-green-950/30 dark:text-green-400",  icon: CheckCircle2 },
    failed:   { label: t("Fallito"),   className: "text-destructive bg-red-100 dark:bg-red-950/30 dark:text-red-400",  icon: XCircle },
    pending:  { label: t("In attesa"), className: "text-yellow-600 bg-yellow-100 dark:bg-yellow-950/30 dark:text-yellow-400", icon: Clock },
    retrying: { label: t("Nuovo tentativo"), className: "text-blue-600 bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400",    icon: RotateCcw },
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t("Invii —")} {webhook?.name}
          </SheetTitle>
          <SheetDescription>{t("Gli ultimi 100 invii di questo webhook.")}</SheetDescription>
        </SheetHeader>

        {/* KPI statistiche */}
        {!isLoading && !isError && deliveries.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-4 p-3 rounded-lg bg-muted/30 border">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("Totali")}</p>
              <p className="text-lg font-bold tabular-nums">{stats.total}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("Successi")}</p>
              <p className="text-lg font-bold tabular-nums text-emerald-600">{stats.success}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("Riusciti")}</p>
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
          {isError ? <Alert variant="destructive"><AlertDescription>{t("Invii non disponibili.")}<Button size="sm" variant="outline" onClick={() => refetch()}>{t("Riprova invii")}</Button></AlertDescription></Alert> : isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
          ) : deliveries.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-medium">{t("Nessun invio ancora")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("Qui compaiono gli eventi aziendali. L'esito della Prova resta nel modulo di configurazione.")}</p>
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
                        <Icon className="h-3 w-3 mr-1" />{d.status === "retrying" ? (d.lease_until && new Date(d.lease_until).getTime() > now ? t("Invio in corso") : t("Nuovo tentativo programmato")) : cfg.label}
                      </Badge>
                      <span className="text-sm font-medium">{d.event_type}</span>
                      {d.http_status && <Badge variant="secondary">HTTP {d.http_status}</Badge>}
                      {d.duration_ms != null && <span className="text-xs text-muted-foreground">{t("{duration_ms}ms", { duration_ms: String(d.duration_ms ?? "") })}</span>}
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
                              toast({ title: t("Invio rimesso in coda") });
                            } catch (e) {
                              toast({
                                title: t("Non sono riuscito a ripetere l'invio"),
                                description: userErrorMessage(e, t("Riprova tra poco.")),
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
                          {t("Riprova")}
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
              >{t("Carica altri {valore}", { valore: Math.min(20, deliveries.length - visibleCount) })}</Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ===== SettingsWebhooks (main page) =====
export default function SettingsWebhooks() {
  const t = useT();
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
      toast({ title: t("Non puoi farlo"), description: t("Per eliminare un webhook serve il permesso «Integrazioni & Canali» in modifica."), variant: "destructive" });
      return;
    }
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: t("Webhook eliminato") });
    } catch (e) {
      toast({
        title: t("Non sono riuscito a eliminarlo"),
        description: userErrorMessage(e, t("Riprova tra poco.")),
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (w: Webhook) => {
    if (!canManageWebhooks) {
      toast({ title: t("Non puoi farlo"), description: t("Per modificare un webhook serve il permesso «Integrazioni & Canali» in modifica."), variant: "destructive" });
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: w.id, is_active: !w.is_active });
    } catch (e) {
      toast({
        title: t("Non sono riuscito ad aggiornarlo"),
        description: userErrorMessage(e, t("Riprova tra poco.")),
        variant: "destructive",
      });
    }
  };

  const activeCount = webhooks.filter((w) => w.is_active).length;

  return (
    <div className="space-y-5">
      <InboundAutomationWebhooks companyId={companyId} canManage={canManageWebhooks}/>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <p className="font-medium">{t("Gli eventi scelti vengono inviati automaticamente.")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("Gli avvisi entrano in coda e vengono consegnati agli indirizzi attivi. In caso di errore, il gestionale riprova dopo 5, 15 e 60 minuti. Ogni evento conserva lo stesso identificativo: il servizio ricevente deve usarlo per scartare gli eventi già elaborati. La «Prova» non genera eventi aziendali.")}
          </p>
        </AlertDescription>
      </Alert>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {webhooks.length > 0
            ? <><span className="font-medium text-foreground">{activeCount}</span> {t("attivi su")} {webhooks.length}</>
            : t("Nessun webhook")}
        </p>
        <Button onClick={openCreate} className="h-9 self-start" size="sm" disabled={!canManageWebhooks || isLoading || isError}>
          <Plus className="h-4 w-4 mr-2" />{t("Crea Webhook")}
        </Button>
      </div>

      {!canManageWebhooks && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            {t("Stai solo consultando: per modificare, mandare prove o ripetere invii serve il permesso «Integrazioni & Canali» in modifica (o essere amministratore).")}
          </AlertDescription>
        </Alert>
      )}

      {isError ? <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-2">{t("Impossibile caricare i webhook. L'elenco non è vuoto: non è disponibile.")}<Button size="sm" variant="outline" onClick={() => refetch()}>{t("Riprova")}</Button></AlertDescription></Alert> : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : webhooks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-14">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <WebhookIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">{t("Nessun webhook configurato")}</h3>
            <p className="text-muted-foreground text-sm mb-4 text-center max-w-md">
              {t("Crea un webhook e scegli gli eventi da inviare automaticamente al tuo servizio.")}
            </p>
            <Button onClick={openCreate} disabled={!canManageWebhooks}><Plus className="h-4 w-4 mr-2" />{t("Crea il primo webhook")}</Button>
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
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">{t("In pausa")}</Badge>
                          )}
                          {hasFailures && (
                            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">{t("{n} errori", { n: String(w.consecutive_failures ?? "") })}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate font-mono">{w.url}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Zap className="h-2.5 w-2.5" /> {w.events.length} {t("event")}{w.events.length === 1 ? "o" : "i"}
                          </Badge>
                          {w.secret && (
                            <Badge variant="outline" className="text-[10px] gap-1 text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
                              <ShieldCheck className="h-2.5 w-2.5" /> {t("Con firma")}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">{t("Creato {created_at}", { created_at: formatRelativeTime(w.created_at) })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1 shrink-0">
                      <Switch
                        checked={w.is_active}
                        aria-label={t("Attiva il webhook {name}", { name: String(w.name ?? "") })}
                        onCheckedChange={() => handleToggleActive(w)}
                        disabled={!canManageWebhooks || updateMutation.isPending}
                      />
                      <Button variant="ghost" size="icon" onClick={() => openLogs(w)} title={t("Invii")} aria-label={t("Invii di {name}", { name: String(w.name ?? "") })} className="h-11 w-11 sm:h-8 sm:w-8">
                        <Activity className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(w)} title={t("Modifica")} aria-label={t("Modifica {nome}", { nome: String(w.name ?? "") })} className="h-11 w-11 sm:h-8 sm:w-8" disabled={!canManageWebhooks}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title={t("Elimina")} aria-label={t("Elimina {nome}", { nome: String(w.name ?? "") })} className="h-11 w-11 sm:h-8 sm:w-8 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={!canManageWebhooks}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("Eliminare il webhook «{name}»?", { name: String(w.name ?? "") })}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("Sparisce anche il registro dei suoi invii. Non verrà più mandato nessun avviso a")}{" "}
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">{w.url}</code>{t(". Non si può annullare.")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(w.id)}
                              disabled={deleteMutation.isPending}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {deleteMutation.isPending ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("Elimino…")}</>
                              ) : t("Elimina")}
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

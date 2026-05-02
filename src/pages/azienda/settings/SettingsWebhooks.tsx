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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
  AlertTriangle, Webhook as WebhookIcon, ShieldCheck, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  if (!trimmed) return { ok: false, message: "URL endpoint obbligatorio." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: "Inserisci un URL valido." };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  if (parsed.username || parsed.password) {
    return { ok: false, message: "L'URL non può contenere credenziali." };
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocalhost)) {
    return { ok: false, message: "I webhook devono usare HTTPS, salvo localhost per test locale." };
  }
  if (!isLocalhost && (hostname === "localhost" || PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname)))) {
    return { ok: false, message: "Endpoint su reti private/locali non consentiti per sicurezza." };
  }
  if (hostname.endsWith(".local") || hostname === "metadata.google.internal") {
    return { ok: false, message: "Endpoint locali o metadata non consentiti." };
  }

  return { ok: true, url: parsed.toString() };
}

function parseAllowedIps(raw: string): { ok: true; ips: string[] } | { ok: false; message: string } {
  const ips = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const ipOrCidr = /^(\d{1,3}\.){3}\d{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))?$/;
  const invalid = ips.find((ip) => !ipOrCidr.test(ip) || ip.split("/")[0].split(".").some((part) => Number(part) > 255));
  if (invalid) return { ok: false, message: `IP/CIDR non valido: ${invalid}` };
  return { ok: true, ips: Array.from(new Set(ips)) };
}

function sanitizeLogBody(body: string): string {
  return body
    .replace(/(authorization|api[_-]?key|token|secret|password)(\"?\\s*[:=]\\s*\"?)[^\",\\s}]+/gi, "$1$2[redacted]")
    .slice(0, 1200);
}

function WebhookStatCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  description: string;
  icon: typeof WebhookIcon;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "border-l-primary text-primary",
    success: "border-l-emerald-500 text-emerald-600",
    warning: "border-l-amber-500 text-amber-600",
    danger: "border-l-destructive text-destructive",
  }[tone];

  return (
    <Card className={cn("border-l-4", toneClass)}>
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Icon className={cn("h-5 w-5", toneClass.split(" ").at(-1))} />
      </CardContent>
    </Card>
  );
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

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [timeoutSec, setTimeoutSec] = useState<number>(15);
  const [allowedIpsText, setAllowedIpsText] = useState<string>("");
  const [testResult, setTestResult] = useState<{ status: string; http_status: number | null } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(webhook?.name || "");
      setUrl(webhook?.url || "");
      setSecret("");
      setSelectedEvents(webhook?.events || []);
      // Campi security (migration 20261024110000)
      setTimeoutSec(webhook?.timeout_seconds ?? 15);
      setAllowedIpsText((webhook?.allowed_ips ?? []).join("\n"));
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
    if (!canManage) {
      toast({ title: "Permessi insufficienti", description: "Solo gli amministratori possono testare webhook.", variant: "destructive" });
      return;
    }
    const validatedUrl = validateWebhookUrl(url);
    if (!validatedUrl.ok) {
      toast({ title: "URL non valido", description: validatedUrl.message, variant: "destructive" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-webhook", {
        body: {
          webhook_id: webhook?.id ?? null,
          event_type: "test.ping",
          payload: { message: "Test da Sales OS", timestamp: new Date().toISOString() },
          is_test: true,
          test_url: webhook ? undefined : validatedUrl.url,
        },
      });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch {}
        throw new Error(errBody?.error ?? error.message ?? "Errore invio webhook");
      }
      setTestResult({ status: data?.status, http_status: data?.http_status });
    } catch {
      setTestResult({ status: "failed", http_status: null });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    if (!canManage) {
      toast({ title: "Permessi insufficienti", description: "Solo gli amministratori possono salvare webhook.", variant: "destructive" });
      return;
    }
    const trimmedName = name.trim();
    const normalizedEvents = Array.from(new Set(selectedEvents)).filter((event) => allEvents.includes(event));
    if (!trimmedName || !url || normalizedEvents.length === 0) {
      toast({ title: "Campi obbligatori", description: "Inserisci nome, URL e seleziona almeno un evento.", variant: "destructive" });
      return;
    }
    if (trimmedName.length < 3 || trimmedName.length > 100) {
      toast({ title: "Nome non valido", description: "Il nome deve contenere tra 3 e 100 caratteri.", variant: "destructive" });
      return;
    }
    const validatedUrl = validateWebhookUrl(url);
    if (!validatedUrl.ok) {
      toast({ title: "URL non valido", description: validatedUrl.message, variant: "destructive" });
      return;
    }
    const allowedIps = parseAllowedIps(allowedIpsText);
    if (!allowedIps.ok) {
      toast({ title: "Whitelist IP non valida", description: allowedIps.message, variant: "destructive" });
      return;
    }

    try {
      // Payload esteso con campi security (migration 20261024110000)
      const basePayload = {
        name: trimmedName,
        url: validatedUrl.url,
        events: normalizedEvents,
        timeout_seconds: timeoutSec,
        allowed_ips: allowedIps.ips,
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
        title: "Errore salvataggio webhook",
        description: (e as Error).message || "Impossibile salvare il webhook.",
        variant: "destructive",
      });
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
            <Input placeholder="Es. Notifica CRM" value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label>URL endpoint *</Label>
            <div className="flex gap-2">
              <Input placeholder="https://api.example.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1" disabled={!canManage} />
              <Button variant="outline" size="sm" onClick={handleTest} disabled={!url || testing || !canManage}>
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
              <Input
                placeholder={webhook ? "Lascia vuoto per mantenere il secret esistente" : "Signing secret"}
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
              Se impostato, ogni richiesta includerà l'header X-Webhook-Signature: sha256=…
              {webhook ? " Il secret salvato non viene mostrato di nuovo." : ""}
            </p>
          </div>

          <Separator />

          {/* Advanced security */}
          <details className="rounded-lg border bg-muted/20 overflow-hidden group">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium flex items-center gap-2 hover:bg-muted/40">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              Sicurezza avanzata
              <span className="ml-auto text-xs text-muted-foreground group-open:hidden">Espandi</span>
            </summary>
            <div className="p-3 pt-2 space-y-4 border-t">
              <div className="space-y-2">
                <Label className="text-xs">Timeout richiesta (secondi)</Label>
                <Input
                  type="number"
                  min={3}
                  max={60}
                  value={timeoutSec}
                  onChange={(e) => setTimeoutSec(Math.max(3, Math.min(60, Number(e.target.value) || 15)))}
                  className="w-28"
                  disabled={!canManage}
                />
                <p className="text-[11px] text-muted-foreground">
                  Tempo massimo di attesa risposta dal tuo endpoint. Default 15s, min 3s, max 60s.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">IP/CIDR whitelist (opzionale)</Label>
                <textarea
                  value={allowedIpsText}
                  onChange={(e) => setAllowedIpsText(e.target.value)}
                  placeholder={"# Una riga per IP o range CIDR\n203.0.113.42\n10.0.0.0/24"}
                  className="w-full min-h-[90px] font-mono text-xs rounded-md border border-input bg-background p-2"
                  disabled={!canManage}
                />
                <p className="text-[11px] text-muted-foreground">
                  Se compilata, il tuo endpoint rifiuterà richieste da IP non autorizzati
                  (controllo lato server nell'edge function). Lascia vuoto per nessuna restrizione.
                </p>
              </div>
            </div>
          </details>

          <Separator />

          {/* Events */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Eventi *</Label>
              <Button variant="ghost" size="sm" onClick={() => toggleGroup(allEvents, !allSelected)} disabled={!canManage}>
                {allSelected ? "Deseleziona tutti" : "Seleziona tutti"}
              </Button>
            </div>
            {Object.entries(WEBHOOK_EVENTS).map(([group, events]) => {
              const groupSelected = events.filter((e) => selectedEvents.includes(e)).length;
              const allGroupSelected = groupSelected === events.length;
              return (
                <div key={group} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={allGroupSelected} onCheckedChange={(v) => toggleGroup(events, !!v)} disabled={!canManage} />
                    <span className="font-medium text-sm">{group}</span>
                    <Badge variant="secondary" className="text-xs">{groupSelected}/{events.length}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1 pl-6">
                    {events.map((evt) => (
                      <div key={evt} className="flex items-center gap-2">
                        <Checkbox checked={selectedEvents.includes(evt)} onCheckedChange={() => toggleEvent(evt)} disabled={!canManage} />
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
          <Button onClick={handleSave} disabled={!canManage || createMutation.isPending || updateMutation.isPending}>
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
            Endpoint apparentemente down — {recent.length} fallimenti consecutivi
          </p>
          <p className="text-destructive/80 mt-0.5">
            Gli eventi continuano ad essere inviati. Consigliamo di disabilitare
            temporaneamente il webhook per evitare latenze sul sistema.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-7 text-xs border-destructive/40 hover:bg-destructive/10"
            onClick={onDisable}
            disabled={!canManage}
          >
            Disabilita ora
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
  const { data: deliveries = [], isLoading } = useWebhookDeliveries(open ? webhook?.id ?? null : null);
  const retryMutation = useRetryDelivery(webhook?.id ?? null);
  const { toast } = useToast();
  const [visibleCount, setVisibleCount] = useState(20);

  // Reset paginazione quando si apre sheet nuovo
  useEffect(() => {
    if (open) setVisibleCount(20);
  }, [open, webhook?.id]);

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
    retrying: { label: "Retry",     className: "text-blue-600 bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400",    icon: RotateCcw },
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Log Delivery — {webhook?.name}
          </SheetTitle>
          <SheetDescription>Ultimi 100 invii per questo webhook.</SheetDescription>
        </SheetHeader>

        {/* KPI statistiche */}
        {!isLoading && deliveries.length > 0 && (
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
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Success rate</p>
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
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-medium">Nessun delivery ancora</p>
              <p className="text-xs text-muted-foreground mt-1">I log appariranno qui dopo il primo evento inviato.</p>
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
                              toast({ title: "Retry inviato" });
                            } catch (e) {
                              toast({
                                title: "Errore retry",
                                description: (e as Error).message,
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
  const companyId = (effectiveCompany as any)?.id as string | undefined;
  const { toast } = useToast();
  const canManageWebhooks = role === "company_admin" || role === "super_admin";

  const [formOpen, setFormOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [logsWebhook, setLogsWebhook] = useState<Webhook | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "signed" | "failing">("all");
  const [eventFilter, setEventFilter] = useState("all");

  const { data: webhooks = [], isLoading } = useWebhooks(companyId ?? "");
  const deleteMutation = useDeleteWebhook(companyId ?? "");
  const updateMutation = useUpdateWebhook(companyId ?? "");

  if (!companyId) return null;

  const openEdit = (w: Webhook) => { setEditingWebhook(w); setFormOpen(true); };
  const openCreate = () => { setEditingWebhook(null); setFormOpen(true); };
  const openLogs = (w: Webhook) => { setLogsWebhook(w); setLogsOpen(true); };

  const handleDelete = async (id: string) => {
    if (!canManageWebhooks) {
      toast({ title: "Permessi insufficienti", description: "Solo gli amministratori possono eliminare webhook.", variant: "destructive" });
      return;
    }
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Webhook eliminato" });
    } catch (e) {
      toast({
        title: "Errore eliminazione",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (w: Webhook) => {
    if (!canManageWebhooks) {
      toast({ title: "Permessi insufficienti", description: "Solo gli amministratori possono modificare webhook.", variant: "destructive" });
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: w.id, is_active: !w.is_active });
    } catch (e) {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare lo stato: " + (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const activeCount = webhooks.filter((w) => w.is_active).length;
  const signedCount = webhooks.filter((w) => !!w.secret).length;
  const failingCount = webhooks.filter((w) => (w.consecutive_failures ?? 0) > 0).length;
  const totalEvents = webhooks.reduce((sum, webhook) => sum + (webhook.events?.length ?? 0), 0);
  const allEvents = Object.values(WEBHOOK_EVENTS).flat() as string[];
  const filteredWebhooks = webhooks.filter((webhook) => {
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = !query || [webhook.name, webhook.url, ...(webhook.events ?? [])].join(" ").toLowerCase().includes(query);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && webhook.is_active) ||
      (statusFilter === "paused" && !webhook.is_active) ||
      (statusFilter === "signed" && !!webhook.secret) ||
      (statusFilter === "failing" && (webhook.consecutive_failures ?? 0) > 0);
    const matchesEvent = eventFilter === "all" || webhook.events?.includes(eventFilter);
    return matchesSearch && matchesStatus && matchesEvent;
  });

  return (
    <div className="space-y-5">
      {/* Header standardizzato */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <WebhookIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Webhook</h1>
            <p className="text-sm text-muted-foreground">
              Ricevi notifiche eventi CRM su endpoint esterni
              {webhooks.length > 0 && (
                <> · <span className="font-medium text-foreground">{activeCount}</span> attivi / {webhooks.length} totali</>
              )}
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="h-9" size="sm" disabled={!canManageWebhooks}>
          <Plus className="h-4 w-4 mr-2" />Crea Webhook
        </Button>
      </div>

      {!canManageWebhooks && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            Puoi consultare webhook e log, ma solo un amministratore aziendale può crearli, testarli, modificarli o eliminarli.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <WebhookStatCard label="Attivi" value={activeCount} description="endpoint in consegna" icon={WebhookIcon} tone="success" />
        <WebhookStatCard label="Firmati" value={signedCount} description="con HMAC configurato" icon={ShieldCheck} />
        <WebhookStatCard label="Eventi" value={totalEvents} description="sottoscrizioni totali" icon={Zap} />
        <WebhookStatCard label="Con errori" value={failingCount} description="fallimenti consecutivi" icon={AlertTriangle} tone={failingCount > 0 ? "warning" : "default"} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : webhooks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-14">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <WebhookIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Nessun webhook configurato</h3>
            <p className="text-muted-foreground text-sm mb-4 text-center max-w-md">
              I webhook ti permettono di ricevere notifiche in tempo reale quando
              accadono eventi nel tuo CRM — creazione contatti, opportunità chiuse, ecc.
            </p>
            <Button onClick={openCreate} disabled={!canManageWebhooks}><Plus className="h-4 w-4 mr-2" />Crea il primo webhook</Button>
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="flex flex-col gap-2 xl:flex-row">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Cerca per nome, endpoint o evento..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
            <SelectTrigger className="w-full xl:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="active">Attivi</SelectItem>
              <SelectItem value="paused">In pausa</SelectItem>
              <SelectItem value="signed">Firmati HMAC</SelectItem>
              <SelectItem value="failing">Con errori</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-full xl:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli eventi</SelectItem>
              {allEvents.map((eventName) => (
                <SelectItem key={eventName} value={eventName}>{eventName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredWebhooks.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Search className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="font-medium">Nessun webhook corrisponde ai filtri</p>
              <p className="text-sm text-muted-foreground">Riduci ricerca, stato o filtro evento.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredWebhooks.map((w) => {
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
                  <CardContent className="flex items-center justify-between py-4 gap-4">
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
                              <ShieldCheck className="h-2.5 w-2.5" /> Firmato HMAC
                            </Badge>
                          )}
                          {w.allowed_ips && w.allowed_ips.length > 0 && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              IP allowlist
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">Creato {formatRelativeTime(w.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={w.is_active}
                        onCheckedChange={() => handleToggleActive(w)}
                        disabled={!canManageWebhooks || updateMutation.isPending}
                      />
                      <Button variant="ghost" size="icon" onClick={() => openLogs(w)} title="Log delivery" className="h-8 w-8">
                        <Activity className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(w)} title="Modifica" className="h-8 w-8" disabled={!canManageWebhooks}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Elimina" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={!canManageWebhooks}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Elimina il webhook "{w.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Verranno eliminati anche tutti i log di delivery. Gli eventi futuri non
                              verranno più inviati a <code className="text-xs bg-muted px-1 py-0.5 rounded">{w.url}</code>. Azione irreversibile.
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
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Elimino...</>
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
        )}
        </>
      )}

      <WebhookFormDialog open={formOpen} onOpenChange={setFormOpen} webhook={editingWebhook} companyId={companyId} canManage={canManageWebhooks} />
      <DeliveriesSheet open={logsOpen} onOpenChange={setLogsOpen} webhook={logsWebhook} canManage={canManageWebhooks} />
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  Plus, Zap, TestTube, Loader2, Activity, AlertTriangle, CheckCircle2, ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSuperAdminPermissions } from '@/hooks/useSuperAdminPermissions';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { cn } from '@/lib/utils';

const AVAILABLE_EVENTS = [
  { id: 'company.created', label: 'Nuova azienda registrata' },
  { id: 'company.activated', label: 'Azienda attivata' },
  { id: 'company.suspended', label: 'Azienda sospesa' },
  { id: 'subscription.changed', label: 'Piano cambiato' },
  { id: 'payment.failed', label: 'Pagamento fallito' },
  { id: 'trial.expiring', label: 'Trial in scadenza (7gg)' },
];

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  last_triggered_at: string | null;
  last_status_code: number | null;
  failure_count: number;
}

interface WebhookForm {
  name: string;
  url: string;
  events: string[];
  secret_token: string;
}

const emptyForm: WebhookForm = { name: '', url: '', events: [], secret_token: '' };

/** Valida URL per webhook: deve essere http(s), dominio reale. */
function validateWebhookUrl(raw: string): { ok: boolean; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'URL richiesto' };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'URL non valido' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, error: 'Solo http:// o https://' };
  }
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') {
    return { ok: false, error: 'Dominio non valido' };
  }
  return { ok: true };
}

function WebhookKPIs({ webhooks }: { webhooks: Webhook[] }) {
  const stats = useMemo(() => {
    const total = webhooks.length;
    const active = webhooks.filter((w) => w.is_active).length;
    const failing = webhooks.filter((w) => w.failure_count > 3).length;
    const recent = webhooks.filter((w) => {
      if (!w.last_triggered_at) return false;
      const diffH = (Date.now() - new Date(w.last_triggered_at).getTime()) / 3_600_000;
      return diffH < 24;
    }).length;
    return { total, active, failing, recent };
  }, [webhooks]);

  const cards = [
    {
      icon: Zap,
      label: 'Webhook totali',
      value: stats.total,
      subtitle: `${stats.active} attivi`,
      accent: 'bg-primary/10 text-primary',
    },
    {
      icon: Activity,
      label: 'Chiamati 24h',
      value: stats.recent,
      subtitle: stats.recent > 0 ? 'traffico recente' : 'nessuno',
      accent:
        stats.recent > 0
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-muted text-muted-foreground',
    },
    {
      icon: AlertTriangle,
      label: 'In errore',
      value: stats.failing,
      subtitle: stats.failing > 0 ? '>3 failure streak' : 'nessuno',
      accent:
        stats.failing > 0
          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
          : 'bg-muted text-muted-foreground',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4 flex items-start gap-3">
            <div className={cn('rounded-lg p-2 shrink-0', c.accent)}>
              <c.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide truncate">
                {c.label}
              </p>
              <p className="text-xl font-bold leading-tight mt-0.5">{c.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {c.subtitle}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AdminSettingsWebhooks() {
  const { permissions } = useSuperAdminPermissions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<WebhookForm>(emptyForm);
  const [testingId, setTestingId] = useState<string | null>(null);

  // FIX: reset form quando si apre il dialog (prima restava popolato se una
  // creazione precedente era fallita).
  useEffect(() => {
    if (open) setForm(emptyForm);
  }, [open]);

  const { data: webhooks = [], isLoading } = useQuery<Webhook[]>({
    queryKey: ['platform-webhooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_webhooks' as never)
        .select('*' as never)
        .order('created_at' as never, { ascending: false });
      if (error) throw error;
      return (data ?? []) as Webhook[];
    },
    enabled: permissions.can_manage_admins,
  });

  const urlValidation = useMemo(() => validateWebhookUrl(form.url), [form.url]);
  const canSubmit =
    form.name.trim().length > 0 && urlValidation.ok && form.events.length > 0;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!canSubmit) throw new Error('Compila nome, URL valido e almeno un evento');
      const { error } = await supabase
        .from('platform_webhooks' as never)
        .insert({ ...form } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Webhook creato');
      void qc.invalidateQueries({ queryKey: ['platform-webhooks'] });
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!permissions.can_manage_admins) return <AccessDenied />;

  /**
   * FIX: il fetch di test prima era senza timeout: se l'endpoint era irraggiungibile
   * o rispondeva in 5 minuti, la promise restava hanging e `testingId` non si
   * resettava mai. Ora AbortController con timeout 10s.
   */
  const testWebhook = async (webhook: Webhook) => {
    setTestingId(webhook.id);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': 'test.ping',
        },
        body: JSON.stringify({
          event: 'test.ping',
          timestamp: new Date().toISOString(),
          data: {},
        }),
        signal: controller.signal,
      });
      if (res.ok) toast.success(`Test riuscito — HTTP ${res.status}`);
      else toast.error(`Test fallito — HTTP ${res.status}`);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        toast.error('Timeout dopo 10s — endpoint non risponde');
      } else {
        const err = e instanceof Error ? e : new Error('Errore sconosciuto');
        toast.error(`Errore di rete: ${err.message}`);
      }
    } finally {
      clearTimeout(timeoutId);
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhook Outbound</h1>
          <p className="text-muted-foreground">
            Notifica sistemi esterni sugli eventi della piattaforma
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/impostazioni/webhook-logs">
              Log webhook in entrata
              <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nuovo Webhook
          </Button>
        </div>
      </div>

      {/* KPI */}
      {!isLoading && webhooks.length > 0 && <WebhookKPIs webhooks={webhooks} />}

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : webhooks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center gap-3">
              <Zap className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-muted-foreground">Nessun webhook configurato</p>
              <Button variant="outline" onClick={() => setOpen(true)}>
                Crea il primo
              </Button>
            </CardContent>
          </Card>
        ) : (
          webhooks.map((w) => (
            <Card key={w.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{w.name}</span>
                    {!w.is_active && (
                      <Badge variant="outline" className="text-xs">
                        Disattivo
                      </Badge>
                    )}
                    {w.failure_count > 3 && (
                      <Badge variant="destructive" className="text-xs">
                        {w.failure_count} errori
                      </Badge>
                    )}
                    {w.last_status_code != null && (
                      <Badge
                        variant={w.last_status_code < 300 ? 'secondary' : 'destructive'}
                        className="text-xs"
                      >
                        HTTP {w.last_status_code}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {w.url}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {w.events.map((e) => (
                      <Badge key={e} variant="outline" className="text-xs">
                        {e}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void testWebhook(w)}
                    disabled={testingId === w.id}
                  >
                    {testingId === w.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <TestTube className="h-4 w-4 mr-1" />
                    )}
                    Test
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuovo Webhook</DialogTitle>
            <DialogDescription>
              Riceverai richieste POST con payload JSON per ogni evento selezionato.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="CRM Interno"
              />
            </div>
            <div>
              <Label>URL Endpoint *</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                placeholder="https://crm.esempio.it/webhook"
                className={cn(
                  form.url && !urlValidation.ok &&
                    'border-destructive focus-visible:ring-destructive',
                )}
              />
              {form.url && !urlValidation.ok && urlValidation.error && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {urlValidation.error}
                </p>
              )}
              {form.url && urlValidation.ok && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> URL valido
                </p>
              )}
            </div>
            <div>
              <Label>Secret Token (per validazione firma)</Label>
              <Input
                value={form.secret_token}
                onChange={(e) =>
                  setForm((p) => ({ ...p, secret_token: e.target.value }))
                }
                placeholder="opzionale — HMAC su header X-Webhook-Signature"
                autoComplete="off"
              />
            </div>
            <div>
              <Label>Eventi *</Label>
              <div className="space-y-2 mt-2">
                {AVAILABLE_EVENTS.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-2">
                    <Checkbox
                      id={ev.id}
                      checked={form.events.includes(ev.id)}
                      onCheckedChange={(c) =>
                        setForm((p) => ({
                          ...p,
                          events: c
                            ? [...p.events, ev.id]
                            : p.events.filter((e) => e !== ev.id),
                        }))
                      }
                    />
                    <label htmlFor={ev.id} className="text-sm cursor-pointer">
                      {ev.label}
                    </label>
                  </div>
                ))}
              </div>
              {form.events.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Seleziona almeno un evento
                </p>
              )}
            </div>
            {!canSubmit && form.name.trim() && form.url.trim() && form.events.length > 0 && (
              <Alert>
                <AlertDescription>Completa i campi obbligatori prima di salvare.</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !canSubmit}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Crea Webhook'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

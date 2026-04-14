import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Zap, TestTube, Loader2 } from 'lucide-react';
import { useSuperAdminPermissions } from '@/hooks/useSuperAdminPermissions';
import { AccessDenied } from '@/components/admin/AccessDenied';

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

export default function AdminSettingsWebhooks() {
  const { permissions } = useSuperAdminPermissions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<WebhookForm>(emptyForm);
  const [testingId, setTestingId] = useState<string | null>(null);

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

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.url.trim() || form.events.length === 0)
        throw new Error('Compila nome, URL e seleziona almeno un evento');
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

  const testWebhook = async (webhook: Webhook) => {
    setTestingId(webhook.id);
    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Event': 'test.ping' },
        body: JSON.stringify({ event: 'test.ping', timestamp: new Date().toISOString(), data: {} }),
      });
      if (res.ok) toast.success(`Test riuscito — HTTP ${res.status}`);
      else toast.error(`Test fallito — HTTP ${res.status}`);
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error('Errore sconosciuto');
      toast.error(`Errore di rete: ${err.message}`);
    }
    setTestingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhook Outbound</h1>
          <p className="text-muted-foreground">Notifica sistemi esterni sugli eventi della piattaforma</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuovo Webhook
        </Button>
      </div>

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
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{w.name}</span>
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
                  <p className="text-xs text-muted-foreground font-mono">{w.url}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {w.events.map((e) => (
                      <Badge key={e} variant="outline" className="text-xs">
                        {e}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void testWebhook(w)}
                    disabled={testingId === w.id}
                  >
                    {testingId === w.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4" />
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
              />
            </div>
            <div>
              <Label>Secret Token (per validazione firma)</Label>
              <Input
                value={form.secret_token}
                onChange={(e) => setForm((p) => ({ ...p, secret_token: e.target.value }))}
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crea Webhook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

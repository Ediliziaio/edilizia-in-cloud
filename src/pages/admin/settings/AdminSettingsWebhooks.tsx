/**
 * AdminSettingsWebhooks — webhook in uscita della piattaforma (tabella `platform_webhooks`).
 *
 * ONESTÀ (30/10/2026): nessuno spedisce questi webhook. Nessuna edge function legge `platform_webhooks`,
 * quindi gli eventi elencati non partono mai. La pagina lo dice in alto. Tolti i riquadri «Chiamati 24h» /
 * «In errore» (contavano campi che nessuno scrive) e il pulsante «Test», che chiamava l'indirizzo dal browser:
 * quasi tutti i server rispondono con un blocco CORS, e l'esito sembrava un guasto che non c'era.
 * Si può: creare, attivare/disattivare, eliminare (con conferma). Il segreto si scrive coperto.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  Plus, Zap, Loader2, AlertTriangle, CheckCircle2, ExternalLink, Trash2, Eye, EyeOff, Info,
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
}

/** Le colonne che servono alla pagina: il segreto (secret_token) non arriva al browser. */
const COLONNE = 'id, name, url, events, is_active, created_at';

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

export default function AdminSettingsWebhooks() {
  const { permissions } = useSuperAdminPermissions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<WebhookForm>(emptyForm);
  const [mostraSegreto, setMostraSegreto] = useState(false);
  const [daEliminare, setDaEliminare] = useState<Webhook | null>(null);

  // Il modulo riparte vuoto a ogni apertura (prima restava pieno se una creazione era fallita).
  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setMostraSegreto(false);
    }
  }, [open]);

  const { data: webhooks = [], isLoading, isError, refetch } = useQuery<Webhook[]>({
    queryKey: ['platform-webhooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_webhooks' as never)
        .select(COLONNE as never)
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
      if (!canSubmit) throw new Error('Compila nome, indirizzo valido e almeno un evento');
      const { error } = await supabase
        .from('platform_webhooks' as never)
        .insert({
          name: form.name.trim(),
          url: form.url.trim(),
          events: form.events,
          secret_token: form.secret_token.trim() || null,
        } as never);
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

  const attivaMutation = useMutation({
    mutationFn: async ({ id, attivo }: { id: string; attivo: boolean }) => {
      const { error } = await supabase
        .from('platform_webhooks' as never)
        .update({ is_active: attivo } as never)
        .eq('id' as never, id as never);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.attivo ? 'Webhook attivato' : 'Webhook disattivato');
      void qc.invalidateQueries({ queryKey: ['platform-webhooks'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Non sono riuscito a cambiare lo stato'),
  });

  const eliminaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_webhooks' as never)
        .delete()
        .eq('id' as never, id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Webhook eliminato');
      setDaEliminare(null);
      void qc.invalidateQueries({ queryKey: ['platform-webhooks'] });
    },
    onError: (e: Error) => toast.error(e.message || "Non sono riuscito a eliminare il webhook"),
  });

  if (!permissions.can_manage_admins) return <AccessDenied />;

  const etichettaEvento = (id: string) => AVAILABLE_EVENTS.find((e) => e.id === id)?.label ?? id;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Webhook in uscita</h1>
          <p className="text-muted-foreground max-sm:hidden">
            Indirizzi esterni da avvisare sugli eventi della piattaforma
          </p>
        </div>
        <div className="flex items-center gap-2 max-sm:w-full">
          <Button asChild variant="ghost" size="sm" className="max-sm:hidden">
            <Link to="/admin/impostazioni/webhook-logs">
              Registro webhook in entrata
              <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
          </Button>
          <Button onClick={() => setOpen(true)} className="max-sm:flex-1">
            <Plus className="h-4 w-4 mr-2" /> Nuovo webhook
          </Button>
        </div>
      </div>

      <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <Info className="h-4 w-4" />
        <AlertTitle>Gli invii automatici non sono ancora attivi</AlertTitle>
        <AlertDescription>
          Puoi preparare gli indirizzi e gli eventi, ma oggi la piattaforma non spedisce niente: nessun evento parte verso
          questi webhook, anche se sono attivi.
        </AlertDescription>
      </Alert>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Non riesco a leggere i webhook.
            <Button size="sm" variant="outline" onClick={() => void refetch()}>Riprova</Button>
          </AlertDescription>
        </Alert>
      ) : webhooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Zap className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">Nessun webhook</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {webhooks.map((w) => (
            <Card key={w.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{w.name}</span>
                    {!w.is_active && (
                      <Badge variant="outline" className="text-xs">Disattivato</Badge>
                    )}
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">{w.url}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {w.events.map((e) => (
                      <Badge key={e} variant="outline" className="text-xs font-normal">{etichettaEvento(e)}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={w.is_active}
                    disabled={attivaMutation.isPending}
                    onCheckedChange={(attivo) => attivaMutation.mutate({ id: w.id, attivo })}
                    aria-label={w.is_active ? `Disattiva ${w.name}` : `Attiva ${w.name}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Elimina ${w.name}`}
                    onClick={() => setDaEliminare(w)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!daEliminare} onOpenChange={(o) => !o && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              {daEliminare && <>«{daEliminare.name}» verso <code className="break-all">{daEliminare.url}</code> sparisce dall'elenco. Non si può annullare.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => daEliminare && eliminaMutation.mutate(daEliminare.id)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuovo webhook</DialogTitle>
            <DialogDescription>
              Quando gli invii saranno attivi, l'indirizzo riceverà una richiesta POST in JSON per ogni evento scelto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="wh-nome">Nome *</Label>
              <Input
                id="wh-nome"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="CRM interno"
              />
            </div>
            <div>
              <Label htmlFor="wh-url">Indirizzo *</Label>
              <Input
                id="wh-url"
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
                  <CheckCircle2 className="h-3 w-3" /> Indirizzo valido
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="wh-segreto">Segreto per la firma (facoltativo)</Label>
              <div className="relative">
                <Input
                  id="wh-segreto"
                  type={mostraSegreto ? 'text' : 'password'}
                  value={form.secret_token}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, secret_token: e.target.value }))
                  }
                  placeholder="Firma HMAC nell'intestazione X-Webhook-Signature"
                  autoComplete="new-password"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                  onClick={() => setMostraSegreto((v) => !v)}
                  aria-label={mostraSegreto ? 'Nascondi il segreto' : 'Mostra il segreto'}
                >
                  {mostraSegreto ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
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
                  Scegli almeno un evento
                </p>
              )}
            </div>
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
                'Crea webhook'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

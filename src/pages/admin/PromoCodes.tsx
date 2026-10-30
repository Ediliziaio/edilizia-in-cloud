import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Copy, Loader2, Ticket } from 'lucide-react';
import { RigaRiepilogo, StatoVuoto } from '@/components/admin/fatturato/AreaUI';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { useSuperAdminPermissions } from '@/hooks/useSuperAdminPermissions';
import { AccessDenied } from '@/components/admin/AccessDenied';

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_uses: number | null;
  uses_count: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

interface PromoCodeForm {
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_uses: string;
  valid_until: string;
}

const emptyForm: PromoCodeForm = {
  code: '',
  description: '',
  discount_type: 'percentage',
  discount_value: 10,
  max_uses: '',
  valid_until: '',
};

export default function PromoCodes() {
  const { permissions } = useSuperAdminPermissions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PromoCodeForm>(emptyForm);

  const { data: codes = [], isLoading } = useQuery<PromoCode[]>({
    queryKey: ['promo-codes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promo_codes' as never)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PromoCode[];
    },
    enabled: permissions.billing_write,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('promo_codes' as never).insert({
        code: form.code.toUpperCase().trim(),
        description: form.description || null,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        valid_until: form.valid_until || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Codice promo creato');
      void qc.invalidateQueries({ queryKey: ['promo-codes'] });
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('promo_codes' as never)
        .update({ is_active } as never)
        .eq('id' as never, id as never);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['promo-codes'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Utilizzabili = attivi, non scaduti, non esauriti. Il resto sta sotto.
  const adesso = Date.now();
  const usabile = (c: PromoCode) =>
    c.is_active &&
    (!c.valid_until || new Date(c.valid_until).getTime() >= adesso) &&
    (!c.max_uses || c.uses_count < c.max_uses);
  const gruppi = { usabili: codes.filter(usabile), chiusi: codes.filter((c) => !usabile(c)) };
  const inScadenza = gruppi.usabili.filter((c) => c.valid_until && new Date(c.valid_until).getTime() - adesso < 14 * 86_400_000).length;

  if (!permissions.billing_write) return <AccessDenied />;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Titolo e sottotitolo li dà già l'hub Fatturato (unico punto d'accesso): qui solo le azioni. */}
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} className="flex-1 sm:flex-none">
          <Plus className="h-4 w-4 mr-2" /> Nuovo codice
        </Button>
      </div>

      <RigaRiepilogo
        voci={[
          { etichetta: "Codici utilizzabili", valore: isLoading ? "…" : gruppi.usabili.length, tono: gruppi.usabili.length ? "buono" : "spento" },
          { etichetta: "Spenti o scaduti", valore: isLoading ? "…" : gruppi.chiusi.length, tono: "spento" },
          { etichetta: "Utilizzi totali", valore: isLoading ? "…" : codes.reduce((t, c) => t + (c.uses_count ?? 0), 0) },
          { etichetta: "In scadenza", valore: isLoading ? "…" : inScadenza, dettaglio: "entro 14 giorni", tono: inScadenza ? "attenzione" : "neutro" },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : codes.length === 0 ? (
            <StatoVuoto
              icona={Ticket}
              titolo="Nessun codice promo"
              testo="Un codice dà uno sconto in percentuale o in euro sull'abbonamento. Puoi limitarne gli utilizzi e la scadenza."
              azione={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Crea il primo codice</Button>}
            />
          ) : (
            ([["Utilizzabili", gruppi.usabili], ["Spenti, scaduti o esauriti", gruppi.chiusi]] as const).map(([titolo, lista]) =>
              lista.length === 0 ? null : (
                <section key={titolo}>
                  <h2 className="bg-muted/50 px-3 py-1.5 text-xs font-semibold md:px-4">{titolo} · {lista.length}</h2>
                  <ul className="divide-y">
                    {lista.map((c) => (
                      <li key={c.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 md:grid-cols-[minmax(0,2fr)_7rem_7rem_8rem_auto] md:px-4 ${titolo === "Utilizzabili" ? "" : "opacity-70"}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <code className="truncate font-mono text-sm font-bold">{c.code}</code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              aria-label="Copia codice"
                              onClick={() => {
                                void navigator.clipboard.writeText(c.code);
                                toast.success('Copiato');
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          {c.description && <p className="truncate text-xs text-muted-foreground">{c.description}</p>}
                          {/* Da telefono sconto, utilizzi e scadenza stanno qui sotto. */}
                          <p className="text-xs text-muted-foreground md:hidden">
                            {c.discount_type === 'percentage' ? `${c.discount_value}%` : `€${c.discount_value}`}
                            {` · ${c.uses_count}${c.max_uses ? `/${c.max_uses}` : ''} usi`}
                            {c.valid_until ? ` · fino al ${format(new Date(c.valid_until), 'dd/MM/yyyy', { locale: it })}` : ''}
                          </p>
                        </div>
                        <div className="hidden md:block">
                          <Badge variant="outline">{c.discount_type === 'percentage' ? `${c.discount_value}%` : `€${c.discount_value}`}</Badge>
                        </div>
                        <p className="hidden text-sm tabular-nums md:block">{c.uses_count}{c.max_uses ? ` / ${c.max_uses}` : ' / ∞'} usi</p>
                        <p className="hidden text-sm md:block">{c.valid_until ? format(new Date(c.valid_until), 'dd/MM/yyyy', { locale: it }) : 'senza scadenza'}</p>
                        <Switch
                          aria-label={c.is_active ? 'Disattiva codice' : 'Attiva codice'}
                          checked={c.is_active}
                          onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, is_active: v })}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ),
            )
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo Codice Promo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Codice *</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="ESTATE2025"
              />
            </div>
            <div>
              <Label>Descrizione</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo sconto</Label>
                <Select
                  value={form.discount_type}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, discount_type: v as 'percentage' | 'fixed' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">%</SelectItem>
                    <SelectItem value="fixed">€ fisso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valore</Label>
                <Input
                  type="number"
                  value={form.discount_value}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, discount_value: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Utilizzi max (vuoto = illimitato)</Label>
              <Input
                type="number"
                value={form.max_uses}
                onChange={(e) => setForm((p) => ({ ...p, max_uses: e.target.value }))}
                placeholder="100"
              />
            </div>
            <div>
              <Label>Scadenza (opzionale)</Label>
              <Input
                type="date"
                value={form.valid_until}
                onChange={(e) => setForm((p) => ({ ...p, valid_until: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.code || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Crea Codice'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

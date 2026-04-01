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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Copy, Loader2, Ticket } from 'lucide-react';
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

  if (!permissions.billing_write) return <AccessDenied />;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary" /> Codici Promo
          </h1>
          <p className="text-muted-foreground">Gestisci sconti e promozioni</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuovo Codice
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codice</TableHead>
                <TableHead>Sconto</TableHead>
                <TableHead>Utilizzi</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead>Attivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : codes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nessun codice promo creato
                  </TableCell>
                </TableRow>
              ) : (
                codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="font-mono font-bold">{c.code}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            void navigator.clipboard.writeText(c.code);
                            toast.success('Copiato');
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      {c.description && (
                        <p className="text-xs text-muted-foreground">{c.description}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {c.discount_type === 'percentage'
                          ? `${c.discount_value}%`
                          : `€${c.discount_value}`}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {c.uses_count}{c.max_uses ? ` / ${c.max_uses}` : ' / ∞'}
                    </TableCell>
                    <TableCell>
                      {c.valid_until
                        ? format(new Date(c.valid_until), 'dd/MM/yyyy', { locale: it })
                        : '---'}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={c.is_active}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, is_active: v })}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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

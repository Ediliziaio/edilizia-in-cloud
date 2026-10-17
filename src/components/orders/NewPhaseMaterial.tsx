import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/usePermissions';
import { refreshWorkQueries } from '@/lib/orders/refreshWorkQueries';
import { parseWorkAmount } from '@/lib/orders/workPlanning';
import { messaggioErrore } from '@/lib/orders/sottofasi';

/** A new physical item, already linked to its phase. No contract price or expense is created. */
export function NewPhaseMaterial({ orderId, phaseId, phaseName }: { orderId: string; phaseId: string; phaseName: string }) {
  const { canEditOrders } = usePermissions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  if (!canEditOrders) return null;
  const save = async () => {
    if (saving) return;
    const count = parseWorkAmount(quantity);
    if (!name.trim() || count == null || !Number.isInteger(count) || count <= 0 || count > 2147483647) { toast.error('Inserisci il nome e una quantità intera di pezzi maggiore di zero.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('order_items').insert({
        order_id: orderId, phase_id: phaseId, name: name.trim(), quantity: count,
        description: description.trim() || null, status: 'da_ordinare',
        // Unknown purchase cost stays null. This item does not add to the sold contract.
        purchase_price: null, unit_price: 0,
      });
      if (error) throw error;
      refreshWorkQueries(qc, orderId);
      void qc.invalidateQueries({ queryKey: ['order-items', orderId] });
      setOpen(false); setName(''); setQuantity('1'); setDescription('');
      toast.success('Materiale aggiunto alla fase');
    } catch (error) { toast.error(messaggioErrore(error, 'Materiale non salvato. Riprova.')); }
    finally { setSaving(false); }
  };
  return <>
    <Button variant="outline" size="sm" className="min-h-9" onClick={() => setOpen(true)}>Nuovo materiale</Button>
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuovo materiale per la fase</DialogTitle><DialogDescription>{phaseName}. Il costo resta da valorizzare; non viene registrata una spesa.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="phase-material-name">Nome materiale</Label><Input id="phase-material-name" value={name} maxLength={500} onChange={e => setName(e.target.value)} disabled={saving} /></div>
          <div className="space-y-1"><Label htmlFor="phase-material-quantity">Quantità (pezzi)</Label><Input id="phase-material-quantity" inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} disabled={saving} /></div>
          <div className="space-y-1"><Label htmlFor="phase-material-description">Descrizione (facoltativa)</Label><Textarea id="phase-material-description" value={description} onChange={e => setDescription(e.target.value)} disabled={saving} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annulla</Button><Button onClick={() => void save()} disabled={saving}>{saving ? 'Salvataggio…' : 'Salva materiale'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

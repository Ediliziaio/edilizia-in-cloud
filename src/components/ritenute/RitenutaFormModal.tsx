import { useState } from 'react';
import { ContrattoSubappalto } from '@/hooks/useRitenuteGaranzia';
import { formatCurrency } from '@/lib/formatters';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FormData {
  contratto_id: string;
  sal_id: string;
  importo: number;
  percentuale_applicata?: number;
  data_svincolo_prevista?: string;
  note?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contratti: ContrattoSubappalto[];
  onSubmit: (data: FormData) => Promise<void>;
  isSubmitting: boolean;
}

const EMPTY: FormData = {
  contratto_id: '',
  sal_id: '',
  importo: 0,
  percentuale_applicata: undefined,
  data_svincolo_prevista: undefined,
  note: undefined,
};

export function RitenutaFormModal({ open, onOpenChange, contratti, onSubmit, isSubmitting }: Props) {
  const [form, setForm] = useState<FormData>(EMPTY);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(form);
    setForm(EMPTY);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aggiungi Ritenuta di Garanzia</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Contratto */}
          <div className="space-y-1">
            <Label htmlFor="contratto_id">Contratto di subappalto</Label>
            <Select
              value={form.contratto_id}
              onValueChange={(v) => set('contratto_id', v)}
              required
            >
              <SelectTrigger id="contratto_id">
                <SelectValue placeholder="Seleziona contratto…" />
              </SelectTrigger>
              <SelectContent>
                {contratti.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {formatCurrency(c.importo_contrattuale)} — {c.stato}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* SAL ID */}
          <div className="space-y-1">
            <Label htmlFor="sal_id">SAL ID</Label>
            <Input
              id="sal_id"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={form.sal_id}
              onChange={(e) => set('sal_id', e.target.value)}
              required
            />
          </div>

          {/* Importo */}
          <div className="space-y-1">
            <Label htmlFor="importo">Importo (€)</Label>
            <Input
              id="importo"
              type="number"
              min={0}
              step={0.01}
              value={form.importo === 0 ? '' : form.importo}
              onChange={(e) => set('importo', parseFloat(e.target.value) || 0)}
              required
            />
          </div>

          {/* Percentuale */}
          <div className="space-y-1">
            <Label htmlFor="percentuale_applicata">Percentuale applicata (%)</Label>
            <Input
              id="percentuale_applicata"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.percentuale_applicata ?? ''}
              onChange={(e) =>
                set('percentuale_applicata', e.target.value ? parseFloat(e.target.value) : undefined)
              }
            />
          </div>

          {/* Data svincolo prevista */}
          <div className="space-y-1">
            <Label htmlFor="data_svincolo_prevista">Data svincolo prevista</Label>
            <Input
              id="data_svincolo_prevista"
              type="date"
              value={form.data_svincolo_prevista ?? ''}
              onChange={(e) => set('data_svincolo_prevista', e.target.value || undefined)}
            />
          </div>

          {/* Note */}
          <div className="space-y-1">
            <Label htmlFor="note">Note</Label>
            <Textarea
              id="note"
              rows={3}
              placeholder="Note facoltative…"
              value={form.note ?? ''}
              onChange={(e) => set('note', e.target.value || undefined)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Salvataggio…' : 'Salva'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

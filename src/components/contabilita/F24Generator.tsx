import { useState } from 'react';
import { F24Entry, TRIBUTI_PREDEFINITI } from '@/hooks/useF24';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Plus, X, Save } from 'lucide-react';

interface Props {
  entries: F24Entry[];
  isLoading: boolean;
  onSalva: (data: Partial<F24Entry> & { tributo_code: string; importo: number }) => Promise<void>;
  isSalvando: boolean;
  onMarcaPagato: (id: string) => void;
  totaleAPagare: number;
  scadentiProssimi30gg: F24Entry[];
}

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

function StatoBadge({ stato }: { stato: F24Entry['stato'] }) {
  if (stato === 'pagato') {
    return <Badge className="bg-green-100 text-green-800 border-green-200">Pagato</Badge>;
  }
  if (stato === 'annullato') {
    return <Badge className="bg-gray-100 text-gray-600 border-gray-200">Annullato</Badge>;
  }
  return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Da pagare</Badge>;
}

interface FormState {
  tributo_code: string;
  importo: string;
  data_scadenza: string;
  mese: string;
  note: string;
}

const defaultForm: FormState = {
  tributo_code: '',
  importo: '',
  data_scadenza: '',
  mese: '',
  note: '',
};

export function F24Generator({
  entries,
  isLoading,
  onSalva,
  isSalvando,
  onMarcaPagato,
  totaleAPagare,
  scadentiProssimi30gg,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);

  const handleSalva = async () => {
    if (!form.tributo_code || !form.importo) return;
    await onSalva({
      tributo_code: form.tributo_code,
      importo: parseFloat(form.importo),
      data_scadenza: form.data_scadenza || null,
      mese: form.mese ? parseInt(form.mese) : undefined,
      note: form.note || undefined,
    });
    setForm(defaultForm);
    setShowForm(false);
  };

  const handleCancel = () => {
    setForm(defaultForm);
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="flex flex-wrap gap-4 items-center p-4 bg-muted/40 rounded-lg border">
        <div className="text-sm font-medium">
          Da pagare:{' '}
          <span className="text-foreground font-semibold">{formatCurrency(totaleAPagare)}</span>
        </div>
        <div className="text-muted-foreground text-sm">|</div>
        <div className="text-sm font-medium">
          Scadenti nei prossimi 30 giorni:{' '}
          <span className="font-semibold">{scadentiProssimi30gg.length}</span>
        </div>
      </div>

      {/* Warning alert */}
      {scadentiProssimi30gg.length > 0 && (
        <Alert className="border-yellow-300 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            Hai {scadentiProssimi30gg.length} pagament{scadentiProssimi30gg.length === 1 ? 'o' : 'i'} in scadenza nei prossimi 30 giorni
          </AlertDescription>
        </Alert>
      )}

      {/* New F24 button / inline form */}
      {!showForm ? (
        <Button variant="outline" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo F24
        </Button>
      ) : (
        <div className="border rounded-lg p-4 space-y-4 bg-card">
          <h3 className="text-sm font-semibold">Nuovo F24</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tributo</Label>
              <Select value={form.tributo_code} onValueChange={v => setForm(f => ({ ...f, tributo_code: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tributo..." />
                </SelectTrigger>
                <SelectContent>
                  {TRIBUTI_PREDEFINITI.map(t => (
                    <SelectItem key={t.code} value={t.code}>
                      {t.code} — {t.descrizione}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Importo (€)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.importo}
                onChange={e => setForm(f => ({ ...f, importo: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Data scadenza</Label>
              <Input
                type="date"
                value={form.data_scadenza}
                onChange={e => setForm(f => ({ ...f, data_scadenza: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Mese di riferimento</Label>
              <Select value={form.mese} onValueChange={v => setForm(f => ({ ...f, mese: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona mese..." />
                </SelectTrigger>
                <SelectContent>
                  {MESI.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Note</Label>
              <Textarea
                placeholder="Note aggiuntive..."
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSalva}
              disabled={isSalvando || !form.tributo_code || !form.importo}
              size="sm"
            >
              <Save className="h-4 w-4 mr-1.5" />
              {isSalvando ? 'Salvataggio...' : 'Salva'}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-4 w-4 mr-1.5" />
              Annulla
            </Button>
          </div>
        </div>
      )}

      {/* Table — scroll orizzontale su mobile (6 colonne sfondavano il layout a 375px) */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tributo</TableHead>
              <TableHead className="text-right">Importo</TableHead>
              <TableHead>Scadenza</TableHead>
              <TableHead>Mese</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nessun F24 registrato
                </TableCell>
              </TableRow>
            ) : (
              entries.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{entry.tributo_code}</div>
                    <div className="text-xs text-muted-foreground">{entry.tributo_descrizione}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(entry.importo)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.data_scadenza ? formatDate(entry.data_scadenza) : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.mese ? MESI[entry.mese - 1] : '—'}
                  </TableCell>
                  <TableCell>
                    <StatoBadge stato={entry.stato} />
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.stato === 'da_pagare' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onMarcaPagato(entry.id)}
                      >
                        Paga
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

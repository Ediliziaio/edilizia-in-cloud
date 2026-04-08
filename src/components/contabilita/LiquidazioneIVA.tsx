import { useState } from 'react';
import { LiquidazioneIVAResult } from '@/hooks/useLiquidazioneIVA';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, RotateCcw, Calculator } from 'lucide-react';

interface Props {
  calcola: (params: { periodo: 'mensile' | 'trimestrale'; mese?: number; trimestre?: number; anno: number }) => Promise<void>;
  isCalcolando: boolean;
  risultato: LiquidazioneIVAResult | null;
  reset: () => void;
}

const MESI_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

const TRIMESTRI = [
  { value: '1', label: '1° trimestre (Q1 — Gen/Mar)' },
  { value: '2', label: '2° trimestre (Q2 — Apr/Giu)' },
  { value: '3', label: '3° trimestre (Q3 — Lug/Set)' },
  { value: '4', label: '4° trimestre (Q4 — Ott/Dic)' },
];

interface FormState {
  periodo: 'mensile' | 'trimestrale';
  mese: string;
  trimestre: string;
  anno: string;
}

export function LiquidazioneIVA({ calcola, isCalcolando, risultato, reset }: Props) {
  const [form, setForm] = useState<FormState>({
    periodo: 'mensile',
    mese: String(new Date().getMonth() + 1),
    trimestre: '1',
    anno: String(new Date().getFullYear()),
  });

  const handleCalcola = async () => {
    const params: Parameters<typeof calcola>[0] = {
      periodo: form.periodo,
      anno: parseInt(form.anno),
    };
    if (form.periodo === 'mensile') {
      params.mese = parseInt(form.mese);
    } else {
      params.trimestre = parseInt(form.trimestre);
    }
    await calcola(params);
  };

  return (
    <div className="space-y-6">
      {/* Form */}
      {risultato === null ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calcola Liquidazione IVA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Periodo</Label>
                <Select
                  value={form.periodo}
                  onValueChange={v =>
                    setForm(f => ({ ...f, periodo: v as 'mensile' | 'trimestrale' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensile">Mensile</SelectItem>
                    <SelectItem value="trimestrale">Trimestrale</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.periodo === 'mensile' ? (
                <div className="space-y-1.5">
                  <Label>Mese</Label>
                  <Select
                    value={form.mese}
                    onValueChange={v => setForm(f => ({ ...f, mese: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MESI_IT.map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Trimestre</Label>
                  <Select
                    value={form.trimestre}
                    onValueChange={v => setForm(f => ({ ...f, trimestre: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIMESTRI.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Anno</Label>
                <Input
                  type="number"
                  min="2000"
                  max="2099"
                  value={form.anno}
                  onChange={e => setForm(f => ({ ...f, anno: e.target.value }))}
                />
              </div>
            </div>

            <Button onClick={handleCalcola} disabled={isCalcolando}>
              {isCalcolando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Calcolo in corso...
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4 mr-2" />
                  Calcola
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Result card */
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Risultato Liquidazione IVA</CardTitle>
            {risultato.credito ? (
              <Badge className="bg-green-100 text-green-800 border-green-200">Credito IVA</Badge>
            ) : (
              <Badge className="bg-red-100 text-red-800 border-red-200">IVA da versare</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground font-medium">
              Periodo: <span className="text-foreground">{risultato.periodo_label}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1 p-3 bg-muted/40 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  IVA su vendite
                </div>
                <div className="text-lg font-semibold font-mono">
                  {formatCurrency(risultato.iva_vendite)}
                </div>
              </div>

              <div className="space-y-1 p-3 bg-muted/40 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  IVA su acquisti
                </div>
                <div className="text-lg font-semibold font-mono">
                  {formatCurrency(risultato.iva_acquisti)}
                </div>
              </div>

              <div
                className={`space-y-1 p-3 rounded-lg ${
                  risultato.credito
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}
              >
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Saldo</div>
                <div
                  className={`text-lg font-bold font-mono ${
                    risultato.credito ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {formatCurrency(risultato.saldo)}
                </div>
              </div>
            </div>

            <Button variant="outline" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Nuova Liquidazione
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

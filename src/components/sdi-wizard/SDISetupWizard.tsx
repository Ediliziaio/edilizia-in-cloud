import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Info, ChevronLeft, ChevronRight, Save } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface FormData {
  codice_destinatario: string;
  pec_sdi: string;
  regime_fiscale: string;
}

const REGIMI_FISCALI = [
  { value: 'RF01', label: 'RF01 — Ordinario' },
  { value: 'RF02', label: 'RF02 — Contribuenti minimi' },
  { value: 'RF19', label: 'RF19 — Regime forfettario' },
];

const defaultForm: FormData = {
  codice_destinatario: '',
  pec_sdi: '',
  regime_fiscale: '',
};

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="text-sm text-muted-foreground font-medium mb-4">
      Passaggio {step} di 4
    </div>
  );
}

export function SDISetupWizard({ open, onOpenChange }: Props) {
  const { effectiveCompany } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(defaultForm);
  const [isSalvando, setIsSalvando] = useState(false);

  const handleNext = () => {
    if (step < 4) setStep(s => s + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(s => s - 1);
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setStep(1);
      setForm(defaultForm);
    }
    onOpenChange(v);
  };

  const handleSalva = async () => {
    if (!effectiveCompany?.id) {
      toast.error('Azienda non trovata');
      return;
    }
    setIsSalvando(true);
    try {
      // I dati SDI vivono sull'anagrafica fiscale dell'azienda (stessa tabella
      // letta/scritta da ImpostazioniFatturazione), NON su una "company_settings"
      // (che non esiste → prima ogni salvataggio falliva = vicolo cieco).
      const { data, error } = await supabase
        .from('anagrafica_azienda' as never)
        .update({
          codice_sdi: form.codice_destinatario,
          pec: form.pec_sdi || null,
          regime_fiscale: form.regime_fiscale,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('company_id', effectiveCompany.id)
        .select('id');
      if (error) throw error;
      if (!data || (data as unknown[]).length === 0) {
        toast.error('Anagrafica aziendale non trovata', {
          description: 'Completa prima i dati azienda in Impostazioni Fatturazione.',
        });
        return;
      }
      toast.success('Configurazione SDI salvata');
      handleClose(false);
    } catch (err) {
      toast.error('Errore salvataggio', {
        description: err instanceof Error ? err.message : 'Riprova',
      });
    } finally {
      setIsSalvando(false);
    }
  };

  const canGoNext = () => {
    // Il codice destinatario SDI è SEMPRE di 7 caratteri (es. "ABCDE12" o "0000000"
    // per PEC/B2C). Bloccare un codice incompleto evita config invalide → fatture scartate.
    if (step === 1) return form.codice_destinatario.length === 7;
    if (step === 2) return true; // PEC is optional
    if (step === 3) return form.regime_fiscale.length > 0;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurazione SDI</DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <StepIndicator step={step} />

          {/* Step 1: Codice SDI */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">Codice SDI</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Codice univoco SDI per la ricezione fatture elettroniche
                </p>
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 mb-3">
                  <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
                  <span>Il codice destinatario è composto da 7 caratteri alfanumerici forniti dal tuo intermediario SDI.</span>
                </div>
                <div className="space-y-1.5">
                  <Label>Codice destinatario</Label>
                  <Input
                    maxLength={7}
                    placeholder="Es. ABCDE12"
                    value={form.codice_destinatario}
                    onChange={e =>
                      setForm(f => ({
                        ...f,
                        codice_destinatario: e.target.value.toUpperCase(),
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {form.codice_destinatario.length}/7 caratteri
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: PEC Aziendale */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">PEC Aziendale</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Alternativa al codice SDI: usa la PEC aziendale
                </p>
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 mb-3">
                  <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
                  <span>
                    La PEC può essere usata in alternativa al codice SDI. Se hai già inserito un codice SDI, questo campo è opzionale.
                  </span>
                </div>
                <div className="space-y-1.5">
                  <Label>Indirizzo PEC</Label>
                  <Input
                    type="email"
                    placeholder="esempio@pec.it"
                    value={form.pec_sdi}
                    onChange={e => setForm(f => ({ ...f, pec_sdi: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Regime Fiscale */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">Regime Fiscale</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Seleziona il regime fiscale della tua azienda
                </p>
                <div className="space-y-1.5">
                  <Label>Regime fiscale</Label>
                  <Select
                    value={form.regime_fiscale}
                    onValueChange={v => setForm(f => ({ ...f, regime_fiscale: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona regime..." />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIMI_FISCALI.map(r => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Riepilogo */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">Riepilogo</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Verifica i dati inseriti prima di salvare
                </p>
              </div>
              <div className="space-y-3 p-4 bg-muted/40 rounded-lg border text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground font-medium">Codice SDI</span>
                  <span className="font-mono font-semibold">
                    {form.codice_destinatario || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground font-medium">PEC aziendale</span>
                  <span className="truncate max-w-[200px]">{form.pec_sdi || '—'}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground font-medium">Regime fiscale</span>
                  <span>
                    {REGIMI_FISCALI.find(r => r.value === form.regime_fiscale)?.label ?? '—'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Indietro
          </Button>

          {step < 4 ? (
            <Button onClick={handleNext} disabled={!canGoNext()}>
              Avanti
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSalva} disabled={isSalvando}>
              <Save className="h-4 w-4 mr-2" />
              {isSalvando ? 'Salvataggio...' : 'Salva Configurazione'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

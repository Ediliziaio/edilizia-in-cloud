import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface LiquidazioneIVAResult {
  iva_vendite: number;
  iva_acquisti: number;
  saldo: number;
  credito: boolean;
  dovuto: boolean;
  periodo_label: string;
}

export function useLiquidazioneIVA() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [isCalcolando, setIsCalcolando] = useState(false);
  const [risultato, setRisultato] = useState<LiquidazioneIVAResult | null>(null);

  const calcola = async (params: { periodo: 'mensile' | 'trimestrale'; mese?: number; trimestre?: number; anno: number }) => {
    if (!companyId) return;
    setIsCalcolando(true);
    try {
      const { data, error } = await supabase.functions.invoke('calcola-liquidazione-iva', {
        body: { company_id: companyId, ...params },
      });
      if (error) throw error;
      setRisultato(data as LiquidazioneIVAResult);
    } catch (err) {
      toast.error('Errore calcolo IVA', { description: err instanceof Error ? err.message : 'Riprova' });
    } finally {
      setIsCalcolando(false);
    }
  };

  const reset = () => setRisultato(null);

  return { calcola, isCalcolando, risultato, reset };
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface F24Entry {
  id: string;
  company_id: string;
  anno: number;
  mese: number | null;
  tributo_code: string;
  tributo_descrizione: string;
  importo: number;
  stato: 'da_pagare' | 'pagato' | 'annullato';
  data_scadenza: string | null;
  data_pagamento: string | null;
  note: string | null;
  pdf_url: string | null;
  created_at: string;
}

export const TRIBUTI_PREDEFINITI: Array<{ code: string; descrizione: string; categoria: string }> = [
  { code: '1001', descrizione: 'IRPEF — Imposta sul reddito delle persone fisiche', categoria: 'IRPEF' },
  { code: '0601', descrizione: 'INPS — Contributi artigiani e commercianti', categoria: 'INPS' },
  { code: '1301', descrizione: 'INAIL — Premio assicurativo', categoria: 'INAIL' },
  { code: '3918', descrizione: 'IVA — Liquidazione periodica', categoria: 'IVA' },
  { code: '1040', descrizione: 'IRPEF — Ritenute su redditi da lavoro dipendente', categoria: 'IRPEF' },
  { code: '6001', descrizione: 'IVA — Acconto dicembre', categoria: 'IVA' },
];

export function useF24(anno?: number) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const annoCorrente = anno ?? new Date().getFullYear();

  const f24Query = useQuery({
    queryKey: ['f24', 'list', companyId, annoCorrente],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('f24_entries')
        .select('id, company_id, anno, mese, tributo_code, tributo_descrizione, importo, stato, data_scadenza, data_pagamento, note, pdf_url, created_at')
        .eq('company_id', companyId!)
        .eq('anno', annoCorrente)
        .order('data_scadenza', { ascending: true, nullsFirst: false });
      if (error) throw new Error(`[useF24] ${error.message}`);
      return (data ?? []) as F24Entry[];
    },
  });

  const salvaMutation = useMutation({
    mutationFn: async (payload: Partial<F24Entry> & { tributo_code: string; importo: number }) => {
      const record = {
        company_id: companyId!,
        anno: annoCorrente,
        tributo_code: payload.tributo_code,
        tributo_descrizione: payload.tributo_descrizione ?? TRIBUTI_PREDEFINITI.find(t => t.code === payload.tributo_code)?.descrizione ?? payload.tributo_code,
        importo: payload.importo,
        stato: payload.stato ?? 'da_pagare',
        data_scadenza: payload.data_scadenza ?? null,
        mese: payload.mese ?? null,
        note: payload.note ?? null,
      };
      if (payload.id) {
        const { error } = await supabase.from('f24_entries').update(record).eq('id', payload.id).eq('company_id', companyId!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('f24_entries').insert(record);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['f24', 'list', companyId, annoCorrente] });
      toast.success('F24 salvato');
    },
    onError: () => toast.error('Errore salvataggio F24'),
  });

  const marcaPagatoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('f24_entries')
        .update({ stato: 'pagato', data_pagamento: new Date().toISOString().split('T')[0] })
        .eq('id', id).eq('company_id', companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['f24', 'list', companyId, annoCorrente] });
      toast.success('F24 marcato come pagato');
    },
    onError: () => toast.error('Errore aggiornamento stato'),
  });

  const entries = f24Query.data ?? [];
  const oggi = new Date();
  const scadentiProssimi30gg = entries.filter(e => {
    if (e.stato !== 'da_pagare' || !e.data_scadenza) return false;
    const diff = (new Date(e.data_scadenza).getTime() - oggi.getTime()) / 86400000;
    return diff >= 0 && diff <= 30;
  });

  return {
    entries,
    isLoading: f24Query.isLoading,
    salva: salvaMutation.mutateAsync,
    isSalvando: salvaMutation.isPending,
    marcaPagato: marcaPagatoMutation.mutate,
    scadentiProssimi30gg,
    totaleAPagare: entries.filter(e => e.stato === 'da_pagare').reduce((s, e) => s + Number(e.importo), 0),
  };
}

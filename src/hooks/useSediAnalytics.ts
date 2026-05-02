import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export interface SedeAnalyticsData {
  sede_id:           string
  nome:              string
  tipo:              string
  colore:            string
  citta?:            string
  ricavi:            number
  costi:             number
  margine:           number
  margine_pct:       number
  n_lead:            number
  n_preventivi:      number
  preventivi_vinti:  number
  spesa_ads:         number
  cpl:               number
  incidenza_ricavi:  number   // % sul totale azienda
  incidenza_margine: number   // % sul totale azienda
  incidenza_lead:    number   // % sul totale azienda
  delta_incidenza:   number   // incidenza_margine - incidenza_ricavi
  trend:             { mese: string; margine_pct: number }[]
}

export interface SediAnalyticsTotali {
  totRicavi:  number
  totMargine: number
  totLead:    number
}

interface Filters {
  da?:       string   // ISO date
  a?:        string
  tipo_sede?: string
}

export function useSediAnalytics(filters: Filters = {}) {
  const { effectiveCompany } = useAuth()
  const company_id = effectiveCompany?.id

  return useQuery({
    queryKey:  ['sedi-analytics', company_id, filters],
    enabled:   !!company_id,
    staleTime: 15 * 60 * 1000,   // 15 min — allineato al refresh mv
    refetchOnWindowFocus: false,
    queryFn:   async () => {
      const { data, error } = await supabase.functions.invoke('get-sede-analytics', {
        body: { company_id, ...filters },
      })
      if (error) throw error
      return data as { sedi: SedeAnalyticsData[]; totali: SediAnalyticsTotali }
    },
  })
}

// Hook semplice per lista sedi (per filtri e form)
export function useSediList() {
  const { effectiveCompany } = useAuth()
  const company_id = effectiveCompany?.id

  return useQuery({
    queryKey:  ['sedi-list', company_id],
    enabled:   !!company_id,
    staleTime: 5 * 60 * 1000,
    queryFn:   async () => {
      const { data, error } = await supabase
        .from('sedi')
        .select('id, nome, tipo, indirizzo, citta, cap, provincia, colore, attiva, principale')
        .eq('company_id', company_id!)
        .order('principale', { ascending: false })
        .order('nome')
      if (error) throw error
      return data ?? []
    },
  })
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/headers.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { company_id, da, a, tipo_sede } = await req.json()

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: 'company_id richiesto' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Query KPI per sede dalla vista materializzata
    let query = supabase
      .from('mv_analytics_sede')
      .select(`
        sede_id,
        mese,
        ricavi,
        costi,
        margine,
        margine_pct,
        n_preventivi,
        preventivi_vinti,
        n_lead,
        spesa_ads,
        cpl,
        sedi!inner(nome, tipo, colore, citta, attiva, principale)
      `)
      .eq('company_id', company_id)

    if (da)       query = query.gte('mese', da)
    if (a)        query = query.lte('mese', a)
    if (tipo_sede) query = query.eq('sedi.tipo', tipo_sede)

    const { data: rows, error } = await query

    if (error) {
      console.error('[get-sede-analytics] query error:', error)
      return new Response(
        JSON.stringify({ error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Calcola totali azienda per incidenza
    const totRicavi  = (rows ?? []).reduce((s: number, r: any) => s + (r.ricavi  || 0), 0)
    const totMargine = (rows ?? []).reduce((s: number, r: any) => s + (r.margine || 0), 0)
    const totLead    = (rows ?? []).reduce((s: number, r: any) => s + (r.n_lead  || 0), 0)

    // Aggrega per sede e aggiungi incidenza
    const bySede: Record<string, any> = {}
    for (const r of rows ?? []) {
      if (!bySede[r.sede_id]) {
        bySede[r.sede_id] = {
          sede_id:       r.sede_id,
          nome:          r.sedi?.nome,
          tipo:          r.sedi?.tipo,
          colore:        r.sedi?.colore,
          citta:         r.sedi?.citta,
          ricavi:        0,
          costi:         0,
          margine:       0,
          n_lead:        0,
          spesa_ads:     0,
          n_preventivi:  0,
          preventivi_vinti: 0,
          trend:         [],
        }
      }
      const s = bySede[r.sede_id]
      s.ricavi          += r.ricavi   || 0
      s.costi           += r.costi    || 0
      s.margine         += r.margine  || 0
      s.n_lead          += r.n_lead   || 0
      s.spesa_ads       += r.spesa_ads || 0
      s.n_preventivi    += r.n_preventivi || 0
      s.preventivi_vinti += r.preventivi_vinti || 0
      s.trend.push({ mese: r.mese, margine_pct: r.margine_pct })
    }

    // Aggiungi incidenza calcolata
    const result = Object.values(bySede).map((s: any) => ({
      ...s,
      margine_pct: s.ricavi > 0 ? +(s.margine / s.ricavi * 100).toFixed(2) : 0,
      incidenza_ricavi:  totRicavi  > 0 ? +(s.ricavi  / totRicavi  * 100).toFixed(2) : 0,
      incidenza_margine: totMargine > 0 ? +(s.margine / totMargine * 100).toFixed(2) : 0,
      incidenza_lead:    totLead    > 0 ? +(s.n_lead  / totLead    * 100).toFixed(2) : 0,
      delta_incidenza: +(
        (totMargine > 0 ? s.margine / totMargine : 0) -
        (totRicavi  > 0 ? s.ricavi  / totRicavi  : 0)
      * 100).toFixed(2),
      cpl: s.n_lead > 0 ? +(s.spesa_ads / s.n_lead).toFixed(2) : 0,
    }))

    return new Response(
      JSON.stringify({
        sedi:   result,
        totali: { totRicavi, totMargine, totLead }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[get-sede-analytics] unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Errore interno del server' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

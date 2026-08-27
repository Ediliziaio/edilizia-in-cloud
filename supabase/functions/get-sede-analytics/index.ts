import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/headers.ts'
import { requireAuth, requireCompanyAccess } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const { company_id, da, a, tipo_sede } = await req.json()

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: 'company_id richiesto' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // SEC (P0): l'utente DEVE appartenere alla company richiesta — niente
    // lettura cross-tenant dei dati finanziari per sede.
    const { userId, supabaseAdmin } = await requireAuth(req, getCorsHeaders(req))
    await requireCompanyAccess(supabaseAdmin, userId, company_id, getCorsHeaders(req))
    const supabase = supabaseAdmin

    // KPI per sede dalla vista materializzata. NIENTE embed sedi!inner: una
    // materialized view non ha foreign key, e PostgREST rispondeva PGRST200
    // ("no relationship between mv_analytics_sede and sedi") → 500, cruscotto
    // sede muto. Si leggono le due tabelle separate e si uniscono in memoria.
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
        cpl
      `)
      .eq('company_id', company_id)

    if (da)       query = query.gte('mese', da)
    if (a)        query = query.lte('mese', a)

    // Anagrafica sedi (nome/tipo/colore/città) letta a parte e indicizzata.
    const { data: sediRows, error: sediError } = await supabase
      .from('sedi')
      .select('id, nome, tipo, colore, citta, attiva, principale')
      .eq('company_id', company_id)

    if (sediError) {
      console.error('[get-sede-analytics] sedi error:', sediError)
      return new Response(
        JSON.stringify({ error: sediError }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }
    const sediById = new Map((sediRows ?? []).map((s: any) => [s.id, s]))

    const { data: rowsRaw, error } = await query

    if (error) {
      console.error('[get-sede-analytics] query error:', error)
      return new Response(
        JSON.stringify({ error }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Il filtro per tipo sede (prima 'sedi.tipo' nell'embed) ora è in memoria.
    const rows = tipo_sede
      ? (rowsRaw ?? []).filter((r: any) => sediById.get(r.sede_id)?.tipo === tipo_sede)
      : (rowsRaw ?? [])

    // Calcola totali azienda per incidenza
    const totRicavi  = (rows ?? []).reduce((s: number, r: any) => s + (r.ricavi  || 0), 0)
    const totMargine = (rows ?? []).reduce((s: number, r: any) => s + (r.margine || 0), 0)
    const totLead    = (rows ?? []).reduce((s: number, r: any) => s + (r.n_lead  || 0), 0)

    // Aggrega per sede e aggiungi incidenza
    const bySede: Record<string, any> = {}
    for (const r of rows ?? []) {
      const sede = sediById.get(r.sede_id)
      if (!bySede[r.sede_id]) {
        bySede[r.sede_id] = {
          sede_id:       r.sede_id,
          nome:          sede?.nome,
          tipo:          sede?.tipo,
          colore:        sede?.colore,
          citta:         sede?.citta,
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
        ((totMargine > 0 ? s.margine / totMargine : 0) -
         (totRicavi  > 0 ? s.ricavi  / totRicavi  : 0))
      * 100).toFixed(2),
      cpl: s.n_lead > 0 ? +(s.spesa_ads / s.n_lead).toFixed(2) : 0,
    }))

    return new Response(
      JSON.stringify({
        sedi:   result,
        totali: { totRicavi, totMargine, totLead }
      }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    if (err instanceof Response) return err
    console.error('[get-sede-analytics] unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Errore interno del server' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})

import { getCorsHeaders } from '../_shared/headers.ts'
import { requireAuth } from '../_shared/auth.ts'
import { verifyCompanyAccess } from '../_shared/companyAuth.ts'

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsH })
  }

  try {
    // ── AUTH: verifica JWT e appartenenza all'azienda ─────────
    const { userId, supabaseAdmin: supabase } = await requireAuth(req, corsH)

    const body = await req.json()
    const { action, company_id, sede_id, ...payload } = body

    if (!action || !company_id) {
      return new Response(
        JSON.stringify({ error: 'action e company_id richiesti' }),
        { status: 400, headers: { ...corsH, 'Content-Type': 'application/json' } }
      )
    }

    // Verifica che l'utente autenticato appartenga alla company richiesta
    await verifyCompanyAccess(supabase, userId, company_id)

    // ── CREA SEDE ────────────────────────────────────────────
    if (action === 'crea') {
      // Verifica limite sedi per piano (Free = max 1, Pro = illimitato)
      const { count } = await supabase
        .from('sedi')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', company_id)
        .eq('attiva', true)

      const { data: subscription } = await supabase
        .from('company_subscriptions')
        .select('plan_id')
        .eq('company_id', company_id)
        .eq('status', 'active')
        .maybeSingle()

      const isFree = !subscription || subscription.plan_id === 'free' || subscription.plan_id === null
      if (isFree && (count ?? 0) >= 1) {
        return new Response(
          JSON.stringify({
            error:   'LIMITE_PIANO',
            message: 'Upgrade a Pro per aggiungere più sedi'
          }),
          { status: 403, headers: { ...corsH, 'Content-Type': 'application/json' } }
        )
      }

      // Se è la prima sede, la rendiamo principale automaticamente
      const isPrima = (count ?? 0) === 0
      const { data, error } = await supabase
        .from('sedi')
        .insert({ company_id, principale: isPrima, ...payload })
        .select()
        .single()

      return new Response(
        JSON.stringify({ sede: data, error }),
        { status: error ? 500 : 200, headers: { ...corsH, 'Content-Type': 'application/json' } }
      )
    }

    // ── AGGIORNA SEDE ────────────────────────────────────────
    if (action === 'aggiorna') {
      if (!sede_id) {
        return new Response(
          JSON.stringify({ error: 'sede_id richiesto per aggiornamento' }),
          { status: 400, headers: { ...corsH, 'Content-Type': 'application/json' } }
        )
      }

      // Se si imposta come principale, de-imposta le altre
      if (payload.principale === true) {
        await supabase
          .from('sedi')
          .update({ principale: false })
          .eq('company_id', company_id)
          .neq('id', sede_id)
      }

      const { data, error } = await supabase
        .from('sedi')
        .update(payload)
        .eq('id', sede_id)
        .eq('company_id', company_id)
        .select()
        .single()

      return new Response(
        JSON.stringify({ sede: data, error }),
        { status: error ? 500 : 200, headers: { ...corsH, 'Content-Type': 'application/json' } }
      )
    }

    // ── DISATTIVA SEDE ───────────────────────────────────────
    if (action === 'disattiva') {
      if (!sede_id) {
        return new Response(
          JSON.stringify({ error: 'sede_id richiesto per disattivazione' }),
          { status: 400, headers: { ...corsH, 'Content-Type': 'application/json' } }
        )
      }

      const { error } = await supabase
        .from('sedi')
        .update({ attiva: false })
        .eq('id', sede_id)
        .eq('company_id', company_id)

      return new Response(
        JSON.stringify({ ok: !error, error }),
        { status: error ? 500 : 200, headers: { ...corsH, 'Content-Type': 'application/json' } }
      )
    }

    // ── ELIMINA SEDE ─────────────────────────────────────────
    if (action === 'elimina') {
      if (!sede_id) {
        return new Response(
          JSON.stringify({ error: 'sede_id richiesto per eliminazione' }),
          { status: 400, headers: { ...corsH, 'Content-Type': 'application/json' } }
        )
      }

      const { error } = await supabase
        .from('sedi')
        .delete()
        .eq('id', sede_id)
        .eq('company_id', company_id)

      return new Response(
        JSON.stringify({ ok: !error, error }),
        { status: error ? 500 : 200, headers: { ...corsH, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: `Azione non riconosciuta: ${action}` }),
      { status: 400, headers: { ...corsH, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    // requireAuth / verifyCompanyAccess lanciano Response direttamente
    if (err instanceof Response) return err
    console.error('[gestisci-sede] unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Errore interno del server' }),
      { status: 500, headers: { ...corsH, 'Content-Type': 'application/json' } }
    )
  }
})

import { getCorsHeaders } from '../_shared/headers.ts'
import { requireAuth } from '../_shared/auth.ts'
import { verifyCompanyAccess } from '../_shared/companyAuth.ts'
import { verificaPermessoAzienda } from '../_shared/permessoAzienda.ts'

// v8.6.42 — Rimosso 'cantiere': i cantieri sono `orders`, non sedi. La
// migration di safety (UPDATE+CHECK) downgrade i record esistenti a 'altro'
// prima di stringere il vincolo.
const TIPI_SEDE = new Set(['showroom', 'magazzino', 'ufficio', 'altro'])
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/
const CAP = /^\d{5}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE = /^[+()0-9\s.-]{6,30}$/

type SedePayload = {
  nome?: string
  tipo?: string
  indirizzo?: string | null
  citta?: string | null
  cap?: string | null
  provincia?: string | null
  regione?: string | null
  nazione?: string | null
  telefono?: string | null
  email?: string | null
  responsabile_sede?: string | null
  orari_apertura?: string | null
  note_interne?: string | null
  lat?: number | null
  lng?: number | null
  colore?: string
  attiva?: boolean
  principale?: boolean
}

function json(body: unknown, status: number, corsH: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsH, 'Content-Type': 'application/json' },
  })
}

function cleanOptionalText(value: unknown) {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function normalizeName(value: unknown) {
  if (typeof value !== 'string') return undefined
  return value.trim().replace(/\s+/g, ' ')
}

function sanitizePayload(raw: Record<string, unknown>, isCreate: boolean): SedePayload {
  const payload: SedePayload = {}

  const nome = normalizeName(raw.nome)
  if (nome !== undefined) payload.nome = nome

  if (typeof raw.tipo === 'string') payload.tipo = raw.tipo

  const indirizzo = cleanOptionalText(raw.indirizzo)
  if (indirizzo !== undefined) payload.indirizzo = indirizzo

  const citta = cleanOptionalText(raw.citta)
  if (citta !== undefined) payload.citta = citta

  const cap = cleanOptionalText(raw.cap)
  if (cap !== undefined) payload.cap = cap

  const provincia = cleanOptionalText(raw.provincia)
  if (provincia !== undefined) payload.provincia = provincia?.toUpperCase() ?? null

  const regione = cleanOptionalText(raw.regione)
  if (regione !== undefined) payload.regione = regione

  const nazione = cleanOptionalText(raw.nazione)
  if (nazione !== undefined) payload.nazione = nazione

  const telefono = cleanOptionalText(raw.telefono)
  if (telefono !== undefined) payload.telefono = telefono

  const email = cleanOptionalText(raw.email)
  if (email !== undefined) payload.email = email?.toLowerCase() ?? null

  const responsabile = cleanOptionalText(raw.responsabile_sede)
  if (responsabile !== undefined) payload.responsabile_sede = responsabile

  const orari = cleanOptionalText(raw.orari_apertura)
  if (orari !== undefined) payload.orari_apertura = orari

  const note = cleanOptionalText(raw.note_interne)
  if (note !== undefined) payload.note_interne = note

  if (raw.lat === null || raw.lat === '') payload.lat = null
  else if (raw.lat !== undefined) payload.lat = Number(raw.lat)

  if (raw.lng === null || raw.lng === '') payload.lng = null
  else if (raw.lng !== undefined) payload.lng = Number(raw.lng)

  if (typeof raw.colore === 'string') payload.colore = raw.colore
  if (typeof raw.attiva === 'boolean') payload.attiva = raw.attiva
  if (typeof raw.principale === 'boolean') payload.principale = raw.principale

  if (isCreate || payload.nome !== undefined) {
    if (!payload.nome || payload.nome.length < 2) throw new Error('Nome sede richiesto')
  }
  if (isCreate || payload.tipo !== undefined) {
    if (!payload.tipo || !TIPI_SEDE.has(payload.tipo)) throw new Error('Tipo sede non valido')
  }
  if (payload.cap && !CAP.test(payload.cap)) throw new Error('CAP non valido')
  if (payload.provincia && payload.provincia.length !== 2) throw new Error('Provincia non valida')
  if (payload.email && !EMAIL.test(payload.email)) throw new Error('Email sede non valida')
  if (payload.telefono && !PHONE.test(payload.telefono)) throw new Error('Telefono sede non valido')
  if (payload.lat !== undefined && payload.lat !== null && (!Number.isFinite(payload.lat) || payload.lat < -90 || payload.lat > 90)) {
    throw new Error('Latitudine sede non valida')
  }
  if (payload.lng !== undefined && payload.lng !== null && (!Number.isFinite(payload.lng) || payload.lng < -180 || payload.lng > 180)) {
    throw new Error('Longitudine sede non valida')
  }
  if (payload.colore && !HEX_COLOR.test(payload.colore)) throw new Error('Colore sede non valido')

  return payload
}

async function ensureUniqueName(
  supabase: any,
  companyId: string,
  nome: string | undefined,
  sedeId?: string,
) {
  if (!nome) return
  const { data, error } = await supabase
    .from('sedi')
    .select('id,nome')
    .eq('company_id', companyId)

  if (error) throw new Error('Impossibile verificare duplicati sede')

  const normalized = nome.toLocaleLowerCase('it-IT')
  const duplicate = (data ?? []).find((sede: { id: string; nome: string }) =>
    sede.id !== sedeId && sede.nome.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it-IT') === normalized
  )
  if (duplicate) throw new Error('Esiste già una sede con questo nome')
}

async function ensureSinglePrimary(supabase: any, companyId: string) {
  const { data: activePrimary = [] } = await supabase
    .from('sedi')
    .select('id')
    .eq('company_id', companyId)
    .eq('attiva', true)
    .eq('principale', true)
    .order('created_at', { ascending: true })

  if (activePrimary.length > 0) {
    const keepId = activePrimary[0].id
    if (activePrimary.length > 1) {
      await supabase
        .from('sedi')
        .update({ principale: false })
        .eq('company_id', companyId)
        .eq('attiva', true)
        .neq('id', keepId)
    }
    return
  }

  const { data: next } = await supabase
    .from('sedi')
    .select('id')
    .eq('company_id', companyId)
    .eq('attiva', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!next?.id) return

  await supabase
    .from('sedi')
    .update({ principale: true })
    .eq('company_id', companyId)
    .eq('id', next.id)
}

async function ensureCanManageSedi(supabase: any, userId: string, companyId: string) {
  // Chi può modificare le sedi di QUESTA azienda: l'amministratore della sua
  // azienda o da accesso multi-azienda attivo, o lo staff con le impostazioni.
  // Fino al 26/09/2026 bastava essere amministratore di un'azienda qualsiasi:
  // chi lo era nella propria entrava da staff in un'altra e passava anche lì.
  try {
    await verificaPermessoAzienda(supabase, userId, companyId, ['can_edit_settings', 'can_edit_settings_orders'], 'modificare le sedi')
  } catch {
    throw new Error('Permesso insufficiente per modificare le sedi')
  }
}

async function ensureSedeIsNotLinked(supabase: any, companyId: string, sedeId: string) {
  const checks = [
    { table: 'quotes', label: 'preventivi' },
    { table: 'orders', label: 'ordini' },
    { table: 'marketing_contacts', label: 'contatti' },
    { table: 'company_costs', label: 'costi' },
    { table: 'invoices', label: 'fatture' },
  ]

  for (const check of checks) {
    const { count, error } = await supabase
      .from(check.table)
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('sede_id', sedeId)

    if (error) throw new Error('Impossibile verificare i collegamenti della sede')
    if ((count ?? 0) > 0) {
      throw new Error(`Sede collegata a ${check.label}: disattivala invece di eliminarla`)
    }
  }
}

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
      return json({ error: 'action e company_id richiesti' }, 400, corsH)
    }

    // Verifica che l'utente autenticato appartenga alla company richiesta
    await verifyCompanyAccess(supabase, userId, company_id)
    await ensureCanManageSedi(supabase, userId, company_id)

    // ── CREA SEDE ────────────────────────────────────────────
    if (action === 'crea') {
      const sedePayload = sanitizePayload(payload, true)
      await ensureUniqueName(supabase, company_id, sedePayload.nome)

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
        return json({
          error:   'LIMITE_PIANO',
          message: 'Upgrade a Pro per aggiungere più sedi',
        }, 403, corsH)
      }

      // Se è la prima sede, la rendiamo principale automaticamente
      const isPrima = (count ?? 0) === 0
      const principale = isPrima || sedePayload.principale === true
      if (principale) {
        await supabase
          .from('sedi')
          .update({ principale: false })
          .eq('company_id', company_id)
      }

      const { data, error } = await supabase
        .from('sedi')
        .insert({ company_id, attiva: true, ...sedePayload, principale })
        .select()
        .single()

      if (!error) await ensureSinglePrimary(supabase, company_id)

      return json({ sede: data, error }, error ? 500 : 200, corsH)
    }

    // ── AGGIORNA SEDE ────────────────────────────────────────
    if (action === 'aggiorna') {
      if (!sede_id) {
        return json({ error: 'sede_id richiesto per aggiornamento' }, 400, corsH)
      }

      const sedePayload = sanitizePayload(payload, false)
      await ensureUniqueName(supabase, company_id, sedePayload.nome, sede_id)

      // Se si imposta come principale, de-imposta le altre
      if (sedePayload.principale === true) {
        await supabase
          .from('sedi')
          .update({ principale: false })
          .eq('company_id', company_id)
          .neq('id', sede_id)
        sedePayload.attiva = true
      }

      const { data, error } = await supabase
        .from('sedi')
        .update(sedePayload)
        .eq('id', sede_id)
        .eq('company_id', company_id)
        .select()
        .single()

      if (!error && sedePayload.attiva === false) {
        await supabase
          .from('sedi')
          .update({ principale: false })
          .eq('company_id', company_id)
          .eq('id', sede_id)
          .eq('attiva', false)
        await ensureSinglePrimary(supabase, company_id)
      }
      if (!error && sedePayload.attiva !== false) {
        await ensureSinglePrimary(supabase, company_id)
      }

      return json({ sede: data, error }, error ? 500 : 200, corsH)
    }

    // ── DISATTIVA SEDE ───────────────────────────────────────
    if (action === 'disattiva') {
      if (!sede_id) {
        return json({ error: 'sede_id richiesto per disattivazione' }, 400, corsH)
      }

      const { error } = await supabase
        .from('sedi')
        .update({ attiva: false, principale: false })
        .eq('id', sede_id)
        .eq('company_id', company_id)

      if (!error) await ensureSinglePrimary(supabase, company_id)

      return json({ ok: !error, error }, error ? 500 : 200, corsH)
    }

    // ── ELIMINA SEDE ─────────────────────────────────────────
    if (action === 'elimina') {
      if (!sede_id) {
        return json({ error: 'sede_id richiesto per eliminazione' }, 400, corsH)
      }

      await ensureSedeIsNotLinked(supabase, company_id, sede_id)

      const { error } = await supabase
        .from('sedi')
        .delete()
        .eq('id', sede_id)
        .eq('company_id', company_id)

      if (!error) await ensureSinglePrimary(supabase, company_id)

      return json({ ok: !error, error }, error ? 500 : 200, corsH)
    }

    return json({ error: `Azione non riconosciuta: ${action}` }, 400, corsH)

  } catch (err) {
    // requireAuth lancia Response direttamente
    if (err instanceof Response) return err
    // verifyCompanyAccess lancia Error
    const message = err instanceof Error ? err.message : 'Errore interno del server'
    console.error('[gestisci-sede] error:', message)
    const status = message.includes('Non autorizzato') || message.includes('Permesso insufficiente')
      ? 403
      : message.includes('Sede collegata')
        ? 409
        : 500
    return json({ error: message }, status, corsH)
  }
})

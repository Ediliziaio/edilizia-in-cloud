// Migration compatibility is opt-in and scoped to the explicitly migrated company.
export const SOLARIA_COMPANY = '3f52a5ed-0b4f-4f8f-8b92-a13f3361e474';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isSolariaCompat(cfg, companyId) {
  return companyId === SOLARIA_COMPANY && typeof cfg?.migration_source_node_id === 'string';
}
export function solariaTimeoutValid(cfg, companyId, days) {
  return Number.isFinite(days) && days > 0 && days <= 365 &&
    (Number.isInteger(days) || (isSolariaCompat(cfg, companyId) && Number(cfg.migration_timeout_hours) === days * 24));
}
export function solariaReplyValue(cfg, companyId, field, queue) {
  if (!isSolariaCompat(cfg, companyId) || field !== 'trigger.message') return { handled: false };
  const p = queue?.context_json?.payload ?? {};
  const value = typeof p.message === 'string' ? p.message
    : typeof p.message_body === 'string' ? p.message_body
    : typeof p.text === 'string' ? p.text
    : typeof p.body === 'string' ? p.body : '';
  return { handled: true, value };
}
export function solariaStagePatch(existing, targetStage, currentStage, allowBackwards) {
  if (!targetStage || targetStage.id === existing.stage_id) return {};
  if (!allowBackwards && currentStage && targetStage.position < currentStage.position) return {};
  return { stage_id: targetStage.id };
}
export function solariaAfterDelay(cfg, companyId, context, result) {
  if (!isSolariaCompat(cfg, companyId)) return context;
  return { ...(context ?? {}), _solaria_skip_outgoing: cfg.delay_tipo === 'prima_appuntamento' && result.success === true && result.isDelay === true && result.delayMs === 0 };
}
export function solariaSkipOutgoing(cfg, companyId, context, action) {
  return isSolariaCompat(cfg, companyId) && context?._solaria_skip_outgoing === true && ['send_email','send_whatsapp','send_whatsapp_locale','send_sms'].includes(action);
}
function check(result, message) {
  if (result.error) throw new Error(result.error.message || message);
  return result.data;
}

export async function runSolariaAction({ db, cfg, companyId, entityId, queue, contact, resolveText, now = new Date() }) {
  if (!isSolariaCompat(cfg, companyId)) return null;
  const action = cfg.action_type ?? cfg.item_id;
  const relevant = action === 'squadd_add_notes' || action === 'squadd_drip' ||
    (action === 'aggiungi_tag' && cfg.migration_pipeline_tag === true) ||
    (action === 'aggiorna_campo' && cfg.migration_value === 'Data attuale') ||
    (action === 'crea_opportunita' && cfg.migration_create_update === true);
  if (!relevant) return null;
  if (!UUID.test(String(queue?.id ?? '')) || !UUID.test(String(queue?.flow_id ?? ''))) throw new Error('Contesto di esecuzione non valido');
  const flow = check(await db.from('automation_flows').select('id,created_by').eq('id', queue.flow_id).eq('company_id', companyId).maybeSingle(), 'Flusso non trovato');
  if (!flow) throw new Error('Flusso non appartenente all’azienda');
  if (queue?.context_json?.payload?.test_mode === true || queue?.context_json?.payload?.dry_run === true) return { success: true, output: { action, simulated: true } };
  if (action === 'squadd_drip') {
    const batch = Number(cfg.migration_batch_size), seconds = Number(cfg.migration_interval_seconds);
    if (!Number.isSafeInteger(batch) || batch < 1 || batch > 1000 || !Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) throw new Error('Rilascio a lotti non configurato');
    const at = check(await db.rpc('solaria_reserve_drip_slot', { p_company: companyId, p_flow: queue.flow_id, p_node: queue.current_node_id, p_queue: queue.id, p_batch: batch, p_seconds: seconds }), 'Prenotazione del lotto fallita');
    const target = Date.parse(String(at));
    if (!Number.isFinite(target)) throw new Error('Orario del lotto non valido');
    return { success: true, isDelay: true, delayMs: Math.max(0, target - now.getTime()), output: { action, reserved_at: new Date(target).toISOString(), batch_size: batch, interval_seconds: seconds } };
  }
  const c = await contact();
  if (!c?.id || c.company_id !== companyId) throw new Error('Contatto non appartenente all’azienda');
  if (action === 'squadd_add_notes') {
    const content = await resolveText(String(cfg.migration_note_text ?? ''), c);
    if (!content.trim()) throw new Error('Testo della nota vuoto');
    // Queue ID is stable across retries. Never create the same automatic note twice.
    const old = check(await db.from('marketing_contact_notes').select('id,company_id,contact_id').eq('id', queue.id).maybeSingle(), 'Verifica nota fallita');
    if (old && (old.company_id !== companyId || old.contact_id !== c.id)) throw new Error('Identificatore nota già usato da un altro record');
    if (!old) {
      const result = await db.from('marketing_contact_notes').upsert({ id: queue.id, company_id: companyId, contact_id: c.id, content, created_by: flow.created_by, automatica: true }, { onConflict: 'id', ignoreDuplicates: true });
      check(result, 'Nota non salvata');
    }
    return { success: true, output: { action: 'add_contact_note', note_id: queue.id, existing: !!old } };
  }
  if (action === 'aggiorna_campo') {
    const id = String(cfg.campo ?? '').replace(/^custom_field\./, '');
    if (!UUID.test(id)) throw new Error('Campo personalizzato non valido');
    const def = check(await db.from('marketing_custom_fields').select('id,company_id,object_type,field_type,deleted_at').eq('id', id).eq('company_id', companyId).is('deleted_at', null).maybeSingle(), 'Verifica campo fallita');
    if (!def || def.id !== id || def.company_id !== companyId || def.object_type !== 'contact' || def.field_type !== 'date' || def.deleted_at) throw new Error('Campo data non disponibile per questo contatto');
    // The imported field is a calendar date, not an ISO timestamp. Match Solaria's Rome timezone.
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = type => parts.find(p => p.type === type)?.value;
    const value = `${part('year')}-${part('month')}-${part('day')}`;
    const old = check(await db.from('marketing_contact_field_values').select('value').eq('contact_id', c.id).eq('field_id', id).maybeSingle(), 'Lettura data fallita');
    if (old?.value !== value) {
      // cf_validate_value rechecks contact/field company and type atomically on the server.
      const saved = check(await db.from('marketing_contact_field_values').upsert({ contact_id: c.id, field_id: id, value }, { onConflict: 'contact_id,field_id' }).select('field_id,value').maybeSingle(), 'Data non salvata');
      if (saved?.field_id !== id || saved?.value !== value) throw new Error('Il server non ha confermato la data salvata');
    }
    return { success: true, output: { action: 'update_field', field_id: id, entity_type: 'contact', entity_id: c.id, value, existing: old?.value === value } };
  }
  if (action === 'aggiungi_tag') {
    const payload = queue.context_json?.payload ?? {};
    let pipeline = payload.pipeline_id;
    const opportunityId = payload.opportunity_id ?? (queue.entity_type === 'opportunity' ? entityId : null);
    if (opportunityId) {
      if (!UUID.test(String(opportunityId))) throw new Error('Opportunità evento non valida');
      const opportunity = check(await db.from('marketing_opportunities').select('pipeline_id').eq('id', opportunityId).eq('company_id', companyId).maybeSingle(), 'Opportunità evento non trovata');
      if (!opportunity) throw new Error('Opportunità evento non appartenente all’azienda');
      pipeline = opportunity.pipeline_id;
    }
    if (!UUID.test(String(pipeline ?? ''))) throw new Error('Pipeline evento mancante');
    const record = check(await db.from('marketing_pipelines').select('id,name').eq('id', pipeline).eq('company_id', companyId).maybeSingle(), 'Pipeline evento non trovata');
    if (!record?.name) throw new Error('Pipeline evento non appartenente all’azienda');
    const category = cfg.migration_pipeline_category_tags?.[pipeline];
    const added = ['pl - ' + record.name.trim().toLowerCase(), ...(typeof category === 'string' ? [category] : [])];
    const tags = [...new Set([...(Array.isArray(c.tags) ? c.tags : []), ...added])];
    const rows = check(await db.from('marketing_contacts').update({ tags }).eq('id', c.id).eq('company_id', companyId).select('id'), 'Etichette pipeline non salvate');
    if (!rows?.length) throw new Error('Nessun contatto aggiornato');
    return { success: true, output: { action: 'pipeline_tags', pipeline_id: pipeline, tags: added } };
  }
  // Legacy Create/Update: update an existing opportunity in this pipeline,
  // honour the backwards-stage setting, and never manufacture duplicates.
  const pipeline = String(cfg.pipeline_id ?? ''), stage = String(cfg.stage_id ?? '');
  if (!UUID.test(pipeline)) throw new Error('Pipeline mancante nell’originale: selezionare la destinazione');
  const p = check(await db.from('marketing_pipelines').select('id').eq('id', pipeline).eq('company_id', companyId).maybeSingle(), 'Pipeline non trovata');
  if (!p) throw new Error('Pipeline non appartenente all’azienda');
  let target = null;
  if (stage) {
    if (!UUID.test(stage)) throw new Error('Fase non valida');
    target = check(await db.from('marketing_pipeline_stages').select('id,position').eq('id', stage).eq('pipeline_id', pipeline).eq('company_id', companyId).maybeSingle(), 'Fase non trovata');
    if (!target) throw new Error('Fase non appartenente alla pipeline');
  }
  const rows = check(await db.from('marketing_opportunities').select('id,stage_id,name,value,source,status').eq('company_id', companyId).eq('contact_id', c.id).eq('pipeline_id', pipeline).is('deleted_at', null).order('updated_at', { ascending: false }).limit(1), 'Lettura opportunità fallita');
  const existing = rows?.[0];
  if (!existing) return null; // Use the existing native creation path and its validations.
  let current = null;
  if (existing.stage_id) current = check(await db.from('marketing_pipeline_stages').select('id,position').eq('id', existing.stage_id).eq('pipeline_id', pipeline).eq('company_id', companyId).maybeSingle(), 'Fase attuale non trovata');
  const patch = { ...solariaStagePatch(existing, target, current, cfg.migration_allow_backwards === true), updated_at: now.toISOString() };
  if (cfg.migration_explicit_name) patch.name = await resolveText(cfg.migration_explicit_name, c);
  if (cfg.migration_explicit_source) patch.source = await resolveText(cfg.migration_explicit_source, c);
  if (cfg.migration_explicit_status) patch.status = cfg.migration_explicit_status;
  if (cfg.migration_explicit_value !== undefined) {
    const value = Number(await resolveText(String(cfg.migration_explicit_value), c));
    if (!Number.isFinite(value) || value < 0) throw new Error('Valore opportunità non valido');
    patch.value = value;
  }
  const written = check(await db.from('marketing_opportunities').update(patch).eq('id', existing.id).eq('company_id', companyId).select('id'), 'Aggiornamento opportunità fallito');
  if (!written?.length) throw new Error('Nessuna opportunità aggiornata');
  return { success: true, output: { action: 'create_update_opportunity', opportunity_id: existing.id, updated: true, stage_moved: !!patch.stage_id } };
}

export function solariaWaitTimeoutDays(cfg, companyId) {
  const native = cfg.timeout_days == null || cfg.timeout_days === '' ? 7 : Number(cfg.timeout_days);
  const hours = Number(cfg.migration_timeout_override_hours);
  const sourceHours = Number(cfg.migration_timeout_hours);
  if (isSolariaCompat(cfg, companyId) && Number.isFinite(hours) && hours > 0 && hours <= 365 * 24 &&
      hours === sourceHours && cfg.delay_unita === 'ore' && Number(cfg.delay_durata) === hours &&
      native === Math.ceil(hours / 24)) return hours / 24;
  return native;
}

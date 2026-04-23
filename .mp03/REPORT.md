# MP03 — REPORT FINALE

## Metadata
- Completato il: 2026-04-23
- Branch: feature/mp03-handlers-assistenza-lead-marketing-notifiche
- Base: feature/mp02-bot-operativo-tool-calling (PR #8 pending)
- Deploy edge: 6 function deployate su project rsbrguhkodgnqfomrevo

## Deliverable
- [x] Migration `20260423180000_mp03_handlers_support.sql` applicata (support_tickets + wa_meta_templates + wa_notifiche_triggers + wa_notifiche_cooldown + wa_notifiche_log + marketing_contacts extensions)
- [x] Handler assistenza production (83 righe) — resolve/create marketing_contact + STOP + invoke processor
- [x] Handler lead production (89 righe) — auto-create lead + qualificazione + handoff
- [x] Handler marketing production (108 righe) — broadcast reply + opt-out + route ad assistenza
- [x] Handler notifiche production (27 righe) — log + dispatch audit
- [x] Helper `_contact.ts` condiviso (138 righe) — resolveOrCreateContact + isStopMessage + markOptOut + sendPlainReply
- [x] Sub-processor `assistenza-ai-processor` (221 + 346 righe) — 6 tool: apri_ticket, stato_mio_ordine, miei_pagamenti, richiedi_callback, segnala_urgente, lista_documenti
- [x] Sub-processor `lead-ai-processor` (176 + 240 righe) — 4 tool: salva_dato_qualificazione, verifica_qualificazione_completa, handoff_commerciale, proponi_appuntamento
- [x] Cron `sync-meta-templates` (118 righe) — sync Meta Business templates ogni 6h
- [x] Cron `process-scheduled-broadcasts` (160 righe) — rate limit 60/min/numero, opt-out check bulk
- [x] Cron `check-wa-notifiche` (265 righe) — trigger cron-based: fattura_scaduta, approvazione_pendente + cooldown anti-spam

## Verifiche runtime (smoke test prod)
- ✅ sync-meta-templates: HTTP 200, synced=0 (no waba attivi) — OK struttura funzionante
- ✅ process-scheduled-broadcasts: HTTP 200, processed=0 (no broadcast scheduled) — OK
- ✅ check-wa-notifiche: HTTP 200, fired=0 (no triggers enabled) — OK
- ✅ Tutti gli endpoint cron verificano JWT role=service_role + fallback x-cron-secret
- ✅ tsc --noEmit pulito
- ✅ Vite build OK
- ✅ Identity router MP02 ancora funzionante post-deploy

## Deviazioni dal masterprompt (adattamenti schema reale)
1. **marketing_contacts invece di crm_contacts** — quest'ultima non esiste nel DB. Estesa con `opt_out`, `opt_out_at`, `tipo`, `stato`, `source`, `qualificazione_json`, `telefono_normalized`.
2. **support_tickets create da zero** — tabella non esisteva, creata con campi del masterprompt.
3. **RLS via profiles.company_id** — `user_company_roles` del masterprompt non esiste; usato `profiles.company_id` + `user_roles.role`.
4. **invoices + fatture_ricevute** invece di `fatture_attive`/`fatture_passive` (vedi MP02 deviation).
5. **whatsapp_broadcast_recipients**: usa colonne reali `phone_number`, `status` (non `to_phone`, `stato`). `variables` JSONB (non `variables_resolved`). Trigger `refresh_broadcast_counters` NON esiste — rimosso dal flow, counter calcolato on-read.
6. **Notifiche event-driven** (preventivo_inviato, sal_raggiunto, fattura_emessa) non implementate in MP03 — rinviate a MP4 (richiedono DB triggers).
7. **sync-meta-templates**: token lettura diretta da `access_token_encrypted` (in MP01 è stored plaintext; decrypt corretto in MP4).

## Cron scheduling (da configurare in Supabase Dashboard o pg_cron)
```sql
-- pg_cron (Supabase Dashboard → Database → Extensions → enable pg_cron)
SELECT cron.schedule('sync-meta-templates', '0 */6 * * *',
  $$SELECT net.http_post(url:='https://<PROJECT>.supabase.co/functions/v1/sync-meta-templates',
    headers:='{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb)$$);
SELECT cron.schedule('process-scheduled-broadcasts', '* * * * *',
  $$SELECT net.http_post(url:='https://<PROJECT>.supabase.co/functions/v1/process-scheduled-broadcasts',
    headers:='{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb)$$);
SELECT cron.schedule('check-wa-notifiche', '*/15 * * * *',
  $$SELECT net.http_post(url:='https://<PROJECT>.supabase.co/functions/v1/check-wa-notifiche',
    headers:='{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb)$$);
```

## Template Meta da configurare (prerequisito uso in prod)
Gli handler/cron presuppongono questi template UTILITY approvati su Meta Business Manager:
- [ ] `alert_fattura_scaduta` — notifica fatture scadute (variabili: numero, cliente, importo, scadenza)
- [ ] `alert_ticket_urgente` — escalation ticket assistenza
- [ ] `alert_approvazione_pendente` — segnalazioni >3gg in attesa
- [ ] `notifica_preventivo` — preventivo inviato
- [ ] `notifica_avanzamento` — SAL raggiunto
- [ ] `benvenuto_lead` — primo contatto lead

## Known issues / TODO per MP04
- Trigger event-driven notifiche (preventivo_inviato, sal_raggiunto, fattura_emessa) — richiedono DB triggers su INSERT rispettive tabelle.
- access_token_encrypted legge plaintext in MP01/MP02/MP03 — migrazione a decrypt reale in MP04.
- Frontend UI campagne marketing — spostato in MP04.
- Test fixture 20+ scenari conversazionali — ho creato fixture minimali; test runner node completo TBD.
- Template Meta approvati lato Meta Business Manager — deve essere fatto manualmente da Florin dopo PR.

## Firma
- Masterprompt: MP03 v1.0
- Agent: Claude Code (Sonnet 4.6)
- Sessione: 1 (continua da MP01+MP02)

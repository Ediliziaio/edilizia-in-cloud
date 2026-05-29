# STATUS — MP-ADS-04 (Completamento modulo Pubblicità Meta)
Branch: fix/ads-complete-mp04
Ultimo aggiornamento: 2026-05-29

## Task
- [x] GAP-3  Scope ads_management + avviso re-consent
- [ ] GAP-1  Automation Runner (function + cron + applyAction + cooldown)
- [ ] GAP-1b Frontend: last_evaluated_at / trigger_count in AutomationRulesEditor
- [ ] GAP-2  Tabella meta_ab_tests
- [ ] GAP-2b ABTestDialog.onConfirm -> duplicate + applica variabile + insert test
- [ ] GAP-2c Lettura vincitore (meta-ads-ab-evaluate o frontend)

## Log sessioni
### 2026-05-29 — sessione 1
- Fatto: GAP-3 — aggiunto `ads_management` agli scope di meta-oauth-start; il callback
  ora salva `granted_scopes` anche in `integrations.metadata` (non sensibile); avviso
  "Riconnetti" in MetaIntegrationWizard quando manca ads_management (o metadata assente = token vecchio).
- Verifica: `grep -n ads_management supabase/functions/meta-oauth-start/index.ts` -> 1 risultato; tsc -> (in corso)
- Commit: <hash>
- Prossimo step: GAP-1 (automation runner).

## Note / schemi verificati
- `silvio_pending_approvals` colonne REALI = id, action_id (uuid), preview_md, context (jsonb),
  status, expires_at, resolved_by, resolved_at, resolution_note, modified_payload, created_at.
  ⚠️ NON ha company_id/kind/payload come da pseudocodice del doc → adattare la branch "requires_confirmation".
- `meta-ads-update-campaign` action:duplicate ritorna `{ success, action:"duplicate", new_campaign_id }`.
- `ad_automation_rules` = trigger(jsonb), action(jsonb), scope_filter(jsonb), requires_confirmation,
  is_enabled, last_evaluated_at, last_triggered_at, trigger_count, company_id, name.
- `meta_campaigns` = id, company_id, meta_campaign_id, ad_account_id, daily_budget_cents, status, name, builder_state.
- `meta_insights_cache` = company_id, ad_account_id(text), date_start, date_end, level, payload_json(jsonb).
  NB: insights per ad_account+level+range; il dato per-campagna è dentro payload_json.
- `ad_audit_log` = company_id, entity_type, entity_id, entity_name, action, performed_by, is_automatic, changes(jsonb), notes.
- `granted_scopes` salvato in `integration_credentials` (con token → non client-readable) + ora anche in `integrations.metadata`.

# MP05-FIX — REPORT FINALE

## Metadata
- Completato il: 2026-04-24
- Branch: feature/mp05-fix-ownership-markup
- Base: feature/mp05-ai-provider-openrouter (PR #12)
- Scope: SuperAdmin-ownership, markup per-task, scalo crediti ai_credits atomico

## Audit pre-fix (snapshot salvato)
- Righe `ai_model_config` con company_id NOT NULL: **0** (nessuna da archiviare)
- Saldo totale `ai_credits`: **€50.0000** (2 wallets)
- Tabelle pre-esistenti confermate: `ai_credits`, `ai_credit_transactions`, `ai_credit_usage`, `platform_settings`

## Deliverable

### DB (2 migrations applicate)
- `20260424120000_mp05fix_pricing_markup_billing.sql`:
  - NEW `ai_pricing_markup` (11 task_kind seed con markup 2.0×-5.0×)
  - ALTER `ai_model_usage_log` (+ usd_eur_rate, cost_real_eur, markup_applied_pct, cost_billed_eur, margin_eur, credits_deducted, credit_tx_id)
  - `ai_model_config` CHECK company_id IS NULL + archive tabella `ai_model_config_archive_mp05fix` + RLS SuperAdmin-only write
  - `platform_settings` seed (usd_eur_rate=0.92, ai_min_balance_eur_to_call=0.05, ai_warn_balance_eur=2.00)
  - RPC `deduct_ai_credits_with_markup(company,task,model,cost,tokens)` atomica (lock wallet + scalo + log usage + tx ai_credit_transactions)
  - RPC `check_ai_credits_available(company,est_cost,task)` per precall (no writes)
  - VIEW `v_company_ai_spend` (aggregato azienda: solo cost_billed_eur, no real/margin)
- `20260424120100_mp05fix_rpc_ambiguity_fix.sql`: hotfix output columns `o_*` per evitare ambiguità colonna/variabile in PL/pgSQL

### Modulo provider (3 file)
- `config.ts` refactored: rimosso lookup per-company; solo `ai_model_config WHERE company_id IS NULL`
- `billing.ts` NEW: `precallCheck()` + `chargeAndLog()` (wrapper RPC)
- `index.ts` refactored: class `InsufficientCreditsError`, precallCheck → chain → chargeAndLog

### Handler crediti (3 processor)
- `whatsapp-ai-processor/index.ts`: catch `InsufficientCreditsError` → invia `user_message_it` → markDone `failed` con `credits_{reason}`
- `assistenza-ai-processor/index.ts`: idem + HTTP 402
- `lead-ai-processor/index.ts`: idem + HTTP 402

### Rimozioni UI azienda (F1-F3 rispettate)
- `src/pages/azienda/AiModelConfigPage.tsx` **ELIMINATO** (backup in `.mp05-fix/backup/`)
- Rotta `/azienda/ai-modelli` rimossa da `companyRoutes.tsx`
- `src/hooks/ai-provider.ts` refactored:
  - RIMOSSI: `useAiModelConfig`, `useUpdateAiModelConfig`, `useAiUsageStats`
  - MANTENUTI: `useAiModelCatalog`, `useSyncOpenRouterCatalog`
  - AGGIUNTO: `useCompanyAiSpendStats` (view `v_company_ai_spend`, solo cost_billed)

### UI SuperAdmin NEW (5 componenti)
- `AdminAiMarginsPanel` — container con 4 sub-tab
- `AdminAiMarginsOverview` — 4 KPI card (real/billed/margin/calls) + breakdown per task
- `AdminMarkupConfigTab` — editor markup ×(1-20) per task con margine teorico + esempio live
- `AdminModelConfigTab` — select primary model + budget max per task (company_id=NULL)
- `AdminAiPerCompanyTable` — breakdown 30gg spesa/margine per azienda con JOIN companies.name

### Integrazione AdminRevenueDashboard
- Nuova tab "AI Provider" con icona Zap
- Import + render `<AdminAiMarginsPanel />`

## Verifiche smoke
- ✅ `tsc --noEmit` pulito
- ✅ `npm run build` OK
- ✅ Migration applicate in prod (2/2)
- ✅ 11 righe `ai_pricing_markup` seedate (vision_ddt/computo_metrico ×5, lead ×4, default ×3, bank ×2)
- ✅ RPC `check_ai_credits_available` risponde corretto (`below_minimum` su company_id inesistente)
- ✅ RPC `deduct_ai_credits_with_markup` creata (test unit manuale richiede company reale)
- ✅ Flow billing attivo in `ai-provider-test`: `invalid_api_key` → log logged, no scalo (no key prod)
- ✅ **Wallet totale €50.0000 INVARIATO post-fix** (F10 rispettata)
- ✅ `ai_model_config` righe company_id NOT NULL = **0** (CHECK attivo)
- ✅ Rotta azienda `/ai-modelli` → **404** (rimossa)
- ✅ Deploy 4 edge function aggiornate

## Markup listino seedato

| Task | Markup | Margine % |
|---|---|---|
| bot_operativo_titolare | 3.00× | 66.7% |
| bot_operativo_operaio | 2.50× | 60.0% |
| assistenza_clienti | 2.50× | 60.0% |
| lead_qualificazione | 4.00× | 75.0% |
| vision_ddt | 5.00× | 80.0% |
| vision_cantiere | 3.50× | 71.4% |
| parse_rapportino | 3.00× | 66.7% |
| computo_metrico | 5.00× | 80.0% |
| bank_categorize | 2.00× | 50.0% |
| chat_routine | 2.50× | 60.0% |
| default | 3.00× | 66.7% |

## Azioni Florin post-merge
1. Verifica in produzione Admin Dashboard → Revenue → tab AI Provider
2. Aggiusta markup se serve da `/admin/revenue?tab=ai-margins`
3. Set `OPENROUTER_API_KEY` (se non ancora fatto) per attivare AI reale
4. Ricarica €20-50 OpenRouter + seed credito aziende test
5. Dopo 30gg di stabilità: `DROP TABLE ai_model_config_archive_mp05fix`

## Breaking changes
Nessuno. Il fix è **additivo** (+nuove tabelle/colonne/RPC), **sottrattivo controllato** (elimina solo UI azienda e company-specific config non usata con 0 righe).

## Firma
- Masterprompt: MP05-FIX v1.1
- Agent: Claude Code (Sonnet 4.6)
- Snapshot pre-fix: wallets=2, total=€50 (invariato post-fix)

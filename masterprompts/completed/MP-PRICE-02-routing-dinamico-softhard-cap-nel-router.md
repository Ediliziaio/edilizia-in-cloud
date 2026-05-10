# MP-PRICE-02 — Routing dinamico soft/hard cap nel router

## 🎯 Obiettivo
Estende aiRouter con precheckBudget. Soft cap→downgrade modello. Hard cap→block o auto-charge.

## 📦 Stato finale
- **Stato**: ✅ COMPLETATO
- **Data chiusura**: 2026-05-09
- **Branch merged**: integrato direttamente in `main` insieme a MP-PRICE-01
- **Commit reference**: `supabase/functions/_shared/aiRouter.ts` linee 700-768

## ✅ Implementazione effettiva

### 1. RPC backend
- `check_company_budget_v2(p_company_id uuid)` in
  `supabase/migrations/20260506091900_pricing_payg_topups.sql`
- Ritorna jsonb con `effective_cap_status` (`ok` | `soft_cap` | `hard_cap`),
  `effective_usage_pct`, `on_soft_cap`, `on_hard_cap`, top-up PAYG sommato.

### 2. Precheck nel router
- `aiRouterComplete()` in `supabase/functions/_shared/aiRouter.ts` chiama
  l'RPC PRIMA di executeProvider.
- **soft_cap** + `on_soft_cap=downgrade_models` → riordina `modelsToTry`
  promuovendo il primo fallback come primario; primary originale resta come
  ultima chance (best-effort se downgrade fail).
- **soft_cap** + `on_soft_cap=block` → throw AiRouterError user-friendly.
- **hard_cap** + `on_hard_cap=block|require_topup` → throw con messaggio
  specifico sul top-up.
- **hard_cap** + `on_hard_cap=auto_charge` → continua, addebito gestito da
  cron `auto-topup-trigger` separato.
- Back-compat: se RPC mancante, procede senza cap (no break).

### 3. Logging
- `ai_router_usage_log` continua a tracciare ogni call.
- Quando avviene downgrade, viene loggato un `console.warn` con company_id,
  pct e mapping primary→fallback (visibile in get_logs).

## 📋 Cosa NON è (out of scope)
- UI dashboard consumo cliente → vive in MP-PRICE-03 (UI heavy).
- Notifiche email a 50/80/100% → vive in MP-PRICE-01 step 4
  (`check-ai-usage-alerts` cron) — separato.

## 🔗 Riferimenti
Doc fonte: `EiC-Sistema-Masterprompt.md` / `EiC-Verticali-BrainAEDIX-PricingAI.md`

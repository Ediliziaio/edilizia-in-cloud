

# Sistema Crediti Pay-per-Use con Pricing per Modello

Ristrutturazione completa del sistema crediti da "minuti prepagati" a un modello basato su saldo in Euro, con costi variabili per combinazione LLM+TTS, ricarica manuale/automatica, e blocco agenti a saldo zero.

---

## Stato attuale vs Nuovo modello

**Attuale**: tabella `ai_agent_credits` con `total_minutes_purchased`, `minutes_used`, `cost_per_minute_platform`, `cost_per_minute_billed` — modello a pacchetti minuti.

**Nuovo**: saldo in Euro (`balance_eur`), costi variabili per combinazione LLM+TTS (`platform_pricing`), ricarica manuale/automatica, blocco chiamate a saldo zero, tracciamento consumo per conversazione (`ai_credit_usage`), storico ricariche (`ai_credit_topups`).

---

## 1. Database Migration

### Nuove tabelle

**`platform_pricing`** — Costi per combinazione LLM+TTS (solo SuperAdmin):
- `llm_model`, `tts_model` (UNIQUE combo)
- `cost_real_per_min`, `cost_billed_per_min`, `markup_multiplier`
- `is_active`, `label`, `updated_by`
- Seed con 8 combinazioni default (Flash+Turbo, GPT-4o+Multi, etc.)

**`ai_credits`** — Portafoglio per azienda (sostituisce `ai_agent_credits`):
- `company_id` (UNIQUE), `balance_eur`, `total_recharged_eur`, `total_spent_eur`
- `auto_recharge_enabled`, `auto_recharge_threshold`, `auto_recharge_amount`
- `calls_blocked`, `blocked_at`, `blocked_reason`
- `alert_threshold_eur`, `alert_email_sent_at`

**`ai_credit_topups`** — Storico ricariche:
- `company_id`, `amount_eur`, `type` (manual/auto/promotional/adjustment)
- `status` (pending/completed/failed/refunded), `payment_method`, `invoice_number`

**`ai_credit_usage`** — Consumo per conversazione:
- `company_id`, `conversation_id`, `agent_id`
- `duration_sec`, `duration_min`, `llm_model`, `tts_model`
- `cost_real_per_min`, `cost_billed_per_min`, `cost_real_total`, `cost_billed_total`, `margin_total`
- `balance_before`, `balance_after`

### Modifiche tabelle esistenti
- `ai_agents`: aggiungere colonna `tts_model TEXT DEFAULT 'eleven_multilingual_v2'`
- Tabella `ai_agent_credits` viene mantenuta per backward compat ma non più usata dal nuovo codice

### RLS
- `platform_pricing`: SuperAdmin full access, aziende SELECT
- `ai_credits`: SuperAdmin full, aziende SELECT solo propri
- `ai_credit_topups`: stessa logica
- `ai_credit_usage`: stessa logica (append-only per aziende)
- Uso di `has_role()` e `get_my_company_id()` esistenti

### Vista aggregata
- `monthly_billing_summary`: per report SuperAdmin, raggruppa per company/mese

---

## 2. Edge Functions

### `check-credits-before-call` (nuova)
- Riceve `agentId`, verifica saldo vs costo minimo 1 minuto
- Ritorna `{ allowed, balance_eur, cost_per_min }` o `402` se insufficiente
- `verify_jwt = false` con validazione auth in code

### `topup-credits` (nuova)
- Riceve `companyId`, `amountEur`, `paymentMethod`
- Accredita saldo, crea record in `ai_credit_topups`
- Se era bloccato per `balance_zero`, sblocca automaticamente
- Genera numero fattura sequenziale

### `elevenlabs-webhook` (riscrittura)
- Dopo conversazione: lookup pricing per `llm_model+tts_model` dell'agente
- Calcola costi esatti (`duration_min * cost_per_min`)
- Scala `balance_eur`, registra in `ai_credit_usage`
- Se saldo <= 0: `calls_blocked = true`
- Se saldo <= soglia e auto-recharge attivo: ricarica automatica
- Mantiene CRM integration esistente (appointments, contacts)

---

## 3. UI — Pagina Crediti Azienda (`AgentCreditsPage.tsx`)

Riscrittura completa:

**Hero Card** — Saldo con indicatore colorato:
- Saldo `€XX.XX` grande (brand se ok, amber se basso, red se zero)
- Barra utilizzo (speso/ricaricato)
- Stima conversazioni rimanenti
- Banner rosso se `calls_blocked = true`
- Sezione ricarica automatica (toggle ON/OFF con soglia e importo)

**Ricarica Manuale**:
- 4 card importi standard (€10, €20, €50, €100) + importo personalizzato
- Stima minuti corrispondenti basata su costo medio
- Modal conferma prima del pagamento

**Tabelle**:
- Utilizzo per agente (mese corrente): agente, LLM+TTS, chiamate, minuti, costo €
- Ultime conversazioni con costo: data, agente, durata, LLM, costo, saldo dopo
- Storico ricariche: data, tipo (badge), importo, metodo, fattura, stato

---

## 4. UI — PlatformSettingsPage (tab Prezzi per SuperAdmin)

Aggiungere sezione "Prezzi & Markup":
- Input markup globale con anteprima live
- Tabella `platform_pricing` editabile inline (costo reale, markup, costo azienda calcolato, margine %, stato toggle)
- Button "Applica Markup a Tutte"
- 4 KPI card riepilogo economico mese (incassato, costo EL, margine lordo, margine %)

---

## 5. Componenti aggiornati

- **`CreditUsageBar.tsx`**: da minuti a Euro (`spentEur`, `rechargedEur`)
- **`useAgentCredits.ts`**: nuova interfaccia con `balance_eur`, `calls_blocked`, etc.
- **`creditCalculator.ts`**: nuove funzioni per calcoli Euro-based

---

## 6. File da creare/modificare

**Creare:**
- `supabase/functions/check-credits-before-call/index.ts`
- `supabase/functions/topup-credits/index.ts`

**Modificare:**
- Migration SQL (nuove tabelle + alter `ai_agents`)
- `supabase/functions/elevenlabs-webhook/index.ts` (logica crediti Euro)
- `src/modules/ai-agents/pages/AgentCreditsPage.tsx` (riscrittura completa)
- `src/modules/ai-agents/pages/PlatformSettingsPage.tsx` (sezione prezzi)
- `src/modules/ai-agents/components/CreditUsageBar.tsx`
- `src/modules/ai-agents/hooks/useAgentCredits.ts`
- `src/modules/ai-agents/lib/creditCalculator.ts`
- `supabase/config.toml` (nuove functions)


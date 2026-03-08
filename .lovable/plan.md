

# Fase 5 — Campagne Outbound (UI + Edge Function)

## Obiettivo
Creare l'interfaccia per gestire campagne di chiamate outbound con agenti interni, incluso un wizard di creazione e un manager per l'esecuzione batch.

## Cosa viene implementato

### 1. Pagina `InternalCampaignsPage`
- Dashboard con stats riassuntive (campagne attive, completate, chiamate totali, tasso risposta)
- Tabella campagne con filtri per stato (draft, scheduled, running, completed, paused)
- Azioni rapide: avvia, pausa, elimina
- Pulsante "Nuova Campagna" che apre il wizard

### 2. `CampaignBuilder` — Wizard 4 step
1. **Tipo & Nome**: nome campagna, tipo (payment_reminder, survey, follow_up, custom), selezione agente interno
2. **Target**: scelta tra lista contatti manuale (multi-select da `marketing_contacts`) o filtro dinamico (per tag, source, stato)
3. **Schedulazione**: invio immediato o programmato (data/ora), rate limiting (calls_per_minute)
4. **Preview & Conferma**: riepilogo con conteggio contatti, costo stimato, conferma

### 3. Hook `useInternalCampaigns`
- CRUD su `internal_outbound_campaigns` (tabella gia esistente dal Phase 1)
- Mutazioni: create, update status (start/pause/complete), delete
- Query stats aggregate

### 4. Edge Function `internal-campaign-manager`
- Riceve `campaign_id`, carica la campagna e i contatti target
- Itera sui contatti chiamando `initiate-outbound-call` per ciascuno (con delay basato su `calls_per_minute`)
- Aggiorna contatori `total_calls`, `calls_answered`, `calls_failed` in tempo reale
- Gestisce stati: running → completed/paused
- Configurazione in `config.toml` con `verify_jwt = false`

### 5. Tipo e routing
- Aggiungere tipo `InternalCampaign` in `internalAgent.types.ts`
- Aggiungere route `campagne` nell'index del modulo
- Il link nella sidebar e gia presente

### File coinvolti
- **Nuovo**: `src/modules/ai-agents-internal/pages/InternalCampaignsPage.tsx`
- **Nuovo**: `src/modules/ai-agents-internal/components/CampaignBuilder.tsx`
- **Nuovo**: `src/modules/ai-agents-internal/hooks/useInternalCampaigns.ts`
- **Nuovo**: `supabase/functions/internal-campaign-manager/index.ts`
- **Modificato**: `src/modules/ai-agents-internal/types/internalAgent.types.ts` (tipi campagna)
- **Modificato**: `src/modules/ai-agents-internal/index.tsx` (route campagne)
- **Modificato**: `supabase/config.toml` (JWT config)


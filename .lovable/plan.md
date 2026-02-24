

# Integrazione Meta Lead Ads -- Piano di Implementazione

Questa e' una feature enterprise complessa che coinvolge OAuth, webhook, DB schema, edge functions, e un wizard UI multi-step. Per garantire il vincolo "non rompere nulla", il lavoro e' suddiviso in **4 fasi incrementali**, ciascuna deployabile indipendentemente.

---

## Fase 1 -- Database Schema + Pagina UI Base

### 1.1 Migrazione Database (9 tabelle nuove)

```text
integrations
  id, company_id, provider, status, connected_by, last_sync_at,
  last_error_code, last_error_message, health, created_at, updated_at

integration_credentials
  id, integration_id, access_token_encrypted, token_type, expires_at,
  granted_scopes (jsonb), meta_user_id, meta_user_name, created_at, updated_at

meta_assets
  id, integration_id, asset_type, asset_id, asset_name, selected,
  metadata (jsonb), created_at, updated_at

meta_lead_forms
  id, company_id, integration_id, page_asset_id, form_id, form_name,
  status, sync_mode, since_date, last_pull_at, created_at, updated_at

integration_field_mappings
  id, company_id, integration_id, form_id, mapping_version,
  rules (jsonb), created_at, updated_at

integration_webhook_subscriptions
  id, integration_id, provider, object, fields (jsonb), callback_url,
  verify_token_hash, status, created_at, updated_at

integration_webhook_events
  id, company_id, integration_id, provider, event_type, event_id,
  payload (jsonb), received_at, processed_at, status, fail_count,
  last_fail_reason, locked_by, locked_at

integration_sync_jobs
  id, company_id, integration_id, job_type, params (jsonb), status,
  attempts, scheduled_at, started_at, finished_at, result (jsonb),
  created_at

integration_audit_log
  id, company_id, actor_user_id, action, entity_type, entity_id,
  metadata (jsonb), created_at
```

Tutte le tabelle avranno:
- RLS abilitata con policy per company_id (tenant isolation)
- Indici su (company_id), (integration_id), (status) dove necessario
- company_id FK verso companies con ON DELETE CASCADE

### 1.2 Pagina UI: Impostazioni -> Integrazioni

- Nuova route `/azienda/impostazioni/integrazioni`
- Nuova voce nella sidebar impostazioni con icona `Plug`
- Layout a card stile marketplace (come screenshot GHL)
- Card "Meta (Facebook & Instagram Lead Ads)" con:
  - Stato: Non collegato / Collegato / Errore / Token scaduto
  - Badge con #pagine, #moduli, ultimo sync
  - Bottoni "Collega" / "Gestisci"
  - Search bar "Cerca integrazioni" (predisposta per future integrazioni)

**File nuovi:**
- `src/pages/azienda/settings/SettingsIntegrations.tsx`
- `src/components/integrations/IntegrationCard.tsx`
- `src/components/integrations/MetaIntegrationWizard.tsx` (shell)

**File modificati:**
- `src/App.tsx` -- aggiunta route lazy
- `src/components/layouts/CompanyLayout.tsx` -- aggiunta voce sidebar "Integrazioni"

---

## Fase 2 -- OAuth Meta + Edge Functions

### 2.1 Secrets necessari

- `META_APP_ID` -- da richiedere all'utente
- `META_APP_SECRET` -- da richiedere all'utente  
- `META_WEBHOOK_VERIFY_TOKEN` -- generato automaticamente

### 2.2 Edge Functions

**`meta-oauth-start`** -- Genera URL OAuth Meta con state criptato (contiene company_id + user_id + nonce)
- Permessi richiesti: `pages_show_list`, `pages_read_engagement`, `leads_retrieval`, `pages_manage_ads`
- Ritorna `{ oauth_url }` al frontend

**`meta-oauth-callback`** -- Riceve code, scambia per access token
- Valida state (anti-CSRF)
- Scambia code -> short-lived token -> long-lived token (60 giorni)
- Salva token criptato in `integration_credentials`
- Crea record `integrations` con status "connected"
- Fetcha asset (pagine, ad accounts) da Meta Graph API e salva in `meta_assets`
- Scrive audit log
- Redirect a pagina frontend con status

**`meta-api-proxy`** -- Proxy sicuro per chiamate Meta Graph API
- Legge token da DB, decripta, chiama Meta
- Gestisce rate limit (429) con retry + backoff
- Usata per: fetch pages, fetch lead forms, fetch lead details
- Endpoints interni:
  - `action: "get-assets"` -> lista pagine/ad accounts
  - `action: "get-forms"` -> lista lead forms per pagina
  - `action: "get-form-fields"` -> campi di un form specifico
  - `action: "get-lead"` -> dettagli lead per leadgen_id
  - `action: "disconnect"` -> revoca token, marca disconnected

**`meta-webhook`** -- Riceve eventi da Meta
- GET: verification handshake (hub.challenge)
- POST: valida X-Hub-Signature-256, salva in `integration_webhook_events` come pending, risponde 200

**`meta-process-leads`** -- Worker per processare lead dalla coda
- Chiamata da cron o trigger
- Processa eventi pending:
  1. Fetch dettaglio lead da Meta API
  2. Identifica form -> carica mapping
  3. Applica mapping campi
  4. Deduplica contatto (email, poi phone)
  5. Crea/aggiorna `marketing_contacts`
  6. Crea `marketing_opportunities` (se pipeline configurata)
  7. Aggiorna audit log
- Retry con exponential backoff (max 10 tentativi)
- Idempotenza su (company_id, provider, lead_id)

**`meta-backfill`** -- Job backfill storico
- Pagina i lead passati via Graph API
- Checkpoint su cursor per ripresa
- Rispetta rate limits

### 2.3 Config TOML

Tutte le nuove functions con `verify_jwt = false` e auth gestita internamente.

---

## Fase 3 -- Wizard UI Completo (6 Step)

Il wizard e' un Dialog modale a step, coerente con lo stile GHL (come da screenshot).

### Step 1: OAuth Login
- Bottone "Collega con Facebook"
- Apre popup OAuth Meta
- Listener su callback (polling stato integrazione)
- Feedback: "Connessione riuscita" con nome utente Meta

### Step 2: Selezione Asset (Pagine)
- Tabella con checkbox: nome pagina, icona connessione (FB/IG), select sync mode
- Sync mode per pagina: "Nuovi Lead" / "Tutti i Lead" / "Da data"
- Paginazione se >20 pagine
- "Seleziona tutto" / "Deseleziona tutto"
- Bottoni: "Annulla" / "Aggiorna e Continua"

### Step 3: Conferma Collegamento
- Riepilogo pagine collegate (come screenshot "Nuove pagine Facebook aggiunte")
- Warning: "Configura la mappatura dei campi per sincronizzare i lead"
- Bottoni: "No, lo faro' piu' tardi" / "Configura la mappatura dei campi"

### Step 4: Lista Moduli Lead Ads
- Per ogni pagina selezionata: lista moduli (lead forms)
- Toggle attivazione per modulo
- Link "Mappa i campi" / "Modifica campi" per ogni modulo
- Filtro per pagina (dropdown)
- Ricerca moduli
- Paginazione

### Step 5: Mappatura Campi (per modulo)
- Tabella 2 colonne: "Campi del modulo" (Meta) -> "Campi CRM" (dropdown)
- Campi CRM standard: Full name, First name, Last name, Phone, Email, City, Address, ZIP, Notes
- Campi CRM custom: caricati da `marketing_custom_fields` per il tenant
- Auto-mapping intelligente (match per nome/tipo)
- Sezione regole avanzate (collapsible):
  - Pipeline + Stage di destinazione
  - Owner assegnato (dropdown utenti)
  - Tag da applicare
  - Source label
  - Deduplica policy (email / phone / email_or_phone)
  - Update policy (create_only / upsert)
- Preview: mostra esempio contatto/opportunita' risultante
- Versioning: incrementa `mapping_version` ad ogni salvataggio

### Step 6: Conferma + Attivazione
- Riepilogo configurazione
- Bottone "Attiva sincronizzazione"
- Stato "Attivo" con indicatore verde

### Componenti UI

**File nuovi:**
- `src/components/integrations/MetaIntegrationWizard.tsx`
- `src/components/integrations/steps/OAuthStep.tsx`
- `src/components/integrations/steps/PageSelectionStep.tsx`
- `src/components/integrations/steps/ConnectionConfirmStep.tsx`
- `src/components/integrations/steps/FormListStep.tsx`
- `src/components/integrations/steps/FieldMappingStep.tsx`
- `src/components/integrations/steps/ActivationStep.tsx`
- `src/components/integrations/MetaStatusBadge.tsx`
- `src/components/integrations/IntegrationLogsPanel.tsx`
- `src/hooks/useMetaIntegration.ts` -- hook dati + mutazioni

---

## Fase 4 -- Monitoring, Logs, Error Handling

### 4.1 Pannello Log e Errori
- Tab "Log" nella gestione integrazione Meta
- Tabella: data, tipo evento, stato, messaggio, azioni (retry)
- Filtri: stato (success/failed/pending), data range
- Bottone "Riprova" per eventi falliti
- Stats: eventi ricevuti, tasso successo, ultimo sync

### 4.2 Health Check
- Cron job (o scheduled function) per verificare:
  - Token non scaduto (warning a 7 giorni dalla scadenza)
  - Webhook attivo
  - Errori recenti > soglia -> health = "critical"
- Badge stato nella card integrazione

### 4.3 Event Bus "lead.created"
- Dopo creazione contatto/opportunita', emit evento interno
- Predisposizione hook per automazioni future (task, email, WhatsApp, round robin)
- Nessuna implementazione automazione ora, solo architettura pronta

---

## Dettaglio Tecnico: Sicurezza

| Area | Implementazione |
|------|----------------|
| Token storage | Criptato a DB (pgcrypto o encrypt nel edge function) |
| Token nei log | Mai loggato, mascherato |
| Webhook signature | X-Hub-Signature-256 validata con HMAC-SHA256 |
| Multi-tenancy | RLS su tutte le tabelle, company_id obbligatorio |
| ACL | Solo company_admin puo' collegare/disconnettere |
| Audit trail | Ogni operazione loggata in integration_audit_log |
| CSRF OAuth | State parameter con nonce + company_id firmato |
| Rate limiting | Client Meta con retry 429/5xx + backoff |
| Idempotenza lead | Chiave (company_id, provider, lead_id) |
| Data retention | Raw payload conservato, configurabile |

## Dettaglio Tecnico: Multi-Tenancy Isolation

- Ogni tabella ha `company_id` con FK e RLS
- Edge functions validano company_id dal JWT
- Webhook identifica tenant da page_id -> meta_assets -> integration -> company_id
- Nessun dato cross-tenant possibile

## File Totali Stimati

| Tipo | Quantita' |
|------|----------|
| Pagine/componenti UI | ~12 file nuovi |
| Edge Functions | 5 nuove |
| Migrazione DB | 1 (9 tabelle + RLS + indici) |
| Hooks | 1-2 nuovi |
| Types | 1 file tipi integrazione |
| Config TOML | 5 entries nuove |

## Ordine di Implementazione

1. **Migrazione DB** -- 9 tabelle con RLS
2. **Pagina Integrazioni + Card** -- UI base + route + sidebar
3. **Edge Functions OAuth** -- meta-oauth-start, meta-oauth-callback
4. **Edge Function Proxy** -- meta-api-proxy
5. **Wizard Steps 1-3** -- OAuth + selezione pagine + conferma
6. **Wizard Steps 4-5** -- Form list + field mapping
7. **Edge Function Webhook** -- meta-webhook
8. **Edge Function Worker** -- meta-process-leads
9. **Step 6 + attivazione** -- conferma + sync live
10. **Logs panel + monitoring** -- UI errori + health

## Note Importanti

- La feature e' completamente isolata: nessun file esistente viene modificato tranne `App.tsx` (route) e `CompanyLayout.tsx` (sidebar link).
- Il flusso CRM esistente (contatti, opportunita', pipeline) non viene toccato: i lead importati usano le stesse tabelle `marketing_contacts` e `marketing_opportunities`.
- L'architettura e' pronta per future integrazioni (Google Ads, TikTok Lead Ads) grazie al modello `integrations` generico con `provider` field.
- Data la complessita' (5 edge functions, 9 tabelle, 12+ componenti), l'implementazione richiedera' piu' messaggi sequenziali. Si partira' dalla Fase 1 (DB + UI base).


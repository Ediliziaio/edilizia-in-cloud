

# Audit Completo -- Integrazione Meta Lead Ads

## Stato Implementazione vs Requisiti

L'integrazione e' stata implementata in 4 fasi (DB, OAuth + Edge Functions, Wizard UI, Monitoring). Segue l'analisi dettagliata per ogni area con problemi trovati e fix necessari.

---

## 1. Database Schema (9 tabelle) -- STATO: OK con 2 problemi minori

Tutte e 9 le tabelle sono create correttamente con:
- RLS abilitata su tutte
- company_id FK con ON DELETE CASCADE
- Indici su company_id, integration_id, status
- Unique constraints corretti (company_id+provider, company_id+form_id, etc.)
- Trigger update_updated_at su 5 tabelle
- Credentials bloccate lato client (USING false) -- corretto
- Audit log e webhook events bloccati in scrittura client -- corretto

### P1 - BUG: `integration_webhook_events` ha RLS UPDATE mancante per retry
**File**: migrazione SQL + `IntegrationLogsPanel.tsx` riga 69-74
**Problema**: Il pannello Log chiama `supabase.update()` per rimettere in coda un evento (retry), ma la tabella `integration_webhook_events` ha solo policy SELECT per utenti e una policy INSERT `WITH CHECK (false)`. Non esiste una policy UPDATE ne' DELETE per admin. Il retry da UI fallira' silenziosamente con errore RLS.
**Fix**: Aggiungere policy UPDATE per company_admin/super_admin su `integration_webhook_events`, oppure spostare il retry in un edge function (piu' sicuro).

### P2 - `integration_sync_jobs.integration_id` ha `ON DELETE CASCADE` che potrebbe cancellare job oauth_state
**Problema**: Il flusso OAuth usa `integration_sync_jobs` con `integration_id = '00000000-...'` (placeholder) per salvare il nonce. Questo placeholder non e' un UUID valido in `integrations`, quindi l'INSERT fallira' con FK violation.
**File**: `meta-oauth-start/index.ts` riga 56-63
**Fix**: L'`integration_id` nella tabella `integration_sync_jobs` ha un FK NOT NULL verso `integrations`. Il placeholder UUID `00000000-0000-0000-0000-000000000000` non esiste come integrazione, quindi l'INSERT del nonce OAuth fallisce. Bisogna o rendere `integration_id` nullable per i job di tipo `oauth_state`, oppure usare un'altra tabella/meccanismo per il nonce temporaneo.

---

## 2. Edge Functions -- STATO: OK con 4 problemi

### 2.1 `meta-oauth-start` -- 1 bug critico

**P0 - BUG: FK violation** sull'inserimento del nonce OAuth (vedi P2 sopra). L'intero flusso OAuth e' bloccato a causa di questo bug.

### 2.2 `meta-oauth-callback` -- 2 problemi

**P1 - SICUREZZA: Nonce validation insufficiente** (riga 47-53)
La query cerca qualsiasi `sync_job` con `job_type=oauth_state` e `status=queued` per la company, ma NON verifica che il `nonce` nel payload corrisponda a quello nel job. Un attaccante potrebbe riutilizzare uno state valido se ci sono piu' job queued. Fix: verificare `params->>'nonce'` nella query.

**P2 - Token encryption e' solo base64** (riga 125)
`btoa(accessToken)` non e' crittografia, e' solo encoding. Chiunque con accesso al DB puo' decodificare. Accettabile per MVP ma deve essere documentato come debito tecnico. In produzione: usare `pgcrypto` con una chiave derivata da un secret.

**P1 - Page access token salvato in chiaro in metadata** (riga 166-167)
Il `page_access_token` di ogni pagina e' salvato come base64 nel campo `metadata` della tabella `meta_assets`, che e' leggibile da client tramite RLS (SELECT). Qualsiasi utente autenticato della company puo' leggere il token della pagina. Fix: rimuovere il page_access_token dal campo metadata o bloccarne la lettura.

### 2.3 `meta-api-proxy` -- OK
- Auth con getClaims corretto
- Retry con backoff su 429/5xx
- CORS headers presenti
- Disconnect con revoca token + cleanup completo
- **Nota**: CORS headers mancano i nuovi header Supabase (`x-supabase-client-platform`, etc.), potrebbe causare CORS error in alcuni browser

### 2.4 `meta-webhook` -- OK
- Verification handshake GET corretto
- Signature validation HMAC-SHA256 corretta
- Upsert idempotente con `ignoreDuplicates`
- Risponde sempre 200

### 2.5 `meta-process-leads` -- OK con 1 nota
- Lock/unlock pattern corretto con timeout 5 min
- Retry fino a MAX_RETRIES=10
- Deduplica per email/phone/entrambi
- Split nome automatico
- Normalizzazione telefono E.164 per numeri italiani
- Creazione opportunita' idempotente
- Audit log per ogni lead
- **Nota**: `last_sync_at` viene aggiornato anche per eventi che falliscono (riga 97-103). Il filtro `events.filter(e => e.integration_id)` non distingue successi da fallimenti. Fix: filtrare solo eventi processati con successo.

### 2.6 `meta-health-check` -- OK
- Controlla scadenza token (warn a 7 giorni, critical a scadenza)
- Controlla failure rate (warn >=3, critical >=10 in 24h)
- Aggiorna health e status
- Audit log su cambiamenti

### 2.7 Config TOML -- OK
Tutte e 6 le functions Meta sono registrate con `verify_jwt = false`.

---

## 3. Frontend UI -- STATO: OK con 3 problemi

### 3.1 Pagina Integrazioni (`SettingsIntegrations.tsx`) -- OK
- Usa `effectiveCompany` correttamente
- Query per integrations e stats
- Search filtro
- Grid responsive

### 3.2 `IntegrationCard.tsx` -- OK
- Badge stato con MetaStatusBadge
- Stats (pagine, moduli, ultimo sync)
- Bottoni Collega/Gestisci

### 3.3 `MetaIntegrationWizard.tsx` -- OK
- 6 step con step indicator
- Tab Configurazione/Log per stato connected
- Navigazione back/next coerente
- Reset stato su open/close

### 3.4 `OAuthStep.tsx` -- P2 minor
- Popup OAuth con postMessage listener
- **Problema**: nessun timeout sul polling. Se l'utente chiude la popup senza completare, il loading spinner resta attivo. Fix: aggiungere un timer o un listener `window.closed` sulla popup.

### 3.5 `PageSelectionStep.tsx` -- OK

### 3.6 `FormListStep.tsx` -- P2
- **Problema**: `useEffect` con `loadForms` chiama `callProxy` al mount, ma la dependency array e' `[selectedPages]`. Se `selectedPages` e' un array derivato da `assets.filter()`, cambiera' referenza ad ogni render, causando loop infiniti di chiamate API.
- Fix: stabilizzare la dependency (usare length o JSON.stringify dei page IDs).

### 3.7 `FieldMappingStep.tsx` -- OK
- Auto-mapping intelligente
- Custom fields caricati da `marketing_custom_fields`
- Pipeline + stage selection
- Dedupe + update policy
- Tags
- Versioning su salvataggio

### 3.8 `ActivationStep.tsx` -- OK

### 3.9 `IntegrationLogsPanel.tsx` -- P1 (vedi bug RLS retry sopra)
- Stats corrette
- Filtro stato
- Tabella eventi con data, tipo, stato, tentativi
- Bottone retry (ma fallisce per RLS)

### 3.10 `MetaStatusBadge.tsx` -- OK

---

## 4. useMetaIntegration Hook -- OK con 1 nota

- Query per assets, forms, mappings
- startOAuth, callProxy, togglePageSelection, updateFormStatus, saveMapping, disconnect
- Tutte le mutazioni con toast feedback
- Invalidazione cache corretta
- **Nota**: `updateFormStatus` fa upsert con `onConflict: "company_id,form_id"` ma non passa `integration_id`. Se la stessa company ha due integrazioni Meta (impossibile per unique constraint, ma difesa in profondita'), potrebbe creare conflitti.

---

## 5. Sicurezza -- STATO: BUONO con 3 fix necessari

| Area | Stato | Note |
|------|-------|------|
| RLS su tutte le tabelle | OK | 9/9 tabelle |
| Multi-tenancy isolation | OK | company_id su tutte le query |
| Credentials inaccessibili da client | OK | USING(false) |
| Webhook signature validation | OK | HMAC-SHA256 |
| OAuth CSRF protection | PARZIALE | Nonce non validato nel callback |
| Token encryption | DEBOLE | Solo base64, non crypto |
| Page token esposto in metadata | BUG | Leggibile via RLS SELECT |
| Admin-only per connect/disconnect | OK | has_role check in RLS |
| Audit trail | OK | Tutte le operazioni loggate |

---

## 6. CORS Headers -- P2

Tutti gli edge functions usano:
```text
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
```
Mancano gli header Supabase moderni: `x-supabase-client-platform`, `x-supabase-client-platform-version`, `x-supabase-client-runtime`, `x-supabase-client-runtime-version`. Questo puo' causare CORS errors con versioni recenti del client Supabase.

---

## Piano Fix (ordinato per priorita')

### Fix 1 -- P0: FK violation su oauth_state nonce
**File**: `supabase/functions/meta-oauth-start/index.ts`
**Azione**: Eliminare l'uso di `integration_sync_jobs` per il nonce. Usare invece un approccio stateless: firmare il state con HMAC usando `META_APP_SECRET` come chiave. Il callback verifica la firma senza bisogno di DB lookup.

### Fix 2 -- P1: Nonce validation nel callback
**File**: `supabase/functions/meta-oauth-callback/index.ts`
**Azione**: Se si mantiene il DB-based nonce, verificare `params->>'nonce'` nella query. Con l'approccio HMAC del Fix 1, questo diventa automatico.

### Fix 3 -- P1: Page access token esposto in meta_assets.metadata
**File**: `supabase/functions/meta-oauth-callback/index.ts`
**Azione**: Non salvare il page_access_token nel campo metadata. Salvarlo separatamente in `integration_credentials` o in un campo dedicato non leggibile da client. In alternativa, nel proxy, ri-derivare il page token on-demand dal user token + page ID.

### Fix 4 -- P1: RLS mancante per retry webhook events
**File**: migrazione SQL
**Azione**: Aggiungere policy UPDATE per admin su `integration_webhook_events`, limitata a colonne `status`, `fail_count`, `last_fail_reason`. Oppure creare un edge function `meta-retry-event` e chiamarlo dal frontend.

### Fix 5 -- P2: CORS headers incompleti
**File**: tutti gli edge functions Meta
**Azione**: Aggiornare `Access-Control-Allow-Headers` con gli header Supabase moderni.

### Fix 6 -- P2: FormListStep dependency loop
**File**: `src/components/integrations/steps/FormListStep.tsx`
**Azione**: Stabilizzare la dependency del `useEffect` usando `JSON.stringify(selectedPages.map(p => p.id))` o un ref.

### Fix 7 -- P2: last_sync_at aggiornato anche per eventi falliti
**File**: `supabase/functions/meta-process-leads/index.ts`
**Azione**: Aggiornare `last_sync_at` solo per integrazioni che hanno avuto almeno un evento processato con successo.

### Fix 8 -- P2: OAuthStep loading spinner senza timeout
**File**: `src/components/integrations/steps/OAuthStep.tsx`
**Azione**: Aggiungere un check periodico su `popupWindow.closed` per resettare il loading state.

---

## File Modificati (previsti)

1. `supabase/functions/meta-oauth-start/index.ts` -- HMAC-based state (Fix 1)
2. `supabase/functions/meta-oauth-callback/index.ts` -- HMAC validation + rimuovi page token da metadata (Fix 2, 3)
3. Migrazione SQL nuova -- policy UPDATE su webhook_events (Fix 4)
4. `supabase/functions/meta-api-proxy/index.ts` -- CORS headers (Fix 5)
5. `supabase/functions/meta-process-leads/index.ts` -- CORS + last_sync_at fix (Fix 5, 7)
6. `supabase/functions/meta-health-check/index.ts` -- CORS headers (Fix 5)
7. `supabase/functions/meta-webhook/index.ts` -- gia' OK, solo CORS
8. `src/components/integrations/steps/FormListStep.tsx` -- dependency fix (Fix 6)
9. `src/components/integrations/steps/OAuthStep.tsx` -- popup timeout (Fix 8)

---

## Checklist Completezza vs Requisiti Originali

| Requisito | Stato |
|-----------|-------|
| OAuth 2.0 con Meta | Implementato (con bug FK nonce) |
| Selezione pagine | OK |
| Selezione Business Manager / Ad Account | Parziale (solo pagine, non BM/Ad Account separati) |
| Lead forms list + toggle | OK |
| Field mapping + custom fields | OK |
| Pipeline/stage/owner assignment | OK |
| Deduplica email/phone | OK |
| Webhook real-time | OK |
| Signature validation | OK |
| Retry + dead letter | OK (10 retries, poi failed) |
| Backfill storico | Edge function esiste ma non e' chiamabile da UI |
| Log + monitoring panel | OK |
| Health check automatico | OK (ma manca cron job schedulato) |
| Audit trail | OK |
| Token encryption | Debole (base64 only) |
| Multi-tenancy RLS | OK |
| Import storico UI | Non implementato (solo infrastruttura) |
| Preview mapping | Non implementato |
| Cron per meta-process-leads | Non configurato |
| Cron per meta-health-check | Non configurato |


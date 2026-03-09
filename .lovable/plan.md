# Stato Progetto — Aggiornato

## AI Agents — Modulo Completo ✅
- ✅ **Struttura modulo**: `src/modules/ai-agents/` con lazy loading, sidebar, routing
- ✅ **21 componenti**: Editor 10-tab, wizard creazione, analytics, KB, widget, crediti
- ✅ **7 pagine**: Lista, Editor, KB globale, Crediti, Telefoni, WhatsApp, Impostazioni
- ✅ **6 hooks**: useAgents, useAgentCredits, useElevenLabsProxy, useAISubscription, etc.
- ✅ **Integrazione ElevenLabs**: proxy, webhook, knowledge base sync, crediti atomici

---

## Gestione Utenti — Fase 1: Database + Security ✅

### Migration SQL ✅
- ✅ **Nuove colonne `profiles`**: `password_changed_at`, `failed_login_count`, `locked_until`, `require_2fa`, `last_login_at`, `last_login_ip`
- ✅ **Nuove colonne `companies`**: `enforce_2fa`, `allowed_ips`, `password_expiry_days`, `max_failed_attempts`
- ✅ **Nuove colonne `staff_permissions`**: 9 permessi granulari
- ✅ **6 nuove tabelle**: `user_sessions`, `login_attempts`, `permission_templates`, `user_audit_log`, `teams`, `team_members`
- ✅ **Funzione `check_and_update_login_attempt`**: SECURITY DEFINER con brute force protection
- ✅ **RLS completo** su tutte le tabelle con `get_my_company_id()` + `has_role()` bypass
- ✅ **5 Template di Sistema** seeded

### Frontend Types ✅
- ✅ `Profile` e `Company` types aggiornati con campi security
- ✅ `StaffPermissions` interface con 9 nuovi permessi granulari
- ✅ `permissionsDefaults.ts` con sezione `GRANULAR_SECTIONS`

---

## Gestione Utenti — Fase 2: Edge Functions Security ✅

- ✅ **`track-user-session`**: start/heartbeat/end sessione con IP, device, browser
- ✅ **`revoke-user-session`**: revoca singola o bulk per utente, con audit log
- ✅ **`manage-permission-template`**: CRUD + apply template a utente, con audit log
- ✅ **`get-security-report`**: overview/sessions/login_attempts/audit_log/users_security

---

## Gestione Utenti — Fase 3: UI Wizard + Tabella Arricchita ✅

- ✅ **`CreateUserWizard`**: Wizard 4-step (Info → Ruolo → Permessi → Conferma) con selector template
- ✅ **Tabella utenti arricchita**: colonne "Ultimo accesso" (con `formatDistanceToNow`) e "Stato" (sessioni attive, account bloccato, tentativi falliti)
- ✅ **`SecurityStatus` component**: indicatori visivi con tooltip per sessioni, lock, warning
- ✅ **Audit log**: registrazione `user_created` alla creazione utente

---

## Gestione Utenti — Fase 4: Test & Integrazione ✅

### Edge Functions ✅
- ✅ Tutte e 4 le funzioni deployate e registrate in `config.toml`
- ✅ Corretto bug in `revoke-user-session`: doppio `req.json()` rimosso
- ✅ Rimosso import inutilizzato `createClient` da `track-user-session`
- ✅ Autenticazione e autorizzazione verificate (401/403 senza token)

### Database ✅
- ✅ 6/6 colonne security su `profiles` verificate
- ✅ 9/9 permessi granulari su `staff_permissions` verificati
- ✅ 5 template di sistema presenti in `permission_templates`
- ✅ Funzione `check_and_update_login_attempt` presente
- ✅ 19 RLS policies attive sulle 6 nuove tabelle

### Frontend ✅
- ✅ `UsersConfig` query parallela per profili, ruoli, sessioni, permessi
- ✅ KPI cards (totale, admin, operatori, venditori, call center)
- ✅ Colonne "Ultimo accesso" e "Stato" con tooltip e badge
- ✅ `CreateUserWizard` con template selector e validazione step

# Stato Progetto — Aggiornato

## AI Agents — Modulo Completo ✅
- ✅ **Struttura modulo**: `src/modules/ai-agents/` con lazy loading, sidebar, routing
- ✅ **21 componenti**: Editor 10-tab, wizard creazione, analytics, KB, widget, crediti
- ✅ **7 pagine**: Lista, Editor, KB globale, Crediti, Telefoni, WhatsApp, Impostazioni
- ✅ **6 hooks**: useAgents, useAgentCredits, useElevenLabsProxy, useAISubscription, etc.
- ✅ **Integrazione ElevenLabs**: proxy, webhook, knowledge base sync, crediti atomici

---

## Gestione Utenti — Completamento ~95% ✅

### Database + Security ✅
- ✅ 6 tabelle, 15+ colonne security, 9 permessi granulari, RLS completo, 5 template sistema
- ✅ Colonne aggiuntive: `lockout_duration_minutes`, `enforce_2fa_roles`, `security_notifications`

### Edge Functions ✅
- ✅ track-user-session, revoke-user-session, manage-permission-template, get-security-report
- ✅ **check-login-security**: verifica IP allowlist, brute force con durata blocco configurabile

### UI Core ✅
- ✅ Security Dashboard, Team Management, CreateUserWizard, Tabella utenti arricchita
- ✅ Session Tracking integrato in AuthContext, Unlock Account
- ✅ **3 Tab Dettaglio Utente**: Sessioni, Log Attività, Sicurezza

### UI Avanzate ✅
- ✅ **Filtri Avanzati Tabella Utenti**: Stato + Ruolo + Ricerca + **Team**
- ✅ **Colonna "Sessioni Attive"** separata con badge count
- ✅ **PermissionTemplatesManager**: lista, crea, modifica, duplica, elimina + **"Applica a Utente"**
- ✅ **CompanySecuritySettings** completo:
  - Slider tentativi massimi + **durata blocco configurabile** (15m/30m/1h/24h/Manuale)
  - Scadenza password, IP allowlist
  - 2FA obbligatoria globale + **2FA per ruoli specifici**
  - **Notifiche sicurezza** (login IP sconosciuto, account bloccato, modifica permessi admin)

---

## ⏳ Funzionalità Rimanenti (Priorità Bassa)

- ⬜ Round-robin assegnazione team
- ⬜ KPI per team nella dashboard
- ⬜ Import/Export utenti CSV
- ⬜ Password history (ultime 5)
- ⬜ Drag & Drop utenti tra team
- ⬜ Password complexity enforcement (slider lunghezza, toggle caratteri)
- ⬜ Pulizia automatica sessioni 30+ giorni (cron)

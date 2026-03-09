

# Analisi Completa: Documento vs Implementazione Attuale

## ✅ Già Implementato

| Sezione Documento | Stato |
|---|---|
| **DB: user_sessions, login_attempts, permission_templates, user_audit_log, teams, team_members** | ✅ Tabelle create |
| **DB: colonne security su profiles** (password_changed_at, failed_login_count, locked_until, require_2fa, last_login_at, last_login_ip) | ✅ |
| **DB: colonne security su companies** (enforce_2fa, allowed_ips, password_expiry_days, max_failed_attempts) | ✅ |
| **DB: 9 permessi granulari su staff_permissions** (can_export_clients, can_delete_orders, ecc.) | ✅ |
| **DB: check_and_update_login_attempt()** | ✅ |
| **DB: RLS su tutte le nuove tabelle** | ✅ |
| **DB: 5 template di sistema** (seed) | ✅ |
| **Edge: track-user-session** | ✅ Deployata |
| **Edge: revoke-user-session** | ✅ Deployata |
| **Edge: manage-permission-template** | ✅ Deployata |
| **Edge: get-security-report** | ✅ Deployata |
| **UI: Security Dashboard** (KPI, sessioni, login attempts, audit log) | ✅ Pagina standalone |
| **UI: Team Management** (CRUD team, membri, leader, colori) | ✅ Pagina standalone |
| **UI: CreateUserWizard** (4 step con template selector) | ✅ |
| **UI: Tabella utenti** con colonne "Ultimo accesso" e "Stato" | ✅ |
| **UI: Unlock Account** nella tabella utenti | ✅ |
| **Session Tracking** integrato in AuthContext (login/logout) | ✅ |

---

## ❌ Mancante — Dettaglio per Priorità

### 🔴 PRIORITÀ ALTA — Funzionalità Core Mancanti

**1. Tab Sessioni nel Dettaglio Utente (SettingsUserDetail.tsx)**
Il documento richiede un tab "Sessioni" nel pannello dettaglio utente (Sez. 7.3) con:
- Lista sessioni attive per quel singolo utente (device, browser, IP, ultima attività)
- Pulsante "Revoca" per sessione singola
- Pulsante "Revoca Tutte"
- Storico sessioni (ultime 30)

*Attuale:* Il dettaglio utente ha solo 5 tab (Profilo, Permessi, Disponibilità, Calendario, Notifiche). Non esiste tab sessioni per-utente.

**2. Tab Log Attività nel Dettaglio Utente (Sez. 7.4)**
- Timeline cronologica da `user_audit_log` filtrata per `target_user_id`
- Filtro per tipo azione
- Esporta CSV

*Attuale:* Non esiste. Il Security Dashboard mostra audit log globale, non per singolo utente.

**3. Tab Sicurezza nel Dettaglio Utente (Sez. Prompt 4, punto 3)**
- Stato 2FA, data ultimo cambio password, tentativi falliti
- Pulsante "Forza Reset Password"
- Pulsante "Sblocca Account" (per singolo utente)
- Toggle "Richiedi 2FA" per utente specifico
- Avviso password scaduta

*Attuale:* Non esiste come tab dedicato nel dettaglio utente.

**4. Pagina Impostazioni Sicurezza Aziendale (Sez. 7.6 / Prompt 5)**
Pagina `SettingsSecurity.tsx` con controlli policy:
- Slider tentativi massimi login (3-10)
- Dropdown durata blocco account
- Dropdown scadenza password (Mai/30/60/90/180 giorni)
- Toggle 2FA obbligatoria (per azienda + per ruolo)
- Textarea IP Allowlist
- Checkbox notifiche sicurezza
- Salva su colonne `companies`

*Attuale:* Non esiste. Le colonne DB ci sono ma non c'è UI per configurarle.

### 🟠 PRIORITÀ MEDIA

**5. Sezione Template Permessi nella UI (Sez. 7.5 / Prompt 5)**
- Lista template con nome, ruolo base, count utenti, badge Sistema/Personalizzato
- Crea nuovo template (dialog con editor permessi)
- Applica template a utente
- I 5 template di sistema sono nel DB ma non visualizzabili/applicabili dalla UI

*Attuale:* Il `CreateUserWizard` ha un selector template, ma non esiste una pagina di gestione template dedicata.

**6. Edge Function check-login-security (Sez. 6.3)**
- Auth hook che verifica IP allowlist e brute force ad ogni tentativo di login
- Registra in `login_attempts`
- Invia alert email se account bloccato

*Attuale:* Non esiste. La funzione DB `check_and_update_login_attempt` c'è, ma non viene chiamata da nessun auth hook. I login_attempts non vengono popolati automaticamente.

**7. Filtri Avanzati Tabella Utenti (Sez. 7.1)**
Il documento richiede:
- Filtro per Stato (Tutti/Attivo/Inattivo/Bloccato)
- Filtro per Team
- Filtro per ultima attività

*Attuale:* C'è solo ricerca per nome/email e filtro ruolo via KPI cards.

### 🟡 PRIORITÀ BASSA

**8. Round-robin Assegnazione Team (Sez. 8.2)**
- Nuovi ordini/lead assegnati automaticamente al prossimo membro disponibile del team

**9. KPI per Team nella Dashboard (Sez. 8.2)**
- Statistiche aggregate per team (ordini attivi, fatturato)

**10. User Import/Export (Sez. 2.3)**
- Importa utenti da CSV, esporta lista con permessi

**11. Password History (Sez. 5.2)**
- Non riutilizzare le ultime 5 password (richiede tabella `password_history`)

**12. Drag & Drop utenti tra team (Sez. 8.3)**
- Attuale: assegnazione tramite select, non drag & drop

---

## Riepilogo Quantitativo

| Categoria | Implementato | Mancante |
|---|---|---|
| Tabelle DB | 6/6 | 0 |
| Colonne DB | 15/15 | 0 |
| Edge Functions | 4/5 | 1 (check-login-security) |
| Pagine UI | 3/5 | 2 (SettingsSecurity, Template Management) |
| Tab Dettaglio Utente | 5/8 | 3 (Sessioni, Log, Sicurezza) |
| Filtri tabella | 1/4 | 3 (Stato, Team, Ultima attività) |
| Funzionalità avanzate | 0/4 | 4 (Round-robin, KPI team, Import/Export, Password history) |

**Totale completamento stimato: ~65%** — Il backend è quasi completo, mancano principalmente componenti UI e una edge function critica.


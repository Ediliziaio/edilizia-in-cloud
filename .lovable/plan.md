

# Analisi Documento vs Implementazione — Stato Attuale

## ✅ Implementato Correttamente

| Requisito Documento | Stato |
|---|---|
| 6 tabelle DB (user_sessions, login_attempts, permission_templates, user_audit_log, teams, team_members) | ✅ |
| 15 colonne security su profiles + companies | ✅ |
| 9 permessi granulari su staff_permissions | ✅ |
| RLS su tutte le tabelle | ✅ |
| 5 template di sistema (seed) | ✅ |
| Funzione DB check_and_update_login_attempt() | ✅ |
| Edge: track-user-session, revoke-user-session, manage-permission-template, get-security-report | ✅ |
| Edge: check-login-security | ✅ |
| UI: Security Dashboard (KPI, sessioni, login attempts, audit log) | ✅ |
| UI: Team Management (CRUD, membri, leader, colori) | ✅ |
| UI: CreateUserWizard (4 step con template selector) | ✅ |
| UI: Tabella utenti con "Ultimo accesso", "Stato", "Sessioni attive" | ✅ |
| UI: Unlock Account (quick action nella tabella) | ✅ |
| UI: Session Tracking integrato in AuthContext | ✅ |
| Tab Sessioni nel dettaglio utente (lista, revoca singola/tutte) | ✅ |
| Tab Log Attività nel dettaglio utente (timeline, filtro, export CSV) | ✅ |
| Tab Sicurezza nel dettaglio utente (2FA, blocco, reset password) | ✅ |
| Pagina SettingsSecurity (tab Password + Policy + Template Permessi) | ✅ |
| CompanySecuritySettings (slider tentativi, scadenza, 2FA, IP allowlist) | ✅ |
| PermissionTemplatesManager (lista, crea, duplica, elimina) | ✅ |
| Filtri tabella utenti: Stato (Attivo/Inattivo/Bloccato) + Ruolo + Ricerca | ✅ |

---

## ❌ Ancora Mancante

### 🟠 PRIORITÀ MEDIA

**1. Filtro per Team nella tabella utenti (Sez. 7.1)**
Il documento richiede un dropdown "Team" nei filtri della tabella utenti. Attualmente ci sono solo Ricerca + Ruolo + Stato. Manca il filtro Team che dovrebbe leggere dalla tabella `teams` e filtrare via `team_members`.

**2. Colonna "Sessioni Attive" (badge count) nella tabella utenti (Sez. 7.1 / Prompt 3)**
Il conteggio sessioni attive viene recuperato (`active_sessions`) e mostrato nella colonna Sicurezza come icona Wifi, ma il documento richiede una **colonna separata** "Sessioni Attive" con badge count. Attualmente è inglobato nel componente `SecurityStatus` senza colonna dedicata.

**3. "Applica Template a Utente" dal PermissionTemplatesManager (Sez. 7.5)**
Il PermissionTemplatesManager permette CRUD dei template, ma manca il pulsante **"Applica a Utente"** che dovrebbe aprire un selettore utente e applicare il template via edge function `manage-permission-template` con action `'apply'`.

**4. Durata blocco account configurabile (Sez. 7.6)**
Il documento richiede un dropdown per la durata del blocco (15min / 30min / 1h / 24h / Manuale). Attualmente `CompanySecuritySettings.tsx` non ha questo controllo — il blocco è hardcoded a 30 minuti nella edge function `check-login-security`.

**5. Notifiche sicurezza (Sez. 7.6)**
Il documento richiede checkbox per ricevere email admin su: nuovo login da IP sconosciuto, account bloccato, modifica permessi admin. Non implementato.

**6. 2FA obbligatoria per ruolo specifico (Sez. 7.6)**
Il documento richiede toggle separati: "Obbligatoria per tutti" + "Obbligatoria per Admin e Manager". Attualmente c'è solo un toggle globale `enforce_2fa`.

### 🟡 PRIORITÀ BASSA

**7. Round-robin assegnazione team (Sez. 8.2)**
Assegnazione automatica ordini/lead al prossimo membro disponibile del team.

**8. KPI per team nella dashboard (Sez. 8.2)**
Statistiche aggregate per team (ordini attivi, fatturato).

**9. Import/Export utenti CSV (Sez. 2.3)**
Importa utenti da CSV, esporta lista con permessi.

**10. Password history (Sez. 5.2)**
Non riutilizzare le ultime 5 password. Richiede tabella `password_history`.

**11. Drag & Drop utenti tra team (Sez. 8.3)**
Attualmente assegnazione tramite select.

**12. Password complexity enforcement (Sez. 5.2)**
Slider lunghezza minima (6-20), toggle maiuscole/numeri/caratteri speciali. Non presente in `CompanySecuritySettings`.

**13. Pulizia automatica sessioni 30+ giorni (Sez. 5.3)**
Cron job per eliminare sessioni vecchie. Non implementato.

---

## Riepilogo

| Categoria | Completato | Mancante |
|---|---|---|
| Database + Functions | 100% | 0 |
| Edge Functions | 5/5 | 0 |
| UI Core (tabella, wizard, tabs) | 95% | 3 dettagli minori |
| Policy sicurezza UI | 80% | 3 controlli (durata blocco, notifiche, 2FA per ruolo) |
| Funzionalità avanzate | 0% | 5 items (round-robin, KPI team, CSV, password history, drag&drop) |

**Completamento stimato: ~85%** — Rispetto alla precedente analisi (65%), il progresso è significativo. Rimangono dettagli UI e funzionalità avanzate a bassa priorità.


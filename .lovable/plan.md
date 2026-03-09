

# Fase 1: Database Schema + Security Functions

Implementazione delle nuove tabelle, colonne aggiuntive e funzione brute force come descritto nel documento.

---

## 1. Migration SQL — Nuove Tabelle

### 1.1 `user_sessions`
Traccia sessioni utente attive/storiche con IP, device, browser, revoca.

### 1.2 `login_attempts`
Registra ogni tentativo di login con indice su `(email, created_at DESC)`.

### 1.3 `permission_templates`
Template permessi JSONB riutilizzabili per azienda, con flag `is_system_default`.

### 1.4 `user_audit_log`
Log completo azioni utente (creazione, modifica permessi, revoca sessione, ecc).

### 1.5 `teams` + `team_members`
Organizzazione utenti in team con leader e ruolo nel team.

---

## 2. Colonne Aggiuntive

### `profiles`:
- `password_changed_at TIMESTAMPTZ`
- `failed_login_count INT DEFAULT 0`
- `locked_until TIMESTAMPTZ`
- `require_2fa BOOLEAN DEFAULT FALSE`
- `last_login_at TIMESTAMPTZ`
- `last_login_ip INET`

### `companies`:
- `enforce_2fa BOOLEAN DEFAULT FALSE`
- `allowed_ips TEXT[]`
- `password_expiry_days INT DEFAULT 0`
- `max_failed_attempts INT DEFAULT 5`

---

## 3. Funzione `check_and_update_login_attempt`

Funzione `SECURITY DEFINER` che:
- Verifica se l'account e bloccato (`locked_until > NOW()`)
- Su successo: resetta contatore, aggiorna `last_login_at/ip`
- Su fallimento: incrementa contatore, blocca dopo N tentativi per 30 minuti
- Recupera `max_failed_attempts` dalla company dell'utente

---

## 4. RLS Policies

Tutte le nuove tabelle avranno RLS abilitato con policy:
- **user_sessions**: lettura/scrittura solo per admin della stessa company (via `get_my_company_id()`)
- **login_attempts**: solo lettura per admin della stessa company
- **permission_templates**: CRUD per admin della stessa company
- **user_audit_log**: solo lettura per admin della stessa company
- **teams / team_members**: lettura per tutti gli utenti della company, CRUD per admin
- Super admin bypassa tutto tramite `has_role(auth.uid(), 'super_admin')`

---

## 5. Nuove Colonne `staff_permissions`

Aggiunta di 9 colonne per aree mancanti:
- `can_export_clients`, `can_delete_orders`, `can_manage_payments`
- `can_approve_orders`, `can_view_all_team_calendar`, `can_view_margins`
- `can_manage_suppliers`, `can_view_financial_reports`, `can_manage_warehouse_items`

---

## 6. Seed — Template di Sistema

5 template predefiniti (company_id = NULL, is_system_default = TRUE):
- Company Admin, Manager, Tecnico Standard, Commerciale Standard, Read-Only

---

## Note Tecniche
- Nessuna modifica a schemi riservati (auth, storage, realtime)
- Uso di `get_my_company_id()` per le policy RLS (come da standard progetto)
- Uso di `has_role()` per bypass super admin
- Nessun CHECK constraint con `now()` — tutto via trigger di validazione
- La migration sarà eseguita in un singolo blocco SQL atomico


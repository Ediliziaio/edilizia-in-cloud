
# Permessi Granulari per Super Admin

## Situazione attuale
- Il reset password e gia implementato (icona KeyRound nella lista)
- Tutti i super admin hanno accesso completo e identico a tutta la piattaforma
- Non esiste alcun sistema di permessi granulari per i super admin

## Interventi

### 1. Nuova tabella `super_admin_permissions`

Tabella per gestire cosa ogni super admin puo fare/vedere:

```text
+---------------------------+--------+---------+
| Colonna                   | Tipo   | Default |
+---------------------------+--------+---------+
| id                        | uuid   | random  |
| user_id                   | uuid   | FK      |
| can_manage_companies      | bool   | true    |
| can_manage_plans          | bool   | true    |
| can_manage_tickets        | bool   | true    |
| can_manage_referrals      | bool   | true    |
| can_manage_admins         | bool   | true    |
| can_view_platform_stats   | bool   | true    |
| allowed_company_ids       | uuid[] | NULL    |
| created_at                | tstz   | now()   |
| updated_at                | tstz   | now()   |
+---------------------------+--------+---------+
```

- `allowed_company_ids`: se NULL = tutte le aziende; se array = solo quelle specificate
- RLS: solo super_admin puo leggere/scrivere (tramite `has_role`)

### 2. Nuovo componente: `SuperAdminPermissionsDialog`

Dialog simile a `PermissionsDialog` (usato per lo staff) ma adattato al contesto super admin:

**Sezioni permessi:**
- Gestione Aziende (creare, modificare, eliminare aziende)
- Gestione Piani (modificare piani di abbonamento)
- Assistenza (gestire ticket di supporto)
- Referral (gestire programma referral)
- Gestione Admin (creare/eliminare altri super admin)
- Statistiche Piattaforma (visualizzare dati globali)

**Sezione aziende visibili:**
- Toggle "Tutte le aziende" / "Solo aziende selezionate"
- Se selezionato "Solo aziende selezionate", mostra lista con checkbox delle aziende esistenti

### 3. Aggiornamento `SuperAdminUsersTab`

- Aggiungere icona Shield (permessi) nella colonna azioni di ogni admin
- Non mostrarla per se stessi (i permessi propri non si possono limitare)
- Mostrare i permessi attivi come badge nella tabella (come fa CompanyTeamTab)

### 4. Edge function: nuova action `update-permissions`

Aggiungere a `manage-super-admins`:
- `action: "get-permissions"` -- recupera permessi di un admin
- `action: "update-permissions"` -- salva/aggiorna permessi (upsert)
- Validazione: non puoi toglierti i propri permessi

### 5. Aggiornamento action `list`

Includere i permessi di ogni admin nella risposta della lista, per mostrare i badge nella tabella.

## Riepilogo file

| File | Azione |
|------|--------|
| Migrazione SQL | Nuova tabella `super_admin_permissions` + RLS |
| `manage-super-admins/index.ts` | + actions `get-permissions` e `update-permissions`, arricchimento `list` |
| `SuperAdminUsersTab.tsx` | + icona permessi, badge permessi attivi, integrazione dialog |
| `SuperAdminPermissionsDialog.tsx` | Nuovo componente (dialog permessi con sezione aziende) |
| `adminConstants.ts` | + costanti label permessi super admin |

## Cosa rimane invariato
- Reset password (gia funzionante)
- Creazione e eliminazione admin
- Tab Profilo, Piattaforma, Notifiche
- Sistema permessi staff (separato e indipendente)

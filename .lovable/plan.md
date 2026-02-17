
# Nuove funzionalita Impostazioni Admin

## Risultati test edge function
- **create**: OK (utente creato, profilo e ruolo assegnati correttamente)
- **list**: OK (nuovo admin visibile nella lista)
- **delete**: OK (admin rimosso con protezioni attive)

Tutte le operazioni CRUD del tab Super Admin funzionano correttamente.

## 1. Reset password di un Super Admin dalla lista

### Cosa cambia
Aggiungere un bottone "Reset Password" (icona KeyRound) accanto al bottone elimina nella tabella Super Admin. Cliccando si apre un dialog dove il chiamante inserisce la nuova password per quell'admin.

### Dettaglio tecnico

**Edge function `manage-super-admins`**: aggiungere `action: "reset-password"`
- Riceve `userId` e `newPassword`
- Validazione: password >= 8 caratteri, userId presente
- Usa `supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword })`
- Non puo resettare la propria password (per quello c'e il tab Profilo)

**Nuovo componente**: `ResetPasswordDialog.tsx`
- Dialog con campo password + toggle visibilita + indicatore forza
- Stesso pattern di `CreateSuperAdminDialog`

**Modifica**: `SuperAdminUsersTab.tsx`
- Aggiungere icona KeyRound nella colonna azioni
- Stato `resetTarget` per gestire quale admin resettare

## 2. Notifiche salvate nel database

### Cosa cambia
Migrare le preferenze notifiche da localStorage a una nuova tabella `admin_notification_prefs` nel database, cosi sono persistenti e sincronizzate su ogni dispositivo.

### Nuova tabella: `admin_notification_prefs`

```text
+---------------------+------+---------+----------+
| Colonna             | Tipo | Default | Nullable |
+---------------------+------+---------+----------+
| id                  | uuid | random  | No       |
| user_id             | uuid | -       | No (FK)  |
| new_company         | bool | true    | No       |
| trial_expiring      | bool | true    | No       |
| new_ticket          | bool | true    | No       |
| created_at          | tstz | now()   | No       |
| updated_at          | tstz | now()   | No       |
+---------------------+------+---------+----------+
```

- `user_id` UNIQUE (un record per utente)
- RLS: solo super_admin puo leggere/scrivere le proprie preferenze

### Modifica: `NotificationsTab.tsx`
- Sostituire localStorage con `useQuery` per caricare le prefs dal DB
- Usare `useMutation` con upsert per salvare i toggle
- Fallback ai defaults se non esiste ancora un record
- Rimuovere la description "salvate localmente"

## Riepilogo modifiche

| File | Azione |
|------|--------|
| `manage-super-admins/index.ts` | + action "reset-password" |
| `SuperAdminUsersTab.tsx` | + bottone reset password, stato resetTarget |
| `ResetPasswordDialog.tsx` | Nuovo componente (dialog reset password) |
| `NotificationsTab.tsx` | Migrazione da localStorage a database |
| Migrazione SQL | Nuova tabella `admin_notification_prefs` + RLS |

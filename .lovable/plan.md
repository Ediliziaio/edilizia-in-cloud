

# Audit Crea/Modifica Utente - Report e Piano Interventi

## AS-IS: Flussi Analizzati

I due flussi principali (Creazione via `StaffUserDialog` + Edge Function `create-company-staff`, Modifica via `SettingsUserDetail`) sono funzionalmente corretti. L'analisi ha identificato solo problemi minori.

## Problemi Identificati

### P1 - Importanti

1. **`getPermissionsSummary` in `UsersConfig.tsx` non riflette i permessi granulari marketing**
   - Riga 174: usa ancora `can_view_marketing` (il vecchio campo legacy) per mostrare "Marketing" nel riepilogo permessi della lista utenti. Dopo l'espansione granulare, dovrebbe controllare anche i singoli `can_view_marketing_*` per mostrare un riepilogo accurato.
   - **Fix**: Aggiornare la funzione per contare anche i permessi marketing granulari.

2. **Creazione utente: permessi non salvati correttamente per nuovi campi granulari**
   - `UsersConfig.tsx` riga 117: quando salva i permessi dopo la creazione, fa `const { only_assigned, ...permFields } = data.permissions` e poi `update(permFields)`. Questo funziona, ma destruttura `only_assigned` fuori e poi lo re-include con `|| false`. Il problema e che `can_view_cruscotto` e i campi `can_view_marketing_*` vengono inviati correttamente perche sono in `permFields`. Tuttavia i campi legacy `can_view_marketing` e `can_edit_marketing` non vengono impostati di conseguenza.
   - **Fix**: Allineare la logica: se almeno un `can_view_marketing_*` e true, settare anche `can_view_marketing = true` per backward compatibility con sidebar/guard legacy.

3. **`changeRoleMutation` in `SettingsUserDetail.tsx` non gestisce company_id nel insert di `staff_permissions`**
   - Riga 133: `insert({ user_id: userId! } as any)` - inserisce senza `company_id`. La tabella `staff_permissions` potrebbe avere un vincolo `company_id NOT NULL`.
   - **Fix**: Recuperare il `company_id` dal profilo e includerlo nell'insert.

### P2 - Miglioramenti

4. **Delete utente in `UsersConfig.tsx` non rimuove l'utente auth**
   - Riga 146-149: elimina solo `staff_permissions`, `user_roles`, `profiles` ma non l'utente dalla tabella `auth.users`. L'utente potrebbe ancora fare login. Serve una edge function con `supabase.auth.admin.deleteUser()`.
   - **Fix**: Creare o riutilizzare un'edge function per eliminare anche l'utente auth.

5. **Nessun Cruscotto nel riepilogo permessi lista utenti**
   - `getPermissionsSummary` non mostra "Cruscotto" anche se `can_view_cruscotto` e attivo.
   - **Fix**: Aggiungere il check.

6. **`StaffUserDialog` non mostra Cruscotto Aziendale nei permessi**
   - Il dialog di creazione usa `ALL_PERMISSION_SECTIONS` da `PermissionsDialog` che non include `can_view_cruscotto` come sezione separata (e standalone, non in `ALL_PERMISSION_SECTIONS`). Quindi in fase di creazione non si puo abilitare il cruscotto.
   - **Fix**: Aggiungere la sezione Cruscotto nel dialog creazione, oppure includerla in `ALL_PERMISSION_SECTIONS`.

## Piano Interventi

### 1. Fix `getPermissionsSummary` (P1)
In `UsersConfig.tsx`, aggiornare la funzione per includere:
- Check su `can_view_cruscotto` -> "Cruscotto"
- Check sui permessi marketing granulari: se almeno uno dei `can_view_marketing_*` e attivo, mostrare "Marketing"

### 2. Sync campi legacy marketing alla creazione (P1)
In `UsersConfig.tsx` `handleCreateUser`, dopo il destructuring, settare `can_view_marketing = true` se almeno un permesso marketing granulare e attivo. Stessa logica per `can_edit_marketing`.

### 3. Fix `changeRoleMutation` - aggiungere company_id (P1)
In `SettingsUserDetail.tsx`, quando si inserisce un record `staff_permissions` per un utente promosso a staff, includere il `company_id` dal profilo utente gia disponibile nella query.

### 4. Aggiungere Cruscotto nel dialog creazione (P2)
In `StaffUserDialog.tsx`, aggiungere una sezione "Cruscotto Aziendale" prima di "Gestione Interna" nel render dei permessi, con toggle per `can_view_cruscotto`.

### 5. Fix eliminazione utente con edge function (P2)
Aggiornare `deleteUserMutation` per invocare un'edge function che chiama `auth.admin.deleteUser()` prima di eliminare profilo e ruoli, impedendo login residui.

### Nessuna migrazione DB necessaria.


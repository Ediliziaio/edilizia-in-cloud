

# Audit Sezione Impostazioni Utente - Report e Piano Interventi

## A) ANALISI AS-IS - Problemi Identificati

### P0 - Critici (bloccanti)

1. **Reset Password non funziona per utenti staff/admin**
   - `UserProfileTab.tsx` invia `{ userId: user.id }` ma l'edge function `reset-customer-password` si aspetta `{ customer_id }` e verifica che il target sia un **customer** (`targetRole.role !== "customer"` - riga 114). Per utenti company_admin/company_staff il reset fallisce sempre con "Target user is not a customer".
   - **Fix**: Creare una nuova edge function `reset-staff-password` oppure modificare quella esistente per accettare anche staff/admin, oppure far usare `supabase.auth.admin.updateUserById` direttamente.

2. **`phoneExt` (Estensione telefono) non viene salvato**
   - Il campo esiste nella UI ma non viene ne salvato ne letto dal DB. La colonna `phone_ext` non esiste nella tabella `profiles`.
   - **Fix**: O rimuovere il campo dalla UI, o aggiungere la colonna al DB e salvarlo.

### P1 - Importanti

3. **`can_view_cruscotto` e `only_assigned` sono opzionali nell'interface**
   - In `StaffPermissions` sono marcati con `?`. Questo causa potenziali `undefined` nei toggle e nel salvataggio.
   - **Fix**: Renderli required nell'interface.

4. **Parametro `?tab=permissions` dall'URL non viene letto**
   - `UsersConfig.tsx` riga 310 naviga con `?tab=permissions` ma `SettingsUserDetail.tsx` non legge mai il query param.
   - **Fix**: Leggere `searchParams` e impostare `activeTab` di conseguenza.

5. **Stato form profilo non si aggiorna dopo cambio ruolo**
   - Se cambi ruolo da admin a staff, la query viene invalidata ma il componente `UserProfileTab` mantiene il vecchio state locale perche gli `useState` non hanno `useEffect` di sync per `user.first_name`, ecc.
   - **Fix**: Aggiungere key prop o useEffect per sync.

6. **`PermissionsDialog.tsx` (dialog legacy) non include `can_view_cruscotto`**
   - Il `handleSelectAll` nel dialog legacy non setta `can_view_cruscotto: true`. Il dialog e ancora usato dal pannello admin (`CompanyTeamTab`).
   - **Fix**: Allineare con le stesse permission keys.

### P2 - Miglioramenti

7. **Nessuna validazione input nel profilo** - Email/nome non validati prima del submit.
8. **Nessun dirty state tracking** - Il bottone "Salva" e sempre attivo anche senza modifiche.
9. **`Construction` icon importata ma usata solo per placeholder** - 3 tab "Prossimamente" sono identici, estraibile in componente.

## B) PIANO INTERVENTI

### 1. Fix Reset Password (P0)
Modificare l'edge function `reset-customer-password` per supportare anche ruoli `company_staff` e `company_admin` (non solo `customer`). Correggere il payload in `UserProfileTab.tsx` da `{ userId }` a `{ customer_id }`.

### 2. Rimuovere campo phoneExt dalla UI (P0)
Il campo Estensione non ha colonna DB corrispondente. Rimuoverlo dalla UI per evitare confusione. Se necessario in futuro, aggiungere prima la colonna DB.

### 3. Rendere StaffPermissions consistente (P1)
Rendere `can_view_cruscotto` e `only_assigned` campi required nell'interface. Aggiornare `PermissionsDialog.tsx` e `StaffUserDialog.tsx` per includere `can_view_cruscotto` in tutti i default e select all.

### 4. Leggere tab da URL query params (P1)
In `SettingsUserDetail.tsx`, leggere `?tab=` e impostare `activeTab` iniziale.

### 5. Sync stato form dopo invalidation (P1)
Aggiungere `key={userData.id + userData.role}` ai componenti tab per forzare il remount dopo cambio ruolo.

### 6. Validazione input profilo (P2)
Aggiungere validazione base: email formato valido, nome/cognome non vuoti, trim whitespace.

### 7. Dirty state tracking (P2)
Disabilitare bottone Salva quando non ci sono modifiche rispetto allo stato originale.

### 8. Estrarre componente "Coming Soon" (P2)
Creare `ComingSoonPlaceholder.tsx` e usarlo nei 3 tab placeholder.


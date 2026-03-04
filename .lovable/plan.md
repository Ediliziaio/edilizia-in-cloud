

# Audit Impostazioni Utente - Report e Piano Interventi

## A) Problemi Identificati

### P0 - Critici

1. **Password: manca campo per inserimento manuale**
   L'utente chiede di poter inserire direttamente una nuova password dal pannello profilo. Attualmente il reset genera solo una password casuale automatica. L'edge function `reset-customer-password` gia supporta `new_password` nel body (riga 80-82), ma la UI non offre un campo di input per specificarla.
   - **Fix**: Aggiungere un campo password opzionale nella sezione Reset Password di `UserProfileTab.tsx`. Se compilato, viene inviato come `new_password`; se vuoto, il backend genera quella automatica. Mostrare la password risultante nel toast.

### P1 - Importanti

2. **Warning `forwardRef` su `ComingSoonPlaceholder`**
   La console mostra "Function components cannot be given refs" per `ComingSoonPlaceholder` usato in `UserAvailabilityTab`. Questo accade perche React passa un ref al componente figlio diretto del tab content. Il componente non accetta refs.
   - **Fix**: Il warning proviene dal rendering condizionale. Non serve forwardRef, basta wrappare i tab placeholder in un `<div>` per assorbire eventuali ref spurii, oppure ignorare dato che e solo un warning di dev. Soluzione pulita: verificare se qualche parent passa ref e rimuoverlo.

3. **Dirty state mancante nel tab Permessi**
   `UserRolesPermissionsTab` non traccia lo stato dirty: il bottone "Salva Permessi" e sempre attivo anche senza modifiche. Questo causa salvataggi inutili e confusione UX.
   - **Fix**: Aggiungere `useMemo` che confronta `permissions` correnti con `user.permissions` originali per disabilitare il bottone quando non ci sono cambiamenti.

4. **`savePermissionsMutation` invia tutti i campi incluso `user_id` e `id`**
   Quando si salva, `permissions` contiene anche `user_id`, `id`, `created_at` etc. dal DB (perche viene da `select("*")`). L'update con questi campi extra potrebbe fallire o sovrascrivere dati non intenzionali.
   - **Fix**: Filtrare i campi prima dell'update, inviando solo le chiavi definite in `StaffPermissions`.

### P2 - Miglioramenti

5. **Password temporanea mostrata nel toast, facilmente persa**
   La password generata viene mostrata in un toast che scompare dopo pochi secondi. Se l'utente non la copia in tempo, la perde.
   - **Fix**: Mostrare la password in un dialog modale con bottone "Copia" (come gia fatto in `StaffUserDialog`), non in un toast.

6. **Mobile: sidebar utente non responsive**
   La sidebar a 64px fissa (`w-64 shrink-0`) non collassa su mobile, causando overflow orizzontale.
   - **Fix**: Rendere la sidebar responsive con tabs orizzontali su mobile.

## B) Piano Interventi

### 1. Aggiungere campo password manuale (P0)
In `UserProfileTab.tsx`:
- Aggiungere un `Input` tipo password con label "Nuova password (opzionale)"
- Se compilato, inviare `{ userId: user.id, new_password: value }` alla edge function
- Se vuoto, inviare solo `{ userId: user.id }` per generazione automatica
- Mostrare il risultato in un dialog modale con bottone Copia (non toast)

### 2. Fix warning forwardRef (P1)
Verificare se i tab wrapper passano ref a `ComingSoonPlaceholder`. Se necessario, wrappare in `<div>` nei tab components.

### 3. Dirty state per tab Permessi (P1)
In `UserRolesPermissionsTab.tsx`:
- Aggiungere `useMemo` per confronto deep tra `permissions` e `user.permissions`
- Disabilitare bottone "Salva Permessi" quando `!isDirty`

### 4. Filtrare campi extra nel salvataggio permessi (P1)
In `SettingsUserDetail.tsx` `savePermissionsMutation`:
- Prima dell'update, estrarre solo le chiavi definite in `DEFAULT_PERMISSIONS` (importare e usare come whitelist)

### 5. Dialog modale per password generata (P2)
Sostituire il toast con un dialog che mostra la password + bottone Copia, come gia implementato in `StaffUserDialog`.

### 6. Responsive sidebar su mobile (P2)
In `SettingsUserDetail.tsx`:
- Su viewport `< md`: nascondere sidebar verticale, mostrare tabs orizzontali scrollabili
- Su viewport `>= md`: mantenere layout attuale

### Nessuna migrazione DB necessaria.


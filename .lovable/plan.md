

# Audit Completo - Crea/Modifica Utente: Report AS-IS

## Risultato dell'Audit

Dopo analisi end-to-end di tutti i file coinvolti (6 componenti frontend, 3 Edge Functions, 1 file types, 1 defaults), il sistema e **funzionalmente corretto**. Non ci sono bug bloccanti.

## Problemi Residui Identificati

### P1 - Sicurezza

1. **`create-company-staff`: CORS headers incompleti**
   - Riga 5-7: `corsHeaders` include solo `authorization, x-client-info, apikey, content-type`. Mancano gli header `x-supabase-client-platform*` e `x-supabase-client-runtime*` che sono presenti nelle altre Edge Functions (`delete-company-user`, `reset-customer-password`). Questo potrebbe causare errori CORS in alcuni browser.
   - **Fix**: Allineare i CORS headers di `create-company-staff` con quelli standard usati nelle altre funzioni.

2. **`create-company-staff`: `listUsers()` non scalabile**
   - Riga 100: `await supabaseAdmin.auth.admin.listUsers()` carica TUTTI gli utenti auth per verificare se l'email esiste. Con molti tenant, questo diventa lento e costoso.
   - **Fix**: Usare `getUserByEmail` o tentare la creazione e gestire l'errore `email_exists`.

3. **`create-company-staff`: callerRole query con `.single()` puo fallire**
   - Riga 55-59: Se un utente ha piu di un ruolo (es. doppio record), `.single()` restituisce errore. Dovrebbe usare `.maybeSingle()` o prendere il primo risultato.
   - **Fix**: Usare una query piu robusta per il ruolo del caller.

### P2 - Robustezza

4. **`UserProfileTab`: password reset non valida input lato client**
   - Nessun controllo di lunghezza minima sulla password inserita manualmente. Un utente potrebbe impostare "123" come password.
   - **Fix**: Aggiungere validazione client-side (min 8 caratteri) prima di inviare.

5. **`savePermissionsMutation`: sync legacy marketing mancante nell'edit**
   - In `UsersConfig.tsx` la creazione utente sincronizza `can_view_marketing`/`can_edit_marketing` con i permessi granulari. Ma in `SettingsUserDetail.tsx` il salvataggio permessi (`savePermissionsMutation`) non fa questa sincronizzazione. Se un admin attiva permessi granulari marketing dalla pagina edit, i campi legacy restano `false`, causando inconsistenza con la sidebar che potrebbe usare i campi legacy.
   - **Fix**: Aggiungere la stessa logica di sync legacy nel `savePermissionsMutation` di `SettingsUserDetail.tsx`.

6. **`PermissionsDialog.tsx`: componente legacy non allineato**
   - `PermissionsDialog` (il dialog modale usato in `CompanyTeamTab`) non include il toggle `can_view_cruscotto` nella UI. Le funzioni `handleSelectAll`/`handleDeselectAll` lo settano ma non c'e un checkbox per attivarlo singolarmente.
   - **Fix**: Aggiungere la sezione Cruscotto nel dialog, oppure verificare se il componente e ancora usato e rimuoverlo se obsoleto.

## Piano Interventi

### 1. Fix CORS `create-company-staff` (P1)
Allineare `corsHeaders` con lo standard usato nelle altre funzioni.

### 2. Sostituire `listUsers()` con approccio scalabile (P1)
Provare la creazione e gestire l'errore `user_already_exists`, oppure usare una query diretta.

### 3. Robustezza query ruolo caller (P1)
Cambiare `.single()` in una query piu difensiva in `create-company-staff`.

### 4. Validazione password client-side (P2)
Aggiungere `min 8 chars` check in `UserProfileTab.tsx` prima del submit.

### 5. Sync legacy marketing nel salvataggio permessi (P2)
In `SettingsUserDetail.tsx`, aggiungere la logica di sincronizzazione `can_view_marketing`/`can_edit_marketing` basata sui flag granulari, come gia fatto in `UsersConfig.tsx` riga 119-126.

### 6. Fix `PermissionsDialog` - aggiungere Cruscotto (P2)
Aggiungere il toggle `can_view_cruscotto` nella UI del dialog legacy.

### Nessuna migrazione DB necessaria.


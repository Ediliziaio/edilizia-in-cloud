
# Miglioramento UX della pagina Login

## Panoramica
Riprogettare completamente la pagina di login eliminando il sistema a due card + dialog e creando un'esperienza piu diretta e moderna. Aggiungere accesso con Google e recupero password.

## Cosa cambiera

### Design attuale vs nuovo
- **Attuale**: Due card grandi (Cliente/Azienda) che aprono un dialog con il form di login - troppi passaggi, UX frammentata
- **Nuovo**: Una singola pagina pulita con il form di login direttamente visibile, senza dialog. Layout split-screen su desktop (branding a sinistra, form a destra), form centrato su mobile

### Funzionalita
1. **Form di login diretto** - Email + password visibili subito, niente piu selezione Cliente/Azienda (il sistema rileva il ruolo automaticamente dopo il login)
2. **Accesso con Google** - Pulsante "Accedi con Google" tramite Lovable Cloud OAuth
3. **Recupero password** - Link "Password dimenticata?" che mostra un form per inserire l'email e ricevere il link di reset
4. **Pagina di reset password** - Nuova pagina `/reset-password` dove l'utente imposta la nuova password dopo aver cliccato il link nell'email

## Dettaglio Tecnico

### 1. Riscrittura `LoginForm.tsx`
- Rimuovere il sistema card Cliente/Azienda e il Dialog
- Layout split-screen: colonna sinistra con branding (logo, titolo, descrizione), colonna destra con il form
- Form con campi email/password, pulsante "Accedi"
- Pulsante Google OAuth sotto il form con separatore "oppure"
- Link "Password dimenticata?" sotto il pulsante di login
- Stato `forgotPassword` per mostrare il form di recupero (solo campo email + pulsante "Invia link di reset")
- Su mobile: layout a colonna singola con logo sopra e form sotto

### 2. Integrazione Google OAuth
- Configurare il social login con il tool dedicato (Configure Social Login)
- Importare `lovable` da `@/integrations/lovable/index`
- Chiamare `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })` al click
- Il sistema di autenticazione esistente gestira il redirect post-login in base al ruolo

### 3. Funzionalita "Password dimenticata"
- Nel `LoginForm.tsx`: toggle tra form login e form recupero password
- Form recupero: campo email + pulsante che chiama `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`
- Messaggio di conferma dopo l'invio

### 4. Nuova pagina `/reset-password`
- File: `src/pages/auth/ResetPassword.tsx`
- Controlla il parametro `type=recovery` nell'URL hash
- Mostra form con nuova password + conferma password
- Chiama `supabase.auth.updateUser({ password })` per aggiornare
- Redirect al login dopo il successo

### 5. Aggiornamento `App.tsx`
- Aggiungere la route `/reset-password` come route pubblica
- Importare il nuovo componente `ResetPassword`

### File coinvolti
- `src/components/auth/LoginForm.tsx` - Riscrittura completa
- `src/pages/auth/ResetPassword.tsx` - Nuovo file
- `src/App.tsx` - Aggiunta route `/reset-password`

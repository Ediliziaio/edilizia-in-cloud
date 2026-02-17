
# Miglioramento Sezione Impostazioni Admin

## Problemi trovati

### 1. Warning React: "Function components cannot be given refs" (BUG)
La console mostra un warning su `AdminSettings` -- React Router tenta di passare un `ref` al componente ma non usa `forwardRef`. Stesso bug su `PayoutDialog`.

**Fix**: Nessun intervento necessario su AdminSettings -- il warning viene da React Router internals e non causa problemi funzionali. Ma `PayoutDialog` restituisce `null` prima del Dialog, il che potrebbe confondere React Router. Non e critico.

### 2. Profilo: salvataggio usa `try/catch` manuale invece di `useMutation` (INCONSISTENZA)
Tutte le altre pagine admin usano `useMutation` di TanStack per le operazioni di scrittura. AdminSettings usa `useState` + `try/catch` manuale per `handleUpdateProfile`. Questo perde retry, stato `isPending`, e coerenza col pattern del progetto.

**Fix**: Migrare `handleUpdateProfile` a `useMutation`.

### 3. Password: nessuna verifica della password attuale (SICUREZZA)
Il form "Cambia Password" del Super Admin non richiede la password attuale, a differenza della `ChangePasswordForm` usata nella sezione azienda. Anche un Super Admin dovrebbe verificare la password corrente prima di cambiarla.

**Fix**: Aggiungere campo "Password Attuale" con verifica via `signInWithPassword` prima di `updateUser`.

### 4. Password: salvataggio usa `try/catch` manuale invece di `useMutation` (INCONSISTENZA)
Stessa inconsistenza del punto 2.

**Fix**: Migrare `handleChangePassword` a `useMutation`.

### 5. Validazione form troppo debole (UX)
La validazione della password avviene solo al click del bottone con toast. Non c'e feedback inline sui campi (bordi rossi, messaggi sotto l'input). Il form profilo non ha nessuna validazione (nome/cognome possono essere vuoti).

**Fix**: Aggiungere validazione inline con messaggi di errore sotto i campi, e impedire salvataggio con nome/cognome vuoti.

### 6. Nessun indicatore di password strength (UX)
L'utente vede solo "Minimo 8 caratteri" come placeholder. Non c'e feedback visivo sulla forza della password.

**Fix**: Aggiungere un indicatore di forza semplice (debole/media/forte) sotto il campo password.

### 7. Toggle visibilita password mancante (UX)
`ChangePasswordForm` (sezione azienda) ha il toggle occhio per mostrare/nascondere la password. AdminSettings non ce l'ha.

**Fix**: Aggiungere icona Eye/EyeOff sui campi password.

## Piano di intervento

### File: `src/pages/admin/AdminSettings.tsx`

**Migrazione a useMutation:**
- Sostituire `handleUpdateProfile` con `useMutation` (queryKey invalidation su `refreshAuth`)
- Sostituire `handleChangePassword` con `useMutation`
- Rimuovere `isUpdating` e `isChangingPassword` useState (sostituiti da `mutation.isPending`)

**Sicurezza password:**
- Aggiungere campo "Password Attuale" con stato dedicato
- Verificare con `signInWithPassword` prima di `updateUser` (stesso pattern di `ChangePasswordForm`)

**Validazione inline:**
- Aggiungere stato `errors` per validazione profilo (nome/cognome obbligatori)
- Aggiungere stato `errors` per validazione password (attuale, nuova, conferma)
- Mostrare messaggi rossi sotto i campi invalidi
- Bordi rossi sui campi con errore

**UX password:**
- Aggiungere toggle Eye/EyeOff su tutti e 3 i campi password
- Aggiungere indicatore forza password (debole < 8, media 8-11, forte >= 12 + mix maiuscole/numeri/speciali)

## Riepilogo modifiche

| File | Azione |
|------|--------|
| `AdminSettings.tsx` | Migrazione a useMutation, campo password attuale, validazione inline, toggle visibilita password, indicatore forza |

## Cosa rimane invariato
- Layout a 2 colonne (profilo + password)
- Card Super Admin con badge
- Email non modificabile
- Toast di successo/errore
- Sincronizzazione form con `useEffect` (gia corretta)

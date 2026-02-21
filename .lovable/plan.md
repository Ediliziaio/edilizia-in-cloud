
# Ritorno alla Sessione Originale dopo Quick Login

## Problema
Quando un Super Admin usa il "Quick Login" per accedere come un altro utente, la sessione originale viene completamente sostituita. Non c'e modo di tornare indietro senza fare logout e ri-autenticarsi manualmente.

## Soluzione
Salvare l'email del Super Admin in `sessionStorage` prima del cambio sessione, poi mostrare un banner fisso in tutti i layout con un pulsante "Torna a [Nome Admin]" che riutilizza la stessa Edge Function `sign-in-as-user` per ri-autenticarsi.

## Modifiche

### 1. QuickLoginPopover.tsx
- Prima di eseguire il `signOut`, salvare in `sessionStorage` l'email e il nome del Super Admin corrente:
  - Chiave: `quick_login_original_email`
  - Chiave: `quick_login_original_name`

### 2. Nuovo componente: `QuickLoginReturnBanner.tsx`
- Legge da `sessionStorage` se esiste una sessione originale salvata
- Mostra un banner colorato (blu/viola) con il testo: "Hai effettuato l'accesso rapido. Torna come [Nome Admin]"
- Il pulsante "Torna indietro" esegue:
  1. Chiama `sign-in-as-user` con l'email originale
  2. Pulisce le chiavi da `sessionStorage`
  3. Redirige a `/admin`
- Se il ritorno fallisce (es. sessione scaduta), pulisce comunque `sessionStorage` e mostra un messaggio di errore

### 3. Integrazione nei Layout
Aggiungere `QuickLoginReturnBanner` in cima a tutti e 4 i layout dove l'utente impersonato potrebbe trovarsi:
- **CompanyLayout.tsx** (staff/admin azienda)
- **CustomerLayout.tsx** (cliente)
- **EmployeeLayout.tsx** (dipendente)
- **SalespersonLayout.tsx** (venditore)

### 4. Pulizia automatica
- Al logout normale (`signOut`), pulire le chiavi `quick_login_*` da `sessionStorage` in `AuthContext.tsx`

## Dettagli Tecnici

```text
Flusso:
1. Super Admin clicca "Accedi come utente" su Enrico Goldoni
2. Sistema salva in sessionStorage: email e nome del Super Admin
3. Sistema esegue signOut + verifyOtp come Enrico
4. Enrico vede il banner: "Sessione Quick Login attiva - Torna come Mario Rossi"
5. Enrico clicca "Torna indietro"
6. Sistema chiama sign-in-as-user con email originale
7. Sistema pulisce sessionStorage e redirige a /admin
```

### File coinvolti
| File | Azione |
|------|--------|
| `src/components/admin/QuickLoginPopover.tsx` | Salva email/nome admin prima dello swap |
| `src/components/admin/QuickLoginReturnBanner.tsx` | Nuovo - banner con pulsante ritorno |
| `src/components/layouts/CompanyLayout.tsx` | Aggiunge banner |
| `src/components/layouts/CustomerLayout.tsx` | Aggiunge banner |
| `src/components/layouts/EmployeeLayout.tsx` | Aggiunge banner |
| `src/components/layouts/SalespersonLayout.tsx` | Aggiunge banner |
| `src/contexts/AuthContext.tsx` | Pulizia sessionStorage al signOut |



# Rendere il Quick Login Fluido (Senza Logout Visibile)

## Problema
Attualmente il flusso Quick Login esegue 3 passaggi visibili all'utente:
1. `signOut()` -- causa la perdita della sessione, ProtectedRoute vede "utente non autenticato" e mostra brevemente la pagina di login
2. `verifyOtp()` -- ri-autentica con il nuovo utente
3. `window.location.href` -- forza un reload completo della pagina

Questo crea un effetto "flash" dove l'utente vede la pagina di login per un istante prima di essere rediretto alla dashboard del nuovo utente.

## Soluzione
Eliminare il `signOut()` intermedio e il reload forzato. Supabase sostituisce automaticamente la sessione corrente quando si chiama `verifyOtp()`, quindi il logout esplicito non e necessario. In piu, mostrare un overlay di caricamento a schermo intero durante la transizione per coprire il breve momento di aggiornamento del contesto.

## Modifiche

### 1. QuickLoginPopover.tsx
- Rimuovere la chiamata `await supabase.auth.signOut()` 
- Rimuovere `window.location.href = target` (il reload forzato)
- Dopo `verifyOtp`, chiamare `refreshAuth()` dal contesto di autenticazione per aggiornare il profilo e il ruolo
- Usare `navigate(target, { replace: true })` per la navigazione senza reload

### 2. QuickLoginReturnBanner.tsx
- Stessa logica: rimuovere `signOut()` prima di `verifyOtp`
- Rimuovere `window.location.href = "/admin"`
- Dopo `verifyOtp`, chiamare `refreshAuth()` e poi `navigate("/admin", { replace: true })`

### 3. AuthContext.tsx
- Aggiungere gestione dell'evento `TOKEN_REFRESHED` in `onAuthStateChange` per supportare il cambio sessione senza logout
- L'evento `SIGNED_IN` gia esistente gestira il nuovo token da `verifyOtp`

### Risultato
La transizione avverra in circa 1 secondo senza nessun flash visibile: l'utente vedra solo un breve spinner di caricamento sovrapposto alla pagina corrente, poi verra portato direttamente alla nuova dashboard.

## Dettagli Tecnici

```text
Flusso attuale (con flash):
  Admin Dashboard --> signOut() --> Flash pagina login --> verifyOtp() --> Reload pagina --> Dashboard utente

Nuovo flusso (fluido):
  Admin Dashboard --> Overlay caricamento --> verifyOtp() --> refreshAuth() --> navigate() --> Dashboard utente
```

### File coinvolti
| File | Modifica |
|------|----------|
| `src/components/admin/QuickLoginPopover.tsx` | Rimuovere signOut e window.location.href, usare refreshAuth + navigate |
| `src/components/admin/QuickLoginReturnBanner.tsx` | Stessa modifica: rimuovere signOut, usare refreshAuth + navigate |


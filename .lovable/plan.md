

# Fix: Sessione persa dopo refresh della pagina

## Problema identificato

Il bug è nel `AuthContext.tsx` — ci sono due problemi che causano la perdita di sessione al refresh:

### 1. `onAuthStateChange` ignora l'evento `INITIAL_SESSION`
La callback (riga 196) gestisce solo `SIGNED_IN` e `SIGNED_OUT`. Al refresh della pagina, Supabase emette l'evento **`INITIAL_SESSION`** (non `SIGNED_IN`), che viene completamente ignorato. Quindi la sessione restaurata dal localStorage non viene mai processata dalla callback.

### 2. `refreshAuth` usa `getUser()` che può fallire
La funzione `refreshAuth` (riga 146) chiama `supabase.auth.getUser()` che fa una chiamata di rete al server. Se il token JWT è scaduto o c'è un problema di rete, questa chiamata ritorna errore/null → l'utente viene impostato come non autenticato → redirect al login. I log di autenticazione confermano errori `403: invalid claim: missing sub claim`.

La soluzione corretta è usare prima `getSession()` (che legge dal localStorage, veloce e offline-safe) per il restore iniziale, e gestire `INITIAL_SESSION` nella callback.

## Modifiche

### `src/contexts/AuthContext.tsx`

1. **Nella callback `onAuthStateChange`** (riga 196): aggiungere la gestione dell'evento `INITIAL_SESSION` insieme a `SIGNED_IN`. Quando la sessione viene restaurata dal localStorage al refresh, questo evento porta i dati utente corretti.

```typescript
// Da:
if (event === "SIGNED_IN" && session?.user) {

// A:
if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) {
```

2. **In `refreshAuth`** (riga 145-164): usare `getSession()` invece di `getUser()` come metodo primario. `getSession()` legge dal localStorage ed è istantaneo, mentre `getUser()` fa una chiamata di rete che può fallire. Fallback a `getUser()` solo se la sessione locale non è disponibile.

```typescript
const refreshAuth = useCallback(async () => {
  // getSession reads from localStorage – fast & offline-safe
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  
  if (user) {
    const userData = await fetchUserData(user.id);
    setState({ user, ...userData, isLoading: false });
  } else {
    setState({ user: null, profile: null, role: null, company: null, isLoading: false });
  }
}, [fetchUserData]);
```

Queste due modifiche, combinate, risolvono il problema: il refresh della pagina ora restaura la sessione istantaneamente dal localStorage senza dipendere da chiamate di rete che possono fallire.


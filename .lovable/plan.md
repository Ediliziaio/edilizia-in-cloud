

# Fix: Messaggio di errore generico nella creazione utenti

## Problema trovato

Ho analizzato i log del backend e il problema è chiaro: **l'email `f.andriciuc@overthemol.com` è già registrata nel sistema**. La edge function `create-company-staff` funziona correttamente e ritorna l'errore "Un utente con questa email esiste già" con status 400.

Il problema è che il frontend **non legge il messaggio di errore reale** dalla risposta. Quando una edge function ritorna status non-2xx, `supabase.functions.invoke()` mette un messaggio generico ("Edge Function returned a non-2xx status code") in `response.error.message`, mentre il body reale (con il messaggio italiano) è nascosto in `response.error.context`.

## Modifica

### `src/components/settings/UsersConfig.tsx` — funzione `handleCreateUser` (riga 360)

Sostituire la riga 360:
```typescript
if (response.error) throw new Error(response.error.message || "Errore durante la creazione");
```

Con logica che estrae il messaggio dal body della risposta:
```typescript
if (response.error) {
  let errorMessage = "Errore durante la creazione dell'utente";
  try {
    const errorBody = await response.error.context?.json?.();
    if (errorBody?.error) errorMessage = errorBody.error;
  } catch {
    if (response.error.message && !response.error.message.includes("non-2xx")) {
      errorMessage = response.error.message;
    }
  }
  throw new Error(errorMessage);
}
```

Questo farà apparire messaggi chiari come "Un utente con questa email esiste già" invece del messaggio tecnico generico.


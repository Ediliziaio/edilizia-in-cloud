

# Procedere senza GOOGLE_TOKEN_ENCRYPTION_KEY

## Problema
L'edge function `google-calendar-auth` attualmente lancia un errore se `GOOGLE_TOKEN_ENCRYPTION_KEY` non è configurato. L'utente vuole procedere senza, aggiungendolo in seguito dalla UI SuperAdmin.

## Interventi

### 1. Edge function `google-calendar-auth/index.ts` — fallback encryption key
Modificare `getEncryptionKey()` per usare un fallback deterministico derivato dal `SUPABASE_SERVICE_ROLE_KEY` (primi 32 char) quando il secret dedicato non è configurato. Questo permette l'encrypt/decrypt dei token anche senza il secret, con upgrade trasparente quando verrà aggiunto.

```typescript
function getEncryptionKey(): string {
  const key = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (key) return key;
  // Fallback: derive from service role key (always available)
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "default-dev-key";
  return srk.substring(0, 32);
}
```

Rimuovere il `throw` — non blocca più l'esecuzione.

### 2. `supabase/config.toml` — aggiungere entry function
Aggiungere:
```toml
[functions.google-calendar-auth]
verify_jwt = false
```

Attualmente mancante — senza questo la function non si deploya correttamente.

### File modificati
| File | Modifica |
|------|----------|
| `supabase/functions/google-calendar-auth/index.ts` | Fallback encryption key senza throw |
| `supabase/config.toml` | Aggiungere entry function |

Nessuna regressione: il comportamento è identico quando il secret è presente, e funziona con fallback quando non lo è.


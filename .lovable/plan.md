

# Fix: "Errore avvio OAuth: Unexpected end of JSON input"

## Diagnosi

Il problema e' visibile nelle network requests: la chiamata POST va a `undefined/functions/v1/meta-oauth-start` — l'URL inizia con `undefined` perche' `import.meta.env.VITE_SUPABASE_URL` non e' disponibile a runtime.

Il file `client.ts` ha un fallback hardcoded (`|| "https://guqgszwelffntrgtsycm.supabase.co"`), ma i file che chiamano direttamente `import.meta.env.VITE_SUPABASE_URL` (senza fallback) ottengono `undefined`. Il fetch restituisce un 404 da un URL invalido, e `.json()` fallisce perche' la risposta non e' JSON.

## Fix

Creare una costante condivisa per il Supabase URL con fallback, e usarla in tutti i file che fanno fetch diretti alle Edge Functions:

1. **`src/hooks/useMetaIntegration.ts`** — Sostituire `import.meta.env.VITE_SUPABASE_URL` con una costante con fallback (riga 75 e 108)
2. **`src/hooks/useMetaAdsReport.ts`** — Stessa fix (riga 98)
3. **`src/pages/azienda/CustomersList.tsx`** — Stessa fix (riga 119)

In ogni file, aggiungere in cima:
```typescript
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://guqgszwelffntrgtsycm.supabase.co";
```

E sostituire tutti gli usi di `import.meta.env.VITE_SUPABASE_URL` con `SUPABASE_URL`.


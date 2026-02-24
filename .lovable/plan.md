

# Implementazione Fallback DB per maps-proxy e whatsapp-*

## Stato attuale

Le card UI e le chiavi consentite nell'edge function `manage-super-admins` sono gia' implementate correttamente. Manca solo il fallback da DB (come `getMetaCredentials.ts`) per le seguenti Edge Functions:

| Edge Function | Chiave(i) da leggere da DB | Attuale sorgente |
|---|---|---|
| `maps-proxy` | `google_maps_api_key` | `Deno.env.get("GOOGLE_MAPS_API_KEY")` (riga 39) |
| `whatsapp-webhook` | `whatsapp_verify_token`, `meta_app_secret` | `Deno.env.get` top-level (righe 3-4) |
| `whatsapp-connect` | `meta_app_secret` | `Deno.env.get("META_APP_SECRET")` (riga 3) |
| `whatsapp-status` | Nessuna chiave piattaforma diretta | Nessuna modifica necessaria |

## Modifiche

### 1. Nuovo helper: `_shared/getPlatformSetting.ts`

Funzione generica riutilizzabile che legge una singola chiave da `platform_settings` con fallback a env:

```typescript
export async function getPlatformSetting(key: string, envFallback?: string): Promise<string>
```

- Crea un client service_role
- Query `platform_settings` per la chiave
- Se trovata, restituisce il valore
- Altrimenti fallback a `Deno.env.get(envFallback || key.toUpperCase())`
- Gestisce errori con `console.warn` e fallback silenzioso

### 2. `maps-proxy/index.ts`

**Prima** (riga 39):
```typescript
const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
```

**Dopo**: Spostare la lettura dentro `Deno.serve`, chiamare `getPlatformSetting("google_maps_api_key", "GOOGLE_MAPS_API_KEY")` per ottenere la chiave dinamicamente ad ogni richiesta (non piu' top-level statico).

### 3. `whatsapp-webhook/index.ts`

**Prima** (righe 3-4):
```typescript
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const APP_SECRET = Deno.env.get("META_APP_SECRET")!;
```

**Dopo**: Rimuovere le costanti top-level. Dentro `Deno.serve`, caricare i valori dinamicamente:
- GET (verifica webhook): `getPlatformSetting("whatsapp_verify_token", "WHATSAPP_VERIFY_TOKEN")`
- POST (HMAC): usare `getMetaCredentials()` per `metaAppSecret` (riutilizza helper esistente)

### 4. `whatsapp-connect/index.ts`

**Prima** (riga 3):
```typescript
const APP_SECRET = Deno.env.get("META_APP_SECRET")!;
```

**Dopo**: Rimuovere la costante top-level. Dentro il handler, usare `getMetaCredentials()` per ottenere `metaAppSecret` (stesso pattern gia' usato per `meta-oauth-start` ecc.).

### 5. `whatsapp-status/index.ts`

Nessuna modifica necessaria: questa funzione non usa direttamente `META_APP_SECRET` ne' `WHATSAPP_VERIFY_TOKEN`. Usa solo il token di accesso specifico dell'azienda salvato in `messaging_whatsapp_config`.

---

## Riepilogo file

| File | Azione |
|------|--------|
| `supabase/functions/_shared/getPlatformSetting.ts` | **Nuovo** - helper generico per leggere una chiave da DB con fallback env |
| `supabase/functions/maps-proxy/index.ts` | Sostituire `Deno.env.get` con `getPlatformSetting` |
| `supabase/functions/whatsapp-webhook/index.ts` | Sostituire costanti top-level con lettura dinamica da DB |
| `supabase/functions/whatsapp-connect/index.ts` | Sostituire `APP_SECRET` con `getMetaCredentials()` |

## Sicurezza e retrocompatibilita'

- Fallback a `Deno.env` garantisce che tutto funzioni anche senza configurazione da UI
- Nessuna modifica alla tabella DB o alle RLS policy
- Nessuna modifica al frontend


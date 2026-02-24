

# Aggiunta card Google Maps API Key e WhatsApp Verify Token

## Obiettivo
Estendere il pannello Piattaforma Super Admin con due nuove card di configurazione per Google Maps e WhatsApp, seguendo lo stesso pattern della card Meta esistente.

## Modifiche necessarie

### 1. Edge Function `manage-super-admins` — Estendere le chiavi consentite

Il codice attuale filtra le chiavi con `allowedKeys = ["meta_app_id", "meta_app_secret"]` sia in `get-settings` che in `update-settings`. Basta aggiungere `google_maps_api_key` e `whatsapp_verify_token` a entrambe le liste.

**File**: `supabase/functions/manage-super-admins/index.ts`
- Riga 355: estendere la lista `.in("key", [...])` per includere le nuove chiavi
- Riga 381: aggiungere le nuove chiavi a `allowedKeys`
- Trattare `google_maps_api_key` e `whatsapp_verify_token` come secret (mascherati con `••••` + ultimi 4 char)

### 2. Frontend — Due nuove card in `PlatformInfoTab.tsx`

Per evitare duplicazione di codice, estrarre un componente generico `ApiKeyCard` riutilizzabile dalle 3 card (Meta, Google Maps, WhatsApp).

**File**: `src/components/admin/settings/PlatformInfoTab.tsx`

Il componente `ApiKeyCard` accettera':
- `icon`: icona Lucide
- `title`: nome dell'integrazione
- `description`: descrizione breve
- `tooltipText`: spiegazione per il tooltip
- `fields`: array di campi `{ key, label, isSecret }` che descrivono quali chiavi gestire
- `settings`: i dati dal backend
- `isLoading`: stato caricamento
- `onSave(updates)`: callback per il salvataggio

Le 3 card:

| Card | Chiavi | Campi |
|------|--------|-------|
| Meta | `meta_app_id`, `meta_app_secret` | App ID (testo), App Secret (password) |
| Google Maps | `google_maps_api_key` | API Key (password) |
| WhatsApp | `whatsapp_verify_token` | Verify Token (password) |

La query `get-settings` viene condivisa: una singola chiamata carica tutte le chiavi, evitando 3 richieste separate. La mutation `update-settings` resta identica (invia solo le chiavi modificate).

### 3. Edge Functions Maps/WhatsApp — Fallback da DB (opzionale, fase successiva)

Analogamente a quanto fatto per Meta con `getMetaCredentials.ts`, le Edge Functions `maps-proxy`, `whatsapp-connect`, `whatsapp-webhook` e `whatsapp-status` potranno leggere prima da `platform_settings` e poi fare fallback su `Deno.env`. Questo e' un miglioramento incrementale che puo' essere fatto in un secondo momento senza bloccare la UI.

### 4. Nessuna migrazione DB necessaria

La tabella `platform_settings` e' gia' una key-value store generica. Le nuove chiavi (`google_maps_api_key`, `whatsapp_verify_token`) vengono semplicemente inserite come nuove righe, senza alterazioni di schema.

---

## Riepilogo file da modificare

| File | Modifica |
|------|----------|
| `supabase/functions/manage-super-admins/index.ts` | Aggiungere chiavi a `get-settings` e `allowedKeys` in `update-settings`, mascherare le nuove chiavi |
| `src/components/admin/settings/PlatformInfoTab.tsx` | Estrarre `ApiKeyCard` generico, aggiungere card Google Maps e WhatsApp |

## Sicurezza
- Stesse protezioni della card Meta: RLS su `platform_settings`, verifica `super_admin`, audit trail, mascheramento secret
- Nessuna nuova superficie di attacco


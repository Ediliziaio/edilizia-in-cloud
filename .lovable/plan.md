

# FIX 8: Gestione errori — API esterne non configurate

## Approccio

Le API esterne in questo progetto usano la tabella `platform_settings` per le credenziali (non env vars dirette). L'edge function verificherà la presenza delle chiavi in DB, con fallback su env vars, coerente con il pattern `getPlatformSetting` già usato ovunque.

## Componenti

### 1. Edge function `check-api-health/index.ts`
- Autentica l'utente via JWT header
- Legge da `platform_settings` le chiavi: `google_maps_api_key`, `meta_app_id`, `meta_app_secret`, `email_provider_api_key`, `elevenlabs_api_key`, `whatsapp_verify_token`
- Controlla anche `messaging_whatsapp_config` per la company dell'utente (WhatsApp è per-company)
- Controlla anche `integrations` per Meta (per-company)
- Restituisce `{ whatsapp: bool, googlemaps: bool, meta: bool, email: bool, elevenlabs: bool }`
- Config: `verify_jwt = false` in `config.toml`

### 2. Hook `useApiHealth` (`src/hooks/useApiHealth.ts`)
- Chiama `check-api-health` via `supabase.functions.invoke`
- Cache con `staleTime: 10 min` (non serve rinfrescare spesso)
- Espone `{ services: Record<string, boolean>, isLoading }`

### 3. Componente `ApiHealthBanner` (`src/components/marketing/ApiHealthBanner.tsx`)
- Riceve la lista servizi dal hook
- Per ogni servizio non configurato: mostra un `Alert` con icona, nome servizio, e link "Configura ora" (→ `/piattaforma/impostazioni`)
- Chiudibile con X; stato dismissione in `sessionStorage` per non ripetersi
- Servizi mappati a pagine: WhatsApp → pagine WhatsApp/contatti, Google Maps → calendario, Meta → dashboard/opportunità, Email → email marketing, ElevenLabs → agente AI

### 4. Integrazione nelle pagine Marketing
- Aggiungere `<ApiHealthBanner filter={["whatsapp"]} />` nelle pagine rilevanti:
  - `MarketingWhatsApp.tsx` → filtra `whatsapp`
  - `MarketingDashboard.tsx` → filtra `meta`, `email`
  - `MarketingCalendar.tsx` → filtra `googlemaps`
  - `EmailMarketing.tsx` → filtra `email`
  - `MarketingContactDetail.tsx` → filtra `whatsapp`, `email`

## File coinvolti

| File | Azione |
|------|--------|
| `supabase/functions/check-api-health/index.ts` | Nuovo |
| `supabase/config.toml` | Aggiungere entry |
| `src/hooks/useApiHealth.ts` | Nuovo |
| `src/components/marketing/ApiHealthBanner.tsx` | Nuovo |
| 5 pagine marketing | Aggiungere banner |




# Google Calendar Integration — Piano Implementativo (Batch 1)

Questa feature richiede circa 15-20 iterazioni. Propongo un approccio in 3 batch. Questo piano copre il **Batch 1 completo**: DB + OAuth + UI base.

---

## Scope Batch 1

L'utente potra collegare il proprio account Google, selezionare Primary/Conflict calendars, e configurare le preferenze di sync. Non sara ancora attiva la sincronizzazione effettiva (Batch 2).

---

## 1. Migrazione DB (4 tabelle + RLS + indici)

### `google_calendar_connections`
| Colonna | Tipo |
|---------|------|
| id | uuid PK |
| company_id | uuid FK companies NOT NULL |
| user_id | uuid FK auth.users NOT NULL |
| google_account_email | text |
| google_sub | text |
| access_token_encrypted | text |
| refresh_token_encrypted | text |
| token_expires_at | timestamptz |
| status | text DEFAULT 'disconnected' |
| last_sync_at | timestamptz |
| last_error | text |
| created_at / updated_at | timestamptz |

### `google_calendar_settings`
| Colonna | Tipo |
|---------|------|
| id | uuid PK |
| company_id | uuid FK NOT NULL |
| user_id | uuid FK NOT NULL |
| connection_id | uuid FK google_calendar_connections |
| primary_calendar_id | text |
| conflict_calendar_ids | text[] DEFAULT '{}' |
| sync_mode | text DEFAULT 'one_way' |
| import_google_events_to_crm | boolean DEFAULT false |
| create_contacts_from_guests | boolean DEFAULT false |
| created_at / updated_at | timestamptz |

### `google_calendar_event_map`
| Colonna | Tipo |
|---------|------|
| id | uuid PK |
| company_id | uuid FK NOT NULL |
| user_id | uuid FK NOT NULL |
| appointment_id | uuid FK appointments (nullable) |
| google_event_id | text NOT NULL |
| google_calendar_id | text |
| source | text NOT NULL (crm/google) |
| etag | text |
| last_synced_at | timestamptz |
| last_updated_by | text |
| created_at / updated_at | timestamptz |

### `google_calendar_busy_slots`
| Colonna | Tipo |
|---------|------|
| id | uuid PK |
| company_id | uuid FK NOT NULL |
| user_id | uuid FK NOT NULL |
| google_event_id | text |
| google_calendar_id | text |
| start_at | timestamptz NOT NULL |
| end_at | timestamptz NOT NULL |
| summary | text |
| is_all_day | boolean DEFAULT false |
| created_at | timestamptz |

RLS su tutte le tabelle: `company_id = get_user_company_id(auth.uid())` per company_admin/staff, `user_id = auth.uid()` per isolamento utente. Super admin: full access.

Indici: `(company_id, user_id)` su tutte, `(company_id, user_id, start_at, end_at)` su busy_slots, UNIQUE `(company_id, user_id)` su connections e settings.

---

## 2. Platform Settings (SuperAdmin)

Aggiungere nella card API del `PlatformInfoTab.tsx` una nuova sezione "Google Calendar" con:
- `google_calendar_client_id` (non secret)
- `google_calendar_client_secret` (secret)

Aggiungere nella stessa UI 3 toggle (salvati come platform_settings):
- `google_calendar_allow_two_way` (default false)
- `google_calendar_allow_guest_contact_create` (default false)
- `google_calendar_allow_google_to_crm_import` (default false)

File: `src/components/admin/settings/PlatformInfoTab.tsx` — aggiungere card nell'array `API_CARDS` + sezione toggle separata.

---

## 3. Edge Function: `google-calendar-auth`

Singola edge function con action routing:

- **`start`**: genera URL OAuth Google con scopes `calendar.readonly calendar.events`, state firmato HMAC (come Meta), redirect a callback
- **`callback`**: scambia code per tokens, cifra con pgcrypto, salva in `google_calendar_connections`, fetch lista calendari Google e restituisce al client
- **`disconnect`**: revoca token Google, cancella connessione + settings + mappings + busy_slots
- **`refresh`**: rinnova access_token se scaduto (uso interno)
- **`list-calendars`**: decifra token, chiama Google Calendar API `calendarList`, restituisce lista

Credenziali lette con `getPlatformSetting` (DB first, env fallback).
Encryption key: nuovo secret `GOOGLE_TOKEN_ENCRYPTION_KEY`.

File: `supabase/functions/google-calendar-auth/index.ts`
Config: aggiungere `[functions.google-calendar-auth] verify_jwt = false` in config.toml

---

## 4. UI: Tab "Collegamenti" in MarketingCalendarsConfig

Sostituire il placeholder attuale (righe 654-691) con componente funzionale:

**Stato disconnesso**: empty state con CTA "Aggiungi nuovo" che apre popup OAuth (stesso pattern di Meta: `window.open` + polling chiusura + `postMessage`)

**Stato connesso**: 
- Card "Calendari collegati" con Google Calendar icon, email, check verde, pulsante elimina
- Sezione "Configurazione del calendario":
  - "Calendario collegato" (Primary): dropdown con calendari Google dell'utente + "Modifica"
  - "Calendari dei conflitti": multi-select con calendari Google + "Modifica"
  - Link "Impostazioni avanzate" che apre modale sync preferences
- Tutto come da screenshot GHL forniti

File: `src/components/settings/MarketingCalendarsConfig.tsx` (righe 654-691 sostituite)
Nuovo componente: `src/components/settings/GoogleCalendarConnectionTab.tsx`

---

## 5. Modale "Preferenze di sincronizzazione"

Nuovo componente dialog come da screenshot:
- Header: "Preferenze di sincronizzazione"
- Illustrazione Default Sync (icone calendario -> blocked slots)
- Radio group:
  - **Sincronizzazione predefinita (one-way)** — badge "Consigliato"
  - **Sincronizzazione bidirezionale** — toggle extra visibili solo se policy SuperAdmin lo consente (query `platform_settings` per `google_calendar_allow_two_way`)
- Bottoni Annulla / Salva

File: `src/components/settings/GoogleCalendarSyncPrefsDialog.tsx`

---

## 6. Card Google Calendar in SettingsIntegrations

Aggiungere alla lista `availableIntegrations` in `SettingsIntegrations.tsx`:
- Provider: `google_calendar`
- Nome: "Google Calendar"
- Descrizione: come da screenshot ("L'impostazione di Google Calendar e stata spostata! Collegalo da...")
- CTA: "Gestisci" che naviga a Impostazioni > Calendari > Collegamenti

Aggiornare `IntegrationProvider` type per includere `"google_calendar"`.
Aggiornare `IntegrationCard` per renderizzare icon Google Calendar (non solo Meta).

File: `src/types/integrations.ts`, `src/components/integrations/IntegrationCard.tsx`, `src/pages/azienda/settings/SettingsIntegrations.tsx`

---

## 7. Riepilogo file da creare/modificare

| Azione | File |
|--------|------|
| CREA | `supabase/migrations/..._google_calendar_tables.sql` |
| CREA | `supabase/functions/google-calendar-auth/index.ts` |
| CREA | `src/components/settings/GoogleCalendarConnectionTab.tsx` |
| CREA | `src/components/settings/GoogleCalendarSyncPrefsDialog.tsx` |
| MODIFICA | `src/components/settings/MarketingCalendarsConfig.tsx` (tab Collegamenti) |
| MODIFICA | `src/components/admin/settings/PlatformInfoTab.tsx` (card + toggle) |
| MODIFICA | `src/pages/azienda/settings/SettingsIntegrations.tsx` (card Google) |
| MODIFICA | `src/components/integrations/IntegrationCard.tsx` (icon routing) |
| MODIFICA | `src/types/integrations.ts` (provider type) |

---

## Prerequisiti

Prima dell'implementazione servira:
1. Secret `GOOGLE_TOKEN_ENCRYPTION_KEY` per cifrare i token OAuth
2. L'utente dovra configurare Client ID e Client Secret dalla UI SuperAdmin (Platform Settings) dopo che il codice sara deployato
3. Su Google Cloud Console: abilitare Google Calendar API, creare credenziali OAuth 2.0, configurare redirect URI

---

## Batch successivi (non inclusi)

- **Batch 2**: Sync engine pull/push, busy slot visualization nel calendario, appointment hooks CRM->Google
- **Batch 3**: Two-way reconciliation, anti-loop, badge sync, error handling avanzato


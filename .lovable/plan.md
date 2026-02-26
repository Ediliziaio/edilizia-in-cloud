

# Analisi Gap — Google Calendar Integration (Batch 1)

Ho esaminato tutti i file implementati. Ecco cosa manca o ha bug rispetto ai requisiti.

---

## Problemi Critici (bloccanti)

### 1. `supabase/config.toml` — entry mancante
La function `google-calendar-auth` non ha la sua entry in config.toml. Senza di essa non verrà deployata correttamente.

**Fix**: aggiungere `[functions.google-calendar-auth] verify_jwt = false`

### 2. Edge function — `supabase.auth.getClaims()` non esiste
Alla riga 392, il codice usa `supabase.auth.getClaims()` che non esiste nel client Supabase JS v2. La function crasherà con un errore runtime su ogni chiamata POST autenticata.

**Fix**: sostituire con `supabase.auth.getUser()` e leggere `data.user.id` per ottenere lo userId.

---

## Problemi UI (funzionali)

### 3. PlatformInfoTab — mancano i 3 toggle policy SuperAdmin
La card Google Calendar ha solo i campi client_id e client_secret, ma manca la sezione con i 3 toggle obbligatori:
- `google_calendar_allow_two_way` (default false)
- `google_calendar_allow_guest_contact_create` (default false)  
- `google_calendar_allow_google_to_crm_import` (default false)

Senza questi toggle, il componente `GoogleCalendarSyncPrefsDialog` non può leggere le policy e mostrerà sempre tutto disabilitato.

**Fix**: aggiungere una sezione toggle dedicata sotto la card API di Google Calendar in `PlatformInfoTab.tsx`, con switch persistiti come `platform_settings`.

### 4. IntegrationCard — card Google Calendar mostra sempre "Collega"
L'`integration` per Google Calendar è hardcodata come `null` (riga 78 di SettingsIntegrations). Quindi il bottone mostra sempre "Collega" anche quando l'utente ha già collegato Google. Dovrebbe leggere lo stato dalla tabella `google_calendar_connections`.

**Fix**: query `google_calendar_connections` per lo user corrente e passare lo stato alla card. Se connesso, mostrare "Gestisci" invece di "Collega".

---

## Riepilogo interventi

| # | File | Intervento | Criticità |
|---|------|-----------|-----------|
| 1 | `supabase/config.toml` | Aggiungere entry function | Bloccante |
| 2 | `supabase/functions/google-calendar-auth/index.ts` | Fix `getClaims` → `getUser` | Bloccante |
| 3 | `src/components/admin/settings/PlatformInfoTab.tsx` | Aggiungere sezione toggle policy Google Calendar | Funzionale |
| 4 | `src/pages/azienda/settings/SettingsIntegrations.tsx` | Query stato connessione Google per mostrare "Gestisci" vs "Collega" | Funzionale |

### Non necessario ora (Batch 2-3)
- Sync engine pull/push (Batch 2)
- Appointment hooks CRM→Google (Batch 2)
- Two-way reconciliation e anti-loop (Batch 3)
- Badge "Google Synced" nel calendario (Batch 3)
- Availability engine aggregation (Batch 2)

Tutti gli elementi di Batch 1 (DB, OAuth, UI base) sono implementati correttamente tranne questi 4 fix.


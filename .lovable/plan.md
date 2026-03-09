

## Piano: Allineamento V4 — Gap residui

Confrontando la spec V4 con l'implementazione attuale, ci sono differenze specifiche da colmare. Le tabelle principali e i componenti UI esistono già, ma alcuni dettagli non corrispondono.

### Gap identificati

**1. Tracking Snippet (`trackingSnippet.ts`)**
- Usa cookies; V4 richiede `localStorage`/`sessionStorage`
- Mancano `ttclid`, `msclkid`, `li_fat_id` nel capture
- Manca persistenza UTM in localStorage per navigazione multi-pagina
- Manca `window._attrSessionId` esposto globalmente
- Invia `landing_page` (path) invece di `landing_url` (URL completa)
- Manca `user_agent` nel payload

**2. Edge Function `form-submit`**
- Manca validazione `company_id` nel body (V4 lo richiede esplicitamente)
- Manca check `is_active` (serve colonna DB + check)
- Mancano `fbclid`/`gclid` nella submission (DB non ha queste colonne in `form_submissions`)
- Manca `user_agent`/`device_type` nella submission
- Manca chiamata RPC `trigger_form_automations` (usa `automation_trigger_events` insert)
- Manca ritorno `success_title`/`success_message` dalla theme del form
- Manca creazione opportunity se pipeline configurata

**3. Edge Function `form-render`**
- Tracking script usa cookies; V4 usa localStorage/sessionStorage
- Manca invio `visitor_id` nel submit payload
- Il param URL è `company_id`; V4 supporta anche `company`

**4. Database**
- `lead_forms` manca colonna `is_active` (V4 la prevede separata da `is_published`)
- `form_submissions` manca `fbclid`, `gclid`, `user_agent`, `device_type`
- Manca funzione DB `trigger_form_automations`

### Piano di implementazione (3 step)

**Step 1 — Migrazione DB**
- ADD `is_active BOOLEAN NOT NULL DEFAULT true` a `lead_forms`
- ADD `fbclid TEXT`, `gclid TEXT`, `user_agent TEXT`, `device_type TEXT` a `form_submissions`
- CREATE FUNCTION `trigger_form_automations(p_submission_id UUID)` come da spec V4

**Step 2 — Riscrittura tracking snippet + edge functions**
- Riscrivere `trackingSnippet.ts` con localStorage/sessionStorage, tutti i click IDs, persistenza UTM multi-pagina, `window._attrSessionId`
- Aggiornare `form-submit`: aggiungere `company_id` validation, `is_active` check, click IDs in submission, opportunity creation, success title/message nel ritorno, `trigger_form_automations` RPC
- Aggiornare `form-render`: tracking script con localStorage, `visitor_id` nel submit, supporto param `company`

**Step 3 — Allineamento UI form-submit response**
- Aggiornare il pannello `FormSettingsPanel` per supportare `successTitle` e `successMessage` nella theme
- Aggiornare `form-render` success box per usare `successTitle` dalla risposta del submit

### File da modificare

| File | Modifica |
|---|---|
| Nuova migrazione SQL | `is_active`, colonne form_submissions, trigger_form_automations |
| `src/constants/trackingSnippet.ts` | Riscrittura completa con localStorage |
| `supabase/functions/form-submit/index.ts` | company_id check, is_active, click IDs, opportunities, success response |
| `supabase/functions/form-render/index.ts` | Tracking localStorage, visitor_id, param company |
| `src/components/settings/FormSettingsPanel.tsx` | Campi successTitle/successMessage nella theme |


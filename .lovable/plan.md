

## Analisi UTM — Problemi trovati

Ho esaminato tutto il flusso: tracking snippet, edge functions (attribution-capture, form-submit, form-render), DB functions, hooks e componenti UI.

### Problemi identificati

**1. `form-submit` non cattura `ttclid`, `msclkid`, `li_fat_id`**
Il body destruttura solo `gclid, fbclid` (riga 42-43). Anche se `form-render` ora invia tutti e 5 i click ID nel payload, `form-submit` li ignora e non li salva in `form_submissions`. Inoltre le colonne `ttclid`, `msclkid`, `li_fat_id` non esistono nella tabella `form_submissions`.

**2. `form-submit` non filtra per `company_id` nella query form**
La query (riga 58-62) cerca il form solo per `id`. Chiunque conosca un `form_id` valido puo inviare dati. Dovrebbe verificare anche il `company_id` se passato nel body, oppure almeno la query dovrebbe restituire il `company_id` e usarlo (cosa che gia fa, ma non valida la coerenza con un eventuale `company_id` nel body).

**3. `ContactAttributionTab` mostra Last Touch solo se source diversa da First Touch**
Riga 134: `attribution.last_source !== attribution.first_source`. Se un utente torna dalla stessa sorgente ma con campagna diversa, il Last Touch non viene mostrato. Il confronto dovrebbe essere piu ampio (source+medium+campaign) o semplicemente mostrare sempre il Last Touch se presente.

**4. `useContactAttribution` query sessioni senza filtro `company_id`**
Riga 24: filtra solo per `contact_id`, non per `company_id`. In teoria i dati sono gia isolati tramite il contatto, ma manca il filtro di sicurezza RLS-style nel codice applicativo.

**5. `attribution_sessions.landing_page` duplicato con `landing_url`**
Il campo `landing_page` (path) e `landing_url` (URL completo) vengono entrambi settati allo stesso valore `resolvedLandingUrl` nell'edge function (riga 122-123 di attribution-capture). Non serve avere entrambi con lo stesso valore.

**6. Click ID mostrano solo il nome, non il valore**
In `ContactAttributionTab` riga 49-53, i click ID mostrano solo "gclid", "fbclid", "ttclid" come label badge, ma non il valore effettivo. Utile per debug ma poco informativo.

**7. `get_attribution_report` non conta `contacts_created` correttamente**
Riga 122: `COUNT(DISTINCT s.contact_id)` conta i contatti collegati alle sessioni, non i contatti **creati** nel periodo. Un contatto creato 6 mesi fa ma con sessione nel periodo viene contato come "creato".

### Piano di fix

**Step 1 — DB: aggiungere colonne click ID a `form_submissions`**
- ADD `ttclid TEXT`, `msclkid TEXT`, `li_fat_id TEXT` a `form_submissions`

**Step 2 — `form-submit`: catturare tutti i click ID**
- Destrutturare `ttclid`, `msclkid`, `li_fat_id` dal body
- Salvarli nell'insert di `form_submissions`

**Step 3 — `ContactAttributionTab`: fix Last Touch visibility**
- Cambiare la condizione per mostrare Last Touch: mostare sempre se `last_touch_at !== first_touch_at` (sessioni diverse)

**Step 4 — `get_attribution_report`: fix contacts_created**
- Usare un subquery/join con `marketing_contacts.created_at` nel range date per contare solo contatti effettivamente creati nel periodo

### File da modificare

| File | Modifica |
|---|---|
| Migrazione SQL | ADD ttclid/msclkid/li_fat_id a form_submissions, fix RPC contacts_created |
| `supabase/functions/form-submit/index.ts` | Destrutturare e salvare tutti i click ID |
| `src/components/contacts/ContactAttributionTab.tsx` | Fix condizione Last Touch |


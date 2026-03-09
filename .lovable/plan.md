

## Piano: UTM Attribution Tracking + Form Builder

Due moduli completi da implementare in 8 step sequenziali. Il progetto NON ha nessuna di queste tabelle/funzioni — tutto è da creare da zero.

### Adattamenti necessari rispetto alla spec

La spec referenzia `contacts` ma il progetto usa `marketing_contacts`. Tutte le foreign key e query vanno adattate. Le RLS policy usano `get_user_company_id(auth.uid())` come pattern standard del progetto (non `SELECT company_id FROM users`). L'import supabase è `@/integrations/supabase/client` (non `@/lib/supabase`). Il contatto detail è `MarketingContactDetail.tsx` con sidebar a tab.

### Step 1 — Migrazione DB: UTM Attribution (Prompt A1)

Creare migrazione con:
- Tabella `attribution_sessions` (session tracking con UTM, click IDs, device info, IP hash)
- Tabella `contact_attributions` (first/last touch per contatto)
- ALTER `marketing_contacts`: aggiungere `attr_source`, `attr_medium`, `attr_campaign`, `attr_content`, `attr_model`
- Indici, RLS con `get_user_company_id(auth.uid())`
- RPC `get_attribution_report(p_company_id, p_date_from, p_date_to, p_group_by)`
- Funzione `attach_attribution_to_contact(p_session_id, p_contact_id, p_company_id)`

### Step 2 — Edge Function `attribution-capture` + Tracking Snippet (Prompt A2)

- Edge function pubblica (no JWT) che riceve UTM data via POST e fa upsert in `attribution_sessions`
- Hashing IP con SHA-256, device detection
- `src/constants/trackingSnippet.ts`: funzione `getTrackingSnippet(companyId, supabaseUrl)` che genera lo snippet JS

### Step 3 — Tab Attribuzione nel Contatto (Prompt A3)

- Hook `useContactAttribution.ts`: fetch `contact_attributions` + `attribution_sessions` per un contatto
- Componente `ContactAttributionTab.tsx`: card First/Last Touch, badge source colorati, storico sessioni
- Integrare come sezione collapsible nella sidebar di `MarketingContactDetail.tsx` (il layout usa sidebar, non tab classiche)

### Step 4 — Report Attribuzione in Reportistica (Prompt A4)

- Aggiornare `AttributionReport.tsx` (già esiste ma usa dati Facebook): riscriverlo per usare la RPC `get_attribution_report`
- KPI cards, BarChart recharts, tabella con drill-down source → campaign
- Filtri data + GroupBy tabs (Source/Medium/Campaign/Content)

### Step 5 — Migrazione DB: Form Builder (Prompt B1)

Creare migrazione con:
- Tabella `lead_forms` (nome, slug, fields JSONB, theme JSONB, settings JSONB, stats denormalizzati)
- Tabella `form_views` (tracking visualizzazioni)
- Tabella `form_submissions` (dati compilati, UTM al momento della submit, link a contatto)
- Trigger `trg_update_form_stats` per contatori automatici
- Funzione `trigger_form_automations(p_submission_id)` per integrazione automazioni
- RLS, indici

### Step 6 — Edge Functions: `form-submit` + `form-render` (Prompt B2)

- `form-submit`: endpoint pubblico (no JWT), valida campi required, upsert contatto per email, salva submission con UTM, chiama `attach_attribution_to_contact`, trigger automazioni
- `form-render`: genera pagina HTML standalone con CSS inline, include tracking snippet nell'head, gestione submit via fetch

### Step 7 — Form Builder UI in Impostazioni (Prompt B3)

- Pagina `SettingsFormBuilder.tsx` in `src/pages/azienda/settings/`
- Vista lista: card per ogni form con stats (views, submissions, conversion rate), toggle publish, azioni
- Vista editor a 3 colonne: libreria campi (drag) | canvas sortable (@dnd-kit) | pannello proprietà (label, mapping, aspetto, condivisione)
- Hook `useFormBuilder.ts` per gestione stato campi
- Route: `/azienda/impostazioni/form-builder`

### Step 8 — Snippet Tracking Settings + Integrazione Sidebar (Prompt B4)

- Componente `TrackingSnippetSettings.tsx`: card snippet con copia, spiegazione "Come funziona" in 3 step, tabella parametri supportati, tool di test URL
- Integrare in `SettingsFormBuilder.tsx` come seconda tab ("Tracking UTM")
- Aggiungere route nella navigazione impostazioni
- NON aggiungere voci sidebar per form — è in Impostazioni

### File da creare (18+)

| File | Tipo |
|---|---|
| Migrazione UTM attribution | SQL |
| Migrazione Form Builder | SQL |
| `supabase/functions/attribution-capture/index.ts` | Edge Function |
| `supabase/functions/form-submit/index.ts` | Edge Function |
| `supabase/functions/form-render/index.ts` | Edge Function |
| `src/constants/trackingSnippet.ts` | Utility |
| `src/hooks/useContactAttribution.ts` | Hook |
| `src/hooks/useAttributionReport.ts` | Hook |
| `src/hooks/useFormBuilder.ts` | Hook |
| `src/components/contacts/ContactAttributionTab.tsx` | Componente |
| `src/pages/azienda/settings/SettingsFormBuilder.tsx` | Pagina |
| `src/components/settings/TrackingSnippetSettings.tsx` | Componente |
| `src/components/settings/FormEditorCanvas.tsx` | Componente |
| `src/components/settings/FormFieldLibrary.tsx` | Componente |
| `src/components/settings/FormFieldProperties.tsx` | Componente |

### File da modificare

| File | Modifica |
|---|---|
| `src/components/reporting/attribution/AttributionReport.tsx` | Riscrivere con RPC reale |
| `src/pages/azienda/marketing/MarketingContactDetail.tsx` | Aggiungere sezione Attribuzione |
| Router/navigazione impostazioni | Aggiungere route form-builder |

### Ordine di esecuzione

Data la dimensione (8 prompt, 18+ file), implementerò in ordine: A1 → A2 → A3 → A4 → B1 → B2 → B3 → B4, raggruppando dove possibile per ridurre i messaggi.


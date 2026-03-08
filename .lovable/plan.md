

# Piano: Meta/Facebook Reporting + Automazioni Lead — Gap Fix Completo

Analisi del documento caricato vs codebase attuale. 10 fix organizzati in 4 fasi.

---

## Stato attuale confermato

| Componente | Stato |
|------------|-------|
| OAuth, webhook, process-leads, api-proxy | OK |
| FacebookAdsReport con KPI, trend, table | OK |
| LevelToggle (campaign/adset/ad) | Già presente in UI |
| meta-api-proxy `get-campaign-insights` | Già supporta `level` e `reach` nei fields |
| Trigger `facebook_lead_received` in automazioni | **MANCANTE** |
| meta-process-leads → fire automazioni | **MANCANTE** |
| Admin Meta App config (platform_settings) | **MANCANTE** |
| Preset date rapidi in ReportHeader | **MANCANTE** |
| ROAS + Reach + Frequency nei KPI | **MANCANTE** |
| Notifiche real-time lead Facebook | **MANCANTE** |

---

## Fase A — P0 CRITICO: Trigger Automazioni da Lead Facebook

**FIX 1A — `src/types/automationBuilder.ts`: Nuovo trigger category "Social Media"**
- Aggiungere `"social_media"` al type `TriggerCategory`
- Nuova categoria in `TRIGGER_CATEGORIES` con items:
  - `facebook_lead_received` — "Nuovo lead da Facebook" (icon: Facebook/#1877F2)
  - `facebook_lead_updated` — "Lead Facebook aggiornato"

**FIX 1B — `supabase/functions/meta-process-leads/index.ts`: Fire automazioni**
- Dopo `processLeadEvent` successo (riga ~75), invocare `process-automation` con:
  - `action: "trigger"`, `trigger_event: "facebook_lead_received"`, `entity_id: contactId`, `entity_type: "contact"`
  - Payload: `form_id`, `page_id`, `campaign_id`, `campaign_name`, `leadgen_id`, `is_new_contact`
- Chiamata non-bloccante con `.catch()` per non bloccare il processing

**FIX 1C — `src/components/marketing/automations/TriggerPickerDialog.tsx`: Icona Facebook**
- Aggiungere mapping icona per la categoria `social_media` (usare icona Share2 o custom SVG Facebook)

---

## Fase B — P0: Admin Platform Meta Configuration

**FIX 2A — `src/pages/admin/AdminSettings.tsx`: Tab Integrazioni**
- Aggiungere tab "Integrazioni" con icona `Plug`
- Creare `src/pages/admin/settings/AdminSettingsIntegrations.tsx` con card "Meta (Facebook & Instagram)":
  - Campi: App ID, App Secret (password), Webhook Verify Token
  - URL webhook read-only con pulsante copia
  - Pulsante "Verifica connessione" → test API Meta
  - Salvataggio in `platform_settings` (upsert keys: `meta_app_id`, `meta_app_secret`, `meta_webhook_verify_token`)

**FIX 2B — Verifica credenziali prima del connect aziendale**
- Nel wizard Meta dell'azienda, prima di avviare OAuth verificare che `meta_app_id` e `meta_app_secret` esistano in `platform_settings`
- Se mancanti, mostrare alert "L'integrazione Meta non è configurata dall'amministratore"

---

## Fase C — P1: Reportistica Miglioramenti UX

**FIX 3A — `ReportHeader.tsx`: Preset date rapidi**
- Aggiungere `DATE_PRESETS` (Oggi, Ieri, 7gg, 30gg, Questo mese, Mese scorso) con pulsanti inline accanto al date picker
- Usa `date-fns` (già presente): `subDays`, `startOfMonth`, `endOfMonth`, `subMonths`
- Preset attivo evidenziato con stile active

**FIX 3B — `KPIGrid.tsx`: ROAS, Reach, Frequenza**
- Aggiungere 3 SmallCard: ROAS (revenue/spend), Reach (da `kpis.reach`), Frequenza (impressioni/reach)
- Aggiornare `KPISummary` in `metaInsightsNormalizer.ts` per includere `reach` e calcolare `frequency`
- ROAS: se revenue=0 mostrare "N/D" con tooltip

**FIX 3C — `CampaignTable.tsx`: Colonne adattive per livello**
- Prima colonna dinamica: "Campagna" / "Gruppo inserzioni" / "Annuncio" in base a `report.level`
- A livello adset: aggiungere colonna "Campagna" di riferimento
- A livello ad: aggiungere colonne "Gruppo inserzioni" e "Campagna"

---

## Fase D — P1: Notifiche Real-time Lead Facebook

**FIX 4A — Realtime subscription su `integration_webhook_events`**
- Creare hook `useMetaLeadNotifications` che sottoscrive INSERT su `integration_webhook_events` filtrato per `company_id` e `provider='meta'`
- Mostra toast "Nuovo lead da Facebook" con link al contatto
- Integrare nel layout Marketing

---

## File da creare/modificare

| File | Fix |
|------|-----|
| `src/types/automationBuilder.ts` | 1A |
| `supabase/functions/meta-process-leads/index.ts` | 1B |
| `src/components/marketing/automations/TriggerPickerDialog.tsx` | 1C |
| `src/pages/admin/AdminSettings.tsx` | 2A |
| `src/pages/admin/settings/AdminSettingsIntegrations.tsx` (nuovo) | 2A |
| Wizard Meta (verifica pre-OAuth) | 2B |
| `src/components/reporting/facebook-ads/ReportHeader.tsx` | 3A |
| `src/components/reporting/facebook-ads/KPIGrid.tsx` | 3B |
| `src/lib/metaInsightsNormalizer.ts` | 3B |
| `src/components/reporting/facebook-ads/CampaignTable.tsx` | 3C |
| `src/hooks/useMetaLeadNotifications.ts` (nuovo) | 4A |

## Ordine di implementazione

Fase A → Fase B → Fase C → Fase D. Stimo 2 sessioni di lavoro.


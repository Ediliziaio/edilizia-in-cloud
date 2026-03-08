

# Piano: Gap Rimanenti — Meta/Facebook Integration v2

## Analisi documento vs stato attuale

Il documento ripropone gli stessi 10 fix già analizzati. **7 su 10 sono già implementati**. Restano 3 gap:

| Gap | Descrizione | Priorità |
|-----|-------------|----------|
| 2B | Verifica credenziali Meta piattaforma prima dell'OAuth aziendale | P0 |
| 4B | Report cross-channel Facebook + CRM (attribuzione) | P2 |
| 4C | Pagina dedicata "Moduli Lead Ads" | P2 |

---

## FIX 2B — Verifica credenziali Meta prima del connect aziendale

**File: `src/pages/azienda/settings/SettingsIntegrations.tsx`**

Quando l'utente clicca "Connetti" sulla card Meta (riga ~254), prima di aprire il wizard:
- Query `platform_settings` per verificare che `meta_app_id` e `meta_app_secret` esistano e non siano vuoti
- Se mancanti, mostrare un alert dialog: "L'integrazione Meta non è ancora configurata dall'amministratore della piattaforma. Contattare il supporto."
- Solo se presenti, aprire `setWizardOpen(true)`

---

## FIX 4B — Report Cross-channel (Attribuzione)

**File nuovo: `src/components/reporting/attribution/AttributionReport.tsx`**
**File modificato: `src/pages/azienda/ReportisticaPage.tsx`**

La tab "Rapporto di attribuzione" (già presente come placeholder) mostrerà:
- Tabella per campagna Facebook: Spesa, Lead generati, Contatti CRM creati, Opportunità aperte, Opportunità vinte, Valore vinto, ROAS calcolato
- Dati CRM: query `marketing_contacts` con `source='facebook'` + join su `marketing_opportunities`
- Dati Ads: riuso dell'hook `useMetaAdsReport` per spesa/impressioni per campagna
- Date range picker condiviso
- Nota: il collegamento campagna→contatto usa i dati già salvati in `automation_trigger_events.payload.campaign_name` o `marketing_contact_activities.metadata`

**Prerequisito DB**: aggiungere colonna `source_campaign_id` su `marketing_contacts` (opzionale, TEXT). Aggiornare `meta-process-leads` per salvare il `campaign_id` dal payload Meta durante la creazione del contatto.

---

## FIX 4C — Pagina "Moduli Lead Ads"

**File nuovo: `src/pages/azienda/marketing/FacebookFormsPage.tsx`**
**File modificato: `src/App.tsx`** (route), sidebar marketing

Pagina dedicata con:
- Lista form attivi da `meta_lead_forms` filtrata per company_id
- Per ogni form: nome, pagina collegata, conteggio lead totali (da `integration_webhook_events`), ultimo lead, stato attivo/inattivo
- Azioni: "Configura mapping" (apre FieldMappingStep in drawer), "Backfill" (chiama meta-api-proxy backfill-leads)
- Sparkline lead/giorno per ogni form

---

## File da creare/modificare

| File | Fix |
|------|-----|
| `src/pages/azienda/settings/SettingsIntegrations.tsx` | 2B |
| `src/components/reporting/attribution/AttributionReport.tsx` (nuovo) | 4B |
| `src/pages/azienda/ReportisticaPage.tsx` | 4B |
| `supabase/functions/meta-process-leads/index.ts` | 4B (save campaign_id) |
| Migration SQL: `source_campaign_id` su `marketing_contacts` | 4B |
| `src/pages/azienda/marketing/FacebookFormsPage.tsx` (nuovo) | 4C |
| `src/App.tsx` | 4C (route) |

## Ordine: FIX 2B → FIX 4B (con migration) → FIX 4C




# Email Marketing Module - Piano di Implementazione

Questo e un modulo complesso che richiede implementazione in fasi. Questa prima fase copre la **struttura UI completa** (3 tab: Statistiche, Campagne, Modelli), le **tabelle database**, e la **logica CRUD** per campagne e template. L'integrazione SendGrid vera e propria verra configurata in una fase successiva (richiede API key e webhook).

---

## Fase 1: Struttura, Database, UI

### 1. Sidebar - Nuova voce "Email Marketing"

Aggiungere in `src/lib/sidebarConfig.ts` la voce `Email Marketing` con icona `Mail` nella sezione `marketingNavItems`, dopo "Agente AI".

### 2. Database - Nuove tabelle

Creare tramite migration:

```text
email_templates
  - id (uuid PK)
  - company_id (uuid FK companies)
  - name (text)
  - subject (text)
  - html_content (text)
  - json_content (jsonb) -- per editor strutturato
  - folder (text, default 'Home')
  - type (text: 'html' | 'editor')
  - created_by (uuid)
  - created_at, updated_at (timestamptz)

email_campaigns
  - id (uuid PK)
  - company_id (uuid FK companies)
  - name (text)
  - subject (text)
  - template_id (uuid FK email_templates, nullable)
  - status (text: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused')
  - type (text: 'broadcast' | 'automation')
  - scheduled_at (timestamptz, nullable)
  - sent_at (timestamptz, nullable)
  - recipient_filter (jsonb) -- filtri: lista, tag, pipeline, custom field
  - total_recipients (int, default 0)
  - ab_test_enabled (bool, default false)
  - ab_subject_b (text, nullable)
  - created_by (uuid)
  - created_at, updated_at (timestamptz)

email_logs
  - id (uuid PK)
  - campaign_id (uuid FK email_campaigns)
  - contact_id (uuid FK marketing_contacts)
  - company_id (uuid)
  - status (text: 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'unsubscribed' | 'spam')
  - sendgrid_message_id (text, nullable)
  - event_timestamp (timestamptz)
  - metadata (jsonb)

email_billing
  - id (uuid PK)
  - company_id (uuid)
  - campaign_id (uuid FK, nullable)
  - emails_sent (int)
  - unit_cost (numeric)
  - total_cost (numeric)
  - month_reference (date)
  - created_at (timestamptz)
```

RLS: tutte filtrate per `company_id` con le stesse policy pattern delle tabelle marketing esistenti.

### 3. Routing

In `src/App.tsx`, aggiungere:
```
<Route path="marketing/email" element={<EmailMarketing />} />
```

### 4. Pagina principale: `src/pages/azienda/marketing/EmailMarketing.tsx`

Pagina con 3 tab (come negli screenshot GHL):
- **Statistiche**: KPI cards (Consegnate, Aperte, Cliccate, Bounce, Disiscrizioni, Spam) + grafico funnel orizzontale + grafico andamento nel tempo + tabella "migliori campagne"
- **Campagne**: Lista campagne con filtri (tipo, stato), sidebar sub-filtri (Campagne email, Flusso, Azione in blocco), empty state con CTA "+ Crea campagna", dialog per creare/editare campagna
- **Modelli**: Lista template con ricerca, filtro, paginazione, pulsanti "+ Nuovo" e "Crea cartella", dropdown "Nuovo" (Modello vuoto, Importa HTML)

### 5. Componenti nuovi

```text
src/components/email-marketing/
  EmailStatsTab.tsx        -- Tab statistiche con KPI + grafici
  EmailCampaignsTab.tsx    -- Tab campagne con lista + filtri
  EmailTemplatesTab.tsx    -- Tab modelli con lista + CRUD
  CampaignDialog.tsx       -- Dialog creazione/modifica campagna
  TemplateDialog.tsx        -- Dialog creazione/modifica template
  TemplateEditor.tsx       -- Editor HTML con textarea + anteprima
  CampaignStatsCards.tsx   -- Card KPI riutilizzabili
  EmailFunnelChart.tsx     -- Grafico funnel (recharts BarChart orizzontale)
```

### 6. Editor Template

Per la Fase 1, l'editor sara un **editor HTML** con:
- Textarea con syntax highlighting base
- Anteprima live in iframe
- Variabili placeholder (nome contatto, azienda, ecc.)
- Salva come template

L'editor drag-and-drop completo e previsto per una fase successiva.

### 7. Logica Campagne (UI-only in Fase 1)

- CRUD completo campagne (bozza, pianificata)
- Selezione destinatari tramite filtri (lista, tag, pipeline)
- Selezione template
- Invio test (mock, logga in console)
- Cambio stato (bozza -> pianificata -> in invio -> inviata)

L'invio reale via SendGrid e il webhook per tracking eventi saranno in Fase 2.

### 8. Statistiche (dati mock iniziali)

Le statistiche leggono dalla tabella `email_logs`. In Fase 1 i dati saranno vuoti con empty state appropriati. La struttura UI e pronta per quando arriveranno i dati reali dal webhook SendGrid.

---

## Fase 2 (successiva, non inclusa ora)

- Integrazione SendGrid API key (secret)
- Edge function `send-email-campaign` per invio bulk
- Edge function `sendgrid-webhook` per tracking eventi
- Sistema billing a consumo
- Editor drag-and-drop avanzato
- Automazioni email (trigger da pipeline/tag)
- Warmup, rate limit, monitoring reputazione

---

## Riepilogo file

| Azione | File |
|--------|------|
| Modifica | `src/lib/sidebarConfig.ts` (nuova voce) |
| Modifica | `src/App.tsx` (nuova route) |
| Nuovo | `src/pages/azienda/marketing/EmailMarketing.tsx` |
| Nuovo | `src/components/email-marketing/EmailStatsTab.tsx` |
| Nuovo | `src/components/email-marketing/EmailCampaignsTab.tsx` |
| Nuovo | `src/components/email-marketing/EmailTemplatesTab.tsx` |
| Nuovo | `src/components/email-marketing/CampaignDialog.tsx` |
| Nuovo | `src/components/email-marketing/TemplateDialog.tsx` |
| Nuovo | `src/components/email-marketing/TemplateEditor.tsx` |
| Nuovo | `src/components/email-marketing/CampaignStatsCards.tsx` |
| Nuovo | `src/components/email-marketing/EmailFunnelChart.tsx` |
| Migration | 4 nuove tabelle + RLS policies |


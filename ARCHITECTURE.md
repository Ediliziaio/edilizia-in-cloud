# Edilizia in Cloud — Architecture Reference

> **Progetto ID Supabase:** `rsbrguhkodgnqfomrevo`
> **Stack:** React 18 · TypeScript · Vite · Supabase (PostgreSQL + Edge Functions + Auth + Storage) · Tailwind CSS · shadcn/ui
> **Aggiornato:** 2026-04-01

---

## 1. Stack Overview

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React 18 + Vite)                              │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │  Pages / Routes  │  │  Components (shadcn/ui)      │ │
│  └────────┬─────────┘  └──────────────┬───────────────┘ │
│           │  TanStack React Query v5   │                 │
│  ┌────────▼──────────────────────────▼───────────────┐  │
│  │  Hooks layer  (src/hooks/)                        │  │
│  └────────┬──────────────────────────────────────────┘  │
│           │  supabase-js v2                              │
└───────────┼─────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────┐
│  Supabase Cloud (project: rsbrguhkodgnqfomrevo)         │
│  ┌────────────────┐  ┌────────────┐  ┌───────────────┐  │
│  │  PostgreSQL DB │  │ Edge Fns   │  │ Auth (JWT)    │  │
│  │  + RLS         │  │ (Deno)     │  │ + Storage     │  │
│  └────────────────┘  └────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Routing

Il router principale è in `src/App.tsx`.

| Prefisso | Audience | Layout |
|----------|----------|--------|
| `/` | Pubblico (landing) | `LandingLayout` |
| `/azienda/*` | Azienda auth | `CompanyLayout` |
| `/admin/*` | Super admin | `AdminLayout` |
| `/cliente/*` | Cliente finale | `CustomerLayout` |
| `/campo/*` | Operai e subappaltatori (mobile-first) | `CampoLayout` |
| `/tecnico/*` | Tecnici di servizio | `TecnicoLayout` |
| `/partner/*` | Referral partner | `PartnerLayout` |
| `/venditore/*` | Venditori | `SalespersonLayout` |

`/dipendente/*` è deprecato: i deep link storici reindirizzano verso `/campo/*`.

`CompanyLayout` wrappa `<Outlet>` con `<ErrorBoundary>` per proteggere il contenuto senza perdere sidebar/header.

---

## 3. Auth Pattern

```
src/contexts/AuthContext.tsx
└── useAuth() → { user, effectiveCompany, role, ... }

src/integrations/supabase/client.ts
└── supabase = createClient<Database>(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)
```

**Multi-company access:** `profiles` + `multi_company_access` tables.
**Impersonation:** `secure-impersonation` edge function + `upsert-admin-session`.

---

## 4. Edge Functions Map

> 140 funzioni totali · Tutte in Deno · Path: `supabase/functions/<nome>/index.ts`

### 4.1 Auth helpers condivisi

```
supabase/functions/_shared/
├── auth.ts          → requireAuth(req, corsHeaders) — JWT validation + userId
├── companyAuth.ts   → verifyCompanyAccess(supabase, userId, companyId)
└── headers.ts       → getCorsHeaders(req) — CORS response headers
```

**Pattern obbligatorio nelle funzioni protette:**
```typescript
const corsH = getCorsHeaders(req);
if (req.method === "OPTIONS") return new Response(null, { headers: corsH });
const { userId, supabaseAdmin } = await requireAuth(req, corsH);
await verifyCompanyAccess(supabaseAdmin, userId, company_id);
// ... logica business
catch (err) {
  if (err instanceof Response) return err; // auth middleware threw 401/403
  // ... gestione altri errori
}
```

---

### 4.2 Funzioni per categoria

#### 🔐 Autenticazione & Utenti

| Funzione | Trigger | Descrizione |
|----------|---------|-------------|
| `create-company` | Client call | Crea nuova company + profilo admin |
| `create-company-staff` | Admin | Aggiunge staff a una company |
| `create-employee-user` | Admin | Crea utente dipendente con ruolo operaio |
| `create-salesperson-user` | Admin | Crea utente venditore con accesso portale |
| `create-super-admin` | Internal | Promuove utente a super admin |
| `accept-admin-invite` | Public link | Accetta invito e crea account |
| `delete-company-user` | Admin | Elimina utente da una company |
| `reset-customer-password` | Admin | Reset password cliente |
| `reset-password-branded` | Cron/webhook | Email reset password brandizzata (Item 18) |
| `revoke-user-session` | Admin | Invalida sessione specifica |
| `check-login-security` | Pre-login | Verifica sicurezza login (no auth required) |
| `manage-totp` | Client | Gestione TOTP 2FA |
| `secure-impersonation` | SuperAdmin | Impersonazione sicura di altri utenti |
| `sign-in-as-user` | SuperAdmin | Login come utente specifico |
| `upsert-admin-session` | Internal | Crea/aggiorna sessione admin |
| `pulisci_sessioni_utente()` (SQL) | Cron `sessioni-utente-pulizia` | Pulizia sessioni ferme da 90 giorni, tiene l'ultima di ogni utente |
| `manage-super-admins` | SuperAdmin | Gestione lista super admin |
| `manage-platform-users` | SuperAdmin | Gestione utenti piattaforma |
| `manage-permission-template` | Admin | Template permessi ruoli |

#### 📄 Documenti & PDF

| Funzione | Trigger | Descrizione |
|----------|---------|-------------|
| `generate-quote-pdf` | Client | PDF preventivo (pdf-lib) |
| `generate-native-pdf` | Client | PDF nativo Supabase |
| `generate-invoice-pdf` | Client | PDF fattura |
| `generate-sal-pdf` | Client | PDF SAL (HTML → print) |
| `generate-giornale-pdf` | Client | PDF Giornale Lavori |
| `generate-cedolino-pdf` | Client | PDF cedolino stipendio |
| `salva-versione-preventivo` | Client | Versioning snapshot preventivo |
| `genera-pos` | Client | Genera POS (Piano Operativo Sicurezza) |
| `genera-duvri` | Client | Genera DUVRI sicurezza cantiere |
| `duplicate-order` | Client | Duplica ordine/cantiere |
| `converti-preventivo-cantiere` | Client | Converte preventivo in cantiere |

#### 💰 Fatturazione & Pagamenti

| Funzione | Trigger | Descrizione |
|----------|---------|-------------|
| `invia-sdi` | Client | Invia fattura allo SDI (Aruba) |
| `ricevi-sdi` | Webhook (Aruba) | Riceve fatture passive SDI |
| `sdi-webhook` | Webhook (SDI) | Notifiche stato SDI |
| `billing-connect` | Client | Connessione sistema di fatturazione |
| `billing-import` | Client | Importa fatture da sistemi esterni |
| `billing-sync` | Cron | Sincronizzazione stato fatture |
| `billing-webhook` | Webhook | Notifiche billing (replay window: 5min) |
| `export-contabile` | Client | Export prima nota (CSV/XML Zucchetti/TeamSystem) |
| `create-checkout-session` | Client | Crea sessione pagamento Stripe |
| `customer-portal` | Client | Portale clienti Stripe |
| `stripe-webhook` | Webhook (Stripe) | Gestisce eventi Stripe (pagamenti, abbonamenti) |
| `topup-credits` | Client | Ricarica crediti comunicazione |
| `auto-topup-check` | Client | Verifica soglia auto-ricarica |
| `auto-topup-trigger` | Cron | Esegue auto-ricarica crediti |
| `check-credits-before-call` | Client | Verifica crediti prima di avviare chiamata |
| `admin-adjust-credits` | Admin | Aggiustamento manuale crediti |
| `admin-change-plan` | Admin | Cambio piano abbonamento |
| `process-dunning` | Cron | Sequenza recupero crediti (dunning) |
| `check-scadenze-alerts` | Cron | Alert scadenze pagamenti |
| `check-due-dates` | Cron | Notifiche date di scadenza |

#### 🏦 Banca & Riconciliazione

| Funzione | Trigger | Descrizione |
|----------|---------|-------------|
| `bank-connect-start` | Client | Avvia connessione bancaria (GoCardless/OpenBanking) |
| `bank-connect-complete` | OAuth callback | Completa OAuth bancario |
| `bank-disconnect` | Client | Disconnette conto bancario |
| `bank-list-institutions` | Client | Lista banche disponibili per paese |
| `bank-sync` | Client/Cron | Sincronizza transazioni bancarie |
| `bank-sync-all-companies` | Cron | Sync bancario per tutte le aziende |
| `bank-test-connection` | Client | Test connessione bancaria |
| `bank-check-expiry` | Cron | Controlla connessioni in scadenza (< 14gg) |
| `bank-auto-reconcile` | Cron/Client | Riconciliazione automatica batch |
| `bank-categorize-ai` | Client | Categorizza transazioni ambigue via Claude AI |
| `bank-webhook` | Webhook (GoCardless) | Eventi real-time bancari |

#### 📧 Email & Comunicazione

| Funzione | Trigger | Descrizione |
|----------|---------|-------------|
| `send-email-campaign` | Client | Invia campagna email |
| `send-invoice-email` | Client | Invia fattura via email |
| `send-quote-signature` | Client | Invia preventivo per firma |
| `send-test-email` | Client | Test configurazione email |
| `send-contact-message` | Public | Modulo contatto pubblico |
| `send-nps-survey` | Cron | Invia survey NPS agli admin |
| `nps-survey-respond` | Public link | Registra risposta NPS (no auth) |
| `send-partner-notification` | Internal/Cron | Notifiche ai partner |
| `email_prepara_reinvii()` (SQL) | Cron `email-reinvii-non-aperti` | Dopo 48 ore crea la copia per chi non ha aperto; la spedisce send-email-campaign |
| `email-provider-webhook` | Webhook | Normalizza eventi da provider email diversi |
| `email-tracking` | Pixel/link | Tracking aperture email (1x1 GIF) |
| `process-scheduled-campaigns` | Cron | Processa campagne email schedulate (BUG-05) |
| `quote-expiry-reminder` | Cron | Reminder scadenza preventivi (IMP07) |

#### 📱 WhatsApp

| Funzione | Trigger | Descrizione |
|----------|---------|-------------|
| `whatsapp-connect` | Client | Connessione account WhatsApp Business |
| `whatsapp-broadcast` | Client | Invia broadcast WhatsApp a lista contatti |
| `whatsapp-templates` | Client | Gestione template messaggi WhatsApp |
| `whatsapp-webhook` | Webhook (Meta) | Riceve messaggi in ingresso |
| `send-whatsapp-reply` | Client | Invia risposta WhatsApp singola |

#### 🤖 AI & Agenti

| Funzione | Trigger | Descrizione |
|----------|---------|-------------|
| `lucia-chat` | Client | Motore AI Lucia (assistente Edilizia in Cloud) |
| `ai-genera-preventivo-v2` | Client | Generazione preventivo con AI |
| `ai-analisi-preventivi` | Client | Analisi e suggerimenti preventivi AI |
| `initiate-outbound-call` | Client | Avvia chiamata AI in uscita (ElevenLabs) |
| `elevenlabs-proxy` | Client | Proxy per API ElevenLabs voce |
| `elevenlabs-webhook` | Webhook (ElevenLabs) | Notifiche completamento call |
| `internal-agent-tools` | Webhook (ElevenLabs live) | Strumenti richiamati durante la conversazione |
| `internal-agent-webhook` | Webhook | Notifiche agente interno |
| `trascrizione-audio` | Client | Trascrizione audio in testo |
| `kb-sync` | Client/Cron | Sincronizza knowledge base per AI |
| `check-api-health` | Cron | Health check API esterne |
| `get-security-report` | Admin | Report sicurezza sistema |
| `compute-health-scores` | Cron/Internal | Calcola health score aziende (service_role) |

#### 📊 Marketing & Lead

| Funzione | Trigger | Descrizione |
|----------|---------|-------------|
| `meta-oauth-start` | Client | Avvia OAuth Meta (Facebook/Instagram) |
| `meta-oauth-callback` | OAuth callback | Completa OAuth Meta (state max 10min) |
| `meta-api-proxy` | Client | Proxy per API Meta (token management) |
| `meta-webhook` | Webhook (Meta) | Riceve lead e eventi da Meta |
| `meta-process-leads` | Internal | Processa lead Meta in ingresso |
| `meta-token-refresh` | Cron | Rinnova token Meta in scadenza (< 15gg) |
| `meta-health-check` | Cron/Client | Verifica salute integrazione Meta |
| `attribution-capture` | Client | Cattura dati attribuzione marketing |
| `track-referral-click` | Public | Tracking click referral |
| `track-user-session` | Client | Tracking sessione utente |
| `form-render` | Public | Render form pubblico |
| `form-submit` | Public | Submit form pubblico |
| `email_ab_scegli_vincitori()` (SQL) | Cron `email-ab-vincitori` | Determina vincitore A/B test da aperture e clic |
| `check-lifecycle-events` | Cron | Controllo eventi lifecycle utente |
| `process-automation` | Internal | Esecuzione automazioni marketing |
| `check-scheduled-triggers` | Cron | Verifica trigger schedulati |

#### 📍 Cantieri & HR

| Funzione | Trigger | Descrizione |
|----------|---------|-------------|
| `gestisci-sede` | Client | CRUD sedi aziendali (auth: requireAuth + verifyCompanyAccess) |
| `get-sede-analytics` | Client | Analytics presenze per sede |
| `generate-recurring-costs` | Cron | Genera costi ricorrenti cantieri (date-fns) |
| `accetta-preventivo` | Client/Public | Cliente accetta preventivo |
| `quote-sign` | Public link | Firma/rifiuto preventivo cliente (no auth) |
| `generate-signature-token` | Client | Genera token firma preventivo |
| `gdpr-compliance` | Admin | Esportazione/cancellazione dati GDPR |

#### 🗓️ Integrazioni Esterne

| Funzione | Trigger | Descrizione |
|----------|---------|-------------|
| `google-calendar-auth` | Client | OAuth Google Calendar |
| `google-calendar-sync` | Client/Cron | Sincronizza eventi Google Calendar |
| `google-calendar-webhook` | Webhook (Google) | Notifiche push Google Calendar |
| `suggest-calendars` | Client | Suggerisce calendari da collegare |
| `maps-proxy` | Client | Proxy Google Maps (protegge API key) |
| `verify-custom-domain` | Client | Verifica dominio email personalizzato |
| `api-gateway` | Client | Gateway API esterno per integrazioni terze |
| `send-webhook` | Client | Invia webhook a endpoint esterni |
| `test-integration` | Client | Test connessione integrazione |
| `telnyx-proxy` | Client | Proxy Telnyx (telefonia) |
| `telnyx-webhook` | Webhook (Telnyx) | Notifiche Telnyx |

#### 👤 Portale Clienti & Partner

| Funzione | Trigger | Descrizione |
|----------|---------|-------------|
| `create-customer` | Admin | Crea cliente nel portale |
| `ticket-notify` | Internal | Notifica ticket supporto |
| `admin-dashboard-data` | Admin | Dati aggregati dashboard admin |

---

### 4.3 Cron Jobs

Le seguenti funzioni vengono invocate da pg_cron o Supabase scheduled functions:

| Funzione | Frequenza tipica | Protezione |
|----------|-----------------|------------|
| `check-due-dates` | Giornaliero | `cron secret` |
| `check-scadenze-alerts` | Giornaliero | `cron secret` |
| `auto-topup-trigger` | Ogni ora | `cron secret` |
| `bank-sync-all-companies` | Ogni 4 ore | `cron secret` |
| `bank-check-expiry` | Giornaliero | — |
| `pulisci_sessioni_utente()` (SQL) | Giornaliero 03:47 | — |
| `check-wa-notifiche` | Ogni 15 minuti | `proactive_cron_secret` dal Vault |
| `compute-health-scores` | Giornaliero | `cron secret` (service_role) |
| `generate-recurring-costs` | Mensile | — |
| `meta-token-refresh` | Giornaliero | — |
| `process-scheduled-campaigns` | Ogni ora | — |
| `process-dunning` | Giornaliero | — |
| `quote-expiry-reminder` | Giornaliero | — |
| `send-nps-survey` | Settimanale | — |
| `email_ab_scegli_vincitori()` (SQL) | Ogni ora | — |
| `email_prepara_reinvii()` (SQL) | Ogni 30 minuti | — |
| `check-lifecycle-events` | Giornaliero | — |

---

## 5. Database Architecture

### Convenzioni tabelle

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `company_id uuid NOT NULL REFERENCES companies(id)` — su ogni tabella tenant
- `created_at / updated_at timestamptz` — trigger `moddatetime` su `updated_at`
- **RLS obbligatorio** su ogni tabella con dati utente

### Pattern RLS standard

```sql
CREATE POLICY "company_member_access" ON table_name
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );
```

### Categorie principali tabelle

| Categoria | Tabelle principali |
|-----------|-------------------|
| **Tenant** | `companies`, `profiles`, `multi_company_access` |
| **Cantieri** | `orders`, `order_items`, `order_installments`, `v_ordine_marginalita` (VIEW) |
| **SAL** | `sal_records`, `sal_voci` |
| **Giornale** | `giornale_lavori`, `giornale_foto` |
| **Sicurezza** | `pos_documents`, `duvri_documents`, `verbali_sicurezza`, `subappaltatori` |
| **Acquisti** | `purchase_orders`, `ddt_ricezione` |
| **Magazzino** | `warehouse_items`, `stock_lotti` |
| **Fatturazione** | `invoices`, `invoice_items` |
| **Scadenzario** | `scadenze` |
| **HR** | `hr_profiles`, `timbrature`, `cedolini` |
| **CRM** | `marketing_contacts`, `marketing_contact_lists`, `marketing_opportunity_lists` |
| **WhatsApp** | `whatsapp_broadcasts`, `whatsapp_broadcast_recipients` |
| **Banca** | `bank_connections`, `bank_transactions` |
| **Marketing** | `email_campaigns`, `email_campaign_recipients`, `email_credits` |
| **AI** | `flow_execution_runs`, `ai_conversations` |
| **Meta/Ads** | `meta_integrations`, `google_ads_stats` |
| **Automazioni** | `automations`, `automation_runs` |
| **Sistema** | `system_health_metrics`, `platform_announcements`, `entity_custom_field_values` |

---

## 6. Frontend Architecture

### Struttura `src/`

```
src/
├── App.tsx                    ← Router principale
├── main.tsx                   ← Entry point + QueryClient
├── components/
│   ├── layouts/               ← CompanyLayout, AdminLayout, etc.
│   ├── error/ErrorBoundary.tsx ← ErrorBoundary globale (wrappa <Outlet>)
│   ├── ui/                    ← shadcn/ui components
│   ├── orders/                ← SalTab, GiornaleCard, etc.
│   ├── scadenzario/           ← ScadenzarioTable, ScadenzarioKPIs, etc.
│   ├── warehouse/             ← StockAlertBanner, LowStockAlertsPanel
│   ├── onboarding/            ← OnboardingGuide, OnboardingChecklist
│   ├── integrations/          ← MetaIntegrationWizard, MetaStatusBadge
│   ├── forecast/              ← CashFlowForecast, WaterfallChart, etc.
│   └── marketing/             ← whatsapp/, email/, etc.
├── hooks/                     ← useQuery/useMutation wrappers
├── pages/
│   ├── azienda/               ← Pagine company (main app)
│   ├── admin/                 ← Pagine super admin
│   └── portal/                ← Portale clienti/agenti
├── integrations/supabase/
│   ├── client.ts              ← createClient<Database>(...)
│   └── types.ts               ← Tipi generati da schema DB (22k+ righe)
├── lib/
│   ├── formatters.ts          ← formatCurrency, formatCurrencyCompact
│   └── sidebarConfig.ts       ← Configurazione sidebar
├── test/                      ← Vitest test suite
│   ├── lib/formatters.test.ts
│   ├── logic/margine.test.ts
│   ├── logic/firma.test.ts
│   ├── logic/scadenzario.test.ts
│   └── logic/onboarding.test.ts
└── types/                     ← Tipi TypeScript domain-specific
```

### Bundle Code Splitting

Lazy-loaded su route (React.lazy):
- `exceljs` — export Excel/XLSX
- `@xyflow/react` — diagrammi flow automazioni

---

## 7. Security Reference

### Variabili d'ambiente client (VITE_ prefix = pubbliche)

| Variabile | Uso |
|-----------|-----|
| `VITE_SUPABASE_URL` | URL progetto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key Supabase (pubblica per design) |

**⚠️ La `SERVICE_ROLE_KEY` non deve mai avere prefisso `VITE_`.**

### Variabili d'ambiente server (Edge Functions)

| Variabile | Uso |
|-----------|-----|
| `SUPABASE_URL` | URL progetto (auto-inject) |
| `SUPABASE_ANON_KEY` | Anon key (auto-inject) |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key (auto-inject, mai esposta al client) |
| `INTERNAL_CRON_SECRET` | Protezione funzioni cron (SEC-013) |
| `STRIPE_SECRET_KEY` | API Stripe pagamenti |
| `META_APP_ID` / `META_APP_SECRET` | OAuth Meta |
| `ELEVENLABS_API_KEY` | Voce AI |
| `TELNYX_API_KEY` | Telefonia |

### Funzioni con requisiti di sicurezza speciali

| Funzione | Protezione extra |
|----------|-----------------|
| `secure-impersonation` | SuperAdmin role check |
| `sign-in-as-user` | SuperAdmin role check |
| `check-wa-notifiche` | segreti dei cron o chiave di servizio (`chiamataInternaValida`) |
| `compute-health-scores` | `cron secret` obbligatorio (service_role) |
| `billing-webhook` | Replay window 5min |
| `gestisci-sede` | `requireAuth` + `verifyCompanyAccess` |
| `generate-sal-pdf` | `requireAuth` + `verifyCompanyAccess` |

---

## 8. Testing

```bash
# Esegui test suite
npx vitest run

# TypeScript check
npx tsc --noEmit

# Build check
npm run build

# Vulnerabilità
npm audit --audit-level=high
```

### Test esistenti (`src/test/`)

| File | Cosa testa |
|------|-----------|
| `lib/formatters.test.ts` | `formatCurrency`, `formatCurrencyCompact` |
| `logic/margine.test.ts` | Calcolo margine cantiere, soglie semaforo |
| `logic/firma.test.ts` | Validazione firma preventivo, base64 |
| `logic/scadenzario.test.ts` | `isOverdue`, `getRemainingAmount`, `getDateRange` |
| `logic/onboarding.test.ts` | `computeOnboardingPct`, `computeOnboardingStatus` |

---

## 9. Deploy

```bash
# Deploy edge function specifica
npx supabase functions deploy <nome-funzione> --project-ref rsbrguhkodgnqfomrevo

# Deploy tutte le funzioni
npx supabase functions deploy --project-ref rsbrguhkodgnqfomrevo

# Rigenera tipi TypeScript da schema DB live
npx supabase gen types typescript --project-id rsbrguhkodgnqfomrevo > src/integrations/supabase/types.ts

# Apply migration
npx supabase db push --linked --yes

# Build frontend
npm run build
```

---

## 10. Moduli Principali (Feature Map)

| Modulo | File chiave | Edge Function |
|--------|-------------|--------------|
| SAL | `src/components/orders/SalTab.tsx` | `generate-sal-pdf` |
| Giornale Lavori | `src/pages/azienda/GiornaleLavori.tsx` | `generate-giornale-pdf` |
| Sicurezza 81/08 | `src/pages/azienda/SicurezzaCantiere.tsx` | `genera-pos`, `genera-duvri` |
| OdA + DDT | `src/pages/azienda/PurchaseOrderDetail.tsx` | — |
| Magazzino Lotti | `src/pages/azienda/Warehouse.tsx` + `StockAlertBanner` | — |
| Scadenzario | `src/pages/azienda/billing/Scadenzario.tsx` | `check-scadenze-alerts` |
| Fatturazione SDI | `src/pages/azienda/fatturazione/` | `invia-sdi`, `ricevi-sdi` |
| Export Contabile | `src/pages/azienda/fatturazione/ImpostazioniFatturazione.tsx` | `export-contabile` |
| WhatsApp Broadcast | `src/components/marketing/whatsapp/WhatsAppBroadcastTab.tsx` | `whatsapp-broadcast` |
| Banca | `src/pages/azienda/BancaRiconciliazione.tsx` | `bank-*` |
| Google Ads | `src/components/reporting/google-ads/GoogleAdsReport.tsx` | — (tabella `google_ads_stats`) |
| Meta Leads | `src/components/integrations/MetaIntegrationWizard.tsx` | `meta-*` |
| AI Lucia | `src/components/ai/LuciaChat.tsx` | `lucia-chat` |
| Onboarding | `src/pages/azienda/OnboardingPage.tsx` | — |
| Marginalità | `src/pages/azienda/MarginalitaCantieri.tsx` | — (VIEW `v_ordine_marginalita`) |
| Cedolini | `src/pages/azienda/personale/` | `generate-cedolino-pdf` |

# Google Ads API — Design Documentation

**To submit with AEDIX S.r.l. Developer Token application**

---

> **Note**: This tool is externally accessible to our SaaS customers. Screenshots of the live integration UI are attached on pages 4-6.

---

## Company Name

**AEDIX S.r.l.** — operating the SaaS product **Edilizia in Cloud**.

- Website: https://www.ediliziaincloud.com
- Privacy Policy: https://www.ediliziaincloud.com/privacy-policy/
- Terms of Service: https://www.ediliziaincloud.com/termini-e-condizioni/

---

## Business Model

AEDIX S.r.l. operates **Edilizia in Cloud**, a vertical SaaS platform serving Italian construction companies (SMB, 5-500 employees). Our customers are independent construction firms (general contractors, electricians, plumbers, window installers, photovoltaic installers, renovation specialists) who use our software to manage their entire operations: projects, finance, HR, CRM and marketing — all in one platform.

We do **not** run Google Ads campaigns on behalf of customers. Each Edilizia in Cloud customer manages **their own** Google Ads account independently, while using our platform as a unified reporting and conversion-tracking layer. Edilizia in Cloud is a **management tool**, not an advertising agency.

Customer accounts are strictly isolated: each customer's Google Ads data is segregated by `company_id` in our Postgres database using Row-Level Security (RLS) policies. No customer can ever access another customer's data, ads, or conversions.

---

## Tool Access / Use

The Google Ads API integration inside Edilizia in Cloud is used by **two types of users**:

1. **Construction company owners / marketing managers** — log into Edilizia in Cloud (`https://app.ediliziaincloud.com`) and access a unified dashboard showing all marketing channels (Google Ads + Meta Ads + organic + referrals) feeding into their CRM. They authorize their **own** Google Ads account via standard OAuth 2.0 from inside Edilizia in Cloud.

2. **AEDIX platform support team** (~3 internal employees) — limited admin access for technical support, never to customer ads management. Support staff cannot run queries or change campaigns; they only see anonymized status flags (token expiry, last sync time, error rate) to help customers troubleshoot.

The Edilizia in Cloud Google Ads integration provides:

- **Read-only campaign sync** — pulls campaign structure (name, status, daily budget, bidding strategy) every 24 hours so customers see their active campaigns inside their EiC dashboard without context-switching to ads.google.com.
- **Insights aggregation** — fetches last 30 days metrics (impressions, clicks, cost_micros, conversions, conversion_value_micros) per campaign to power ROI dashboards. Customers see which campaigns drive real construction project leads, not just clicks.
- **Offline conversion uploads** — when a Google Ads lead becomes a closed construction contract in our CRM (an event our customers track manually or via integration), we upload the conversion back to Google Ads so Smart Bidding can learn real downstream revenue from each ad click.

PDF reports of campaign performance are available from the UI for monthly client deliverables (some construction companies sub-contract their marketing to local agencies and need physical reports).

---

## Tool Design

### Architecture

Edilizia in Cloud is built on:

- **Frontend**: React 18 + Vite + TypeScript SPA, hosted on Cloudflare Pages
- **Backend**: Supabase (managed Postgres 15 + Edge Functions running on Deno)
- **Authentication**: Supabase Auth with OAuth 2.0 providers
- **Database**: Postgres with strict Row-Level Security policies per `company_id`

### Google Ads API integration flow

```
[Customer browser]
    ↓ click "Connect Google Ads"
[Edge Function: google-ads-oauth?action=start]
    ↓ returns OAuth URL with our client_id + scope=adwords
[accounts.google.com OAuth consent]
    ↓ user authorizes
[Edge Function: google-ads-oauth?action=callback]
    ↓ exchange code → access_token + refresh_token
    ↓ encrypt tokens with AES-256-GCM
    ↓ store in google_ads_connections table (encrypted)
    ↓ call listAccessibleCustomers to populate customer picker
[Customer selects Customer ID + optional MCC]
    ↓ stored in google_ads_connections.customer_id
[Periodic sync: google-ads-sync-campaigns]
    ↓ refresh access_token if expired (refresh_token, offline access)
    ↓ GAQL: SELECT campaign.*, metrics.* FROM campaign WHERE segments.date DURING LAST_30_DAYS
    ↓ upsert into google_ads_campaigns table
```

### Storage and security

- **Access and refresh tokens**: encrypted server-side with AES-256-GCM using a key derived from `SUPABASE_SERVICE_ROLE_KEY`. Tokens are **never** exposed to the customer's browser or any external API.
- **Row-Level Security**: every `google_ads_connections` row is scoped to a `company_id`. SQL policies enforce that only members of that company (verified via `profiles.company_id = auth.uid()`) can read their connection. Service-role bypass is restricted to backend Edge Functions.
- **Audit log**: every API operation (OAuth start, callback, sync, customer change, disconnect) writes a row in `integrations` table with timestamp, user_id, action, and error code.

### UI access controls

Only company **admins** (`role = 'company_admin'`) can connect or disconnect the Google Ads integration. Standard users can only **view** dashboards built on synced data. This is enforced both in UI (button hidden) and in Edge Functions (server-side role check before any mutation).

---

## API Services Called

The Edilizia in Cloud platform calls only these Google Ads API endpoints:

- **`CustomerService.listAccessibleCustomers`** — once per OAuth flow, to populate the customer picker so the user can choose which Google Ads account to link
- **GAQL via `GoogleAdsService.searchStream`** with these specific resources:
  - `customer` — for retrieving customer descriptive_name, currency_code, time_zone, manager flag (one-time, post-OAuth)
  - `campaign` joined with `campaign_budget` — for campaign structure and budget (daily sync)
  - `campaign` joined with `metrics` and `segments.date` — for insights last 7/14/30 days (daily sync)
- **`ConversionUploadService.uploadClickConversions`** — for offline conversion uploads when a CRM deal closes (optional per customer)

We do **not** call any mutation services (CampaignService, AdGroupService, AdService write operations), nor do we modify campaigns from inside Edilizia in Cloud. Customer remains the sole controller of their campaigns via the official ads.google.com UI. We are strictly read-only for campaign management, write-only for offline conversion uploads.

---

## Expected Volume

- **Year 1 estimate**: 20-100 customer connections, each running 1-5 active campaigns
- **API calls per customer per day**: ~50-200 (1 sync of campaigns + 1 sync of insights, plus occasional offline conversion uploads when CRM deals close)
- **Total daily API operations estimated**: 1,000-10,000 well within Basic Access (15,000/day) limits
- We will request Standard Access only when customer base exceeds ~70 active accounts

---

## Tool Mockups

**Page: "Integrazioni" inside Edilizia in Cloud admin panel — Google Ads connection card**

```
┌─────────────────────────────────────────────────────────┐
│  📣  Google Ads                          [Collegato ✓]  │
│  Campagne Search/Display, insights, conversioni offline │
├─────────────────────────────────────────────────────────┤
│  ✓ Edilizia Rossi SRL                                    │
│    ID: 123-456-7890 · EUR · MCC: 098-765-4321          │
│    Account Google: marco.rossi@gmail.com                 │
│                                                          │
│  Ultima sync: 27/05/2026 14:30 · 12 campagne            │
│                                                          │
│  [🔄 Sincronizza campagne]    [🗑️]                       │
└─────────────────────────────────────────────────────────┘
```

**Page: ROI Dashboard — campaign insights from Google Ads**

```
┌─ Marketing ROI ────────────────────────────────────────┐
│                                                         │
│  Google Ads — Last 30 days                              │
│  ┌──────────────┬─────────────┬──────────────────────┐ │
│  │ Campagna     │ Costo       │ Lead CRM acquisiti   │ │
│  ├──────────────┼─────────────┼──────────────────────┤ │
│  │ Ristrutturaz │ € 1,250.00  │ 12 leads · 3 chiusi  │ │
│  │ Cantieri MI  │   € 890.00  │ 8 leads · 2 chiusi   │ │
│  │ Bagno Search │   € 540.00  │ 15 leads · 1 chiusi  │ │
│  └──────────────┴─────────────┴──────────────────────┘ │
│  ROI complessivo: 3.2× · CPL medio: € 19                │
└─────────────────────────────────────────────────────────┘
```

*(Sostituisci con 3-4 screenshot reali presi dall'app live al posto degli ASCII mockup — Google preferisce immagini vere.)*

---

## Conformità ai Google Ads API Policies

- **Required Minimum Functionality (RMF)**: l'integrazione fornisce funzioni ROI dashboard, campaign sync e offline conversion upload, ben oltre il minimo RMF richiesto.
- **OAuth scope minimization**: usiamo solo `https://www.googleapis.com/auth/adwords`. Niente scope non necessari.
- **No data sharing**: i dati Google Ads di un customer sono accessibili SOLO ai membri di quella stessa company (RLS Postgres). Mai aggregati, mai venduti, mai esposti.
- **GDPR compliance**: dati ospitati su Supabase EU region (`eu-west-1`). Customer può richiedere export/delete via right-to-erasure (GDPR Art. 17). Privacy Policy chiara su https://www.ediliziaincloud.com/privacy-policy/
- **Customer data retention**: tokens revocati 30 giorni dopo l'ultimo accesso del customer alla piattaforma. Disconnect = delete immediato della riga `google_ads_connections`.
- **No automated bidding override**: non modifichiamo bidding strategy. Customer ha pieno controllo dei suoi parametri.
- **Audit log**: ogni API call è loggata con timestamp, user_id, customer_id, endpoint, response status.

---

## Punto di contatto tecnico

- **Tech lead**: Florin Andriciuc — flo.andriciuc@gmail.com — (+39 numero)
- **Support email**: assistenza@ediliziaincloud.com
- **Repository (interno)**: privato su GitHub Ediliziaio/edilizia-in-cloud
- **Architecture diagrams**: disponibili su richiesta

---

*Documento preparato 27/05/2026 per richiesta Developer Token Google Ads API.*

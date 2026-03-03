

# Report di Facebook Ads — Piano di Implementazione

## Panoramica

Creare una sezione Reportistica completa dentro Marketing e Vendite, partendo dal Report Facebook Ads con UI stile GHL. L'architettura Meta (OAuth, token, proxy) esiste gia' — serve aggiungere le azioni `get-ad-accounts` e `get-campaign-insights` al proxy esistente `meta-api-proxy`, poi costruire il frontend.

---

## Architettura Tecnica

```text
┌─────────────────────────────────────────────────┐
│  Frontend                                        │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ KPI Cards│  │ Trend    │  │ Campaign Table│  │
│  │ + mini   │  │ Charts   │  │ + filters     │  │
│  │ sparkline│  │          │  │ + sort        │  │
│  └────┬─────┘  └────┬─────┘  └──────┬────────┘  │
│       └──────────────┼───────────────┘            │
│                      ▼                            │
│         useMetaAdsReport() hook                   │
│              ▼              ▼                     │
│   meta-api-proxy       meta_insights_cache (DB)  │
│   (new actions)        (TTL 15min)               │
└─────────────────────────────────────────────────┘
```

## Interventi (8 blocchi)

### 1. DB: Tabelle cache e preferenze

Migrazione SQL per creare:

- **`meta_ad_accounts`** — `id, company_id, integration_id, ad_account_id, ad_account_name, selected, created_at` (RLS: company_id scoped)
- **`meta_insights_cache`** — `id, company_id, ad_account_id, date_start, date_end, level (campaign/adset/ad), payload_json (jsonb), fetched_at, expires_at` (RLS: company_id scoped, TTL 15min)
- **`reporting_preferences`** — `id, company_id, user_id, report_key text, visible_columns jsonb, default_sort text, saved_filters jsonb, last_ad_account text, last_date_range jsonb` (RLS: user_id = auth.uid())

Tutte con RLS abilitato e policy tenant-scoped.

### 2. Backend: Estendere `meta-api-proxy`

Aggiungere 2 nuove actions al file `supabase/functions/meta-api-proxy/index.ts`:

- **`get-ad-accounts`**: chiama `GET /v21.0/me/adaccounts?fields=id,name,account_status,currency` e ritorna la lista. Salva/aggiorna in `meta_ad_accounts`.
- **`get-campaign-insights`**: chiama `GET /v21.0/act_{id}/insights` con parametri `date_preset` o `time_range`, `level` (campaign/adset/ad), fields: `campaign_name,campaign_id,impressions,clicks,spend,ctr,cpc,actions,action_values,objective,reach`. Supporta anche breakdown giornaliero per trend charts. Implementa cache check su `meta_insights_cache` prima della chiamata API.
- **`get-campaign-status`**: chiama `GET /v21.0/act_{id}/campaigns?fields=id,name,status,objective` per lo stato live delle campagne.

### 3. Navigazione: Sidebar + Route

- **`src/lib/sidebarConfig.ts`**: Aggiungere voce `Reportistica` con icona `BarChart3` in `marketingNavItems`, url `/azienda/marketing/reportistica`
- **`src/App.tsx`**: Aggiungere route `/marketing/reportistica` → `ReportisticaPage` (con sub-routing) e `/marketing/reportistica/facebook-ads` → `FacebookAdsReport`
- La pagina `ReportisticaPage` ha tab orizzontali (come GHL): Report personalizzati, Google Ads, **Facebook Ads** (attivo), Attribuzione, Chiamate, Agenti, Appuntamenti, Audit marketing locale. Le tab non attive mostrano placeholder "Coming soon".

### 4. Componenti UI (stile GHL)

Creare nella cartella `src/components/reporting/facebook-ads/`:

| Componente | Descrizione |
|---|---|
| `FacebookAdsReport.tsx` | Page wrapper con header, date picker, account selector, KPI + table |
| `ReportHeader.tsx` | Titolo + DateRangePicker + AdAccount dropdown + Esporta/Colonne buttons |
| `KPIGrid.tsx` | 3 cards grandi (Impressioni, Clic, Conversioni) con sparkline Recharts + 4 cards piccole (Spesa, CPC, CPConv, CPL) |
| `TrendChart.tsx` | Area chart Recharts con serie giornaliera per il KPI selezionato |
| `CampaignTable.tsx` | Tabella con header sticky, sorting, search, filtri compatti. Colonne: Nome, Stato (badge), Clic, Costo, Entrate, ROI%, CPC, CTR, Vendite, CPS, Lead, CPL, Impressioni, Entrate medie |
| `ColumnsDrawer.tsx` | Sheet laterale con toggle per ogni colonna, salva in `reporting_preferences` |
| `ExportDialog.tsx` | Export CSV/XLSX con `xlsx` (gia' installato), include solo colonne visibili e filtri attivi |
| `LevelToggle.tsx` | Toggle Campaign/Adset/Ad per cambiare granularita' |

### 5. Hook: `useMetaAdsReport`

Nuovo hook `src/hooks/useMetaAdsReport.ts`:

- Gestisce state: `dateRange`, `selectedAdAccount`, `level`, `filters`, `sortColumn`, `sortDirection`, `visibleColumns`
- Fetch ad accounts via proxy (query key: `meta-ad-accounts`)
- Fetch insights via proxy con cache check (query key: `meta-insights`, dipende da account+date+level)
- Normalizzazione dati: `pickClicks` (link_clicks > clicks), `pickConversions` (lead/purchase in base a config), `pickRevenue` (action_values o 0)
- Calcoli KPI: Impressioni, Clic, Conversioni, Spesa, CPC (spend/clicks, div-by-zero safe), CPConv, CPL
- Trend series: estrazione giornaliera per sparklines
- Persistenza preferenze utente in `reporting_preferences`
- Error handling: token scaduto → banner con CTA a Integrazioni

### 6. Data Normalization Layer

File `src/lib/metaInsightsNormalizer.ts`:

- `normalizeInsights(raw, config)` — trasforma il payload Meta in righe uniformi per la tabella
- `pickClicks(actions)` — preferisce `link_click`, fallback `clicks`
- `pickConversions(actions, conversionType)` — filtra per `action_type` configurato (default: `lead`)
- `pickRevenue(action_values)` — estrae valore revenue se disponibile
- `computeKPIs(rows)` — somma totali per le KPI cards
- `computeDailySeries(raw)` — raggruppa per giorno per i trend charts
- Division-by-zero safe su tutti i calcoli

### 7. Permessi

- Riutilizzare il permesso `canViewMarketing` gia' esistente per la voce Reportistica
- L'export e' visibile a tutti tranne `viewer` (controllare `permissions.canEditMarketing` o equivalente)
- Se utente non ha Meta connesso: mostrare empty state con CTA "Collega il tuo account Meta da Impostazioni > Integrazioni"

### 8. UX Details (stile GHL)

- Cards bianche con bordo sottile, numeri grandi (font-semibold text-2xl), sparkline integrata
- Stato campagna: badge verde "Attivo", rosso "In pausa", grigio "Altro"
- Formattazione IT: `Intl.NumberFormat('it-IT')` per migliaia, `€` con 2 decimali, `%` con 2 decimali
- Skeleton loading: 3 skeleton cards + skeleton table durante fetch
- Empty state: "Nessun dato nel periodo selezionato" con icona
- Date range picker con preset: Oggi, Ieri, Ultimi 7gg, Ultimi 14gg (default), Ultimi 30gg, Questo mese, Custom
- Persistenza: ultimo ad account e date range salvati per utente

---

## File da creare/modificare

| Azione | File |
|---|---|
| Migrazione | 3 tabelle: `meta_ad_accounts`, `meta_insights_cache`, `reporting_preferences` |
| Modificare | `supabase/functions/meta-api-proxy/index.ts` — 3 nuove actions |
| Modificare | `src/lib/sidebarConfig.ts` — voce Reportistica |
| Modificare | `src/App.tsx` — nuove route |
| Creare | `src/pages/azienda/ReportisticaPage.tsx` — wrapper con tab |
| Creare | `src/components/reporting/facebook-ads/FacebookAdsReport.tsx` |
| Creare | `src/components/reporting/facebook-ads/ReportHeader.tsx` |
| Creare | `src/components/reporting/facebook-ads/KPIGrid.tsx` |
| Creare | `src/components/reporting/facebook-ads/TrendChart.tsx` |
| Creare | `src/components/reporting/facebook-ads/CampaignTable.tsx` |
| Creare | `src/components/reporting/facebook-ads/ColumnsDrawer.tsx` |
| Creare | `src/components/reporting/facebook-ads/ExportDialog.tsx` |
| Creare | `src/components/reporting/facebook-ads/LevelToggle.tsx` |
| Creare | `src/hooks/useMetaAdsReport.ts` |
| Creare | `src/lib/metaInsightsNormalizer.ts` |


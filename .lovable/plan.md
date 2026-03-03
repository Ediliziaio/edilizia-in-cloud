

# Audit Report di Facebook Ads — Verifica Completezza

## Stato: Implementazione quasi completa

L'architettura e' solida e copre la grande maggioranza dei requisiti. Ecco il report dettagliato.

---

## Cosa e' correttamente implementato

| Requisito | Stato |
|---|---|
| Sidebar: voce Reportistica con icona BarChart3 | OK |
| Route `/azienda/marketing/reportistica` | OK |
| Sub-tab orizzontali (8 tab, Facebook Ads attivo, altri placeholder) | OK |
| Header: titolo, date range picker, Ad Account dropdown, Esporta, Colonne | OK |
| KPI cards grandi (Impressioni, Clic, Conversioni) con sparkline Recharts | OK |
| KPI cards piccole (Spesa, CPC, Costo per conversione, CPL) | OK |
| Trend chart giornaliero con Area chart multi-serie | OK |
| Tabella campagne con 14 colonne (nome, stato, clic, costo, entrate, ROI, CPC, CTR, vendite, CPS, lead, CPL, impressioni, entrate medie) | OK |
| Status badge (Attivo/In pausa) | OK |
| Filtri: search, stato, obiettivo, solo con lead | OK |
| Ordinamento cliccando header colonna | OK |
| Level toggle (Campaign/Adset/Ad) | OK |
| Columns drawer con toggle per colonna | OK |
| Export CSV/XLSX con xlsx library | OK |
| Export include solo colonne visibili | OK |
| Nome file con account + daterange | OK |
| Normalizzatore dati: pickClicks, pickConversions, pickLeads, pickPurchases, pickRevenue | OK |
| Division-by-zero safe (safeDivide) | OK |
| computeKPIs + computeDailySeries | OK |
| Meta API proxy: get-ad-accounts, get-campaign-insights, get-campaign-status | OK |
| Cache su meta_insights_cache con TTL 15min | OK |
| Paginazione API (while nextUrl loop) | OK |
| fetchWithRetry con exponential backoff | OK |
| DB: meta_ad_accounts + meta_insights_cache + reporting_preferences | OK |
| RLS su tutte le tabelle (tenant-scoped) | OK |
| Empty state: non connesso → CTA a Integrazioni | OK |
| Token scaduto → banner con CTA riconnetti | OK |
| Skeleton loading su cards e tabella | OK |
| Formattazione numeri IT (separatore migliaia, €, %) | OK |
| staleTime su queries (no refetch su cambio colonne/sort) | OK |
| Lazy loading della pagina | OK |
| Permessi: riusa canViewMarketing | OK |

## Mancanze identificate (3 gap minori)

### 1. Filtro "range di spesa" (min/max) — NON esposto in UI
Il hook `useMetaAdsReport` ha gia' `minSpend` e `maxSpend` nei filtri e li applica, ma `CampaignTable.tsx` non li mostra nella barra filtri. Mancano 2 input numerici.

### 2. Persistenza preferenze utente — NON implementata
La tabella `reporting_preferences` esiste nel DB ma il hook `useMetaAdsReport` non salva/carica le preferenze (colonne visibili, ultimo account, ultimo date range). Lo state e' solo in-memory.

### 3. Export: nome file non include nome azienda
La spec chiede `facebook-ads-report_{azienda}_{adaccount}_{daterange}.xlsx` ma il file usa solo `facebook-ads-report_{accountId}_{daterange}`. Manca il nome azienda.

---

## Piano fix (3 interventi)

### Fix 1 — Aggiungere filtri range spesa in CampaignTable
Aggiungere 2 Input number nella barra filtri della tabella per min/max spesa. I campi esistono gia' nel hook, serve solo esporli nella UI.

### Fix 2 — Persistenza preferenze utente
Caricare preferenze da `reporting_preferences` all'init del hook e salvare (debounced) quando cambiano `visibleColumns`, `selectedAccountId` o `dateRange`. Upsert su `reporting_preferences` con `report_key = 'facebook_ads'`.

### Fix 3 — Nome azienda nell'export
Passare `companyName` (da `effectiveCompany`) al componente ExportDialog e includerlo nel nome file.


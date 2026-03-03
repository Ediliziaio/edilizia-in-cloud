

# Cruscotto Aziendale — Piano di Implementazione

## Analisi

Il progetto ha gia' due dashboard separate con dati complementari:
- **Gestione Interna** (`CompanyDashboard.tsx`): ordini, fatturato, margini, cash flow, scadenze
- **Marketing & Vendite** (`MarketingDashboard.tsx`): lead, pipeline, forecast, performance commerciali, funnel, trend — alimentata dalla RPC `get_marketing_dashboard_stats`

Il Cruscotto Aziendale deve fondere entrambe in un'unica vista executive, riutilizzando al massimo i componenti e le query esistenti.

## Complessita' e Approccio

Questo e' un progetto molto ampio. Lo implemento in modo **modulare e incrementale**: struttura completa, sezioni lazy-loaded, dati aggregati da entrambe le fonti. Ogni macro-sezione e' un componente autonomo che puo' essere attivato/disattivato.

---

## 1. Permessi e Sidebar

**DB Migration**: aggiungere colonna `can_view_cruscotto` a `staff_permissions` (boolean, default false).

**`sidebarConfig.ts`**: aggiungere voce "Cruscotto Aziendale" con `permissionKey: "canViewCruscotto"`, posizionata PRIMA di "Gestione Interna".

**`usePermissions.ts`**: mappare `canViewCruscotto` dalla nuova colonna. Super admin e company admin → true automaticamente.

**`CompanyLayout.tsx`**: renderizzare la voce Cruscotto sopra il Collapsible "Gestione Interna", visibile solo se il permesso e' attivo.

**Routing**: `App.tsx` → nuova route `/azienda/cruscotto` dentro il blocco `<CompanyLayout>`.

## 2. Hook Centralizzato `useCruscottoData`

Un hook che:
- Chiama `get_marketing_dashboard_stats` per i KPI marketing/vendite (riuso della RPC esistente)
- Esegue le query ordini/costi/cash flow gia' presenti in `CompanyDashboard.tsx`
- Accetta filtri globali (periodo, utente, fonte, pipeline, stato ordine)
- Restituisce un oggetto unificato con tutte le sezioni

## 3. Pagina `CruscottoAziendale.tsx`

Layout modulare con 8 sezioni, ognuna componente separato:

### 3.1 Filtri Globali (barra in alto)
Riutilizzo del pattern `DashboardFilters` del marketing con aggiunta di filtro stato ordine. Tutti i widget reagiscono ai filtri.

### 3.2 Alert Intelligenti (fisso sotto filtri)
Componente che aggrega alert da entrambe le fonti:
- Lead non contattati 48h+ (da RPC marketing)
- Opportunita' ferme 7gg (da RPC marketing)
- Pagamenti scaduti (da query ordini)
- Cash flow negativo (da calcolo costi)
- Margine sotto soglia
- Ogni alert cliccabile → link alla lista filtrata

### 3.3 Executive Overview
KPI cards 4x2 con due righe:
- **Riga Finanziaria**: Fatturato Mese, Fatturato YTD, Margine Lordo %, Cash Flow, Da Incassare, Debiti Fornitori
- **Riga Commerciale**: Lead Nuovi, Appuntamenti, Show Rate, Contratti Vinti, Tasso Chiusura, Ticket Medio, Sales Velocity
Ogni card con trend vs periodo precedente e color coding (verde/giallo/rosso) basato su soglie.

### 3.4 Marketing Control
Riutilizzo componenti esistenti: `DashboardFunnel`, `DashboardSourcesTable`, trend per canale. Dati dalla RPC.

### 3.5 Sales Control
Riutilizzo `DashboardSalesTable` + KPI pipeline. Forecast 30/60/90gg. Tabella performance commerciali con color coding.

### 3.6 Pipeline & Forecast
Riutilizzo `DashboardForecast` + `DashboardFunnel` con vista valore per fase e forecast probabilistico (pipeline pesata dalla RPC).

### 3.7 Operations & Delivery
Ordini attivi, ordini in ritardo, ticket aperti, alert magazzino. Dati dalle query ordini/ticket esistenti.

### 3.8 Finanza & Cash Flow
Cash flow dinamico, incassi previsti 30/60gg, margine medio commessa, break even. Riutilizzo logica `DashboardCeoStrip` + `WeeklyDeadlines`.

### 3.9 HR & Performance Team
Ranking commerciali, obiettivi vs realizzato. Riutilizzo dati sales performance dalla RPC.

### 3.10 Trend Temporale
Grafico combinato lead + appuntamenti + vendite + fatturato. Riutilizzo `DashboardTrendChart` con dati aggiuntivi ordini.

---

## File da Creare/Modificare

| Azione | File |
|--------|------|
| Migration | Aggiungere `can_view_cruscotto` a `staff_permissions` |
| Modificare | `src/hooks/usePermissions.ts` — mappare nuovo permesso |
| Modificare | `src/lib/sidebarConfig.ts` — voce Cruscotto |
| Modificare | `src/components/layouts/CompanyLayout.tsx` — renderizzare voce sopra Gestione Interna |
| Modificare | `src/App.tsx` — route `/azienda/cruscotto` |
| Creare | `src/hooks/useCruscottoData.ts` — hook dati centralizzato |
| Creare | `src/pages/azienda/CruscottoAziendale.tsx` — pagina principale |
| Creare | `src/components/cruscotto/CruscottoFilters.tsx` |
| Creare | `src/components/cruscotto/CruscottoAlerts.tsx` |
| Creare | `src/components/cruscotto/ExecutiveOverview.tsx` |
| Creare | `src/components/cruscotto/MarketingControl.tsx` |
| Creare | `src/components/cruscotto/SalesControl.tsx` |
| Creare | `src/components/cruscotto/PipelineForecast.tsx` |
| Creare | `src/components/cruscotto/OperationsDelivery.tsx` |
| Creare | `src/components/cruscotto/FinanzaCashFlow.tsx` |
| Creare | `src/components/cruscotto/HRPerformance.tsx` |
| Creare | `src/components/cruscotto/CruscottoTrend.tsx` |

## Note Tecniche

- Ogni sezione e' `React.memo` per performance
- Le query usano `staleTime: 2min` e caricamento parallelo con `Promise.all`
- I dati marketing vengono dalla RPC server-side gia' ottimizzata
- I dati interni vengono dalle stesse query di `CompanyDashboard` estratte nell'hook
- Architettura predisposta per futuro toggle sezioni via impostazioni azienda
- Nessun drag & drop nella prima versione (complessita' eccessiva senza valore immediato)


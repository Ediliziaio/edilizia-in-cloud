

# FIX 4: Statistiche Email — Aggregazione lato DB

## Problema
`EmailStatsTab.tsx` scarica tutti i log raw client-side e fa `logs.filter()` per calcolare stats, funnel, chart e tabella campagne. Con migliaia di log crasha il browser.

## Soluzione
Creare **3 funzioni Postgres** che aggregano tutto lato DB, poi chiamarle via RPC nel componente.

### 1. SQL Migration — 3 funzioni RPC

**`get_email_stats_summary`** — Stats globali + funnel
- Parametri: `p_company_id`, `p_campaign_id` (nullable), `p_date_from` (nullable), `p_date_to` (nullable)
- Ritorna una singola riga: `total, delivered, opened, clicked, bounced, unsubscribed, spam`
- Conta "delivered" come `status IN ('delivered','opened','clicked')`, "opened" come `status IN ('opened','clicked')` — stessa logica attuale

**`get_email_stats_by_campaign`** — Per la tabella top campagne
- Parametri: `p_company_id`, `p_campaign_id` (nullable), `p_date_from`, `p_date_to`
- Ritorna: `campaign_id, delivered, opened, clicked` raggruppato per campaign
- Join con `email_campaigns` per nome/tipo/sent_at

**`get_email_stats_by_date`** — Per il grafico performance
- Parametri: `p_company_id`, `p_campaign_id` (nullable), `p_date_from`, `p_date_to`
- Ritorna: `date_label, campaign_type, total, delivered, opened, clicked`
- Raggruppato per data (troncata a giorno) e tipo campagna
- Il componente calcola le percentuali dai numeri aggregati

Tutte `SECURITY DEFINER` con `SET search_path = public`.

### 2. Modifica `EmailStatsTab.tsx`
- Rimuovere la query `email_logs` che scarica tutti i log raw
- Sostituire con 3 chiamate `supabase.rpc()`:
  - `get_email_stats_summary` → alimenta `stats`, `funnel`, `CampaignStatsCards`
  - `get_email_stats_by_campaign` → alimenta `EmailTopCampaignsTable`
  - `get_email_stats_by_date` → alimenta `EmailPerformanceChart`
- Rimuovere tutto il calcolo `useMemo` client-side per `chartDatasets`
- Rimuovere la funzione `count()` e i `logs.filter()`

### File modificati

| File | Azione |
|------|--------|
| SQL Migration | 3 funzioni: `get_email_stats_summary`, `get_email_stats_by_campaign`, `get_email_stats_by_date` |
| `src/components/email-marketing/EmailStatsTab.tsx` | Riscrittura queries con RPC, rimozione aggregazione client-side |




# Prompt 4 — Previsionale: Waterfall + Alert Cash Flow + Ottimizzazione Costi Ricorrenti

Tre fix da implementare. FIX 4C (Sicurezza Storage) è già completato (migration `20260305151014` ha reso il bucket privato + RLS).

---

## FIX 4A — Grafico Waterfall Cash Flow

### Nuovo componente: `src/components/forecast/WaterfallChart.tsx`
- Grafico a cascata usando Recharts `BarChart` con barre positive (verde) e negative (rosso)
- Ogni barra rappresenta una settimana, con il saldo cumulativo mostrato come linea sovrapposta
- Utilizza `ComposedChart` con `Bar` (variazione settimanale) + `Line` (saldo cumulativo)
- Tooltip con dettaglio entrate/uscite della settimana

### Modifica: `src/components/forecast/CashForecastTab.tsx`
- Aggiungere il `WaterfallChart` sotto il grafico AreaChart esistente (o sostituire)
- Riutilizzare il `weeklyChartData` già calcolato, aggiungendo i campi `income` e `expenses` per settimana

---

## FIX 4B — Alert Soglia Cash Flow Negativo

### UI — Banner in `CashForecastTab.tsx`
- Sopra le card: se il saldo previsto del prossimo mese è negativo, mostrare un `Alert` rosso con icona `AlertTriangle`
- Se positivo ma < soglia (es. €5.000), mostrare alert giallo "Cash flow vicino allo zero"

### UI — Banner in `CompanyDashboard.tsx`
- Aggiungere una card alert se `stats.nextMonth.net < 0` (dati dal hook `useCompanyDashboardData`)
- Card rossa con link al previsionale

### Backend — `check-scheduled-triggers`
- Aggiungere sezione che, una volta al giorno, verifica il cash flow previsto del mese prossimo
- Se negativo → inserisce `lifecycle_notification` per l'admin aziendale

---

## FIX 4D — generate-recurring-costs: Bulk Insert

### Database Migration
- Aggiungere UNIQUE constraint `company_id, name, due_date` su `company_costs` (per supportare upsert)

### Edge Function: `supabase/functions/generate-recurring-costs/index.ts`
- Sostituire il loop check+insert singolo (righe 87-112) con:
  1. Generare tutti i record in memoria in un array `toInsert`
  2. Singolo `upsert(toInsert, { onConflict: 'company_id,name,due_date', ignoreDuplicates: true })`
- Da ~60 query a ~2 query per esecuzione

---

## File da creare/modificare

| File | Azione |
|------|--------|
| `src/components/forecast/WaterfallChart.tsx` | Nuovo componente grafico waterfall |
| `src/components/forecast/CashForecastTab.tsx` | Aggiungere waterfall + alert banner |
| `src/pages/azienda/CompanyDashboard.tsx` | Alert card cash flow negativo |
| `supabase/functions/generate-recurring-costs/index.ts` | Bulk insert optimization |
| `supabase/functions/check-scheduled-triggers/index.ts` | Alert cash flow notification |
| Migration SQL | UNIQUE constraint su `company_costs` |


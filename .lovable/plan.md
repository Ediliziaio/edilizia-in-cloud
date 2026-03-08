

# Sprint 3 — Feature Nuove: Piano di Implementazione

Sprint 1 (Quick Wins) e Sprint 2 (Grafici Chiave) sono completati. Si procede con le 5 feature nuove ad alto valore del documento.

---

## 1. Budget mensile per categoria costi con grafico previsto vs effettivo

**File:** Migration SQL — nuova tabella `cost_budgets`
- Colonne: `id`, `company_id`, `category`, `month` (date), `budget_amount`, `created_at`
- RLS: accesso limitato a `company_id` dell'utente autenticato

**File:** `src/components/forecast/CostBudgetManager.tsx` (nuovo)
- UI per impostare budget mensile per categoria (form con Select categoria + Input importo + mese)
- Tabella riepilogativa budget impostati
- Grafico BarChart "Budget vs Effettivo" per categoria nel mese selezionato (barre affiancate: grigio=budget, colorato=effettivo, rosso se sfora)

**File:** `src/components/forecast/CompanyCostsManager.tsx`
- Aggiungere tab o sezione "Budget" che renderizza `CostBudgetManager`

---

## 2. Auto-generazione costi ricorrenti

**File:** Migration SQL — aggiungere colonne `recurrence_auto` (boolean) e `recurrence_end_date` (date) su `company_costs` (se non esistenti)

**File:** `supabase/functions/generate-recurring-costs/index.ts` (nuova Edge Function)
- Invocabile via cron o manualmente
- Logica: trova costi con `recurrence != 'none'` e `recurrence_auto = true`, controlla se l'istanza del mese corrente esiste, se no la crea con data scadenza calcolata
- Rispetta `recurrence_end_date`

**File:** `src/components/forecast/CompanyCostsManager.tsx`
- Aggiungere bottone "Genera ricorrenti" che invoca la Edge Function
- Toggle nel `CostFormDialog` per abilitare auto-generazione su un costo ricorrente

---

## 3. DSO (Days Sales Outstanding) nel tab Incassato

**File:** `src/components/forecast/CollectedTab.tsx`
- Aggiungere card KPI "DSO" sopra la tabella: calcolo = media dei giorni tra data creazione ordine e data pagamento per tutti i pagamenti incassati nel periodo
- Seconda KPI: "DSO mese precedente" per confronto con delta
- Terza KPI: "Velocita' di incasso" (trend: migliorando/peggiorando)
- BarChart dell'incassato mensile YTD (recharts) sotto le KPI

---

## 4. Drill-down navigation da metriche principali

**File:** `src/pages/azienda/CompanyDashboard.tsx`
- Rendere cliccabili le 4 stat cards (Ordini → `/azienda/ordini`, Clienti → `/azienda/clienti`, Ticket → `/azienda/ticket`, Da Incassare → `/azienda/previsionale`)
- Rendere cliccabile il "Saldo Netto" del Bilancio Mese → `/azienda/previsionale`
- CEO Strip KPIs già cliccabili (fatto in Sprint 1 nel Cruscotto), applicare stesso pattern qui

**File:** `src/components/cruscotto/CompanyHealthScore.tsx`
- Rendere le 5 barre del breakdown cliccabili: Margine → `/azienda/previsionale`, Cash Flow → `/azienda/previsionale`, Vendite → `/azienda/marketing`, Show Rate → `/azienda/marketing/calendario`, Operazioni → `/azienda/ordini`

---

## 5. Aging Receivables chart

**File:** `src/pages/azienda/CompanyDashboard.tsx`
- Nuovo widget "Aging Crediti" sotto il widget Da Incassare
- BarChart stacked orizzontale con 4 fasce: Scaduto (rosso), Questa settimana (arancione), Questo mese (giallo), Futuro (verde)
- Dati derivati dai pagamenti pending già calcolati in `useCompanyDashboardData`

**File:** `src/hooks/useCompanyDashboardData.ts`
- Aggiungere calcolo `agingReceivables: { overdue: number; thisWeek: number; thisMonth: number; future: number }` basato su `expected_date` dei pagamenti non incassati

---

## Riepilogo file

| File | Modifica |
|------|----------|
| Migration SQL | Tabella `cost_budgets` + colonne ricorrenza |
| `src/components/forecast/CostBudgetManager.tsx` | Nuovo: gestione budget per categoria |
| `src/components/forecast/CompanyCostsManager.tsx` | Sezione Budget + bottone genera ricorrenti |
| `supabase/functions/generate-recurring-costs/index.ts` | Nuovo: Edge Function auto-generazione |
| `src/components/forecast/CollectedTab.tsx` | KPI DSO + BarChart incassato |
| `src/pages/azienda/CompanyDashboard.tsx` | Stat cards cliccabili + Aging Receivables |
| `src/hooks/useCompanyDashboardData.ts` | Aging receivables data |
| `src/components/cruscotto/CompanyHealthScore.tsx` | Barre breakdown cliccabili |
| `src/components/forecast/CostFormDialog.tsx` | Toggle auto-generazione ricorrenti |


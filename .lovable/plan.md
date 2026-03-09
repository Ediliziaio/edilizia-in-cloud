

# Cruscotto Aziendale: Bug Fix + Miglioramenti — Piano

## Fase 1 — Bug Critici (5 fix)

### BUG 1: Cash Runway errato (`FinanzaCashFlow.tsx`)
- La formula attuale usa `finance.thisMonthIncome / dailyBurn` (righe 25-26) — gonfia il runway
- Fix: `netBalance = thisMonthIncome - thisMonthOutflow`, `dailyBurn = outflowSoFar / dayOfMonth`, `runway = netBalance / dailyBurn`
- Aggiungere label "Stabile" per runway >= 999, e tooltip con dettaglio formula
- Aggiornare soglie colore: 0-7 rosso, 8-30 arancio, 31-90 giallo, >90 verde

### BUG 2: Margine non ponderato (`useCruscottoData.ts`)
- La funzione `calc` (riga 184-196) fa media semplice per ordine
- Fix: sommare tutti i ricavi e tutti i costi, calcolare `(totalRevenue - totalCost) / totalRevenue * 100`
- Clamp tra -100% e +100%

### BUG 3: Pagamenti non filtrati per data (`useCruscottoData.ts`)
- La query installments (riga 99-112) non filtra per data — mostra rate scadute di mesi fa
- Fix: aggiungere filtro `expected_date` per i prossimi 30 giorni da oggi per le scadenze, e usare il range del cruscotto per i calcoli finanziari

### BUG 4: NaN/Infinity non gestiti (`FinanzaCashFlow.tsx`)
- Aggiungere helper `safeNumber(value, fallback)` e usarlo in tutti i calcoli che possono produrre divisione per zero

### BUG 5: HealthScore senza dati (`CompanyHealthScore.tsx`)
- Aggiungere `hasData` a ogni fattore — fattori senza dati mostrati in grigio e esclusi dal punteggio
- Se tutti i fattori mancano, mostrare "Dati insufficienti" al posto dello score

---

## Fase 2 — Performance: RPC Server-side

### Migrazione SQL
- Creare funzione `get_cruscotto_stats(p_company_id, p_date_from, p_date_to)` che restituisce JSONB con:
  - `finance`: revenue_current/previous, costs_current/previous, margin_pct ponderato
  - `orders`: total, in_progress, late, avg_value con confronto periodo precedente
  - `customers`: total, new_current/previous
  - `tickets`: open, resolved
  - `upcoming_payments`: array prossimi 30 giorni
  - `monthly_revenue`: 6 mesi per grafico trend

### Aggiornamento `useCruscottoData.ts`
- Aggiungere query RPC come fonte dati aggiuntiva per la sezione finanza/operazioni
- Mantenere la query marketing separata (ha la sua RPC complessa)
- Ridurre da 4-5 query separate a 2 (RPC stats + marketing RPC)

---

## Fase 3 — UX: Skeleton + Empty States + Error Boundaries

### Skeleton per sezione
- Rimuovere il loader globale bloccante in `CruscottoAziendale.tsx` (righe 27-40)
- Mostrare sempre la struttura della pagina, ogni widget gestisce il proprio skeleton via `isLoading`

### Empty states
- Aggiungere empty state specifico in `CompanyHealthScore`, `FinanzaCashFlow`, `OperationsDelivery` quando i dati sono zero/null

### Error boundary
- Creare `SectionErrorBoundary.tsx` — wrappa ogni sezione del cruscotto per isolare i crash

---

## Fase 4 — Nuove Feature

### A: Target mensile
- Migrazione: aggiungere `monthly_revenue_target` e `monthly_orders_target` a `companies`
- Nel cruscotto: barra di progresso sotto le KPI finanziarie se target impostato
- Nelle impostazioni azienda: campo numerico per impostare il target

### B: Soglie alert configurabili
- Migrazione: aggiungere `alert_late_orders_threshold`, `alert_open_tickets_threshold`, `alert_margin_min_pct`, `alert_runway_days_warning` a `companies`
- In `CruscottoAlerts.tsx`: usare soglie da company invece di valori hardcoded
- Mini-dialog "Configura soglie" accessibile dall'header alerts

---

## Fase 5 — Export + Drill-down

### Export/Stampa
- Aggiungere bottone "Stampa / Esporta PDF" nell'header del cruscotto
- Implementare con `window.print()` + print stylesheet che nasconde nav/sidebar/bottoni

### Drill-down KPI
- Rendere le KPI card cliccabili — click apre un `Sheet` (drawer) con tabella dettaglio
- 4 drill-down: Revenue (lista ordini), Margine (breakdown costi per ordine), Ordini in ritardo, Ticket aperti
- Ogni drawer fa la propria query filtrata per il periodo selezionato

---

## File modificati/creati

| File | Azione |
|------|--------|
| Migrazione SQL | RPC `get_cruscotto_stats` + colonne target/alert su `companies` |
| `src/hooks/useCruscottoData.ts` | Fix margine ponderato, fix filtro pagamenti, integra RPC |
| `src/components/cruscotto/FinanzaCashFlow.tsx` | Fix runway, safeNumber, tooltip, empty state |
| `src/components/cruscotto/CompanyHealthScore.tsx` | Gestione "no data" vs "zero", empty state |
| `src/components/cruscotto/CruscottoAlerts.tsx` | Soglie configurabili da company |
| `src/components/cruscotto/ExecutiveOverview.tsx` | Target progress bar, drill-down onClick |
| `src/components/cruscotto/SectionErrorBoundary.tsx` | **Nuovo** |
| `src/components/cruscotto/DrilldownDrawer.tsx` | **Nuovo** — drawer riutilizzabile per drill-down |
| `src/components/cruscotto/AlertThresholdsDialog.tsx` | **Nuovo** — dialog configurazione soglie |
| `src/pages/azienda/CruscottoAziendale.tsx` | Rimuove loader bloccante, wrappa sezioni in error boundary, bottone stampa, print CSS |


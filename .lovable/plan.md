

# Sezioni 6-9 del Documento — Stato Implementazione

## 6. Previsionale (Cash Flow)

| Requisito | Stato | Dettagli |
|-----------|-------|----------|
| 5 tab (Incassato, Marginalità, Costi, Cassa, Tesoreria) | **FATTO** | `CashFlowForecast.tsx` ha tutti e 5 i tab |
| 7 sorgenti dati (installments, ext teams, commissioni, costi, fornitori, dipendenti, categorie) | **FATTO** | `useCashFlowData.ts` ha 12 query separate per tutte le sorgenti |
| Calcolo 3 orizzonti (mese, prossimo mese, 3 mesi) | **FATTO** | `ForecastStats` calcola `thisMonth`, `nextMonth`, `next3Months` |
| Export CSV | **FATTO** | Funzione `exportCSV` in `CashFlowForecast.tsx` |
| Forecast costi ricorrenti auto-generazione | **FATTO** | Edge function `generate-recurring-costs` con upsert bulk |
| Grafico Waterfall cash flow | **FATTO** | `WaterfallChart.tsx` integrato in `CashForecastTab.tsx` |
| Alert soglia cash flow negativo | **FATTO** | Banner in `CashForecastTab.tsx` + alert in `CompanyDashboard.tsx` + `CruscottoAlerts.tsx` |
| Query limit 10.000 record — rischio overflow | **APERTO** | Tutte le query in `useCashFlowData.ts` usano `.limit(10000)` senza filtro date obbligatorio lato DB. Per aziende grandi questo diventerà un collo di bottiglia |
| Proiezione trend (regressione/media mobile) | **NON FATTO** | Nessun calcolo predittivo. Il previsionale mostra solo dati esistenti, non proietta dove va il cash flow nei prossimi 6 mesi |
| Marginalità WIP (ordini aperti con costi parziali) | **NON VERIFICATO** | Da controllare se `MarginTab` include ordini in-progress o solo completati |
| Riconciliazione bancaria (import CSV estratto conto) | **NON FATTO** | La Tesoreria ha categorie ma nessuna funzione di import/riconciliazione |

## 7. Costi Aziendali

| Requisito | Stato | Dettagli |
|-----------|-------|----------|
| CompanyCostsManager con costi fissi/variabili | **FATTO** | Componente esiste e funziona |
| Costi ricorrenti auto-generazione | **FATTO** | `recurrence_auto` flag + edge function |
| Categorizzazione costi | **FATTO** | Tabella `cost_categories` + sistema sincronizzazione |
| Budget vs Consuntivo | **FATTO** | `CostBudgetManager.tsx` esiste, tabella `cost_budgets` presente |
| Workflow approvazione costi | **NON FATTO** | Nessun sistema di approvazione — qualsiasi utente con permessi può inserire costi |
| Import costi da CSV/fatture | **NON FATTO** | Nessuna funzione di import per i costi |
| Schedulazione automatica generate-recurring-costs | **PARZIALE** | La funzione esiste ma viene chiamata manualmente. `check-scheduled-triggers` potrebbe includerla ma da verificare |

## 8. Sicurezza

| Requisito | Stato | Dettagli |
|-----------|-------|----------|
| RLS su orders | **OK** | Filtro company_id + onlyAssigned |
| RLS su order_items | **OK** | Eredita da orders |
| RLS su order_installments | **FATTO** | Migration `20260305131642` abilita RLS con policy per company orders |
| Storage allegati: bucket private + signed URLs | **FATTO** | Migration `20260305151014` rende bucket private con RLS |
| Totali ordine calcolati solo client-side | **APERTO** | Nessun trigger DB che ricalcola/valida totale. Un utente tecnico potrebbe alterare importi via API |
| Draft ordine in localStorage in chiaro | **APERTO (BASSO)** | Rischio solo su device condivisi |
| Rate limiting CRUD | **NON FATTO** | Nessun rate limit sulle operazioni |
| Filtri client-side su dati caricati (data leakage) | **PARZIALE** | Le query caricano 10.000 record poi filtrano client-side. Migliorato con filtri DB su alcune query, ma `useCashFlowData` carica ancora tutto |

## 9. Piano Ottimizzazione Performance

| Ottimizzazione | Stato | Dettagli |
|---------------|-------|----------|
| RPC aggregata dashboard (15→1) | **FATTO** | `get_dashboard_kpis` creata e corretta |
| Server-side filtering magazzino | **PARZIALE** | `supplierMap` memoizzata, ma filtri principali ancora parzialmente client-side |
| Virtualizzazione liste (react-virtual) | **FATTO** | `@tanstack/react-virtual` installato, `WarehouseListView.tsx` virtualizzato |
| Memoizzazione Map supplier | **FATTO** | `useMemo` con `Map` in `useWarehouseData.ts` |
| staleTime 2min→10min | **FATTO** | Dashboard a 10min, forecast a 5min |
| Calcolo margini lato DB (VIEW materializzata) | **NON FATTO** | Margini ancora calcolati client-side per ogni pagina ordini |
| Infinite scroll ordini | **NON FATTO** | Paginazione tradizionale 20/pag con full-reload |
| Supabase Realtime per warehouse | **NON FATTO** | Nessun channel realtime per aggiornamenti magazzino multi-utente |
| React.memo su row components | **PARZIALE** | `WarehouseItemRow` memoizzato. `OrderItemRow` ancora da wrappare |
| Lazy loading tab dashboard | **NON FATTO** | Tutti i tab caricano dati al mount, non solo quello visibile |

---

## Riepilogo: Da Implementare (per priorità)

### Alta priorità
1. **Filtri date obbligatori lato DB nel Previsionale** — Le 12 query di `useCashFlowData.ts` caricano fino a 10.000 record senza filtro temporale. Aggiungere `WHERE date BETWEEN` nelle query per ridurre dati trasferiti dell'80%
2. **Trigger validazione totali ordine** — Aggiungere trigger PostgreSQL che ricalcola e verifica `total_amount` lato DB per prevenire manipolazioni client-side
3. **React.memo su OrderItemRow** — File da 40KB con re-render ad ogni interazione

### Media priorità
4. **Lazy loading tab Dashboard** — Caricare dati solo per il tab attivo usando `enabled: activeTab === 'x'`
5. **Proiezione trend cash flow** — Media mobile o regressione lineare per proiettare il saldo a 3-6 mesi
6. **Schedulazione auto generate-recurring-costs** — Integrare la chiamata nel cron `check-scheduled-triggers`

### Bassa priorità
7. **Infinite scroll ordini** — Sostituire paginazione con `useInfiniteQuery`
8. **Supabase Realtime magazzino** — Channel per aggiornamenti multi-utente
9. **Workflow approvazione costi** — Sistema approve/reject per inserimento costi
10. **Riconciliazione bancaria** — Import CSV estratto conto + matching automatico


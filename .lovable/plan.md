

# Analisi e Fix: Buco Bianco + Verifica Integrazione Dati

## Problema identificato

Lo screenshot mostra un grande spazio bianco nella colonna sinistra (sezione **Sales Control**). Il componente `SalesControl` ha poco contenuto (3 card KPI + tabella con pochi dati), mentre `PipelineForecast` a destra è molto più alto. La griglia CSS `grid-cols-2` allunga entrambe le colonne alla stessa altezza, creando il vuoto.

## Correzioni

### 1. Eliminare il buco bianco — `CruscottoAziendale.tsx`

Cambiare il layout della sezione Vendite (righe 130-135) da griglia 2-colonne a **stack verticale**. `SalesControl` e `PipelineForecast` vengono disposti uno sotto l'altro, eliminando il disallineamento di altezza.

Stessa logica per HR & Trend (righe 142-148): verificare che non crei lo stesso problema. Se il contenuto è simile in altezza, mantenere la griglia.

### 2. Verifica integrazione dati

Ho verificato il codice e confermo:

| Indicatore | Fonte dati | Stato |
|---|---|---|
| Fatturato (Mese/Trim/YTD) | `cashFlowForecast` → query ordini per periodo | OK |
| Cash Flow Mese | `financeData` → merge installments + costs | OK |
| Posizione Netta | `finance.pendingRevenue - finance.supplierDebt` | OK |
| Salute Aziendale | Calcolo composito (margine, CF, close rate, show rate, ritardi) | OK |
| Lead/Appuntamenti (TodayFocus) | Query parametrizzata con `todayDateFrom/To` | OK |
| Crediti scaduti | `order_installments` non pagate con `expected_date < oggi` | OK |
| Fornitori 7gg | `company_costs` non pagate nei prossimi 7 giorni | OK |
| Cash Flow Forecast 30/60/90 | `order_installments` future non pagate | OK |
| Pipeline/Forecast | `marketing RPC` → `kpi.pipeline_active_value`, `weighted_pipeline` | OK |
| Sales Performance | `marketing RPC` → `sales_performance` array | OK |
| Operations (ordini attivi, ritardo, ticket) | Query dirette con merge pagamenti scaduti | OK |
| Weekly Agenda | Costs + deliveries + appointments prossimi 7gg | OK |

Nessun problema di integrazione dati rilevato. Le query keys includono tutti i parametri necessari per evitare cache stale.

### 3. Ottimizzazione aggiuntiva spazi

- Sezione Operations: usa `grid-cols-2` con 4 card piccole — layout corretto, nessun buco
- Sezione Marketing: singola colonna — OK
- Sezione Finanza: 2 colonne con contenuto simile — OK

## File da modificare

| File | Modifica |
|---|---|
| `src/pages/azienda/CruscottoAziendale.tsx` | Cambiare layout sezione Vendite da `grid-cols-2` a stack verticale o `auto-rows` |


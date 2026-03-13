

## VENDOR-REP-03: Funnel di Conversione + Ranking Agenti

### Cosa viene creato

Due nuovi componenti che sostituiscono i placeholder nelle tab "Ranking Agenti" e aggiungono il funnel nella tab "Panoramica". Inoltre, aggiornamento del container per integrare tutto.

### File da creare/modificare

| File | Azione |
|---|---|
| `src/components/reporting/venditori/VenditoriFunnel.tsx` | Nuovo — funnel visivo a barre orizzontali per fase pipeline |
| `src/components/reporting/venditori/VenditoriRanking.tsx` | Nuovo — tabella ranking agenti con sorting via `useTableSort` + `SortableTableHead` |
| `src/components/reporting/venditori/VenditoriPerformanceReport.tsx` | Modificare — importare Funnel e Ranking, sostituire placeholder |

### Dettaglio componenti

**VenditoriFunnel**
- Riceve `stages: FunnelStage[]` dal hook `useVendorFunnel` gia presente
- Ordina le fasi: open stages (per ordine logico), poi won, poi lost
- Ogni riga: label fase a sinistra, barra orizzontale proporzionale al max count, valore a destra
- Won in verde, lost in rosso, open in sfumature blu/indigo
- Tasso conversione tra fasi mostrato come "↓ conv. X%"
- Legenda in fondo
- Usa `formatCurrency` da `src/lib/formatters.ts`

**VenditoriRanking**
- Riceve `kpiList: VendorKPI[]` e `isLoading`
- Usa `useTableSort` hook esistente + `SortableTableHead` per sorting colonne
- Colonne: #, Agente, Fatturato, Chiusura%, Show-Up%, Deal Medio, Opp Vinte, App->Close, Ciclo, Pipeline, Contatti
- Top 3 con icone Crown/Medal/Award
- Riga totale team in fondo
- Celle KPI con colore semaforo (badge colorati) per chiusura, show-up, app->close, ciclo vendita
- Skeleton loading + empty state
- Sorting default: fatturato decrescente

**Container update**
- Importare `VenditoriFunnel` e `VenditoriRanking`
- Tab "overview": aggiungere `<VenditoriFunnel stages={funnel} />` dopo la griglia scorecards
- Tab "ranking": sostituire placeholder con `<VenditoriRanking kpiList={kpiList} isLoading={isLoading} />`
- Tab "trend" resta placeholder (VENDOR-REP-04)

### Note tecniche
- Riuso `useTableSort` + `SortableTableHead` gia esistenti nel progetto per consistenza
- Formattazione: `formatCurrency` da `src/lib/formatters.ts` (non `formatCurrencyIT`)
- Il ranking usa accessors per sorting: `fatturato_generato: k => k.fatturato_generato`, etc.
- Per `avg_giorni_chiusura` la direzione default viene invertita (meno = meglio) tramite accessor negato


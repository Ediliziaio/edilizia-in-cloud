

## VENDOR-REP-04: Trend Temporale + Insights Automatici

### File da creare/modificare

| File | Azione |
|---|---|
| `src/components/reporting/venditori/VenditoriTrend.tsx` | Nuovo — grafico trend mensile multi-metrica + tabella riepilogativa |
| `src/components/reporting/venditori/VenditoriInsights.tsx` | Nuovo — insights automatici generati dai dati KPI e trend |
| `src/components/reporting/venditori/VenditoriPerformanceReport.tsx` | Modificare — importare i due nuovi componenti, sostituire placeholder trend, aggiungere insights in overview |

### Dettaglio componenti

**VenditoriTrend**
- Riceve `trend: VendorTrend[]` e `agentId: string`
- Selettore metrica con 4 toggle: Fatturato, Tassi (%), Volumi, Contatti & App
- Grafico recharts `ComposedChart` con Bar + Line a seconda della metrica selezionata
- Tabella mensile sotto il grafico con semaforo colori su chiusura% e show-up%
- Evidenzia mese corrente
- Usa `formatCurrency` / `formatCurrencyCompact` da `src/lib/formatters.ts`

**VenditoriInsights**
- Riceve `kpi`, `trend`, `kpiList`
- Funzione `generateInsights` analizza i dati e produce array di `Insight` ordinati per priorita
- Regole: tasso chiusura (critico <20%, warning <30%, eccellente >45%), show-up (<50% danger, >80% success), ciclo vendita (>60gg warning), pipeline coverage (<2x warning, >4x success), fatturato perso > generato, trend 3 mesi consecutivi crescita/calo, app→close basso con show-up ok
- 5 tipi visuali: success (verde), warning (ambra), danger (rosso), info (blu), tip (indigo)
- Ogni insight ha icona, titolo, messaggio

**Container update (VenditoriPerformanceReport.tsx)**
- Importare `VenditoriTrend` e `VenditoriInsights`
- Tab "overview": aggiungere `<VenditoriInsights>` dopo il funnel
- Tab "trend": sostituire placeholder con `<VenditoriTrend trend={trend} agentId={agentId} />`

### Note tecniche
- Formattazione: `formatCurrency` e `formatCurrencyCompact` da `src/lib/formatters.ts`
- I dati trend vengono gia fetchati nel container (`useVendorTrend`) — nessun fetch aggiuntivo
- Il componente Insights non fa chiamate API, lavora solo sui dati gia disponibili




## VENDOR-REP-02: KPI Cards + Scorecard Agente

### Cosa viene creato

Sostituzione del componente stub `VenditoriPerformanceReport` con la dashboard completa, più 4 sotto-componenti.

### File da creare/modificare

| File | Azione |
|---|---|
| `src/components/reporting/venditori/VenditoriPerformanceReport.tsx` | Riscrivere — container con selettore agente/periodo, sub-tabs (Panoramica, Ranking, Trend) |
| `src/components/reporting/venditori/KPISection.tsx` | Nuovo — 6 KPI cards con semaforo colori e benchmark |
| `src/components/reporting/venditori/AppuntamentiScorecard.tsx` | Nuovo — scorecard show-up, no-show, conversioni |
| `src/components/reporting/venditori/TempisticheScorecard.tsx` | Nuovo — ciclo vendita medio/min/max con insight |
| `src/components/reporting/venditori/AgentRadarProfile.tsx` | Nuovo — grafico radar agente vs media team (recharts) |

### Dettaglio componenti

**Container (`VenditoriPerformanceReport`)**
- State: `periodo` (PeriodoVendor), `agentId` ("tutti" | uuid), `activeTab`
- Due Select in header: agente (populated da kpiList) e periodo
- Sub-tabs: Panoramica (KPI + scorecards + radar), Ranking (placeholder), Trend (placeholder)
- Funzione `aggregateTeamKPI` per aggregare KPI quando "tutti" selezionato
- Usa hooks esistenti: `useVendorKPI`, `useVendorTrend`, `useVendorFunnel`

**KPISection** — 6 cards in griglia 3x2:
1. Tasso Chiusura (semaforo: >35% verde, 20-35% giallo, <20% rosso)
2. Show-Up Rate (>70% verde, 50-70% giallo, <50% rosso)
3. Fatturato Generato (blu)
4. Importo Medio Chiusura (blu)
5. App→Chiusura (>25% verde, 12-25% giallo, <12% rosso)
6. Ciclo Vendita Medio (<30gg verde, 30-60gg giallo, >60gg rosso)
- Usa `formatCurrency` da `src/lib/formatters.ts` (NON formatCurrencyIT)
- Skeleton loading state

**AppuntamentiScorecard** — Card con:
- Show-up rate prominente con progress bar colorata
- Righe: fissati, effettuati, no-show, app→opp%, app→chiusura%

**TempisticheScorecard** — Card con:
- Valore prominente avg giorni chiusura
- Badge velocita (Rapido/Nella media/Lento)
- Dettaglio: min, max, media perse
- Insight automatico se perse si chiudono piu velocemente delle vinte

**AgentRadarProfile** — Recharts RadarChart:
- 6 dimensioni normalizzate 0-100 vs max del team
- Due serie: Agente selezionato + Media Team
- Visibile solo quando un singolo agente selezionato e ci sono almeno 2 agenti

### Note tecniche
- Formattazione valuta: `formatCurrency` e `formatCurrencyCompact` da `src/lib/formatters.ts`
- Il prompt suggerisce `formatCurrencyIT` che non esiste — uso `formatCurrency`
- Ranking e Trend tabs saranno placeholder per VENDOR-REP-03
- Export default mantenuto per compatibilita con import esistente in ReportisticaPage


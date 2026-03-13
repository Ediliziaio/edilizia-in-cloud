

## Piano: Verifica Integrazione + Export CSV/XLSX + Ottimizzazione Performance

### Verifiche di integrità trovate

1. **Query KPI duplicata Call Center** — `CallCenterReport.tsx` riga 37-40 chiama `useCallCenterKPI(periodo, effectiveOpId)` anche quando `effectiveOpId` è `undefined` (cioè uguale alla query di riga 36). Il commento dice "no duplicate" ma il codice lo fa comunque. Da correggere.

2. **Lazy loading mancante** — Le query `useSpeedToLeadDistribuzione`, `useTrendGiornaliero`, `useFonteLeadPerformance` vengono eseguite sempre, anche quando il tab non è attivo. Da aggiungere `enabled` condizionale.

3. **OperatoriConfronto non memoizzato** — A differenza di `VenditoriConfronto` (già wrappato in `memo()`), `OperatoriConfronto` non lo è.

4. **Export non presente** — Nessuna funzionalità di export CSV/XLSX nei report. L'utility `csvExport.ts` esiste già con `exportToCSV` e `exportToXLSX`.

### Interventi

#### 1. Fix query duplicata Call Center
In `CallCenterReport.tsx`:
- Rimuovere la seconda query `useCallCenterKPI(periodo, effectiveOpId)`
- Quando `operatoreId !== "tutti"`, filtrare da `kpiList` client-side (`kpiList.find(k => k.operatore_id === operatoreId)`)
- Semplifica il `currentKpi` useMemo

#### 2. Lazy loading tab Call Center
Aggiungere `enabled` condizionale a `useSpeedToLeadDistribuzione`, `useTrendGiornaliero`, `useFonteLeadPerformance` nel hook — oppure direttamente in `CallCenterReport.tsx` passando l'enabled:
- Speed: solo quando `subTab === "speed"`
- Trend: solo quando `subTab === "trend"`
- Fonti: solo quando `subTab === "fonti"`

Modificare `useCallCenterReport.ts` aggiungendo parametro `enabled` opzionale ai 3 hook.

#### 3. Memoizzare OperatoriConfronto
Wrappare con `memo()`.

#### 4. Export CSV/XLSX per entrambi i report
Creare `src/components/reporting/shared/ReportExportMenu.tsx` — un `DropdownMenu` con 2 opzioni (CSV, XLSX) che accetta `rows`, `columns`, `filename` e chiama le utility esistenti.

Integrare in:
- `VenditoriPerformanceReport.tsx` — export KPI ranking (tutti gli agenti con tutte le metriche)
- `CallCenterReport.tsx` — export ranking operatori

I dati da esportare: la tabella ranking completa (già disponibile in `kpiList`).

### File coinvolti

| File | Azione |
|---|---|
| `src/components/reporting/shared/ReportExportMenu.tsx` | Nuovo — dropdown export CSV/XLSX |
| `src/components/reporting/callcenter/CallCenterReport.tsx` | Modifica — fix query duplicata, lazy loading, bottone export |
| `src/components/reporting/callcenter/OperatoriConfronto.tsx` | Modifica — aggiungere `memo()` |
| `src/hooks/useCallCenterReport.ts` | Modifica — aggiungere `enabled` ai 3 hook |
| `src/components/reporting/venditori/VenditoriPerformanceReport.tsx` | Modifica — bottone export |


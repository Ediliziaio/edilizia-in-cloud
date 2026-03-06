

# Pulizia, Stabilizzazione e UX — Sezione Previsionale Cassa

## 1. Analisi e pulizia codice

### Codice morto / inutilizzato da rimuovere
- **`src/hooks/useCashFlowData.ts`**: le seguenti proprietà e funzioni sono calcolate ma mai consumate da nessun componente:
  - `cfoKpis` (calcolato riga 544-556, esposto riga 658 — nessun componente lo usa)
  - `chartData` (calcolato riga 570-609 — nessun componente del previsionale lo consuma; il grafico è nel TreasuryTab che ha il proprio chartData)
  - `costsSummary` (calcolato riga 612-621 — mai usato)
  - `suppliers` (calcolato riga 278-288 — mai usato)
  - `pendingItems` (esposto riga 662 — mai usato)
  - `getMaterialCosts` (funzione riga 624-647 — mai usata)
  - `projectCostsForMonth` (funzione riga 442-458 — usata solo internamente per `chartData` e `stats`, rimuovibile se si rimuove chartData)
  - Import `isSameMonth`, `addDays` che diventano inutili dopo rimozione
  - Interfacce `CfoKpis`, `CostsSummary`, `MaterialCosts`, `Supplier` in `forecastTypes.ts` — orfane se non usate altrove (verificare prima)
  - Il type `ChartDataPoint` inline (riga 559-568) — va via con chartData

- **`src/lib/forecastTypes.ts`**: `DateRange` (riga 21-24) — non referenziato da nessun file
- **`CashFlowForecast.tsx`**: import `formatCurrency` (riga 12) — non usato nella pagina stessa
- **`CostsForecastTab.tsx`**: import `startOfDay` (riga 2) — già importato ma verificare se effettivamente usato (sì, riga 51 — OK, tenerlo)

### Import inutili da rimuovere
- `CollectedTab.tsx`: `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` (riga 7) — non più usati dopo refactor preset
- `CollectedTab.tsx`: `cn` (riga 15) — verificare se ancora usato dopo refactor (sì, riga 339 — OK)

## 2. Fix funzionali (bug e warning)

### Bug 1: Warning console "Function components cannot be given refs"
**Causa**: `Calendar` è un function component senza `forwardRef`, ma viene usato dentro `PopoverContent` che cerca di passare un ref.
**Fix**: Wrappare `Calendar` con `React.forwardRef` in `src/components/ui/calendar.tsx`. Aggiungere il parametro `ref` e passarlo tramite un div wrapper o direttamente.

### Bug 2: `filteredCollected` non si resetta correttamente al cambio preset
Quando si seleziona "Questo mese" dopo aver usato "Tutto", `dateFrom` e `dateTo` vengono impostati a `thisMonthStart`/`thisMonthEnd`. Ma il filtro (riga 122-129) controlla `dateFrom || dateTo` — se entrambi sono impostati usa `allCollected`, e compara con `startOfDay(dateFrom)`. Questo funziona, ma "Questo mese" come preset imposta le date, quindi `showingFiltered` (riga 219) diventa `true` e il titolo dice "Periodo personalizzato" anche per "Questo mese".
**Fix**: modificare `showingFiltered` per controllare `activePreset !== "thisMonth"` AND che le date siano effettivamente diverse da quelle di default. Oppure più semplicemente: quando `activePreset === "thisMonth"`, resettare `dateFrom`/`dateTo` a `undefined` (il default già filtra il mese corrente). Rivedere la logica in `applyPreset("thisMonth")`.

### Bug 3: `onSelect` Calendar range con type mismatch
In `CollectedTab.tsx` riga 336, `handleRangeSelect` viene passato come `onSelect` con un cast `as any`. Questo è fragile.
**Fix**: tipizzare correttamente usando `import type { DateRange } from "react-day-picker"` e adattare la firma di `handleRangeSelect`.

### Bug 4: TreasuryTab orders duplicate detection
Il `TreasuryTab` riceve `orders` che sono in realtà `installmentsData` (rate), ma il codice alle righe 166-179 legge `order.deposit_paid`, `order.deposit_2_paid` etc. — queste sono proprietà degli ordini legacy, non delle rate. Questo è un pattern legacy che potrebbe contare doppioni se un ordine ha più rate.
**Nota**: Non è un bug critico se i dati sono migrati correttamente, ma va documentato. Non tocchiamo la logica funzionale come da vincolo.

## 3. Miglioramenti UX

### UX 1: Unificare i filtri data nei tab "Previsionale Costi" e "Previsione di Cassa" con lo stile già usato in "Incassato"
Attualmente `CostsForecastTab` e `CashForecastTab` usano ancora i vecchi `DatePickerButton` separati "Da"/"A". Sostituirli con lo stesso pattern di preset buttons usato in `CollectedTab` (Questo mese / Ultimo trimestre / Quest'anno / Tutto / Personalizzato).

### UX 2: Stato vuoto migliorato
Quando non ci sono dati nelle tabelle, mostrare un messaggio con CTA coerente. Attualmente i messaggi vuoti sono generici. Aggiungere un'icona e un testo più descrittivo.

### UX 3: Feedback immediato su Tesoreria
Il toggle "Mostra/Nascondi Previsionale" non ha feedback visivo. Aggiungere una transizione CSS sull'apparizione delle colonne forecast nel grafico e nella tabella.

### UX 4: Rimuovere `DatePickerButton.tsx` se non più usato
Dopo aver unificato tutti i tab con il nuovo pattern di preset, se `DatePickerButton` non è più importato da nessun file, rimuoverlo.

## 4. Riepilogo modifiche per file

| File | Azione |
|---|---|
| `src/components/ui/calendar.tsx` | Wrap con `forwardRef` per eliminare warning |
| `src/hooks/useCashFlowData.ts` | Rimuovere `cfoKpis`, `chartData`, `costsSummary`, `suppliers`, `pendingItems`, `getMaterialCosts`, `projectCostsForMonth` (se usato solo per chartData), import inutili |
| `src/lib/forecastTypes.ts` | Rimuovere `DateRange`, `CfoKpis`, `CostsSummary`, `MaterialCosts`, `Supplier` (dopo verifica cross-ref) |
| `src/components/forecast/CollectedTab.tsx` | Fix preset "Questo mese" + rimuovere import Select inutili + fix type `onSelect` Calendar |
| `src/components/forecast/CostsForecastTab.tsx` | Unificare filtri data con pattern preset (come CollectedTab) |
| `src/components/forecast/CashForecastTab.tsx` | Unificare filtri data con pattern preset (come CollectedTab) |
| `src/components/forecast/DatePickerButton.tsx` | Rimuovere se non più referenziato (ancora usato da TreasuryTab — tenere per ora) |
| `src/pages/azienda/CashFlowForecast.tsx` | Rimuovere import `formatCurrency` inutile |

## 5. Vincoli rispettati
- Nessun cambio al comportamento funzionale
- Nessuna modifica a file auto-generati (`client.ts`, `types.ts`, `.env`, `config.toml`)
- Solo stabilità, pulizia, UX e performance


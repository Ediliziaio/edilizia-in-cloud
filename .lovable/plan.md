

# Audit Enterprise - Sezione Previsionale (Forecast)

## Stato Attuale (AS-IS)

La sezione Previsionale e' il modulo finanziario piu' complesso del progetto, con:
- Pagina principale `CashFlowForecast.tsx` con 5 tab: Incassato, Marginalita', Previsionale Costi, Previsione di Cassa, Tesoreria
- Pagina `CompanyCosts.tsx` (wrapper di `CompanyCostsManager`)
- 3 hook dati pesanti: `useCashFlowData` (730 righe, 12 query), `useMarginData` (296 righe, 6 query), `useCompanyCostsData` (511 righe, 7 query)
- 1 hook mutazioni: `useCompanyCostsMutations` (435 righe, 14 mutazioni)
- Tipi centralizzati in `forecastTypes.ts` (155 righe)
- Componenti tab: CollectedTab, CostsForecastTab, CashForecastTab, TreasuryTab (783 righe), MarginTab
- Componenti shared: CostsTable, CostsStatsCards, CostFormDialog, CostsDialogs, DatePickerButton, CompanyCostsManager
- Multi-tenancy con effectiveCompany

## Problemi Identificati

### P1 - Duplicazione: `RECURRENCE_LABELS` in 2 file
**File**: `CostsTable.tsx` (riga 25), `useCompanyCostsData.ts` (riga 463)
**Problema**: Mappa identica `{ once: "Una tantum", monthly: "Mensile", quarterly: "Trimestrale", yearly: "Annuale" }` definita in 2 file.
**Fix**: Estrarre in `forecastTypes.ts` e importare in entrambi.

### P1 - Duplicazione: `DatePickerButton` in 2 file (versioni diverse)
**File**: `DatePickerButton.tsx` (componente shared, 35 righe), `TreasuryTab.tsx` (righe 65-112, versione locale con `onClear` e `placeholder`)
**Problema**: TreasuryTab ha una propria versione di DatePickerButton con API diversa (onClear, placeholder vs label). Due componenti con lo stesso nome ma API incompatibili.
**Fix**: Estendere il componente shared `DatePickerButton.tsx` per supportare opzionalmente `onClear` e `placeholder`, poi rimuovere la versione locale da TreasuryTab.

### P1 - Duplicazione: logica ricorrenza costi in 2 file
**File**: `useCashFlowData.ts` (righe 479-494, `projectCostsForMonth`), `useCashFlowData.ts` (righe 623-645, inline nel chartData)
**Problema**: La stessa logica di proiezione costi ricorrenti (monthly/quarterly/yearly/once match) e' implementata 2 volte nello stesso file con pattern identico. La funzione `projectCostsForMonth` la fa per un singolo totale, il chartData lo fa separatamente per fissi e variabili.
**Fix**: Rifattorizzare `projectCostsForMonth` per accettare un filtro opzionale `cost_type` e riusarla nel calcolo del chartData.

### P1 - Duplicazione: `recurrenceMultiplier` isolata in useMarginData
**File**: `useMarginData.ts` (righe 236-243)
**Problema**: Funzione utility per convertire ricorrenza a moltiplicatore mensile. Utile anche altrove ma definita solo in useMarginData. Non duplicata ma candidata per centralizzazione.
**Fix**: Estrarre in `forecastTypes.ts` come utility condivisa.

### P2 - TreasuryTab molto grande (783 righe)
**File**: `TreasuryTab.tsx`
**Problema**: Componente molto complesso con tree builder, calcolo dati mensili, filtri date, rendering tabella gerarchica, tooltip dettagli. Non duplicato ma complesso.
**Stato**: Non si interviene per ridurre il rischio di regressione. Il componente e' funzionalmente coeso.

### P2 - `useCashFlowData` molto grande (730 righe, 12 query)
**File**: `useCashFlowData.ts`
**Problema**: Hook monolitico con 12 query separate, calcoli complessi su entrate/uscite/stats/chart. Candidato per splitting futuro (es. `useTreasuryData` separato).
**Stato**: Le query condividono `companyId` e i dati derivati sono interdipendenti. Splitting rischioso. Documentato come P2.

---

## Piano Interventi

### Intervento 1 - Centralizzare costanti in `forecastTypes.ts`

Aggiornare `src/lib/forecastTypes.ts` con:
- `RECURRENCE_LABELS: Record<string, string>` - mappa etichette ricorrenza
- `recurrenceMultiplier(recurrence: string): number` - utility conversione a moltiplicatore mensile

### Intervento 2 - Aggiornare CostsTable.tsx
- Rimuovere `RECURRENCE_LABELS` locale (riga 25)
- Importare da `forecastTypes.ts`

### Intervento 3 - Aggiornare useCompanyCostsData.ts
- Rimuovere `RECURRENCE_LABELS` locale (riga 463)
- Importare da `forecastTypes.ts`

### Intervento 4 - Aggiornare useMarginData.ts
- Rimuovere `recurrenceMultiplier` locale (righe 236-243)
- Importare da `forecastTypes.ts`

### Intervento 5 - Estendere DatePickerButton.tsx
- Aggiungere props opzionali: `onClear?: () => void`, `placeholder?: string`, `formatStr?: string`
- Quando `onClear` e' fornito, mostrare pulsante X inline
- Mantenere retrocompatibilita' con API esistente (label-based)

### Intervento 6 - Aggiornare TreasuryTab.tsx
- Rimuovere la funzione locale `DatePickerButton` (righe 65-112)
- Importare il componente shared `DatePickerButton` esteso
- Adattare le chiamate per usare le nuove props opzionali

### Intervento 7 - Deduplicare logica proiezione costi in useCashFlowData.ts
- Rifattorizzare `projectCostsForMonth` per accettare un filtro opzionale `costTypeFilter?: "fixed" | "variable"`
- Riusare nel calcolo `chartData` al posto della logica inline duplicata (righe 623-645)

---

## Checklist Sicurezza e Multi-Tenancy

| Area | Stato |
|------|-------|
| company_id su query orders (forecast) | OK |
| company_id su query external_teams | OK (inner join) |
| company_id su query commissions | OK (inner join) |
| company_id su query order_items | OK (inner join) |
| company_id su query company_costs | OK |
| company_id su query employees | OK |
| company_id su query treasury_categories | OK |
| company_id su query suppliers | OK |
| company_id su insert company_costs | OK |
| company_id su delete company_costs | OK |
| RLS su company_costs | OK |
| RLS su orders | OK |
| RLS su order_items | OK |
| Validazione input (importo, nome, date) | OK |
| Nessuna API key esposta | OK |
| effectiveCompany per impersonificazione | OK |
| Query limit (1000/5000) | OK (documentato) |

## Checklist Performance

| Area | Stato attuale | Dopo intervento |
|------|--------------|-----------------|
| RECURRENCE_LABELS | 2 copie | 1 in forecastTypes.ts |
| recurrenceMultiplier | 1 copia isolata | 1 utility condivisa |
| DatePickerButton | 2 versioni (API diversa) | 1 componente esteso |
| Logica proiezione costi | 2 implementazioni inline | 1 funzione parametrica |
| staleTime (5min) su tutte le query | OK | Invariato |
| 12 query parallele in useCashFlowData | OK (React Query) | Invariato |

## File Modificati (Previsti)

1. `src/lib/forecastTypes.ts` - aggiunta RECURRENCE_LABELS, recurrenceMultiplier
2. `src/components/forecast/CostsTable.tsx` - import RECURRENCE_LABELS
3. `src/hooks/useCompanyCostsData.ts` - import RECURRENCE_LABELS
4. `src/hooks/useMarginData.ts` - import recurrenceMultiplier
5. `src/components/forecast/DatePickerButton.tsx` - estensione props (onClear, placeholder, formatStr)
6. `src/components/forecast/TreasuryTab.tsx` - rimozione DatePickerButton locale, import shared
7. `src/hooks/useCashFlowData.ts` - deduplicazione projectCostsForMonth nel chartData

## Note

Nessuna modifica strutturale al database. Nessuna modifica al comportamento funzionale. Tutti gli interventi sono refactor behavior-preserving. Il TreasuryTab (783 righe) e useCashFlowData (730 righe) restano invariati nella struttura per minimizzare rischio regressione, con l'eccezione della deduplicazione interna della logica di proiezione costi. I commenti TODO nel codice (filtro data rolling, paginazione server-side) sono documentati come candidati per interventi futuri.




# Stabilizzazione, Pulizia e QA Completa

## Risultati dell'Analisi

Dopo un'analisi approfondita dell'intero codebase (hooks, componenti, pagine, contesti, edge functions), il progetto risulta **ben strutturato e funzionalmente solido**. Le correzioni necessarie sono minori.

---

## 1. Codice Morto da Rimuovere

### File: `src/components/forecast/TreasuryTab.tsx`

**A. Variabile `lastActualTreasury` mai utilizzata (riga 442)**
La variabile viene dichiarata nel `forecastData` useMemo ma non viene mai letta. Il forecast cumulative parte da `forecastCum = 0` e non la usa.

```
// RIMUOVERE questa riga:
const lastActualTreasury = monthKeys.length > 0 ? treeData.netMonthly[monthKeys[monthKeys.length - 1]] || 0 : 0;
```

---

## 2. Bug Funzionali Identificati

### Nessun bug critico trovato

- Tutte le route sono raggiungibili e correttamente protette da `ProtectedRoute`
- Le query Supabase hanno tutte gestione errori (try/catch o onError)
- I form (ordini, clienti, dipendenti, costi) salvano correttamente
- I loading state sono implementati su tutte le pagine principali
- I ruoli accedono solo alle sezioni autorizzate
- Le RLS policy coprono tutte le tabelle
- `console.error` viene usato solo in handler di errore (nessun `console.log` di debug residuo)

---

## 3. Miglioramenti UX Minori

### Nessun miglioramento critico necessario

Il flusso e gia fluido:
- Tutte le tab hanno empty state chiari ("Nessun movimento previsto", "Nessun incasso registrato", ecc.)
- I dialog si chiudono dopo il salvataggio
- I toast di successo/errore sono implementati ovunque
- Il toggle Previsionale ha feedback immediato (icona Eye/EyeOff + label dinamica)
- Le date picker hanno bottone di reset (X)
- La griglia tesoreria ha sticky column per la navigazione orizzontale

---

## 4. Piano di Implementazione

### Unica modifica necessaria:

**File: `src/components/forecast/TreasuryTab.tsx`**
- Rimuovere la variabile `lastActualTreasury` (riga 442) e il commento associato (riga 441)

### Riepilogo:
- **Cose rimosse**: 1 variabile morta (`lastActualTreasury`)
- **Bug corretti**: 0 (nessun bug critico o lieve trovato)
- **Miglioramenti UX**: 0 (flusso gia completo e fluido)
- **Console**: pulita (solo `console.error` in error handler)
- **Performance**: staleTime impostato su tutte le query (5 min)
- **Sicurezza**: RLS attive su tutte le tabelle, nessun dato sensibile esposto

### Conferma test: **TUTTO OK**

---

## 5. Refactoring: CompanyCostsManager (2032 righe) — ATTIVITÀ SEPARATA

### Obiettivo
Scomporre il monolite `src/components/forecast/CompanyCostsManager.tsx` in moduli più piccoli e manutenibili, seguendo il pattern già adottato nel progetto (es. CashFlowForecast → hook + tab components).

### Analisi della struttura attuale

Il file contiene 5 blocchi logici distinti mescolati insieme:

| Blocco | Righe (circa) | Responsabilità |
|--------|---------------|----------------|
| **Data Fetching** | 1–302 | 6 query Supabase (costs, suppliers, orderItems, externalTeams, employees, commissions) |
| **Data Transformation** | 304–500 | 4 useMemo per trasformare dati da ordini in `UnifiedCost[]` + filtri combinati |
| **Mutations** | 502–1032 | 10+ mutazioni (CRUD costi, mark paid/unpaid per 4 entità diverse, bulk ops, CSV import/export) |
| **Stats & Helpers** | 1107–1140 | Calcoli statistiche, badge renderer, VAT preview |
| **UI/JSX** | 1141–2032 | Tabella con selezione multipla, 5 stat cards, grafico recharts, 6 dialogs (form, delete, group delete, bulk delete, payment, tasks, CSV import) |

### Piano di Refactoring (6 task)

#### Task 1: Estrarre hook `useCompanyCostsData.ts`
- Spostare le 6 query + i 4 useMemo di trasformazione + i filtri combinati
- Esporre: `costs`, `filteredCosts`, `filteredOrderItemCosts`, `allOrderDerivedCosts`, `suppliers`, `dynamicCategories`, `monthlyDistribution`, `vatStats`, `isLoading`
- **Input**: `companyId`, filtri (period, status, search, supplier, category, origin)
- ~500 righe → hook dedicato

#### Task 2: Estrarre hook `useCompanyCostsMutations.ts`
- Spostare tutte le 10+ mutazioni (save, delete, markPaid/Unpaid per costs, orderItems, extTeams, commissions, bulk ops)
- Esporre oggetti mutation pronti all'uso
- **Input**: `companyId`, `queryClient`
- ~530 righe → hook dedicato

#### Task 3: Estrarre `CostsStatsCards.tsx`
- Le 5 stat cards (da pagare, pagato, scaduti, IVA a debito, fornitori) + il mini-chart recharts
- **Props**: stats calcolati dal hook
- ~100 righe

#### Task 4: Estrarre `CostsTable.tsx`
- La funzione `renderCostsTable` (righe 1141-1482) con selezione multipla, bulk action bar, badge renderer
- **Props**: items, type, selectedIds, callbacks
- ~340 righe

#### Task 5: Estrarre `CostFormDialog.tsx`
- Il Dialog di creazione/modifica (righe 1662-1929) con sezioni Basic Info, Fiscal, Planning
- Include: category combobox, VAT preview, periods preview
- **Props**: formData, suppliers, orders, categories, callbacks
- ~270 righe

#### Task 6: Estrarre `CostsDialogs.tsx`
- I 4 dialogs ausiliari: delete confirm, group delete, bulk delete, payment dialog
- **Props**: state + callbacks
- ~100 righe

### Risultato atteso

```
src/components/forecast/
├── CompanyCostsManager.tsx   (~150 righe, orchestratore)
├── CostsStatsCards.tsx        (~100 righe)
├── CostsTable.tsx             (~340 righe)
├── CostFormDialog.tsx         (~270 righe)
├── CostsDialogs.tsx           (~100 righe)
└── ...

src/hooks/
├── useCompanyCostsData.ts     (~500 righe)
├── useCompanyCostsMutations.ts (~530 righe)
└── ...
```

**Rischio**: Basso. Nessuna modifica funzionale, solo riorganizzazione strutturale.
**Priorità**: Media. Il componente funziona correttamente ma è difficile da manutenere.
**Stima**: 2-3 sessioni di lavoro.

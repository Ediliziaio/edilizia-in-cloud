

# Sprint 4 — Consolidamento UX: Piano di Implementazione

Sprint 1, 2 e 3 sono completati. Si procede con lo Sprint 4 finale del documento di analisi.

---

## 1. Ridurre duplicazione metriche tra Dashboard e Cruscotto

**File:** `src/pages/azienda/CompanyDashboard.tsx`
- Rimuovere la stat card "Da Incassare" dalla griglia delle 4 stat cards (è già nel CEO Strip e nel Cruscotto). Sostituirla con una card "Prossimi Lavori" che mostra il conteggio dei lavori in settimana (dato già disponibile in `weeklyDeadlines.upcomingWorks`).
- Aggiungere un link "Vai al Cruscotto →" sotto il CEO Strip per guidare l'utente alla vista executive.

**File:** `src/components/cruscotto/ExecutiveOverview.tsx`
- Ridurre le KPI Finanziarie visibili in home da 11 a 8: rimuovere "Proiezione Mese", "Costo Medio Ordine" e "Burn Rate" dalla vista default. Aggiungerle in una sezione espandibile "Mostra tutte" con un `Collapsible`.

---

## 2. Rinominare HRPerformance e spostare PipelineForecast

**File:** `src/components/cruscotto/HRPerformance.tsx`
- Rinominare il titolo "HR & Performance Team" → "Performance Venditori".

**File:** `src/pages/azienda/CruscottoAziendale.tsx`
- Spostare `PipelineForecast` dal tab "Finanza" al tab "Vendite" (logicamente appartiene lì come indicato nel documento).
- Tab Finanza: solo `FinanzaCashFlow` (full width).
- Tab Vendite: `SalesControl` + `PipelineForecast` + `HRPerformance` in grid.

---

## 3. Colonna Categoria visibile nella CostsTable

**File:** `src/components/forecast/CostsTable.tsx`
- Aggiungere colonna "Categoria" nella tabella costi, dopo la colonna "Fornitore", con `Badge` colorato per tipo categoria. Usa palette fissa (5-6 colori mappati alle categorie più comuni).

---

## 4. ScatterPlot Ricavi vs Margine nel MarginTab

**File:** `src/components/forecast/MarginTab.tsx`
- Aggiungere sotto la tabella ordini un `ScatterChart` (recharts, già installato) che mostra ogni ordine come punto: asse X = ricavo totale, asse Y = margine %. Colore punto basato sullo status margine (rosso/giallo/verde). Tooltip con descrizione ordine. Altezza ~250px.

---

## 5. Tesoreria: color-coding e saldo finale

**File:** `src/components/forecast/TreasuryTab.tsx`
- Aggiungere color-coding nelle celle dei valori mensili: verde per valori positivi, rosso per negativi, grigio per zero.
- Aggiungere una card "Saldo Finale Periodo" evidenziata sopra il grafico, che mostra la somma netta di tutte le categorie nell'ultimo mese visibile, con colore condizionale verde/rosso.

---

## Riepilogo file

| File | Modifica |
|------|----------|
| `src/pages/azienda/CompanyDashboard.tsx` | Rimuovere duplicazione "Da Incassare", aggiungere link Cruscotto |
| `src/components/cruscotto/ExecutiveOverview.tsx` | KPI collassabili (8 visibili + 3 espandibili) |
| `src/components/cruscotto/HRPerformance.tsx` | Rinominare in "Performance Venditori" |
| `src/pages/azienda/CruscottoAziendale.tsx` | Spostare PipelineForecast nel tab Vendite |
| `src/components/forecast/CostsTable.tsx` | Colonna Categoria con badge colorato |
| `src/components/forecast/MarginTab.tsx` | ScatterPlot ricavi vs margine |
| `src/components/forecast/TreasuryTab.tsx` | Color-coding + Saldo Finale |


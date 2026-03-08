

# Sprint 5 — Completamento Finale: Piano di Implementazione

Tutti i 4 sprint principali sono completati. Restano gli item di media/bassa priorità dal documento non ancora implementati.

---

## 1. BarChart stacked uscite per categoria nel CostsForecastTab

**File:** `src/components/forecast/CostsForecastTab.tsx`
- Aggiungere un `BarChart` stacked sotto la hero card con 4 serie (Squadre, Provvigioni, Fornitori, Costi Az.) raggruppate per mese nel periodo filtrato.
- Calcolare i dati aggregandoli mensilmente dai 4 array filtrati già disponibili.
- Altezza ~220px, colori coerenti con le etichette nella hero card.

---

## 2. Filtro periodo su LaborCosts e SupplierPayments

**File:** `src/components/dashboard/LaborCostsStats.tsx`
- Accettare prop `dateRange?: { from: Date; to: Date }` e usarla per filtrare le query Supabase per mese (attualmente hardcoded a mese corrente).

**File:** `src/components/dashboard/SupplierPaymentsSummary.tsx`
- Accettare prop `dateRange?: { from: Date; to: Date }` e usarla per filtrare i dati per periodo.

**File:** `src/pages/azienda/CompanyDashboard.tsx`
- Passare il `dateRange` dai filtri globali ai due componenti sopra.

---

## 3. Bottone "Refresh dati" con timestamp ultimo aggiornamento

**File:** `src/pages/azienda/CompanyDashboard.tsx`
- Aggiungere un bottone "Aggiorna" nell'header accanto ai filtri con `RefreshCw` icon.
- Mostrare `Ultimo aggiornamento: HH:mm` basato su `dataUpdatedAt` di react-query.
- Il click invalida le query principali del dashboard.

---

## 4. LineChart tendenza costi fissi % nel tempo

**File:** `src/components/forecast/CostsStatsCards.tsx`
- Aggiungere un `LineChart` che mostra la percentuale di costi fissi sul totale per mese (ultimi 12 mesi).
- Dati calcolati dai costi esistenti, raggruppando per mese e calcolando `fissi / (fissi + variabili) * 100`.

---

## 5. Espansione selezione anno nella sezione Costi

**File:** `src/components/forecast/CostsStatsCards.tsx`
- Sostituire lo switch anno (anno corrente / anno-1) con un `Select` dropdown che mostra tutti gli anni dal primo costo registrato ad oggi.
- Modificare `useCompanyCostsData` per determinare dinamicamente il primo anno disponibile.

---

## 6. Linea cumulativa nel grafico Tesoreria

**File:** `src/components/forecast/TreasuryTab.tsx`
- Nel `ComposedChart` esistente, aggiungere una `Line` per il saldo netto cumulativo (somma running delle categorie mese per mese).
- Colore distinto (es. nero/grigio scuro) con strokeWidth 2 e label "Saldo Cumulativo".

---

## Riepilogo file

| File | Modifica |
|------|----------|
| `src/components/forecast/CostsForecastTab.tsx` | BarChart stacked uscite per categoria |
| `src/components/dashboard/LaborCostsStats.tsx` | Prop dateRange per filtro periodo |
| `src/components/dashboard/SupplierPaymentsSummary.tsx` | Prop dateRange per filtro periodo |
| `src/pages/azienda/CompanyDashboard.tsx` | Passaggio dateRange + bottone Refresh |
| `src/components/forecast/CostsStatsCards.tsx` | LineChart fissi % + dropdown anno espanso |
| `src/components/forecast/TreasuryTab.tsx` | Linea cumulativa nel grafico |


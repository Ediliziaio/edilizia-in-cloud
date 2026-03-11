

# Piano: Filtri data per Lead/Appuntamenti + Ottimizzazione spazi

## 1. Filtri data per TodayFocus — Lead e Appuntamenti

**File:** `src/components/cruscotto/TodayFocus.tsx`

Aggiungere un mini date-picker inline sopra le tile "Lead oggi" e "Appuntamenti oggi" con preset rapidi (Oggi, Ieri, 7gg, 30gg, Custom). Quando l'utente cambia data, i conteggi lead e appuntamenti si aggiornano di conseguenza, mentre "Crediti scaduti" e "Fornitori 7gg" restano invariati (sono sempre live).

**File:** `src/hooks/useCruscottoData.ts`

Modificare la query `cruscotto-today` per accettare `dateFrom`/`dateTo` come parametri invece di usare sempre "oggi". Aggiornare le query `marketing_contacts` e `appointments` per usare il range selezionato. I label delle tile cambieranno dinamicamente ("Lead oggi" → "Lead 7gg" etc.).

**File:** `src/pages/azienda/CruscottoAziendale.tsx`

Passare lo stato filtro data a `TodayFocus` e gestire il callback di aggiornamento.

## 2. Ottimizzazione spazi bianchi

**File:** `src/pages/azienda/CruscottoAziendale.tsx`

- Ridurre `space-y-6` a `space-y-4` per il container principale
- Ridurre i `gap-6` nelle griglie a `gap-4`
- Compattare l'header (ridurre padding)

**File:** `src/components/cruscotto/CruscottoHero.tsx`

- Ridurre padding interno delle card da `p-5` a `p-4`

**File:** `src/components/cruscotto/CashFlowForecast.tsx` e `FinanzaCashFlow.tsx`

- Compattare spacing interno (`space-y-5` → `space-y-3`)

## 3. Verifiche integrazione

- Confermare che `TodayFocus` riceva correttamente i dati filtrati
- Confermare che le query keys includano i parametri data per evitare cache stale
- Verificare che i label dinamici ("oggi", "ieri", "ultimi 7gg") si aggiornino coerentemente

## File coinvolti

| File | Modifica |
|------|----------|
| `src/components/cruscotto/TodayFocus.tsx` | Aggiungere filtri data inline + label dinamici |
| `src/hooks/useCruscottoData.ts` | Parametrizzare query today con date range |
| `src/pages/azienda/CruscottoAziendale.tsx` | Stato filtro + riduzione spacing globale |
| `src/components/cruscotto/CruscottoHero.tsx` | Compattare padding |
| `src/components/cruscotto/CashFlowForecast.tsx` | Compattare spacing |
| `src/components/cruscotto/FinanzaCashFlow.tsx` | Compattare spacing |


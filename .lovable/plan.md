

# Audit Completo Area Azienda + Pulizia Codice Morto

## Analisi Funzionamento

Tutte le sezioni della sidebar sono state analizzate e risultano funzionanti:
- **Dashboard**: query parallele, stat cards, alert finanziari, quick actions -- OK
- **Ordini**: tabella paginata (20/pagina), pipeline kanban, filtri, bulk actions, CSV import/export -- OK
- **Magazzino**: 3 viste + tab giacenze, filtri, export -- OK
- **Calendario**: 4 viste (mese, gantt, settimana, heatmap), appuntamenti -- OK
- **Clienti**: CRUD, reset password, dettaglio con ordini collegati -- OK
- **Ticket Clienti**: lista con filtri, badge priorita -- OK
- **Previsionale**: 5 tab (incassi, costi, cash flow, tesoreria, marginalita) -- OK
- **Costi**: wrapper su CompanyCostsManager -- OK
- **Attivita**: filtri, stat cards, link ordini -- OK
- **Errori**: stat cards, grafici Recharts, tabella -- OK
- **Messaggistica**: gate beta con flag company -- OK
- **Impostazioni**: 10 tab admin, 5 staff -- OK

## Problemi Trovati e Fix

### 1. Antipattern: `useMemo` con side effect (Priorita: Alta)
**File**: `src/pages/azienda/OrdersList.tsx` (riga ~417)
```typescript
// SBAGLIATO: setState dentro useMemo (side effect in fase render)
useMemo(() => { setCurrentPage(1); }, [filterKey]);
```
**Fix**: sostituire con `useEffect` che e il hook corretto per side effects.

### 2. Import morto: `Separator` in Settings (Priorita: Bassa)
**File**: `src/pages/azienda/Settings.tsx` (riga 6)
`Separator` e importato ma mai usato nel JSX.
**Fix**: rimuovere l'import.

### 3. Import morto: `CardContent, CardDescription` in Settings (Priorita: Bassa)
**File**: `src/pages/azienda/Settings.tsx` (riga 5)
`CardContent` e `CardDescription` sono importati da `@/components/ui/card` ma usati solo dentro il tab "profilo". Verifico che siano effettivamente usati... Si, sono usati nelle Card del profilo. Non sono dead code.

### 4. Righe vuote doppie in CompanyLayout (Priorita: Bassa)
**File**: `src/components/layouts/CompanyLayout.tsx`
Ci sono righe vuote consecutive nell'array `allNavItems` (residuo della rimozione di "Personale").
**Fix**: rimuovere le righe vuote extra.

### 5. Righe vuote doppie in App.tsx (Priorita: Bassa)
**File**: `src/App.tsx` (righe 167-168)
Righe vuote consecutive residue dalla rimozione della rotta "personale".
**Fix**: rimuovere la riga vuota extra.

## Riepilogo Interventi

| File | Intervento |
|------|-----------|
| `src/pages/azienda/OrdersList.tsx` | Sostituire `useMemo` con `useEffect` per reset pagina |
| `src/pages/azienda/Settings.tsx` | Rimuovere import `Separator` non usato |
| `src/components/layouts/CompanyLayout.tsx` | Pulire righe vuote doppie in `allNavItems` |
| `src/App.tsx` | Pulire righe vuote doppie nelle rotte |

Nessun file da eliminare. Nessuna modifica funzionale, solo pulizia codice e fix di un antipattern React.


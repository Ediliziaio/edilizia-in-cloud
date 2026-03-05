

# Persistenza Layer + Pulizia e Stabilizzazione Calendario

## 1. Persistenza preferenze layer in localStorage

**File: `src/pages/azienda/Calendar.tsx`**

Creare un hook/logica che:
- Al mount, legge da `localStorage` la chiave `calendar-layer-prefs` (JSON con `showPosa`, `showLavoro`, `showAppuntamento`, `showMerce`, `showGoogleBusy`, `visibleEmployeeIds`, `visibleTeamIds`, `layerPanelOpen`)
- Inizializza gli state con i valori salvati (fallback ai default attuali)
- Ad ogni cambio di questi state, salva in localStorage (debounce con `useEffect`)

## 2. Sezioni collassabili nel pannello Layer

**File: `src/components/calendar/CalendarLayerPanel.tsx`**

Le sezioni "Calendario Lavori" e "Calendario Magazzino" usano già `<Collapsible defaultOpen>`. Funzionano correttamente come collassabili. Il `ChevronDown` nell'header fa da trigger. Nessun intervento necessario: la funzionalità c'e' già.

## 3. Fix console warning (ref su function component)

Il warning "Function components cannot be given refs" viene da `CalendarMonthView` che passa `TooltipProvider` e `AppointmentDialog` come children senza `forwardRef`.

**File: `src/components/calendar/CalendarMonthView.tsx`**
- L'`AppointmentDialog` viene renderizzato dentro la `Card` ma non è wrappato in un `TooltipTrigger` (che richiede ref). Il warning probabilmente viene dal fatto che `TooltipProvider` è passato come child diretto al grid. Verificare e risolvere togliendo eventuali `ref` impliciti o usando `forwardRef` dove necessario.

## 4. Pulizia codice

- Rimuovere righe vuote extra (linee 38-39 in `CalendarMonthView`, linee 43-44 in `CalendarWeekView`)
- Verificare che non ci siano import inutilizzati nei file toccati
- Il `Badge` import in `Calendar.tsx` è usato. `Collapsible` import è usato. Tutto ok.

## Riepilogo file da modificare

| File | Cosa |
|------|------|
| `src/pages/azienda/Calendar.tsx` | Persistenza localStorage per tutti gli state del layer panel |
| `src/components/calendar/CalendarLayerPanel.tsx` | Nessuna modifica (collapsible già funzionante) |
| `src/components/calendar/CalendarMonthView.tsx` | Fix warning ref, pulizia righe vuote |
| `src/components/calendar/CalendarWeekView.tsx` | Pulizia righe vuote |




# Audit e Stabilizzazione del Progetto

## 1. Pulizia Codice - Import Inutilizzati

### File: `src/components/layouts/CompanyLayout.tsx`
- Rimuovere `AvatarImage` dall'import (riga 23) -- non piu usato dopo la sostituzione del logo con `<img>`

### File: `src/components/layouts/CustomerLayout.tsx`
- Rimuovere `Avatar`, `AvatarFallback`, `AvatarImage` dall'intero import (riga 12) -- nessuno di questi componenti e' utilizzato nel corpo del componente dopo le modifiche recenti al logo

## 2. Fix Funzionali

### Console Warning: "Function components cannot be given refs" in `CostsTable.tsx`
- **Problema**: Il componente `Tooltip` di Radix riceve un ref che non puo gestire. L'errore compare perche `TooltipProvider` wrappa ciascuna `Tooltip` inline (uno per cella della tabella), creando provider multipli annidati
- **Soluzione**: Rimuovere tutti i `<TooltipProvider>` inline individuali nel file `CostsTable.tsx` -- il provider globale in `App.tsx` gia copre tutta l'applicazione. Questo elimina il warning in console e migliora leggermente la performance (meno componenti React nel tree)

### Bug tab "Stati" nelle Impostazioni (gia corretto)
- Il fix con `useEffect` + `queryData` applicato nella conversazione precedente risolve il problema di stati che scompaiono al cambio tab

## 3. Miglioramenti UX

Nessun intervento UX specifico rilevato in questa analisi -- i flussi principali funzionano correttamente. Il fix dei warning in console migliora la pulizia dell'esperienza di sviluppo.

## 4. Riepilogo Modifiche

| Tipo | File | Modifica |
|------|------|----------|
| Pulizia | `CompanyLayout.tsx` | Rimuovere import `AvatarImage` |
| Pulizia | `CustomerLayout.tsx` | Rimuovere import `Avatar, AvatarFallback, AvatarImage` |
| Bug Fix | `CostsTable.tsx` | Rimuovere tutti i `TooltipProvider` wrapper inline (circa 7 occorrenze) |

## Dettaglio tecnico

### `CostsTable.tsx`
Rimuovere tutte le istanze di `<TooltipProvider>` e `</TooltipProvider>` che wrappano singole `<Tooltip>`. Rimuovere anche `TooltipProvider` dall'import in cima al file. Il `TooltipProvider` globale gia presente in `App.tsx` garantisce il funzionamento corretto dei tooltip.

### `CompanyLayout.tsx`
Cambiare riga 23 da:
```
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
```
a:
```
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
```

### `CustomerLayout.tsx`
Rimuovere completamente riga 12:
```
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
```


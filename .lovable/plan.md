

# Unificare i filtri data del tab "Incassato" con lo stile Dashboard

## Problema attuale
Nel tab "Incassato" del Previsionale Cassa, i filtri data usano due pulsanti separati "Da" e "A" più una riga di preset sotto. La Dashboard invece usa un design unificato: preset in una barra con bordo, e l'opzione "Personalizzato" che apre direttamente il calendario range.

## Modifiche

**File: `src/components/forecast/CollectedTab.tsx`**

Sostituire l'attuale sistema di filtri (righe 283-315) con il pattern della Dashboard:
- Una singola barra con bordo contenente i preset: **Questo mese**, **Ultimo trimestre**, **Quest'anno**, **Tutto**, **Personalizzato**
- Il pulsante "Personalizzato" apre un `Popover` con `Calendar mode="range"` a 2 mesi (identico alla Dashboard)
- Quando "Personalizzato" è attivo, mostra le date selezionate nel pulsante (es. "05 mar – 31 mar")
- Rimuovere i due `DatePickerButton` separati "Da" e "A"
- La barra di ricerca resta accanto ai preset

Stato attivo evidenziato con `variant="default"` (come in Dashboard), gli altri `variant="ghost"`.

Nessuna modifica alla logica di filtraggio sottostante — solo il layout e l'interazione UX cambiano.


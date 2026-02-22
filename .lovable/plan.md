

# Fix: Nomi Fasi Non Visibili nella Kanban + Miglioramento Card

## Problema identificato

Le colonne della kanban mostrano il conteggio ("2 Opportunita - EUR 0,00") ma il nome della fase (es. "Da Chiamare", "Non risponde") non appare visibile. I dati sono corretti nel database e nel codice. Il problema e che l'`h3` con `stage.name` viene renderizzato ma potrebbe non essere visibile a causa di un problema di stile/rendering.

Dalla comparazione con lo screenshot GHL, emergono anche differenze importanti nella card:
- GHL mostra **etichette** per ogni campo: "Fonte dell'opportunita:", "Valore dell'opportunita:", "Email del contatto:", "Telefono del contatto:"
- La card attuale mostra solo i valori senza etichette, rendendo difficile capire cosa si sta guardando

## Modifiche previste

### 1. Fix header colonne kanban

**File**: `src/components/opportunities/OpportunityKanbanView.tsx`

Il tag `h3` con `stage.name` (linea 25) viene renderizzato ma potrebbe essere troncato o non visibile. Verifichero che:
- Il testo non sia troncato con `truncate` in modo eccessivo
- Il font size e peso siano sufficienti
- Aggiungo un fallback visivo se il nome e vuoto (non dovrebbe essere il caso, ma per sicurezza)

### 2. Card stile GHL con etichette

**File**: `src/components/opportunities/OpportunityCard.tsx`

Aggiornare la card per mostrare le etichette come in GHL:
- "Fonte dell'opportunita: Facebook Bluesolar"
- "Valore dell'opportunita: EUR 0,00"
- "Email del contatto: email@esempio.com"
- "Telefono del contatto: +393483467567"

Formato: testo grigio per l'etichetta, testo nero per il valore, tutto sulla stessa riga con `truncate` per i valori lunghi.

### 3. Debug rendering

Per sicurezza, aggiungero un `console.log` temporaneo (che poi rimuovo) per verificare che `stage.name` arrivi correttamente al componente. Se il problema e un race condition o un dato mancante, lo correggo nella query.

## File modificati (2)

1. **`src/components/opportunities/OpportunityKanbanView.tsx`** - Fix visibilita nome fase nell'header della colonna
2. **`src/components/opportunities/OpportunityCard.tsx`** - Aggiunta etichette GHL-style per fonte, valore, email, telefono


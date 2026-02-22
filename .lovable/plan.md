

# Stabilizzazione e Miglioramento Opportunita - Piano Completo

## Bug critico trovato

**"Maximum update depth exceeded"** in `OpportunityDetailDialog.tsx` (linea 102). I due `useEffect` per sincronizzare `contactFieldValues` e `oppFieldValues` creano nuovi oggetti `Record` ad ogni render, causando un loop infinito di setState. Questo causa freeze della UI e re-render continui.

**Causa**: `contactFieldValues` e `oppFieldValues` sono array che cambiano riferimento ad ogni query refetch, ma il `useEffect` non confronta i valori prima di fare `setState`, creando un ciclo: setState -> re-render -> useEffect -> setState -> ...

## Modifiche previste

### 1. Fix bug critico - Loop infinito in OpportunityDetailDialog.tsx

**File**: `src/components/opportunities/OpportunityDetailDialog.tsx`

Sostituire i due `useEffect` problematici (linee 96-106) con una logica che confronta i valori prima di aggiornare lo stato. Usare `JSON.stringify` per evitare re-render inutili oppure spostare la sincronizzazione dentro il `useEffect` principale che si attiva su `opportunity`.

Approccio: unificare la sincronizzazione dei custom field values nell'effetto principale (linea 75) che dipende da `opportunity`, aggiungendo `contactFieldValues` e `oppFieldValues` come dipendenze con un guard di confronto.

### 2. Dialog piu grande

**File**: `src/components/opportunities/OpportunityDetailDialog.tsx`
- Cambiare `max-w-3xl` a `max-w-5xl` e `max-h-[90vh]` a `max-h-[92vh]`

**File**: `src/components/opportunities/OpportunityDialog.tsx`
- Cambiare `max-w-2xl` a `max-w-4xl` e `max-h-[85vh]` a `max-h-[92vh]`

### 3. Creazione nuovo contatto dal dialog dettaglio

**File**: `src/components/opportunities/OpportunityDetailDialog.tsx`

Aggiungere un pulsante "Cambia contatto" sotto il nome del contatto primario che apre un combobox/inline form (simile a quello del dialog di creazione) per:
- Cercare un contatto esistente e associarlo
- Creare un nuovo contatto inline (nome, email, telefono) e associarlo all'opportunita

### 4. Pulizia codice

**File**: `src/components/opportunities/OpportunityCard.tsx`
- Rimuovere il commento morto `// removed handleCopyName` (linea 71)

**File**: `src/components/opportunities/OpportunityDetailDialog.tsx`
- Rimuovere import `Textarea` se non usato nella tab details (viene usato nelle note, quindi resta)
- Verificare che tutti gli import siano necessari

### 5. Miglioramenti UX

**File**: `src/components/opportunities/OpportunityDetailDialog.tsx`
- Aggiungere `toast.success` dopo il salvataggio andato a buon fine (attualmente chiude il dialog senza feedback)
- Aggiungere stato di loading sul pulsante "Aggiorna" con `Loader2` (gia presente ma verificare che funzioni)
- Disabilitare il pulsante "Aggiorna" se non ci sono modifiche (opzionale, basso priorita)

**File**: `src/components/opportunities/OpportunityDialog.tsx`
- Il dropdown contatti scompare con `onBlur` dopo 200ms - aumentare a 300ms per evitare click mancati su mobile

---

## Dettaglio tecnico

### File modificati (3)

1. **`src/components/opportunities/OpportunityDetailDialog.tsx`**
   - Fix loop infinito: sostituire i due useEffect con sincronizzazione sicura usando `useMemo` per creare i valori iniziali e sincronizzare solo quando l'`opportunity.id` cambia
   - Dialog piu grande: `max-w-5xl`
   - Aggiungere sezione "Cambia contatto" con combobox di ricerca + form inline per nuovo contatto
   - Toast di successo al salvataggio

2. **`src/components/opportunities/OpportunityDialog.tsx`**
   - Dialog piu grande: `max-w-4xl`
   - Fix timeout onBlur da 200ms a 300ms

3. **`src/components/opportunities/OpportunityCard.tsx`**
   - Rimuovere commento morto linea 71

### Flusso "Cambia contatto" nel dialog dettaglio

```text
[Nome contatto primario (read-only)]  [Pulsante "Cambia"]
                |
                v (click "Cambia")
[Input ricerca contatto con dropdown]
  - Lista contatti filtrati
  - "+ Crea nuovo contatto" in fondo
                |
                v (seleziona esistente)
  Aggiorna contact_id sull'opportunita al salvataggio
                |
                v (crea nuovo)
  Form inline: Nome, Email, Telefono
  Al salvataggio: crea contatto -> aggiorna contact_id
```

### Elenco bug corretti
1. **Loop infinito** (Maximum update depth exceeded) - useEffect senza guard in OpportunityDetailDialog
2. **Commento morto** in OpportunityCard

### Elenco miglioramenti UX
1. Dialog piu grandi (5xl dettaglio, 4xl creazione)
2. Toast feedback al salvataggio
3. Timeout onBlur aumentato per mobile
4. Possibilita di cambiare contatto dal dettaglio


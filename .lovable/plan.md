

## Piano: Bottone Salva nel Config Panel + Fix Riconnessione Edge alla Cancellazione

### Problemi

**1. Manca il bottone "Salva" nel pannello config del nodo**
Il pannello di configurazione (`FlowBuilderConfigPanel.tsx`) ha solo "Elimina nodo". L'utente si aspetta un bottone "Salva" per confermare le modifiche al nodo (etichetta, filtri, ecc.) e chiudere il pannello.

**2. Bug: cancellando un nodo sparisce il "+" di collegamento**
In `handleDeleteNode` (riga 491-499 di `FlowBuilderPage.tsx`), quando si cancella un nodo le edge vengono rimosse con `filter`, ma NON viene creata una nuova edge tra il nodo precedente e il nodo successivo. Esempio: Trigger → Azione → Fine → se cancelli Azione, spariscono entrambe le edge e non viene ricreata Trigger → Fine.

---

### Fix

**File 1: `FlowBuilderConfigPanel.tsx`**
- Aggiungere un bottone "Salva configurazione" (variant `default`, icona `Save`) sopra al bottone "Elimina nodo"
- Il click chiama `onClose()` (le modifiche sono già applicate in tempo reale via `handleChange`, il salvataggio effettivo avviene col "Salva" in header — ma il bottone nel pannello conferma visivamente e chiude)

**File 2: `FlowBuilderPage.tsx` — `handleDeleteNode`**
- Prima di rimuovere le edge, trovare tutte le edge in ingresso (`target === nodeId`) e in uscita (`source === nodeId`)
- Per ogni coppia (source → nodo → target), creare una nuova edge `source → target` di tipo `addStep` con callback `onAddStep`
- Poi rimuovere le edge vecchie e il nodo
- Persistere: rimuovere le connessioni vecchie dal builder e aggiungere quelle nuove

```text
Prima:   A ──edge1──> [NODO] ──edge2──> B
Dopo:    A ──newEdge──> B
```

### File da modificare

| File | Modifica |
|------|----------|
| `FlowBuilderConfigPanel.tsx` | Aggiungere bottone "Salva" che chiude il pannello |
| `FlowBuilderPage.tsx` | Riconnettere edge quando si cancella un nodo intermedio |


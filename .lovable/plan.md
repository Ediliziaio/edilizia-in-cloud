

# Checkbox selezione multipla nelle Attività

## Problema
Attualmente il checkbox nella tabella Attività (riga 206-209 di `Tasks.tsx`) chiama `handleToggleComplete` che cambia lo stato del task a "completata". L'utente vuole invece che il checkbox serva per **selezionare righe** e abilitare **azioni multiple** (bulk actions), non per completare il task.

## Piano

### 1. Aggiungere stato di selezione in `Tasks.tsx`
- Nuovo state `selectedIds: Set<string>` per tracciare le righe selezionate
- Checkbox nell'header della tabella per "seleziona tutti / deseleziona tutti"
- Checkbox per riga: toggle della selezione, **non** cambia lo stato del task

### 2. Barra azioni multiple (bulk actions bar)
- Quando `selectedIds.size > 0`, mostrare una barra sopra la tabella con:
  - Conteggio: "X attività selezionate"
  - Bottone **"Segna come completate"** → chiama update su tutti i task selezionati
  - Bottone **"Elimina"** → con conferma AlertDialog
  - Bottone **"Cambia priorità"** → dropdown per scegliere priorità
  - Bottone **"Deseleziona"** → svuota selezione

### 3. Preservare il completamento rapido
- Aggiungere un piccolo bottone/icona (CheckCircle) nella colonna "Stato" per il completamento rapido singolo, così la funzionalità non viene persa

### File da modificare
| File | Modifica |
|------|----------|
| `src/pages/azienda/Tasks.tsx` | Stato selezione, checkbox header, bulk actions bar, rimuovere toggle-complete dal checkbox |


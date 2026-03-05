

# Pulizia Calendario Lavori — Layout pulito e ordinato

## Problemi attuali

La pagina ha troppi elementi visibili simultaneamente:
- 4 filtri Select sempre aperti in una riga
- Badge contatori + badge "non pianificati" nella stessa riga
- Toggle viste (Mese/Settimana/Carico/Gantt) in una seconda riga
- 3 bottoni azione (Sync Google, Appuntamento, Oggi) nella stessa riga
- Tutto visibile contemporaneamente = "mapazzone"

## Interventi

### 1. Compattare header — una sola riga pulita
Titolo a sinistra, toggle viste al centro, azioni a destra. Una sola riga.

### 2. Filtri collassabili
Nascondere i 4 filtri dietro un bottone "Filtri" con icona `SlidersHorizontal`. Al click si espande un pannello sotto l'header. Badge con contatore filtri attivi visibile sul bottone.

### 3. Azioni raggruppate
- Bottone "Oggi" integrato nella navigazione mese (accanto alle frecce < >)
- "Appuntamento" e "Sync Google" restano come bottoni compatti nell'header

### 4. Badge contatori dentro il pannello filtri
I badge (N ordini, N non pianificati) si spostano dentro il pannello filtri espanso, non occupano spazio quando i filtri sono chiusi.

## File da modificare

| File | Intervento |
|------|-----------|
| `src/pages/azienda/Calendar.tsx` | Riorganizzare layout: header compatto, filtri collassabili con `Collapsible`, spostare badge |

Nessun componente figlio da toccare. La logica dati e i props restano identici.


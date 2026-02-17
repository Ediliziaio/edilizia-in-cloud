
# Redesign: Selettore Impersonazione in stile Popover in alto

## Obiettivo
Spostare il selettore "Accesso Rapido" dalla parte bassa della sidebar a un bottone in alto (sotto il logo), che apre un **Popover** con campo di ricerca e lista aziende, come nel design di riferimento.

## Design

Il bottone sara posizionato tra il logo e la navigazione. Cliccandolo si apre un Popover con:
- Campo di ricerca "Cerca un'azienda..."
- Sezione "TUTTE LE AZIENDE" con lista scrollabile
- Ogni riga mostra: iniziale (avatar colorato), nome azienda, indirizzo/info secondaria
- Click su un'azienda avvia l'impersonazione

## Modifiche tecniche

### File: `src/components/layouts/AdminLayout.tsx`

1. **Rimuovere** la sezione `SidebarGroup` "Accesso Rapido" (righe 146-206) con il toggle inline
2. **Aggiungere** un bottone Popover subito dopo il logo (riga 98), dentro il div `h-14`:
   - Importare `Popover, PopoverTrigger, PopoverContent` da `@/components/ui/popover`
   - Il trigger e un bottone con icona `ChevronsUpDown` e testo "Accedi come azienda..." (troncato)
   - Stile: bordo sottile, sfondo trasparente, larghezza piena
3. **PopoverContent** contiene:
   - Input di ricerca con icona `Search`
   - Separatore
   - Label "TUTTE LE AZIENDE" in maiuscolo, grigio, piccolo
   - `ScrollArea` con `max-h-[300px]` contenente le aziende
   - Ogni azienda: avatar con iniziale colorata (cerchio), nome in grassetto, sotto-testo opzionale
   - Click chiude il popover e avvia impersonazione
4. Lo stato `showCompanyPicker` viene sostituito dall'`open` del Popover (gestito internamente)
5. Mantenere la logica di filtro e la query `companies` invariate

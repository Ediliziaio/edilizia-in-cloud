

# Tempistiche editabili inline nel Dettaglio Ordine

## Approccio
Dallo screenshot, l'utente vuole i 4 date picker inline (come nella pagina Modifica Ordine) direttamente nella sidebar del Dettaglio Ordine, sostituendo la `CustomerDatesCard` read-only attuale.

## Modifiche

### `src/pages/azienda/OrderDetail.tsx`
- Sostituire la riga 653 (`CustomerDatesCard` read-only) con una card "Tempistiche per il Cliente" contenente 4 date picker inline (Data Prevista, Arrivo Merce, Inizio Lavori, Fine Lavori) — stessa struttura della pagina EditOrder (righe 769-830)
- Aggiungere stati locali per le 4 date, inizializzati dai dati dell'ordine
- Al cambio di una data, salvarla immediatamente su Supabase (auto-save) e invalidare la query `["order", id]` — nessun bottone "Salva" necessario, modifica diretta
- Layout: griglia a 2 colonne (`grid-cols-2`) nella sidebar (dato che è 1/3 dello schermo), oppure `grid-cols-1` se lo spazio è troppo stretto
- Importare `Popover`, `PopoverTrigger`, `PopoverContent`, `Calendar`, `cn`, `format`, `parseISO` (molti già importati)
- Rimuovere anche la card "Consegna Prevista" separata (righe 655-660) dato che "Data Prevista" sarà inclusa nei 4 picker


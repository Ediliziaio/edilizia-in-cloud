
# Piano: Paginazione Ordini (20 per pagina)

## Cosa cambia

Aggiungeremo la paginazione client-side alla vista tabella degli ordini, mostrando massimo 20 ordini per pagina con controlli di navigazione in basso.

## Interventi

### 1. `src/pages/azienda/OrdersList.tsx`
- Aggiungere stato `currentPage` (default 1), reset a 1 quando cambiano i filtri
- Calcolare `paginatedOrders` come slice di `filteredOrders` (da `(page-1)*20` a `page*20`)
- Passare `paginatedOrders` invece di `filteredOrders` alla `OrdersTable`
- Le stats rimangono calcolate su `filteredOrders` (tutti gli ordini filtrati, non solo la pagina corrente)
- Aggiungere sotto la tabella i controlli di paginazione: "Pagina X di Y" con bottoni Precedente/Successivo e info "Mostrando 1-20 di N ordini"

### 2. Comportamento
- **20 ordini per pagina** nella vista tabella
- La vista pipeline (Kanban) resta senza paginazione (mostra tutto)
- Quando si cambia filtro, la pagina torna a 1
- Export CSV continua a esportare tutti gli ordini filtrati (non solo la pagina corrente)
- Le stat cards mostrano i totali di tutti gli ordini filtrati

## Dettagli tecnici

Nessun nuovo file o componente esterno. La paginazione e puramente client-side con un semplice `slice()` su `filteredOrders`. I controlli useranno i componenti `Button` gia esistenti con icone `ChevronLeft`/`ChevronRight`.

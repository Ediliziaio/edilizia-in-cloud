

# Scalabilità Opportunità — `.limit(10000)` + Virtualizzazione

## Modifiche

### 1. `src/hooks/useOpportunitiesData.ts`
Aggiungere `.limit(10000)` alla query principale (riga 43, dopo `.order()`). Una riga.

### 2. `src/components/opportunities/OpportunityKanbanView.tsx`
Virtualizzare le card in ogni `StageColumn` con `useVirtualizer`:
- Importare `useVirtualizer` da `@tanstack/react-virtual`
- Aggiungere un `ref` per il container scrollabile (il div droppable)
- Creare un virtualizer con `count: opportunities.length`, `estimateSize` basato sul layout (mini: 52px, default: 180px), `overscan: 5`
- Sostituire il `.map()` diretto con il rendering virtualizzato: div wrapper con `height: totalSize`, poi solo i virtual items visibili posizionati con `position: absolute` + `translateY`
- Mantenere `SortableContext` wrappato attorno al container virtualizzato (serve la lista completa di ID per il drag-and-drop)
- Il messaggio "Nessuna opportunità" resta invariato

### 3. `src/components/opportunities/OpportunityListView.tsx`
Virtualizzare le righe della tabella:
- Importare `useVirtualizer` da `@tanstack/react-virtual`
- Aggiungere un `ref` al container scrollabile (div `overflow-x-auto`)
- Creare virtualizer con `count: opportunities.length`, `estimateSize: 56` (altezza riga), `overscan: 10`
- Il `<TableHeader>` resta fisso (sticky top)
- Il `<TableBody>` diventa un container con altezza = `totalSize`, le righe visibili posizionate con `translateY`
- La riga "Nessuna opportunità" si mostra solo se `opportunities.length === 0`

3 file, nessuna modifica architetturale.


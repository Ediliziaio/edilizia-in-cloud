

# Scalabilità Opportunità — Approccio Semplificato

## Analisi

Hai ragione a dubitare. `useInfiniteQuery` con paginazione server-side è **overengineering** per questo caso, perché:
- Il filtro e l'ordinamento sono tutti **client-side** — servono tutti i dati in memoria comunque
- L'enrichment (profili, note, documenti, appuntamenti) funziona meglio in batch unico
- La complessità di gestire pagine + optimistic updates sulla Kanban board sarebbe enorme

Il vero problema sono **due cose concrete**:
1. **La query non ha limit** → Supabase tronca silenziosamente a 1000 righe
2. **Migliaia di DOM nodes** nelle colonne Kanban rallentano il browser

## Soluzione (molto più semplice)

### 1. `useOpportunitiesData.ts` — Aggiungere `.limit(10000)`
Come già fatto nel progetto per Prima Nota, Scadenzario, etc. Una riga.

### 2. `OpportunityKanbanView.tsx` — Virtualizzazione colonne con `@tanstack/react-virtual`
- Ogni colonna usa `useVirtualizer` per renderizzare solo le ~15-20 card visibili
- `estimateSize`: 60px per mini, 180px per default
- `@tanstack/react-virtual` è già installato nel progetto
- L'utente scrolla nella colonna e le card appaiono/scompaiono come in GHL

### 3. `OpportunityListView.tsx` — Virtualizzazione righe tabella
- Stessa logica: `useVirtualizer` per le righe, header fisso

**3 file, nessuna modifica all'architettura query, nessun useInfiniteQuery.**


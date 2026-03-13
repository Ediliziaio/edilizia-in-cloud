

## Fix Paginazione Campi Personalizzati

### Problema
La paginazione attuale mostra sempre `filtered.slice(0, pageSize)` — non c'è modo di andare alle pagine successive. Manca lo stato `currentPage` e i bottoni di navigazione.

### Soluzione
Modificare `src/components/settings/CustomFieldsConfig.tsx`:

1. Aggiungere stato `currentPage` (default 1), reset a 1 quando cambiano filtri/ricerca/pageSize
2. Calcolare `visibleFields` con `filtered.slice((currentPage-1)*pageSize, currentPage*pageSize)`
3. Sostituire il footer con il componente `TablePagination` già esistente (`src/components/ui/table-pagination.tsx`) che ha già bottoni prima/precedente/successiva/ultima pagina + selettore dimensione pagina


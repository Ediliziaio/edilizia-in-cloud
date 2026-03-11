
# Fix: Header fisso + scroll orizzontale solo per le colonne Kanban

## Problema
Attualmente tutta la pagina Opportunità scorre insieme. Se la pipeline ha molte fasi, per raggiungere i bottoni (Aggiungi, Importa, filtri, ecc.) bisogna scrollare orizzontalmente fino in fondo. L'header (selettore pipeline, stats, tabs, filtri) dovrebbe restare fisso in alto.

## Soluzione
Nella struttura del componente `MarketingOpportunitiesContent`, il container principale è già `flex flex-col h-full` e tutte le sezioni superiori hanno `shrink-0`. Il problema è che il contenitore Kanban (`OpportunityKanbanView`) non è vincolato correttamente a occupare solo lo spazio rimanente con overflow orizzontale indipendente.

### File da modificare

**`src/pages/azienda/marketing/MarketingOpportunities.tsx`**
- Il wrapper della Kanban view (riga ~611) è già `<div className="flex-1 min-h-0">`. Verificare che il container padre `<div className="flex flex-col h-full gap-3">` (riga 372) abbia effettivamente `h-full` e che il layout genitore fornisca un'altezza vincolata.
- Aggiungere `overflow-hidden` al wrapper della Kanban per contenere lo scroll orizzontale dentro di esso.

**`src/components/opportunities/OpportunityKanbanView.tsx`**  
- Il wrapper principale (riga con `className="w-full h-full overflow-x-auto overflow-y-hidden"`) è già configurato per scroll orizzontale indipendente. Assicurarsi che abbia `h-full` e che lo scroll funzioni in modo isolato.

### Dettaglio modifiche

1. **Riga 372** (`MarketingOpportunities.tsx`): Cambiare il container root da `h-full` a `h-[calc(100vh-var(--header-height,64px))]` oppure più semplicemente assicurarsi che il parent fornisca altezza. Aggiungere `overflow-hidden` per impedire overflow dell'intero container.

2. **Riga 611**: Il wrapper `<div className="flex-1 min-h-0">` che contiene `OpportunityKanbanView` deve avere anche `overflow-hidden` per contenere lo scroll orizzontale del kanban.

3. **`OpportunityKanbanView.tsx`**: Il div con `overflow-x-auto overflow-y-hidden` è già corretto — lo scroll orizzontale avviene solo qui dentro.

In sintesi: fissare l'altezza del container principale e aggiungere `overflow-hidden` ai wrapper intermedi in modo che solo l'area Kanban scrolli orizzontalmente, mentre header/stats/tabs/filtri restano sempre visibili.

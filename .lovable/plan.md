

# Selezione multipla batch + Mappa visuale magazzino

## Verifiche funzionali
Le sezioni del magazzino (CRUD, assegnazione articolo, filtro per zona) sono già implementate correttamente nel codice. Il warning in console riguarda un problema di `forwardRef` su `WarehouseListView`, non correlato alle sezioni.

## Nuove funzionalità

### 1. Selezione multipla con azione batch "Sposta in zona"

**Modifica `WarehouseStockTab.tsx`**:
- Aggiungere stato `selectedIds: Set<string>` per tracciare gli articoli selezionati
- Aggiungere checkbox nella prima colonna di ogni riga + checkbox "seleziona tutti" nell'header
- Mostrare una barra azioni batch quando `selectedIds.size > 0` con:
  - Conteggio selezionati
  - Select per scegliere la zona di destinazione
  - Bottone "Sposta" che esegue un update batch `warehouse_stock.section_id` per tutti gli ID selezionati
  - Bottone "Deseleziona tutto"
- Mutation batch per aggiornare `section_id` su tutti gli articoli selezionati in una volta

### 2. Mappa visuale del magazzino

**Nuovo componente `WarehouseMapView.tsx`**:
- Griglia di card, una per ogni sezione + una card "Senza zona"
- Ogni card mostra:
  - Colore della sezione (bordo sinistro o sfondo leggero)
  - Nome e descrizione della sezione
  - Conteggio articoli assegnati
  - Quantità totale e valore totale degli articoli nella zona
  - Indicatore articoli sotto soglia minima (se presenti)
- Cliccando su una card si attiva il filtro per quella sezione nella tabella sottostante

**Integrazione in `WarehouseStockTab.tsx`**:
- Renderizzare `WarehouseMapView` sopra la tabella (dopo `WarehouseSectionsManager`)
- Passare `stockItems`, `sections`, callback `onFilterSection` che setta `sectionFilter`

## File da modificare/creare
- **Creare** `src/components/warehouse/WarehouseMapView.tsx`
- **Modificare** `src/components/warehouse/WarehouseStockTab.tsx` — checkbox, batch action bar, mappa


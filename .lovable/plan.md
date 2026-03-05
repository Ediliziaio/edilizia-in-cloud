

# Mappa visuale del magazzino nella pagina principale

## Obiettivo
Spostare la `WarehouseMapView` dalla tab "Giacenze" alla pagina principale del magazzino (`Warehouse.tsx`), rendendola sempre visibile indipendentemente dalla tab attiva (Lista, Kanban, Calendario, Giacenze).

## Modifiche

### 1. `src/pages/azienda/Warehouse.tsx`
- Importare `WarehouseMapView` e `useWarehouseSections`
- Recuperare `sections` dal hook e `stockItems` dai dati già presenti
- Aggiungere stato `activeSectionFilter` per il filtro cliccabile dalla mappa
- Renderizzare `WarehouseMapView` subito dopo le stats (`WarehouseStats`) e prima della card filtri, visibile in tutte le view
- Quando si clicca una sezione nella mappa, applicare il filtro anche alla lista/kanban (se applicabile)

### 2. `src/components/warehouse/WarehouseStockTab.tsx`
- Rimuovere il rendering di `WarehouseMapView` dalla tab Giacenze (evitare duplicazione)
- Mantenere invariato il filtro `sectionFilter` interno alla tab

### File coinvolti
- **Modificare** `src/pages/azienda/Warehouse.tsx` — aggiungere mappa + hook sezioni
- **Modificare** `src/components/warehouse/WarehouseStockTab.tsx` — rimuovere mappa duplicata


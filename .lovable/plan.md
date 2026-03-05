

# Audit tecnico: Mappa Visuale Magazzino + Batch Selection

## Report AS-IS

### Moduli analizzati
- `WarehouseMapView.tsx` — griglia card sezioni con stats aggregate
- `WarehouseStockTab.tsx` — tab giacenze con selezione multipla e batch move
- `Warehouse.tsx` — pagina principale con mappa globale
- `useWarehouseSections.ts` — hook CRUD sezioni

### Problemi trovati e priorità

#### P0 — Sicurezza / Data Isolation

1. **Batch move mutation senza `company_id` filter** (`WarehouseStockTab.tsx:222-227`)
   - L'update usa solo `.in("id", ids)` senza filtrare per `company_id`. Un utente potrebbe teoricamente manipolare gli ID per spostare articoli di un altro tenant.
   - Fix: aggiungere `.eq("company_id", companyId)` alla query di batch update.

2. **Update singolo stock item senza `company_id` filter** (`WarehouseStockTab.tsx:129-140`)
   - Stesso problema: l'update filtra solo per `id`, non per `company_id`.
   - Fix: aggiungere `.eq("company_id", companyId!)`.

3. **Movement mutation: update quantità senza `company_id`** (`WarehouseStockTab.tsx:199-202`)
   - Fix: aggiungere `.eq("company_id", companyId!)`.

> Nota: le RLS policies dovrebbero comunque bloccare cross-tenant, ma il filtro esplicito è obbligatorio per defense-in-depth (conforme alla memory `multi-tenant-security-hardening`).

#### P1 — Duplicazione query / Performance

4. **Query `warehouse_stock` duplicata tra `Warehouse.tsx` e `WarehouseStockTab.tsx`**
   - Entrambi i componenti fetchano `select("*")` dalla stessa tabella con la stessa `queryKey` `["warehouse-stock", companyId]`. La duplicazione è innocua grazie al cache di React Query, ma la query in `Warehouse.tsx` aggiunge `staleTime: 5 * 60 * 1000` che potrebbe causare dati stale sulla mappa mentre la tabella mostra dati freschi.
   - Fix: rimuovere `staleTime` dalla query in `Warehouse.tsx` per allinearla con quella di `WarehouseStockTab`.

5. **Import `WarehouseMapView` rimasto in `WarehouseStockTab.tsx`** (riga 23)
   - Dead import: il componente è stato rimosso dal rendering ma l'import resta.
   - Fix: rimuovere la riga `import { WarehouseMapView } from "./WarehouseMapView";`.

#### P1 — Tipo / Interfaccia duplicata

6. **Tipo `WarehouseSection` duplicato** in `WarehouseMapView.tsx` (righe 8-14) vs export in `useWarehouseSections.ts` (righe 6-14).
   - Fix: `WarehouseMapView` dovrebbe importare il tipo da `useWarehouseSections` anziché ridefinirlo.

#### P1 — UX / Edge Cases

7. **Filtro mappa nella pagina principale non collegato ai dati**
   - Cliccando una card sulla mappa in `Warehouse.tsx` si setta `activeSectionFilter` ma questo stato non viene passato a nessuna view (Lista, Kanban, Calendario). Il filtro è visivamente attivo (ring) ma non filtra nulla.
   - Fix: o collegare il filtro alle view sottostanti, o rimuovere il comportamento di selezione dalla mappa globale e mantenerlo solo come visualizzazione read-only.

8. **`batchTargetSection` non resettato quando si deseleziona tutto**
   - Se l'utente seleziona una zona target, poi deseleziona gli articoli, al prossimo ciclo di selezione la zona risulta pre-selezionata.
   - Fix: resettare `batchTargetSection` anche nel callback del bottone "Deseleziona".

#### P2 — Code Quality

9. **`toggleSelectAll` usa `selectedIds.size` come dependency** (riga 278)
   - Potrebbe non coprire il caso in cui `selectedIds` contiene ID non presenti in `filtered` (es. dopo un cambio filtro). Meglio confrontare set membership.
   - Fix: confrontare `filtered.every(i => selectedIds.has(i.id))` anziché contare.

10. **Mancanza `React.memo` su `SectionCard`**
    - Il componente viene ri-renderizzato ad ogni cambio di stato del parent. Essendo puro, beneficerebbe di `React.memo`.

11. **Console warning `forwardRef`** (visibile nei log)
    - `WarehouseItemDetailDialog` e `WarehouseKanbanCard` non usano `forwardRef`. Non correlato a questa feature ma presente nella stessa pagina.

---

## Piano interventi

### Da implementare (scope di questo refactor)

| # | Priorità | Intervento | File |
|---|----------|-----------|------|
| 1 | P0 | Aggiungere `.eq("company_id")` a batch move, update singolo, movement update | `WarehouseStockTab.tsx` |
| 2 | P1 | Rimuovere dead import `WarehouseMapView` | `WarehouseStockTab.tsx` |
| 3 | P1 | Rimuovere `staleTime` dalla query in pagina principale | `Warehouse.tsx` |
| 4 | P1 | Importare tipo `WarehouseSection` dal hook invece di ridefinirlo | `WarehouseMapView.tsx` |
| 5 | P1 | Rendere mappa globale read-only (rimuovere toggle filter non collegato) oppure collegare filtro alle view | `Warehouse.tsx` |
| 6 | P2 | Reset `batchTargetSection` nel deselect-all | `WarehouseStockTab.tsx` |
| 7 | P2 | Fix `toggleSelectAll` per gestire filtri cambiati | `WarehouseStockTab.tsx` |
| 8 | P2 | `React.memo` su `SectionCard` | `WarehouseMapView.tsx` |

### Fuori scope (segnalati)
- Fix `forwardRef` warning su `WarehouseItemDetailDialog` / `WarehouseKanbanCard` (non correlato)
- Backup/restore: già coperto dall'infrastruttura Cloud (backup giornalieri automatici)

### Dichiarazione
**NON PRONTO PER PRODUZIONE** fino alla risoluzione dei P0 (filtri `company_id` mancanti sulle mutazioni). Una volta applicati i fix P0 e P1, la feature sarà conforme agli standard enterprise del progetto.


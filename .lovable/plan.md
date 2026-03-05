

# Audit tecnico: Magazzino (Mappa + DnD + Stock Tab)

## Report AS-IS

### Moduli analizzati
- `Warehouse.tsx` — pagina principale con mappa globale read-only
- `WarehouseStockTab.tsx` — tab Giacenze con DnD, selezione multipla, batch move
- `WarehouseMapView.tsx` — componente mappa con droppable support
- `useWarehouseSections.ts` — hook CRUD sezioni

### Problemi trovati e priorità

#### P0 — Sicurezza / Data Isolation

1. **`useWarehouseSections` — update e delete senza `company_id` filter** (righe 64-67, 79)
   - `updateMutation` filtra solo per `.eq("id", data.id)` senza `.eq("company_id", companyId!)`. Un utente potrebbe manipolare l'ID per modificare sezioni di un altro tenant.
   - `deleteMutation` stesso problema: filtra solo per `.eq("id", id)`.
   - Fix: aggiungere `.eq("company_id", companyId!)` a entrambe le mutazioni.

2. **`warehouse_movements` insert senza `company_id`** (`WarehouseStockTab.tsx:196-202`)
   - La tabella `warehouse_movements` non ha un campo `company_id` visibile nell'insert. Se la tabella lo richiede, manca; se la RLS si basa solo su `stock_item_id`, va verificato che sia sufficiente. In ogni caso il record `warehouse_movements` non è direttamente tenant-scoped.
   - Fix: verificare schema e, se presente, aggiungere `company_id` all'insert.

#### P1 — Duplicazione / Inconsistenza

3. **Mappa duplicata nella pagina principale E nella tab Giacenze**
   - `Warehouse.tsx` (riga 212) rende una `WarehouseMapView` read-only.
   - `WarehouseStockTab.tsx` (riga 357) rende una seconda `WarehouseMapView` con `droppable`.
   - L'utente vede DUE mappe quando è nella tab Giacenze. La mappa globale non è droppable e non serve a nulla quando la tab Giacenze è attiva.
   - Fix: nascondere la mappa globale quando `viewMode === "stock"`, oppure passare il DnD context dalla pagina globale e rimuovere la mappa dalla tab.

4. **Filtro mappa globale `activeSectionFilter` non collegato a nessuna view**
   - `Warehouse.tsx` mantiene `activeSectionFilter` ma non lo passa a nessuna view (List, Kanban, Calendar). Cliccando sulla mappa globale si attiva il ring visivo ma non filtra nulla.
   - Fix: rendere la mappa globale puramente informativa (rimuovere `onFilterSection` e il ring) oppure collegare il filtro alle view.

5. **Import `WarehouseMapView` ancora presente in `WarehouseStockTab.tsx`** — non è dead code questa volta (viene usato per il DnD), ma crea la duplicazione visiva del punto 3.

#### P1 — UX

6. **Due mappe visivamente identiche nella stessa pagina**
   - Confusione per l'utente: quale mappa usare? Quella sopra non è droppable, quella sotto sì, ma hanno lo stesso aspetto.
   - Fix: se si mantengono entrambe, differenziare visivamente (es. la mappa globale mostra solo stats, quella nella tab ha il label "trascina qui").

7. **Mappa globale mostra "Mappa Magazzino" come label duplicata** — sia in `Warehouse.tsx` (riga 194) che dentro `WarehouseMapView.tsx` (riga 76). Il titolo appare due volte.
   - Fix: rimuovere il titolo interno dal componente quando è renderizzato dalla pagina principale (prop `showTitle?: boolean`).

#### P2 — Code Quality / Performance

8. **`DraggableStockRow` non è memoizzato**
   - Ogni cambio di stato (selezione, drag) causa ri-render di tutte le righe. Con molti articoli questo è un problema.
   - Fix: wrappare in `React.memo` con comparatore personalizzato.

9. **`useWarehouseSections` non filtra per `company_id` su update/delete** — già coperto in P0.

10. **Console warning `forwardRef`** visibile nei log — proviene da `MarketingAppointmentDialog`, non correlato al magazzino ma presente nella sessione.

---

## Piano interventi

| # | Priorità | Intervento | File |
|---|----------|-----------|------|
| 1 | P0 | Aggiungere `.eq("company_id")` a update e delete in `useWarehouseSections` | `useWarehouseSections.ts` |
| 2 | P1 | Nascondere mappa globale quando `viewMode === "stock"` per evitare duplicazione | `Warehouse.tsx` |
| 3 | P1 | Rendere mappa globale puramente informativa (rimuovere `activeSectionFilter` e onClick) o collegarla alle view | `Warehouse.tsx` |
| 4 | P1 | Rimuovere titolo duplicato "Mappa Magazzino" dal componente quando renderizzato fuori dalla tab | `WarehouseMapView.tsx` + `Warehouse.tsx` |
| 5 | P2 | Memoizzare `DraggableStockRow` con `React.memo` | `WarehouseStockTab.tsx` |

### Dichiarazione
**NON PRONTO PER PRODUZIONE** fino alla risoluzione del P0 (filtri `company_id` mancanti sulle mutazioni sezioni). Una volta applicati P0 e P1, la feature sarà conforme agli standard enterprise.




# Fix Crash Magazzino — Status "consegnato" non riconosciuto

## Problema
Le migrazioni demo hanno impostato alcuni `order_items` con status `"consegnato"`, ma il tipo `OrderItemStatus` e `STATUS_CONFIG` in `src/types/warehouse.ts` riconoscono solo 4 stati: `da_ordinare`, `ordinato`, `in_magazzino`, `installato`. Quando il componente `WarehouseListView` tenta `STATUS_CONFIG["consegnato"].bgColor`, ottiene `undefined` → crash.

## Soluzione

**Opzione scelta**: Correggere i dati nel DB. Lo status `consegnato` non è previsto dal sistema — va mappato a `in_magazzino` (merce arrivata/consegnata al magazzino) che è lo stato equivalente nel flusso esistente.

### Azione
1. **SQL migration**: `UPDATE order_items SET status = 'in_magazzino' WHERE status = 'consegnato';`
2. **Defensive code**: Aggiungere un fallback in `WarehouseListView.tsx` riga 348 per evitare crash futuri se un valore sconosciuto arriva dal DB: `STATUS_CONFIG[item.status] ?? STATUS_CONFIG.da_ordinare`

Nessun altro file o sezione è affetto — il crash è isolato a questo singolo punto.


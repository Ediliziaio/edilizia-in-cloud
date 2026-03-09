

## Piano: Integrazione bilaterale Ordini d'Acquisto ↔ Ordini Cliente

### Problema attuale
- La pagina OdA mostra "Nessun ordine d'acquisto trovato" -- probabilmente perche non ne sono ancora stati creati, ma manca anche la visibilita bilaterale.
- Nel dettaglio ordine cliente c'e il bottone "Crea OdA" ma **nessuna card che mostri gli OdA gia collegati** a quell'ordine.
- Nel dettaglio OdA, il numero ordine cliente e mostrato ma **non e cliccabile** per tornare all'ordine.

### Modifiche

**1. Aggiungere card "OdA Collegati" nel dettaglio ordine cliente (`OrderDetail.tsx`)**
- Nella colonna destra, aggiungere una Card che mostra tutti i `purchase_orders` con `order_id = ordine corrente`.
- Query con join `suppliers(name)` per mostrare: numero OdA, fornitore, stato (badge colorato), totale.
- Ogni riga cliccabile naviga a `/azienda/ordini-acquisto/:id`.
- Se nessun OdA collegato, mostra "Nessun OdA collegato" con il pulsante Crea OdA integrato.

**2. Rendere il riferimento ordine cliccabile nel dettaglio OdA (`PurchaseOrderDetail.tsx`)**
- Il campo `order_number` mostrato nell'header dell'OdA deve essere un `Link` a `/azienda/ordini/${order.order_id}`.

**3. Spostare il bottone "Crea OdA" dentro la card collegati**
- Rimuovere il `CreatePurchaseOrderButton` dall'header dell'ordine e metterlo come azione nella nuova card OdA Collegati, cosi e contestualizzato.

Nessuna modifica al DB necessaria -- il campo `order_id` nella tabella `purchase_orders` esiste gia.


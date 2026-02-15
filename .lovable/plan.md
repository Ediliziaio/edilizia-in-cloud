
# Modifica Articoli dalla Pagina Dettaglio Ordine

## Problema Attuale

Nella pagina "Dettaglio Ordine", il componente `OrderItemsList` e' renderizzato con `editable={false}`, quindi i pulsanti Modifica (matita) e Elimina non sono visibili. L'utente vuole poter modificare ogni articolo (dati, stato pagamento, date) direttamente dalla pagina di dettaglio.

Inoltre, la mutation `updateOrderItemsMutation` in `OrderDetail.tsx` utilizza una strategia distruttiva (cancella tutti gli articoli e li ricrea), perdendo gli ID e rompendo gli allegati. Serve un aggiornamento diretto per singolo articolo.

---

## Modifiche Previste

### 1. Componente `OrderItemsList.tsx` - Nuovo prop `allowEdit`

Aggiungere un prop opzionale `allowEdit?: boolean` all'interfaccia `OrderItemsListProps`. Questo prop, quando `true`, mostra il pulsante Matita su ogni articolo anche se `editable` e' `false`.

- **Logica**: Il pulsante Pencil viene mostrato se `editable === true` OPPURE `allowEdit === true`
- **Differenza**: `editable` controlla sia Aggiungi che Modifica/Elimina. `allowEdit` mostra solo la Matita (modifica), senza Aggiungi e senza Elimina

Quando l'utente salva dalla dialog di modifica con `allowEdit`, viene invocato un nuovo callback `onItemUpdate` anziche' `onItemsChange`, passando l'item aggiornato con il suo `id`.

### 2. Componente `OrderItemsList.tsx` - Nuovo callback `onItemUpdate`

Aggiungere un callback opzionale:

```text
onItemUpdate?: (item: OrderItem) => void;
```

Nella funzione `handleSaveItem`, se `editingIndex !== null` e `onItemUpdate` e' definito, invocarlo con l'item aggiornato (incluso il suo `id`). Altrimenti, il comportamento esistente con `onItemsChange` rimane invariato.

### 3. Pagina `OrderDetail.tsx` - Integrazione

- Passare `allowEdit={true}` e `onItemUpdate={handleItemUpdate}` al componente `OrderItemsList`
- Creare una nuova mutation `updateSingleItemMutation` che fa un UPDATE diretto su `order_items` filtrando per `id`, aggiornando solo i campi modificati (nome, quantita', fornitore, prezzo, IVA, stato, pagamento, rate)
- Rimuovere o mantenere la vecchia `updateOrderItemsMutation` (non piu' usata dalla pagina dettaglio, ma potenzialmente usata altrove)

### 4. Riepilogo modifiche file

| Azione | File |
|--------|------|
| Modificare | `src/components/orders/OrderItemsList.tsx` (aggiungere `allowEdit` e `onItemUpdate`) |
| Modificare | `src/pages/azienda/OrderDetail.tsx` (nuova mutation diretta + passaggio props) |

---

## Comportamento Atteso

1. Nella pagina Dettaglio Ordine, ogni card articolo mostra un'icona Matita a destra (accanto al dropdown stato)
2. Cliccando la Matita, si apre il dialog "Modifica Articolo" con tutti i campi precompilati (nome, quantita', fornitore, costo, stato pagamento, rate)
3. L'utente modifica i dati desiderati e clicca "Salva"
4. Il salvataggio aggiorna direttamente il singolo record nel database senza toccare gli altri articoli
5. La lista si aggiorna automaticamente tramite invalidazione della query
6. Non viene mostrato il pulsante "Elimina" ne' "Aggiungi" nella vista dettaglio (solo modifica)

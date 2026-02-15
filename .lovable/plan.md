

# Fix: Modifica articolo causa salvataggio automatico + Stabilizzazione

## Problema identificato

Quando clicchi sul pulsante "Modifica" (matita) o "Elimina" (cestino) di un articolo nella pagina di modifica ordine, il form viene inviato automaticamente perche quei `<Button>` non hanno `type="button"`. Essendo dentro un tag `<form>`, il browser li interpreta come `type="submit"`, invocando `handleSubmit` che salva e fa redirect a `/azienda/ordini/:id`.

## Root cause

In `OrderItemsList.tsx`, i pulsanti alle righe 556 e 559:

```text
<Button variant="ghost" size="icon" onClick={() => openEditDialog(index)}>
<Button variant="ghost" size="icon" onClick={() => handleDeleteItem(index)}>
```

Non hanno `type="button"`. Dentro un `<form>` (quello di `EditOrder.tsx` riga 752), un bottone senza `type` esplicito e' `type="submit"` per default HTML.

## Fix

Aggiungere `type="button"` a **tutti** i `<Button>` dentro `OrderItemsList.tsx` che non devono inviare il form:

| Riga | Bottone | Fix |
|------|---------|-----|
| 556 | Modifica (Pencil) | Aggiungere `type="button"` |
| 559 | Elimina (Trash2) | Aggiungere `type="button"` |
| 615 | Dialog "Annulla" | Aggiungere `type="button"` |
| 616 | Dialog "Aggiungi" | Aggiungere `type="button"` |
| 665 | Dialog stock "Annulla" | Aggiungere `type="button"` |
| 666-668 | Dialog stock "Preleva" | Aggiungere `type="button"` |
| 680 | Dialog fallback "Annulla" | Aggiungere `type="button"` |
| 681 | Dialog fallback "Salva/Aggiungi" | Aggiungere `type="button"` |

## Verifica aggiuntiva

- Controllare che i filtri (riga 452-458) abbiano gia `type="button"` -- confermato, li hanno gia
- Controllare che il bottone "Aggiungi" nel CardHeader (riga 421) abbia `type="button"` -- confermato, lo ha gia

## Impatto

- **Bug risolto**: Modifica e eliminazione articoli non causeranno piu il submit del form
- **Zero rischi**: Aggiungere `type="button"` e' un fix puramente correttivo, nessun cambio funzionale

## File coinvolti

| Azione | File |
|--------|------|
| Modificare | `src/components/orders/OrderItemsList.tsx` (aggiungere `type="button"` a 8 bottoni) |




# Fix: Cliente non caricato in Modifica Ordine

## Problema

Quando si apre la pagina "Modifica Ordine", il sistema di **bozza automatica** (draft) sovrascrive il cliente assegnato con un valore vuoto. Questo succede perche:

1. La bozza viene salvata automaticamente ad ogni modifica dei campi
2. Se la bozza e stata salvata prima che il `customerId` fosse correttamente inizializzato, salva una stringa vuota
3. Al rientro nella pagina, la bozza viene ripristinata e il campo cliente risulta vuoto anche se l'ordine ha un cliente assegnato nel database

## Soluzione

Modificare la logica di ripristino bozza in `src/pages/azienda/EditOrder.tsx` per **usare sempre il `customer_id` dal database** quando il draft ha un `customerId` vuoto. Il cliente e un dato critico che non dovrebbe mai essere perso durante il ripristino di una bozza.

### Modifica specifica

Nel `useEffect` che gestisce il caricamento dati (riga ~212-275):

- Quando si ripristina una bozza, se `draft.customerId` e vuoto, usare `order.customer_id` come fallback
- Cambiare: `setCustomerId(draft.customerId || "")` in `setCustomerId(draft.customerId || order.customer_id)`

Questo garantisce che il cliente venga sempre mostrato correttamente, anche se la bozza non contiene l'informazione.

### File da modificare

| File | Modifica |
|------|----------|
| `src/pages/azienda/EditOrder.tsx` | Fallback `customer_id` dal DB durante ripristino bozza |


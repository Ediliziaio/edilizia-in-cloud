

# Fix: Pre-popolamento Cliente in Modifica Ordine

## Problema

Quando si clicca "Modifica" dall'anteprima ordine, il campo cliente appare vuoto nonostante il `customerId` sia impostato correttamente nello state. Il problema e una race condition: il `Select` ha un `value` impostato ma la lista `allCustomers` e ancora vuota, quindi Radix Select mostra il placeholder.

## Causa

1. Lo state `customerId` viene impostato rapidamente (dal draft o dall'ordine caricato)
2. Le query per `customers` e `orderCustomer` sono asincrone e possono non essere pronte al momento del render
3. Radix `Select` con un `value` che non corrisponde a nessun `SelectItem` mostra il placeholder

## Soluzione

### File: `src/pages/azienda/EditOrder.tsx`

1. **Aggiungere `staleTime` alla query `orderCustomer`** per evitare refetch inutili e accelerare il caricamento

2. **Usare `initialData` nella query orderCustomer** se l'ordine ha gia il customer_id, per ridurre il ritardo

3. **Spostare la logica `allCustomers` con un check piu robusto**: verificare che `customerId` sia sempre presente nella lista prima di renderizzare il Select. Se `allCustomers` non contiene ancora il `customerId` corrente e i dati sono in caricamento, mostrare un placeholder di caricamento nel Select.

4. **Proteggere il draft**: quando si salva il draft, evitare di sovrascrivere `customerId` se e ancora vuoto (stato iniziale `""`) e l'ordine ha un `customer_id` valido.

### Modifiche specifiche

- Aggiungere la variabile `isCustomerDataReady` che verifica se `customerId` e presente in `allCustomers` oppure se `allCustomers` e ancora in caricamento
- Mostrare "Caricamento..." come placeholder del Select se i dati non sono pronti
- Aggiungere `staleTime: 5 * 60 * 1000` alle query customers e orderCustomer
- Nella logica di draft-save (useEffect linea 342), non salvare se `customerId` e ancora la stringa vuota iniziale


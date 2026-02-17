
# Fix bug nella tab Stati delle Impostazioni

## Problema
Quando si esce dalla tab "Stati" e si rientra, gli stati ordine scompaiono e appare il messaggio "Sono richiesti almeno 2 stati ordine". Questo succede perche:

1. Il componente `OrderStatusConfig` usa `useState([])` per gli stati
2. La query ha `staleTime: 5 * 60 * 1000` (5 minuti di cache)
3. Quando il componente si smonta e rimonta, lo `useState` riparte da `[]`
4. Ma la query e' ancora "fresh" grazie alla cache, quindi il `queryFn` (che contiene il `setStatuses`) non viene rieseguito
5. Risultato: `statuses = []`, nessuno stato visibile

## Soluzione
Modificare `OrderStatusConfig` per inizializzare lo stato locale dai dati della query quando disponibili, invece di partire sempre da un array vuoto.

## Dettaglio tecnico

### File: `src/components/settings/OrderStatusConfig.tsx`

1. Salvare il risultato di `useQuery` in una variabile `data`
2. Usare un `useEffect` che sincronizza `statuses` con `data` quando i dati della query cambiano (e solo se non ci sono modifiche locali non salvate)
3. Oppure, approccio piu semplice: inizializzare `statuses` dal risultato della query usando `initialData` o controllando nel render

Approccio scelto: aggiungere un `useEffect` che imposta `statuses` dai dati query quando `hasChanges` e' `false`:

```typescript
const { data: queryData, isLoading } = useQuery({
  queryKey: ["order-statuses-config", company?.id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("order_statuses")
      .select("*")
      .eq("company_id", company!.id)
      .order("position");
    if (error) throw error;
    return data as OrderStatus[];
  },
  enabled: !!company?.id,
  staleTime: 5 * 60 * 1000,
});

// Sincronizza stato locale con dati della query
useEffect(() => {
  if (queryData && !hasChanges) {
    setStatuses(queryData);
  }
}, [queryData, hasChanges]);
```

Questo rimuove il `setStatuses` dal `queryFn` e lo sposta in un `useEffect` che si attiva ogni volta che `queryData` cambia (incluso quando viene restituito dalla cache al remount).



# Bug: Filtro Venditori non mostra i venditori

## Problema identificato

Il codice in `OrdersList.tsx` (riga 158) cerca i nomi dei venditori nella tabella **`profiles`**, ma il campo `salesperson_id` in `order_salespeople` fa riferimento alla tabella **`salespeople`**, non a `profiles`.

Dai dati di rete:
- `order_salespeople.salesperson_id` = `b4f34373-...`, `0c4e3079-...`
- Questi ID esistono nella tabella `salespeople` (Maurizio Trevisi, Luizia Antal, etc.)
- La query a `profiles` con quegli ID restituisce array vuoto perche non sono profili utente

## Fix

**File: `src/pages/azienda/OrdersList.tsx`**

Riga 154-164: cambiare la query `salespersonProfiles` da `profiles` a `salespeople`:

```typescript
const { data: salespersonProfiles = [] } = useQuery({
  queryKey: ["salesperson-profiles", salespersonIds],
  queryFn: async () => {
    if (salespersonIds.length === 0) return [];
    const { data, error } = await supabase
      .from("salespeople")
      .select("id, first_name, last_name")
      .in("id", salespersonIds);
    if (error) throw error;
    return data;
  },
  enabled: salespersonIds.length > 0,
  staleTime: 10 * 60 * 1000,
});
```

Un solo file, una riga cambiata (`profiles` -> `salespeople`). Questo corregge sia la colonna Venditore nella tabella sia il dropdown del filtro venditori.


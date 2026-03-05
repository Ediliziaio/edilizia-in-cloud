

# Indice DB + Paginazione Server-Side Clienti

## 1. Migrazione DB: indice su `profiles.salesperson_id`

```sql
CREATE INDEX idx_profiles_salesperson_id ON public.profiles (salesperson_id);
```

## 2. RPC function per paginazione server-side

La query attuale fa 3 chiamate separate (user_roles, orders, profiles) e le unisce client-side. Per la paginazione server-side serve una funzione RPC che:
- Filtra per `company_id`, `search`, `salesperson_id`, ordini si/no
- Ordina per nome o `created_at`
- Restituisce una pagina (offset/limit) + conteggio totale

```sql
CREATE FUNCTION get_customers_paginated(
  p_company_id UUID,
  p_search TEXT DEFAULT NULL,
  p_salesperson_id UUID DEFAULT NULL,  -- null = tutti, 'none' gestito con boolean
  p_salesperson_none BOOLEAN DEFAULT FALSE,
  p_has_orders TEXT DEFAULT 'all',     -- 'all','with','without'
  p_sort_field TEXT DEFAULT 'name',
  p_sort_dir TEXT DEFAULT 'asc',
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 25
) RETURNS JSON  -- { rows: [...], total_count: N }
```

Logica interna: JOIN `profiles` + `user_roles` (role='customer'), LEFT JOIN aggregato su `orders` per conteggio, filtri applicati, COUNT(*) OVER() per totale.

## 3. Modifiche a `CustomersList.tsx`

- Stato paginazione: `page` (default 0), `pageSize` (default 25)
- Query key include tutti i filtri + page/pageSize (la query chiama la RPC)
- Rimuovere filter/sort client-side (tutto server-side)
- Aggiungere UI paginazione in fondo alla tabella: "Pagina X di Y", bottoni Prev/Next, select pageSize (25/50/100)
- Contatore: "Mostrando X-Y di Z clienti"
- CSV export: continua a esportare solo i filtrati visibili (o opzione "esporta tutti" con chiamata separata senza limit)

### File modificati

| File | Modifica |
|------|----------|
| Migrazione SQL | Indice + funzione RPC `get_customers_paginated` |
| `CustomersList.tsx` | Paginazione server-side, rimozione filter/sort client-side, UI paginator |


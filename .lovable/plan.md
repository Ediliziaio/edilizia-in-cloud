
# Piano: Fix Stati Ordine Duplicati

## Problema Identificato

Dallo screenshot si vedono **stati ordine duplicati** nel progress tracker (es. "Contratto Firmato" appare 2 volte). Questo accade perche la query per recuperare gli stati **non filtra per `company_id`**, recuperando cosi gli stati di **tutte le aziende** nel database.

Il database contiene:
- 8 stati per `company_id: 728fc9cf-...`
- 8 stati per `company_id: 95fd8ffd-...`
- Totale: 16 stati mostrati invece di 8

---

## Cause Tecniche

Le seguenti query non filtrano per `company_id`:

| File | Query | Linea |
|------|-------|-------|
| `OrderDetail.tsx` | `order_statuses` senza filtro | 254-266 |
| `OrdersList.tsx` | `order_statuses` senza filtro | 128-141 |
| `CreateOrder.tsx` | `order_statuses` senza filtro | 123-135 |
| `OrdersList.tsx` | `orders` senza filtro | 107-125 |

---

## Soluzione Proposta

### 1. OrderDetail.tsx (linee 253-266)

Usare `effectiveCompany?.id` per filtrare gli stati.

Da:
```typescript
const { data: statuses = [] } = useQuery({
  queryKey: ["order-statuses", user?.id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("order_statuses")
      .select("id, name, icon, color, position")
      .order("position");
    // ...
  },
  enabled: !!user,
});
```

A:
```typescript
const { effectiveCompany } = useAuth(); // già importato

const { data: statuses = [] } = useQuery({
  queryKey: ["order-statuses", effectiveCompany?.id],
  queryFn: async () => {
    if (!effectiveCompany?.id) return [];
    
    const { data, error } = await supabase
      .from("order_statuses")
      .select("id, name, icon, color, position")
      .eq("company_id", effectiveCompany.id)
      .order("position");
    // ...
  },
  enabled: !!effectiveCompany?.id,
});
```

### 2. OrdersList.tsx (linee 107-141)

Aggiungere filtro `company_id` sia per ordini che per stati.

```typescript
const { effectiveCompany } = useAuth();

// Query ordini
const { data: orders = [] } = useQuery({
  queryKey: ["orders", effectiveCompany?.id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(...)
      .eq("company_id", effectiveCompany!.id)
      .order("created_at", { ascending: false });
    // ...
  },
  enabled: !!effectiveCompany?.id,
});

// Query stati
const { data: statuses = [] } = useQuery({
  queryKey: ["order-statuses", effectiveCompany?.id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("order_statuses")
      .select("id, name, color, position")
      .eq("company_id", effectiveCompany!.id)
      .order("position");
    // ...
  },
  enabled: !!effectiveCompany?.id,
});
```

### 3. CreateOrder.tsx (linee 122-135)

Aggiungere filtro `company_id` per gli stati.

```typescript
const { data: statuses = [] } = useQuery({
  queryKey: ["order-statuses", effectiveCompany?.id],
  queryFn: async () => {
    if (!effectiveCompany?.id) return [];
    
    const { data, error } = await supabase
      .from("order_statuses")
      .select("id, name, position")
      .eq("company_id", effectiveCompany.id)
      .order("position");
    // ...
  },
  enabled: !!effectiveCompany?.id,
});
```

---

## File da Modificare

| File | Modifiche |
|------|-----------|
| `src/pages/azienda/OrderDetail.tsx` | Aggiungere `effectiveCompany` + filtro `company_id` negli stati |
| `src/pages/azienda/OrdersList.tsx` | Aggiungere `effectiveCompany` + filtro `company_id` ordini e stati |
| `src/pages/azienda/CreateOrder.tsx` | Aggiornare query stati con filtro `company_id` |

---

## Risultato Atteso

| Prima | Dopo |
|-------|------|
| 16 stati visualizzati (tutte le aziende) | 8 stati visualizzati (solo azienda corrente) |
| Progress tracker confuso con duplicati | Progress tracker chiaro e ordinato |
| Possibili conflitti tra aziende | Isolamento dati corretto per azienda |

---

## Verifica Post-Fix

1. Aprire Dettaglio Ordine - verificare 8 stati unici
2. Aprire Lista Ordini - verificare filtro stati corretto
3. Creare nuovo ordine - verificare stati disponibili corretti
4. Testare con impersonation (super admin) - verificare switch azienda corretto

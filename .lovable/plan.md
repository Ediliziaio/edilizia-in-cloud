

# Fix: Lista Clienti non carica - errore relazione DB

## Problema
La query in `CustomersList.tsx`, `CreateOrder.tsx` e `EditOrder.tsx` usa un join PostgREST tra `profiles` e `user_roles`:
```
.select("id, first_name, last_name, email, phone, user_roles!inner(role)")
```

PostgREST restituisce errore 400:
```
"Could not find a relationship between 'profiles' and 'user_roles' in the schema cache"
```

Non esiste una foreign key diretta tra `profiles.id` e `user_roles.user_id`. Entrambe le tabelle referenziano `auth.users(id)` separatamente, ma non sono collegate tra loro.

## Causa Root
Il fix precedente (filtrare per ruolo `customer`) ha introdotto un join non supportato dallo schema. Il campo `user_roles.user_id` ha FK verso `auth.users`, non verso `profiles`.

## Soluzione
Usare due query separate invece del join PostgREST:

1. Query `user_roles` per ottenere tutti gli `user_id` con ruolo `customer`
2. Query `profiles` filtrando per quegli ID e per `company_id`

Questo approccio evita il join non supportato ed e robusto.

### Codice corretto (pattern da applicare a tutti e 3 i file):
```typescript
// Step 1: get customer user IDs
const { data: customerRoles } = await supabase
  .from("user_roles")
  .select("user_id")
  .eq("role", "customer");

const customerIds = (customerRoles || []).map(r => r.user_id);

if (customerIds.length === 0) return [];

// Step 2: fetch profiles for those IDs within the company
const { data, error } = await supabase
  .from("profiles")
  .select("id, first_name, last_name, email, phone")
  .eq("company_id", effectiveCompany.id)
  .in("id", customerIds)
  .order("last_name");
```

## File da modificare

1. **`src/pages/azienda/CustomersList.tsx`** - Query principale lista clienti (riga ~78-87): sostituire il join con due query separate
2. **`src/pages/azienda/CreateOrder.tsx`** - Dropdown selezione cliente: stesso pattern
3. **`src/pages/azienda/EditOrder.tsx`** - Dropdown selezione cliente: stesso pattern

## Impatto
- Risolve il 400 che impedisce di vedere qualsiasi cliente nella lista
- Il cliente appena creato (flo.andriciuTRTERTc@gmail.com) diventera visibile
- Nessuna modifica al database necessaria



# Fix: Dropdown Clienti mostra tutti gli utenti

## Problema
Nella creazione ordine (`/azienda/ordini/nuovo`), il dropdown "Cliente" carica tutti i profili dalla tabella `profiles` senza filtrare per ruolo. Questo mostra admin, staff, dipendenti e venditori insieme ai clienti.

## Causa
La query a riga 108-120 di `CreateOrder.tsx` fa:
```
supabase.from("profiles").select("id, first_name, last_name, email").order("last_name")
```
Nessun filtro per ruolo `customer`.

## Soluzione
Modificare la query per fare un inner join con `user_roles` filtrando solo gli utenti con ruolo `customer`, e limitare ai profili della stessa azienda.

La stessa correzione va applicata anche a:
- `src/pages/azienda/EditOrder.tsx` (se ha la stessa query)
- `src/pages/azienda/CustomersList.tsx` (verificare coerenza)

## Dettaglio tecnico

La query corretta sara:
```typescript
const { data, error } = await supabase
  .from("profiles")
  .select("id, first_name, last_name, email, user_roles!inner(role)")
  .eq("user_roles.role", "customer")
  .eq("company_id", effectiveCompany.id)
  .order("last_name");
```

Questo:
1. Fa un inner join con `user_roles` (solo profili che hanno un ruolo)
2. Filtra per `role = 'customer'`
3. Filtra per `company_id` dell'azienda corrente
4. Garantisce che nel dropdown appaiano solo i veri clienti


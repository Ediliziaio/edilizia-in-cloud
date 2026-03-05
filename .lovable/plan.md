

# Fix Errore Assistenza + Audit P0/P1

## Problema Critico (P0)

L'errore visibile nello screenshot e' causato da un **400 Bad Request** di PostgREST:

```
"Could not find a relationship between 'tickets' and 'profiles' using the hint 'tickets_assigned_to_fkey'"
```

**Causa**: la migrazione ha creato `assigned_to UUID REFERENCES auth.users(id)`, ma la query PostgREST usa `profiles!tickets_assigned_to_fkey(...)`. PostgREST non puo' risolvere il join perche' la FK punta a `auth.users`, non a `public.profiles`.

## Piano Fix

### 1. Migrazione DB — Fix FK assigned_to (P0)

```sql
-- Rimuovi la FK verso auth.users
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_assigned_to_fkey;

-- Ricrea FK verso profiles
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
```

Questo permette a PostgREST di risolvere il join `profiles!tickets_assigned_to_fkey`.

### 2. Nessuna modifica frontend

Il codice frontend in `TicketsList.tsx` e `TicketDetail.tsx` e' gia' corretto — usa `assignee:profiles!tickets_assigned_to_fkey(first_name, last_name)`. Basta solo che la FK punti a `profiles`.

### File modificati

| File | Modifica |
|------|----------|
| Migrazione SQL | Drop FK auth.users, ricrea FK profiles |

### Risultato
- La lista ticket si carichera' correttamente
- Il dettaglio ticket funzionera'
- La creazione ticket funzionera' (gia' inserisce UUID valido)




# C-1: Fix Race Condition nel Token Refresh (billing-sync)

## Problema
Quando richieste concorrenti invocano `billing-sync` per la stessa integrazione FIC, il refresh del token non ha locking. Piu' worker possono refreshare simultaneamente, sovrascrivendo token validi con quelli invalidati.

## Soluzione

### 1. Migration SQL: Advisory lock function
Creare una funzione RPC `try_refresh_fic_token` che usa `pg_try_advisory_xact_lock` per garantire che solo un worker alla volta possa refreshare il token:

```sql
CREATE OR REPLACE FUNCTION public.try_acquire_token_refresh_lock(p_integration_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Use hashtext for advisory lock (converts UUID to int)
  RETURN pg_try_advisory_lock(hashtext(p_integration_id::text));
END;
$$;

CREATE OR REPLACE FUNCTION public.release_token_refresh_lock(p_integration_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_unlock(hashtext(p_integration_id::text));
END;
$$;
```

### 2. Modifica `billing-sync/index.ts`
Riscrivere la sezione token refresh (righe 44-67):

1. Aumentare buffer da 5 minuti a 30 minuti
2. Tentare advisory lock tramite RPC `try_acquire_token_refresh_lock`
3. Se lock acquisito: refreshare il token, aggiornare DB, rilasciare lock
4. Se lock non acquisito: attendere 2 secondi, ri-leggere token dal DB (un altro worker lo ha refreshato)
5. Double-check: dopo aver acquisito il lock, ri-leggere `token_expires_at` dal DB per verificare se un altro worker ha gia' refreshato

## File coinvolti

| File | Azione |
|------|--------|
| `supabase/migrations/[new].sql` | Advisory lock functions |
| `supabase/functions/billing-sync/index.ts` | Logica token refresh con locking |


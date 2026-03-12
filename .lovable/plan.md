

# Criticita' trovata: 403 su query appointments

## Problema attivo (ALTA)

La query `GET appointments?contact_id=in.(...)` dalla pagina opportunita' restituisce **403 "permission denied for table users"**.

### Causa radice
La policy RLS `customer_view_own_appointments` contiene un subselect diretto su `auth.users`:
```sql
EXISTS (
  SELECT 1 FROM marketing_contacts mc
  WHERE mc.id = appointments.contact_id
  AND mc.email = (SELECT users.email FROM auth.users WHERE users.id = auth.uid())
)
```
Il ruolo `authenticated` non ha permesso di leggere `auth.users` direttamente nelle policy RLS. Anche se l'utente e' super_admin (coperto da un'altra policy), Postgres puo' valutare tutte le espressioni delle policy e il subselect su `auth.users` genera un errore di permesso che blocca l'intera query.

### Fix proposto
Creare una funzione `SECURITY DEFINER` che recupera l'email dell'utente autenticato, e sostituire il subselect diretto:

```sql
CREATE OR REPLACE FUNCTION public.get_auth_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid()
$$;
```

Poi ricreare la policy:
```sql
DROP POLICY IF EXISTS "customer_view_own_appointments" ON public.appointments;

CREATE POLICY "customer_view_own_appointments"
ON public.appointments
FOR SELECT TO authenticated
USING (
  contact_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM marketing_contacts mc
    WHERE mc.id = appointments.contact_id
    AND mc.email = public.get_auth_email()
  )
);
```

### Riepilogo

| # | Criticita' | Problema | Effort |
|---|-----------|----------|--------|
| 1 | **ALTA** | 403 su appointments per subselect diretto su auth.users | Basso (1 migration SQL) |

Nessun'altra criticita' runtime rilevata. Le query su opportunita', contatti, pipeline, documenti e note funzionano correttamente (200). Il linter conferma solo il warning gia' noto sulla leaked password protection.




## Piano: Fix RLS policy per `cost_categories` (super_admin bypass)

### Problema
L'utente e super_admin con `company_id: null` nel profilo. La policy RLS attuale controlla `company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())` che restituisce `NULL` e blocca tutte le operazioni INSERT/UPDATE/DELETE con errore 403.

### Soluzione
Aggiungere una policy separata per super_admin, come gia fatto per tutte le altre tabelle del progetto (es. `order_attachments`, `salespeople`, `article_templates`, ecc.).

### Migrazione SQL

```sql
CREATE POLICY "Super admins can manage all cost categories"
ON public.cost_categories FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
```

Nessuna modifica ai file TypeScript necessaria. Una volta applicata la policy, l'importazione e tutte le operazioni CRUD funzioneranno correttamente.


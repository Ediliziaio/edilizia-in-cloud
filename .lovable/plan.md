

# Fix: RLS policy warehouse_sections per super_admin

## Problema
La policy RLS attuale controlla `company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())`. Quando un super_admin sta impersonando un'azienda, il `company_id` usato nell'insert (quello dell'azienda impersonata) non corrisponde al `company_id` del profilo del super_admin, causando il blocco.

## Soluzione
Aggiungere una policy separata per i super_admin, come fatto per tutte le altre tabelle del progetto:

```sql
CREATE POLICY "Super admins can manage all warehouse sections"
  ON public.warehouse_sections FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));
```

## File da modificare
- **Migrazione SQL** — aggiungere la policy super_admin su `warehouse_sections`

Un singolo cambio, nessuna modifica al codice frontend.


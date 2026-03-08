

# Migration: `get_dashboard_kpis` function

## Issue found
The provided SQL references `oi.company_id` on `order_items`, but that table has no `company_id` column. The urgent items query needs to filter via `orders.company_id` instead.

## Fix
In the URGENT ITEMS section, change:
```sql
WHERE oi.company_id = p_company_id
```
to:
```sql
WHERE o.company_id = p_company_id
```

The query already joins `orders o ON o.id = oi.order_id`, so filtering on `o.company_id` is correct.

## What will be created
Single migration file with the full `get_dashboard_kpis` function as provided, with the one fix above applied. No TypeScript files will be modified.


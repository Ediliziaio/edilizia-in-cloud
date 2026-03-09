

## Piano: 2 bug residui da fixare

### Stato attuale verificato

| Bug | Stato |
|-----|-------|
| Bug 1 — RLS WITH CHECK | **DA FARE** — nessuna migration trovata |
| Bug 2 — delete-company-user | ✅ Già fixato (riga 99: ritorna 500) |
| Bug 3 — canViewUsers | ✅ Già fixato (riga 158: `can_view_settings`) |
| Bug 4 — Math.random password | ✅ Già fixato (entrambi importano da `_shared/securePassword.ts`) |
| Bug 5 — changeRoleMutation | ✅ Già fixato (singola query `.in()` + error check) |
| Bug 6 — permessi error handling | ✅ Già fixato (riga 379: `toast.warning`) |
| Bug 7 — legacy marketing sync | **DA FARE** — `handleSavePermissions` salva raw senza sync |

### Modifiche da eseguire

**1. Migration SQL — RLS WITH CHECK su `staff_permissions`**

```sql
DROP POLICY IF EXISTS "Company admins can manage staff permissions" ON public.staff_permissions;
CREATE POLICY "Company admins can manage staff permissions"
  ON public.staff_permissions FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
```

**2. `src/hooks/useCompanyDetail.ts` — sync legacy marketing flags (riga 410)**

Prima di `supabase.from("staff_permissions").update(permissions)`, calcolare:
- `can_view_marketing` = true se almeno uno dei `can_view_marketing_*` è true
- `can_edit_marketing` = true se almeno uno dei `can_edit_marketing_*` è true

### File modificati
| File | Modifica |
|------|----------|
| Migration SQL | RLS WITH CHECK |
| `src/hooks/useCompanyDetail.ts` | Sync legacy flags in `handleSavePermissions` |


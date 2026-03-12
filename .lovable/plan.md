

# HR0 — Navigazione + Database + Permessi HR

First prompt of the HR module. Sets up the architecture: database schema, types, navigation, and main page shell.

## What gets built

1. **6 database tables** for the HR module (hr_profili, hr_timbrature, hr_giornate, hr_richieste, hr_sedi, hr_festivita)
2. **RLS policies** using existing `get_my_company_id()` and `has_role()` functions (the document's policies reference a non-existent `company_users` table — we'll fix this)
3. **DB function + trigger** for auto-calculating work days from clock-in/out events
4. **TypeScript types** at `src/types/hr.ts`
5. **Sidebar entry** "Personale & HR" under the Team subcategory in `sidebarConfig.ts`
6. **Main tabbed page** at `src/pages/azienda/personale/PersonalePage.tsx` with 6 placeholder tabs
7. **Routes** in `companyRoutes.tsx`

## Key adaptations from the document

- **RLS**: Replace all `company_users` references with `company_id = public.get_my_company_id()` for standard users + `public.has_role(auth.uid(), 'super_admin')` for super admins (matching the pattern already used on billing tables)
- **CHECK constraints**: The `sesso`, `tipo_contratto`, `orario_tipo`, `tipo` (timbrature), `stato` (giornate), etc. constraints are simple enum-like checks (no time-based logic), so they're safe to keep as CHECK constraints
- **Generated columns**: `data_evento` and `ora_evento` as GENERATED ALWAYS STORED are fine in Postgres
- **ore_mancanti** generated column uses `GREATEST(0, ore_previste - ore_lavorate)` — this is immutable, safe as CHECK

## Database migration

Single migration creating all 6 tables, indexes, RLS policies, the `calcola_giornata_hr` function, and the trigger. Policies will follow this pattern:

```sql
-- Per-table: own company access + super_admin bypass + employee self-access
CREATE POLICY "own_company" ON hr_profili FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "super_admin" ON hr_profili FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "self_read" ON hr_profili FOR SELECT TO authenticated
  USING (user_id = auth.uid());
```

## Files to create/modify

| File | Action |
|------|--------|
| `src/types/hr.ts` | Create — all HR TypeScript interfaces and types |
| `src/pages/azienda/personale/PersonalePage.tsx` | Create — tabbed container with 6 placeholder tabs |
| `src/lib/sidebarConfig.ts` | Modify — add "Personale & HR" nav item under `gi_team` |
| `src/routes/companyRoutes.tsx` | Modify — add `/azienda/personale` route |

## Not modified (as per document rules)
SettingsUsers.tsx, SettingsStaff.tsx, SettingsTeams.tsx, Employees.tsx, the `employees` table.


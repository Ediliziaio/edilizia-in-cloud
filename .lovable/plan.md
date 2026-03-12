

# F0: Billing Mode Switch System

## Overview
Add a billing mode toggle (`external` | `native`) to the companies table, a React context to read/switch it, a mode selector UI in SettingsBilling, and a route guard component. The existing billing pages remain untouched -- only wrapped with a guard.

## 1. Database Migration

Add 3 columns to `companies`:

```sql
ALTER TABLE public.companies
  ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'external',
  ADD COLUMN billing_mode_set_at TIMESTAMPTZ,
  ADD COLUMN billing_mode_set_by UUID REFERENCES auth.users(id);

-- Validation trigger (not CHECK, per guidelines)
CREATE OR REPLACE FUNCTION public.validate_billing_mode()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.billing_mode NOT IN ('external', 'native') THEN
    RAISE EXCEPTION 'Invalid billing_mode: %', NEW.billing_mode;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_billing_mode
  BEFORE INSERT OR UPDATE OF billing_mode ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.validate_billing_mode();
```

## 2. Context: `src/contexts/BillingModeContext.tsx`

- Reads `billing_mode` from `effectiveCompany` (via `useAuth`)
- Exposes `mode`, `isNative`, `isExternal`, `isLoading`, `switchMode()`
- `switchMode` updates `companies` row with `billing_mode`, `billing_mode_set_at`, `billing_mode_set_by`
- Wrap in `App.tsx` inside `AuthProvider`

## 3. Guard: `src/components/billing/BillingModeGuard.tsx`

- Accepts `requiredMode: 'external' | 'native'`
- If mode doesn't match, redirects (external routes -> `/azienda/fatturazione`, native routes -> `/azienda/documenti`)
- Shows loader while `isLoading`

## 4. Update `SettingsBilling.tsx`

Add a mode selector section at the TOP (before existing content):
- Two selectable cards: "Integrazione Esterna" (current) and "Sistema Nativo" (new)
- Visual feedback: selected card has colored border + checkmark
- Confirmation dialog when switching from external with active integrations
- Conditionally render existing integration UI only when `mode === 'external'`
- Show placeholder "Configurazione nativa in arrivo" when `mode === 'native'`

## 5. Route wrapping in `companyRoutes.tsx`

Wrap the 3 existing billing routes with `BillingModeGuard requiredMode="external"`:
- `/azienda/fatturazione` (InvoicesList)
- `/azienda/fatturazione/:id` (InvoiceDetail)
- `/azienda/scadenzario` (Scadenzario)

No changes to existing billing components themselves.

## 6. Sidebar nav update in `sidebarConfig.ts`

No change needed now -- the sidebar items stay, the guard handles redirect. Native nav items will be added in F1+.

## Files to create/modify

| File | Action |
|------|--------|
| `supabase/migrations/[new].sql` | Add billing_mode columns + trigger |
| `src/contexts/BillingModeContext.tsx` | Create context + provider + hook |
| `src/App.tsx` | Wrap with `BillingModeProvider` |
| `src/components/billing/BillingModeGuard.tsx` | Create guard component |
| `src/pages/azienda/settings/SettingsBilling.tsx` | Add mode selector UI at top |
| `src/routes/companyRoutes.tsx` | Wrap billing routes with guard |


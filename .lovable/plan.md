

## Piano: Feature Flags System

Sostituire il sistema hardcoded "Implementations" (solo `messaging_beta_enabled` su `companies`) con un sistema di feature flags completo e configurabile.

### 1. Database — 2 nuove tabelle + seed data

**Migration SQL:**

```sql
CREATE TABLE public.platform_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'core',  -- core | addon | beta | enterprise
  is_beta BOOLEAN DEFAULT false,
  default_value BOOLEAN DEFAULT false,
  plans_included TEXT[] DEFAULT '{}',
  price_per_month DECIMAL(10,2),
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.company_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  feature_key TEXT REFERENCES public.platform_feature_flags(key) ON DELETE CASCADE NOT NULL,
  is_enabled BOOLEAN NOT NULL,
  override_reason TEXT,
  override_by UUID,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, feature_key)
);

ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_feature_overrides ENABLE ROW LEVEL SECURITY;

-- Super admins: full access
CREATE POLICY "Super admins manage feature flags"
  ON public.platform_feature_flags FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Company admins/staff: read-only on flags
CREATE POLICY "Authenticated users can read feature flags"
  ON public.platform_feature_flags FOR SELECT
  TO authenticated USING (true);

-- Super admins: full access on overrides
CREATE POLICY "Super admins manage overrides"
  ON public.company_feature_overrides FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Company admins: read own overrides
CREATE POLICY "Company users read own overrides"
  ON public.company_feature_overrides FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));
```

**Seed data** (insert via insert tool):
```sql
INSERT INTO platform_feature_flags (key, name, description, category, is_beta, default_value, plans_included, icon, sort_order) VALUES
  ('ai_agents', 'Agenti AI', 'Assistenti AI per automazione task e conversazioni', 'addon', false, true, '{enterprise}', 'Bot', 1),
  ('whatsapp', 'WhatsApp Business', 'Invio messaggi WhatsApp ai contatti', 'addon', false, true, '{pro,enterprise}', 'MessageCircle', 2),
  ('reporting_advanced', 'Reporting Avanzato', 'Report personalizzati e dashboard avanzate', 'addon', false, false, '{enterprise}', 'BarChart3', 3),
  ('messaging_beta', 'Messaggistica', 'Modulo di messaggistica con AI per conversazioni', 'beta', true, false, '{}', 'MessageSquare', 4),
  ('ai_agents_internal', 'Agenti AI Gestione Interna', 'AI per gestione ordini e magazzino', 'beta', true, false, '{}', 'Cpu', 5),
  ('email_marketing', 'Email Marketing', 'Campagne email automatizzate', 'addon', false, true, '{pro,enterprise}', 'Mail', 6),
  ('automations', 'Automazioni Marketing', 'Workflow automatizzati per il CRM', 'core', false, true, '{base,pro,enterprise}', 'Zap', 7);
```

**Migrate existing data**: Convert `companies.messaging_beta_enabled = true` rows into `company_feature_overrides` records.

### 2. Hook — `useFeatureFlags`

**File:** `src/hooks/useFeatureFlags.ts`

- Accepts optional `companyId` parameter (defaults to `effectiveCompany.id` from AuthContext)
- Queries `platform_feature_flags` and `company_feature_overrides` for the company
- Also reads the company's subscription plan's `included_modules` for plan-based resolution
- Returns `{ flags: Record<string, boolean>, isLoading, isFeatureEnabled(key) }`
- Resolution logic: `override.is_enabled ?? (plans_included.includes(currentPlan) ? true : default_value)`
- Check `expires_at`: if expired, treat as no override

### 3. Update `CompanyLayout.tsx` — Consume feature flags

Replace `messaging_beta_enabled` check with `useFeatureFlags()`. The `filterNavItems` function will call `isFeatureEnabled(item.featureKey)` for items that have a feature flag key.

Update `useSubscriptionLimits.ts` `isModuleEnabled` to also check feature flags (or merge the two systems).

### 4. Admin Page — Replace `Implementations.tsx` with `FeatureFlags.tsx`

**File:** `src/pages/admin/FeatureFlags.tsx` (replaces Implementations)

UI structure:
- Header: "Feature Flags" + description
- Filter tabs: Tutti | Core | Addon | Beta | Enterprise
- Grid of cards, one per flag:
  - Icon + name + category badge (colored: core=blue, addon=purple, beta=amber, enterprise=indigo)
  - Description
  - "Default attivo" toggle (changes `default_value`)
  - "Piani inclusi" badges
  - Stats: "Attivo su N/M aziende"
  - Button "Gestisci aziende" opens per-company dialog (same as current Implementations dialog but reads from overrides table)
  - Bulk enable/disable all companies

### 5. CompanyDetail — Feature Flags tab in `CompanySaaSTab.tsx`

Add a section "Feature Flags" in the existing SaaS tab showing:
- All flags with effective status for that company
- Toggle per flag to create/update/delete `company_feature_overrides`
- Badge showing source: "Piano" (from plan), "Override" (manual), "Default"
- Optional reason field when toggling

### 6. Route + Sidebar updates

- `App.tsx`: Change route from `/admin/implementazioni` to `/admin/feature-flags`, lazy import `FeatureFlags`
- `AdminLayout.tsx`: Update sidebar item title to "Feature Flags", URL to `/admin/feature-flags`
- Keep `/admin/implementazioni` as redirect to `/admin/feature-flags` for backward compat

### File summary

| File | Action |
|------|--------|
| Migration SQL | Create 2 tables + RLS + seed |
| `src/hooks/useFeatureFlags.ts` | New hook |
| `src/pages/admin/FeatureFlags.tsx` | New page (replaces Implementations) |
| `src/pages/admin/Implementations.tsx` | Remove |
| `src/components/admin/company/CompanySaaSTab.tsx` | Add feature flags section |
| `src/components/layouts/CompanyLayout.tsx` | Use `useFeatureFlags` |
| `src/components/layouts/AdminLayout.tsx` | Update sidebar |
| `src/App.tsx` | Update route |
| `src/lib/adminConstants.ts` | No change needed |


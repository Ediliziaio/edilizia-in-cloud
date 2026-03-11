

# Gestione Utenti GHL-Style: 2 Livelli (Team Piattaforma + Multi-Azienda)

## Panoramica

Implementazione di un sistema di gestione utenti ispirato a GoHighLevel con 2 nuovi livelli:
- **Livello 1 - Team Piattaforma**: staff interno con ruoli predefiniti (platform_manager, platform_sales, platform_support, platform_marketing, platform_implementation) che accedono a /admin con permessi filtrati
- **Livello 2 - Utenti Multi-Azienda**: consulenti/partner che accedono a /azienda con company switcher per navigare tra più aziende

## Modifiche Database (3 migrazioni)

### Migrazione 1: Nuovi ruoli nell'enum `app_role`
```sql
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'platform_manager';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'platform_sales';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'platform_support';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'platform_marketing';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'platform_implementation';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'multi_company_user';
```

### Migrazione 2: Tabella `multi_company_access`
```sql
CREATE TABLE public.multi_company_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  access_role TEXT NOT NULL DEFAULT 'company_staff',
  granted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, company_id)
);
ALTER TABLE multi_company_access ENABLE ROW LEVEL SECURITY;
-- RLS: solo super_admin
CREATE POLICY "super_admin_manage" ON multi_company_access FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));
```

### Migrazione 3: Nuovi campi su `super_admin_permissions`
```sql
ALTER TABLE super_admin_permissions
  ADD COLUMN IF NOT EXISTS platform_role TEXT DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT;
```

## Edge Function: `manage-platform-users`

Nuova edge function (NON modifica `manage-super-admins`) con actions:
- **list**: fetch utenti con ruoli platform_* + super_admin, join con permessi e profili
- **create**: crea utente con ruolo piattaforma, profilo (company_id: null), permessi preset
- **delete**: rimuove utente dal team piattaforma
- **update-permissions**: aggiorna ruolo e permessi con supporto preset
- **list-multi-company**: fetch utenti multi_company_user con le loro aziende
- **create-multi-company**: crea utente multi-company con accessi a N aziende
- **update-company-access**: aggiungi/rimuovi accesso azienda per utente multi-company

## Componenti UI (6 nuovi file)

### 1. Refactor `AdminSettingsSuperAdmins.tsx`
Pagina a 2 tab: "Team Piattaforma" + "Utenti Multi-Azienda"

### 2. `PlatformTeamTab.tsx`
Tabella con stat cards per ruolo, lista membri con badge ruolo colorato, menu azioni (permessi, reset pw, rimuovi)

### 3. `CreatePlatformUserDialog.tsx`
Dialog a 3 step: scelta ruolo (card selezionabili) → dati personali → riepilogo e conferma

### 4. `PlatformPermissionsDialog.tsx`
Select per cambio ruolo con auto-apply preset + toggle granulari per permessi + selezione aziende accessibili

### 5. `MultiCompanyUsersTab.tsx`
Layout 2 colonne: lista utenti a sinistra, dettaglio aziende accessibili a destra con gestione accessi inline

### 6. `CreateMultiCompanyUserDialog.tsx`
Dialog a 2 step: dati utente → selezione aziende con ruolo per-azienda

## Modifiche ai file esistenti

### `src/types/auth.ts`
- Aggiunta tipo `PlatformRole`, `MultiCompanyAccess`
- Aggiornamento `AppRole` con i nuovi ruoli
- Export costanti `PLATFORM_ROLE_PRESETS` e `PLATFORM_ROLE_DESCRIPTIONS`

### `src/contexts/AuthContext.tsx`
- Nuovo stato: `multiCompanyAccesses`, `selectedMultiCompany`
- Nuova funzione `switchMultiCompany` (con persistenza in sessionStorage)
- Aggiornamento `effectiveCompany` per supportare multi_company_user
- `effectiveRoleInCompany` per il ruolo effettivo nell'azienda selezionata

### `src/components/auth/ProtectedRoute.tsx`
- `ADMIN_ROLES` include i nuovi platform_* roles per accesso a /admin
- Redirect multi_company_user a /azienda

### `src/components/auth/RoleBasedRedirect.tsx`
- Cases per platform_* → /admin
- Case per multi_company_user → /azienda/dashboard

### `src/components/layouts/CompanyLayout.tsx`
- Nuovo componente `MultiCompanySwitcher` (dropdown) visibile solo per multi_company_user

### `src/components/layouts/AdminLayout.tsx`
- Sezione profilo in sidebar per utenti platform_* (non super_admin)

## Ordine di implementazione

1. Migrazioni database (3 SQL)
2. Tipi TypeScript in `auth.ts`
3. Edge function `manage-platform-users`
4. Componenti UI (tab, dialogs)
5. AuthContext + ProtectedRoute + RoleBasedRedirect
6. Layout updates (CompanySwitcher, AdminLayout)


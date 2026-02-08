
# Piano: Gestione Utenti Aziendali con Permessi Granulari

## Panoramica

Implementazione di un sistema che permette all'Admin aziendale di creare utenti interni all'azienda (es. magazziniere, commerciale, operaio) con accessi specifici alle diverse sezioni del gestionale.

---

## 1. Nuovo Ruolo: `company_staff`

Aggiungere un nuovo ruolo all'enum `app_role` per gli utenti staff dell'azienda:

```sql
ALTER TYPE app_role ADD VALUE 'company_staff';
```

Gerarchia ruoli:
- `super_admin` - Accesso totale a tutte le aziende
- `company_admin` - Accesso totale alla propria azienda
- `company_staff` - Accesso limitato alle sezioni autorizzate (NUOVO)
- `customer` - Solo area cliente

---

## 2. Nuova Tabella: `staff_permissions`

Tabella per gestire i permessi granulari per ogni utente staff:

```sql
CREATE TABLE staff_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Permessi per sezione (true = accesso consentito)
  can_view_dashboard boolean DEFAULT false,
  can_view_orders boolean DEFAULT false,
  can_edit_orders boolean DEFAULT false,
  can_view_warehouse boolean DEFAULT false,
  can_edit_warehouse boolean DEFAULT false,
  can_view_calendar boolean DEFAULT false,
  can_view_customers boolean DEFAULT false,
  can_edit_customers boolean DEFAULT false,
  can_view_employees boolean DEFAULT false,
  can_view_tickets boolean DEFAULT false,
  can_edit_tickets boolean DEFAULT false,
  can_view_forecast boolean DEFAULT false,
  can_view_settings boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(user_id, company_id)
);
```

---

## 3. Sezioni e Permessi Disponibili

| Sezione | Permesso View | Permesso Edit | Descrizione |
|---------|---------------|---------------|-------------|
| Dashboard | `can_view_dashboard` | - | Visualizza statistiche |
| Ordini | `can_view_orders` | `can_edit_orders` | Lista/dettaglio ordini |
| Magazzino | `can_view_warehouse` | `can_edit_warehouse` | Gestione articoli |
| Calendario | `can_view_calendar` | - | Visualizza programmazione |
| Clienti | `can_view_customers` | `can_edit_customers` | Anagrafica clienti |
| Dipendenti | `can_view_employees` | - | Solo visualizzazione |
| Assistenza | `can_view_tickets` | `can_edit_tickets` | Ticket supporto |
| Previsionale | `can_view_forecast` | - | Cash flow |
| Impostazioni | `can_view_settings` | - | Solo admin |

---

## 4. Interfaccia Utente

### 4.1 Nuova Pagina: Gestione Utenti

URL: `/azienda/utenti`

```
Utenti Aziendali
Gestisci gli accessi del tuo team
                                              [+ Nuovo Utente]
+------------+---------------+----------------+--------+--------+
| Nome       | Email         | Permessi       | Stato  | Azioni |
+------------+---------------+----------------+--------+--------+
| Mario      | mario@...     | Magazzino,     | Attivo | [Perm] |
| Rossi      |               | Ordini         |        | [Mod]  |
|            |               |                |        | [Elim] |
+------------+---------------+----------------+--------+--------+
| Luca       | luca@...      | Solo Calendario| Attivo | [Perm] |
| Bianchi    |               |                |        | [Mod]  |
|            |               |                |        | [Elim] |
+------------+---------------+----------------+--------+--------+
```

### 4.2 Dialog Creazione Utente

```
+--------------------------------------------+
|          Nuovo Utente Aziendale            |
+--------------------------------------------+
| Nome *                                     |
| [_____________________________________]    |
|                                            |
| Cognome *                                  |
| [_____________________________________]    |
|                                            |
| Email *                                    |
| [_____________________________________]    |
|                                            |
|                    [Annulla] [Crea Utente] |
+--------------------------------------------+
```

### 4.3 Dialog Permessi

```
+--------------------------------------------+
|    Permessi - Mario Rossi                  |
+--------------------------------------------+
| Seleziona le sezioni a cui puo accedere:   |
|                                            |
|  [ ] Dashboard                             |
|  [x] Ordini                                |
|      [x] Puo modificare                    |
|  [x] Magazzino                             |
|      [x] Puo modificare                    |
|  [ ] Calendario                            |
|  [ ] Clienti                               |
|  [ ] Dipendenti                            |
|  [ ] Assistenza                            |
|  [ ] Previsionale                          |
|                                            |
|                    [Annulla] [Salva]       |
+--------------------------------------------+
```

---

## 5. Logica Frontend

### 5.1 Hook `usePermissions`

```typescript
// src/hooks/usePermissions.ts

interface Permissions {
  canViewDashboard: boolean;
  canViewOrders: boolean;
  canEditOrders: boolean;
  canViewWarehouse: boolean;
  canEditWarehouse: boolean;
  canViewCalendar: boolean;
  canViewCustomers: boolean;
  canEditCustomers: boolean;
  canViewEmployees: boolean;
  canViewTickets: boolean;
  canEditTickets: boolean;
  canViewForecast: boolean;
  canViewSettings: boolean;
  isAdmin: boolean; // company_admin o super_admin = tutto
}

export function usePermissions(): Permissions {
  const { role, user } = useAuth();
  
  // Admin ha tutti i permessi
  if (role === "super_admin" || role === "company_admin") {
    return {
      canViewDashboard: true,
      canViewOrders: true,
      // ... tutti true
      isAdmin: true,
    };
  }
  
  // Staff: carica permessi dal database
  // ...
}
```

### 5.2 Menu Dinamico

Il menu laterale mostrera solo le voci a cui l'utente ha accesso:

```typescript
// CompanyLayout.tsx
const { permissions } = usePermissions();

const visibleNavItems = navItems.filter(item => {
  if (item.url === "/azienda") return permissions.canViewDashboard;
  if (item.url === "/azienda/ordini") return permissions.canViewOrders;
  if (item.url === "/azienda/magazzino") return permissions.canViewWarehouse;
  // ...
  return false;
});
```

### 5.3 Protezione Route

```typescript
// Nuova route protetta con permessi
<Route 
  path="magazzino" 
  element={
    <PermissionGuard permission="canViewWarehouse">
      <Warehouse />
    </PermissionGuard>
  } 
/>
```

---

## 6. Edge Function: `create-company-staff`

Nuova edge function per creare utenti staff:

```typescript
// Input
{
  first_name: string;
  last_name: string;
  email: string;
  company_id: string;
  permissions: {
    can_view_dashboard: boolean;
    can_view_orders: boolean;
    can_edit_orders: boolean;
    // ...
  };
}

// Output
{
  success: true;
  user_id: string;
  temporary_password: string; // Generata automaticamente
}
```

---

## 7. File da Creare/Modificare

| File | Operazione | Descrizione |
|------|------------|-------------|
| `supabase/migrations/xxx.sql` | Creare | Nuova tabella staff_permissions + update enum |
| `supabase/functions/create-company-staff/index.ts` | Creare | Edge function per creare utenti staff |
| `src/hooks/usePermissions.ts` | Creare | Hook per gestione permessi |
| `src/pages/azienda/CompanyUsers.tsx` | Creare | Pagina gestione utenti |
| `src/components/users/UserDialog.tsx` | Creare | Dialog creazione utente |
| `src/components/users/PermissionsDialog.tsx` | Creare | Dialog modifica permessi |
| `src/components/auth/PermissionGuard.tsx` | Creare | Componente protezione route |
| `src/types/auth.ts` | Modificare | Aggiungere tipo company_staff |
| `src/contexts/AuthContext.tsx` | Modificare | Caricare permessi per staff |
| `src/components/layouts/CompanyLayout.tsx` | Modificare | Menu dinamico |
| `src/App.tsx` | Modificare | Nuove route con permessi |

---

## 8. Sezione Tecnica

### Database Migration

```sql
-- Aggiunge nuovo valore all'enum
ALTER TYPE app_role ADD VALUE 'company_staff';

-- Tabella permessi
CREATE TABLE staff_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  can_view_dashboard boolean DEFAULT false,
  can_view_orders boolean DEFAULT false,
  can_edit_orders boolean DEFAULT false,
  can_view_warehouse boolean DEFAULT false,
  can_edit_warehouse boolean DEFAULT false,
  can_view_calendar boolean DEFAULT false,
  can_view_customers boolean DEFAULT false,
  can_edit_customers boolean DEFAULT false,
  can_view_employees boolean DEFAULT false,
  can_view_tickets boolean DEFAULT false,
  can_edit_tickets boolean DEFAULT false,
  can_view_forecast boolean DEFAULT false,
  can_view_settings boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(user_id, company_id)
);

ALTER TABLE staff_permissions ENABLE ROW LEVEL SECURITY;

-- RLS: Solo admin puo gestire i permessi
CREATE POLICY "Company admins can manage staff permissions"
  ON staff_permissions FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin') AND
    company_id = get_user_company_id(auth.uid())
  );

-- RLS: Staff puo vedere i propri permessi
CREATE POLICY "Staff can view their own permissions"
  ON staff_permissions FOR SELECT
  USING (user_id = auth.uid());

-- Super admin
CREATE POLICY "Super admins can manage all staff permissions"
  ON staff_permissions FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));
```

### Funzione helper per verificare permessi

```sql
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN has_role(_user_id, 'super_admin') THEN true
      WHEN has_role(_user_id, 'company_admin') THEN true
      WHEN has_role(_user_id, 'company_staff') THEN
        CASE _permission
          WHEN 'can_view_dashboard' THEN (SELECT can_view_dashboard FROM staff_permissions WHERE user_id = _user_id)
          WHEN 'can_view_orders' THEN (SELECT can_view_orders FROM staff_permissions WHERE user_id = _user_id)
          WHEN 'can_edit_orders' THEN (SELECT can_edit_orders FROM staff_permissions WHERE user_id = _user_id)
          -- ... altri permessi
          ELSE false
        END
      ELSE false
    END
$$;
```

### Hook usePermissions

```typescript
export function usePermissions() {
  const { role, user, effectiveCompany } = useAuth();
  
  const { data: permissions } = useQuery({
    queryKey: ["staff-permissions", user?.id],
    queryFn: async () => {
      if (role !== "company_staff") return null;
      
      const { data, error } = await supabase
        .from("staff_permissions")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      
      if (error) return null;
      return data;
    },
    enabled: role === "company_staff",
  });
  
  // Admin = tutti i permessi
  if (role === "super_admin" || role === "company_admin") {
    return {
      canViewDashboard: true,
      canViewOrders: true,
      canEditOrders: true,
      canViewWarehouse: true,
      canEditWarehouse: true,
      canViewCalendar: true,
      canViewCustomers: true,
      canEditCustomers: true,
      canViewEmployees: true,
      canViewTickets: true,
      canEditTickets: true,
      canViewForecast: true,
      canViewSettings: true,
      isAdmin: true,
      isLoading: false,
    };
  }
  
  // Staff = permessi dal database
  return {
    canViewDashboard: permissions?.can_view_dashboard ?? false,
    canViewOrders: permissions?.can_view_orders ?? false,
    canEditOrders: permissions?.can_edit_orders ?? false,
    canViewWarehouse: permissions?.can_view_warehouse ?? false,
    canEditWarehouse: permissions?.can_edit_warehouse ?? false,
    canViewCalendar: permissions?.can_view_calendar ?? false,
    canViewCustomers: permissions?.can_view_customers ?? false,
    canEditCustomers: permissions?.can_edit_customers ?? false,
    canViewEmployees: permissions?.can_view_employees ?? false,
    canViewTickets: permissions?.can_view_tickets ?? false,
    canEditTickets: permissions?.can_edit_tickets ?? false,
    canViewForecast: permissions?.can_view_forecast ?? false,
    canViewSettings: permissions?.can_view_settings ?? false,
    isAdmin: false,
    isLoading: !permissions && role === "company_staff",
  };
}
```

### Componente PermissionGuard

```typescript
interface PermissionGuardProps {
  permission: keyof ReturnType<typeof usePermissions>;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGuard({ 
  permission, 
  children, 
  fallback 
}: PermissionGuardProps) {
  const permissions = usePermissions();
  
  if (permissions.isLoading) {
    return <LoadingSpinner />;
  }
  
  if (!permissions[permission]) {
    return fallback || <AccessDenied />;
  }
  
  return <>{children}</>;
}
```

---

## 9. Flusso Utente

1. L'Admin aziendale va su "Utenti" nel menu
2. Clicca "Nuovo Utente"
3. Inserisce nome, cognome, email
4. Il sistema crea l'utente con password temporanea
5. Mostra la password temporanea da comunicare all'utente
6. L'admin clicca sull'icona permessi per configurare gli accessi
7. Seleziona le sezioni a cui l'utente puo accedere
8. L'utente staff fa login e vede solo le sezioni autorizzate

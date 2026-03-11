

# Piano: Correggere la cancellazione incompleta di utenti e contatti

## Problemi trovati

### Bug 1 — CompanyCustomerDetail.tsx: cancellazione diretta da `profiles` (CRITICO)
La pagina dettaglio cliente (`CompanyCustomerDetail.tsx` riga 162) esegue:
```typescript
supabase.from("profiles").delete().eq("id", id!)
```
Questo **NON** elimina `auth.users`, `user_roles`, `staff_permissions`. Il record `auth.users` rimane orfano e l'email non può essere riutilizzata. Inoltre, FK con `NO ACTION` su `profiles` (orders.assigned_to, tasks.assigned_to, ecc.) possono **bloccare** la cancellazione.

**Fix**: Usare la edge function `delete-company-user` (come già fa `CustomersList.tsx`).

---

### Bug 2 — manage-platform-users delete: manca pulizia `staff_permissions`
L'azione `delete` (riga 304-308) pulisce `super_admin_permissions`, `user_roles`, `profiles` e `auth.users`, ma **non** `staff_permissions`. Questa tabella non ha FK verso `profiles` o `auth.users` (solo verso `companies`), quindi i record rimangono orfani.

**Fix**: Aggiungere `staff_permissions.delete().eq("user_id", userId)` prima delle altre operazioni.

---

### Bug 3 — FK con `NO ACTION` che bloccano la cancellazione auth.users
Quando `delete-company-user` o `manage-platform-users` chiamano `auth.admin.deleteUser()`, le seguenti FK con `NO ACTION` possono far **fallire** la cancellazione:

| Tabella | Colonna | Soluzione |
|---------|---------|-----------|
| `referrers` | `user_id` | SET NULL |
| `marketing_contacts` | `call_center_id` | SET NULL |
| `marketing_opportunities` | `call_center_id` | SET NULL |
| `orders` | `assigned_to` | SET NULL |
| `tasks` | `assigned_to` | SET NULL |
| `invoices` | `created_by` | SET NULL |
| `invoice_payments` | `created_by` | SET NULL |
| `signature_requests` | `created_by` | SET NULL |
| `marketing_contact_notes` | `created_by` | SET NULL |
| `marketing_contact_activities` | `created_by` | SET NULL |
| `work_logs` | `approved_by` | SET NULL |
| `scadenze` | `created_by` | SET NULL |
| `prima_nota_entries` | `created_by` | SET NULL |
| `purchase_orders` | `created_by` | SET NULL |
| `bank_connections` | `created_by` | SET NULL |
| `bank_sync_logs` | `triggered_by` | SET NULL |
| `platform_announcements` | `created_by` | SET NULL |
| `platform_settings` | `updated_by` | SET NULL |
| `companies` | `white_label_enabled_by` | SET NULL |
| `company_addons_log` | `performed_by` | SET NULL |
| `company_onboarding` | `assigned_cs` | SET NULL |
| `cs_tasks` | `assigned_to` | SET NULL |
| `inventory_audits` | `performed_by` | SET NULL |
| `user_sessions` | `revoked_by` | SET NULL |
| `multi_company_access` | `granted_by` | SET NULL |

**Fix**: Migrazione DB per cambiare tutte queste FK da `NO ACTION` a `ON DELETE SET NULL`.

---

### Bug 4 — FK con `NO ACTION` che bloccano cancellazione marketing_contacts
| Tabella | Colonna | Soluzione |
|---------|---------|-----------|
| `internal_call_logs` | `contact_id` | SET NULL |
| `invoices` | `client_id` | SET NULL |

**Fix**: Migrazione DB per cambiare queste FK a `ON DELETE SET NULL`.

---

## Modifiche

### 1. Migrazione DB
Una singola migrazione SQL che altera tutte le FK `NO ACTION` → `ON DELETE SET NULL` per le tabelle sopra elencate (sia quelle che referenziano `auth.users` che quelle che referenziano `profiles` e `marketing_contacts`).

### 2. `src/pages/azienda/CompanyCustomerDetail.tsx`
Sostituire la cancellazione diretta con la chiamata a `delete-company-user`:
```typescript
const { data, error } = await supabase.functions.invoke("delete-company-user", {
  body: { userId: id },
});
```

### 3. `supabase/functions/manage-platform-users/index.ts`
Aggiungere nella sezione delete (riga 305):
```typescript
await supabaseAdmin.from("staff_permissions").delete().eq("user_id", userId);
```

### File impattati
- `src/pages/azienda/CompanyCustomerDetail.tsx`
- `supabase/functions/manage-platform-users/index.ts`
- Migrazione DB (FK constraints)


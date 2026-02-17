
# Piano: Permessi Granulari Navigazione + Audit Log + Quick Impersonation

## 1. Applicare i permessi granulari alla navigazione Admin

### Hook: `useSuperAdminPermissions`
Creare un hook `src/hooks/useSuperAdminPermissions.ts` che:
- Recupera i permessi dalla tabella `super_admin_permissions` per l'utente corrente
- Espone un oggetto con i flag booleani e `allowed_company_ids`
- Cachea con `staleTime` di 5 minuti
- Ritorna `isLoading` e valori default `true` durante il caricamento (per non bloccare l'UI)

### Sidebar: filtrare le voci di menu
Modificare `AdminLayout.tsx`:
- Importare il hook `useSuperAdminPermissions`
- Mappare ogni voce di navigazione al permesso corrispondente:
  - Dashboard -> `can_view_platform_stats`
  - Aziende -> `can_manage_companies`
  - Assistenza -> `can_manage_tickets`
  - Piani -> `can_manage_plans`
  - Referral -> `can_manage_referrals`
  - Impostazioni -> sempre visibile
- Filtrare `navItems` rimuovendo le voci non autorizzate

### Pagine: bloccare l'accesso diretto
Modificare ogni pagina admin per controllare il permesso corrispondente e mostrare un componente "Accesso Negato" se il permesso e disabilitato:
- `AdminDashboard.tsx` -> `can_view_platform_stats`
- `CompaniesList.tsx`, `CreateCompany.tsx`, `CompanyDetail.tsx` -> `can_manage_companies`
- `GlobalTickets.tsx` -> `can_manage_tickets`
- `SubscriptionPlans.tsx` -> `can_manage_plans`
- `ReferralDashboard.tsx` -> `can_manage_referrals`
- `AdminSettings.tsx` -> il tab "Super Admin" visibile solo se `can_manage_admins`

---

## 2. Audit Log Super Admin

### Tabella `admin_audit_log`
Migrazione SQL per creare:

```text
+------------------+--------+-----------+
| Colonna          | Tipo   | Default   |
+------------------+--------+-----------+
| id               | uuid   | random    |
| user_id          | uuid   | NOT NULL  |
| action           | text   | NOT NULL  |
| target_type      | text   | NULL      |
| target_id        | text   | NULL      |
| details          | jsonb  | NULL      |
| ip_address       | text   | NULL      |
| created_at       | tstz   | now()     |
+------------------+--------+-----------+
```

RLS: solo `super_admin` puo leggere (SELECT). INSERT tramite edge function con service role.

### Edge function: registrazione audit
Aggiornare `manage-super-admins/index.ts`:
- Aggiungere una funzione helper `logAudit(supabaseAdmin, callerId, action, targetType, targetId, details)` che inserisce nella tabella
- Registrare tutte le azioni: `create_admin`, `delete_admin`, `reset_password`, `update_permissions`
- Aggiungere un'azione `audit-log` per recuperare i log paginati

### UI: Tab Audit Log nelle Impostazioni
Creare `src/components/admin/settings/AuditLogTab.tsx`:
- Tabella con colonne: Data, Admin, Azione, Dettaglio
- Filtri per tipo azione e data range
- Paginazione (20 per pagina)

Modificare `AdminSettings.tsx`:
- Aggiungere il tab "Registro Attivita" (visibile solo se `can_manage_admins`)

### Audit log per impersonazione
Registrare l'evento anche quando un admin impersona un'azienda:
- Aggiungere un'azione `log-impersonation` nell'edge function
- Chiamare questa azione da `AuthContext.tsx` quando `impersonateCompany` viene invocato

---

## 3. Selettore rapido impersonazione nella Sidebar Admin

Modificare `AdminLayout.tsx`:
- Aggiungere una sezione "Accesso Rapido" prima del bottone "Esci"
- Mostrare un combobox/select con le aziende (filtrate per `allowed_company_ids` se configurato)
- Al click su un'azienda, invocare `impersonateCompany(id)` e navigare a `/azienda`
- Icona `LogIn` + nome azienda abbreviato
- La lista viene caricata con una query `companies` con `staleTime` 5min
- Visibile solo se `can_manage_companies` e attivo

---

## 4. Pulizia e stabilizzazione

### Controlli da effettuare
- Verificare che `getClaims` nell'edge function sia compatibile (fallback a `getUser` se necessario)
- Assicurare che i permessi default (tutti `true`) non blocchino admin esistenti senza riga in `super_admin_permissions`
- L'hook `useSuperAdminPermissions` deve trattare "nessun record" come "accesso completo" (backward compatible)

---

## Riepilogo file

| File | Azione |
|------|--------|
| Migrazione SQL | Tabella `admin_audit_log` + RLS |
| `src/hooks/useSuperAdminPermissions.ts` | Nuovo hook permessi |
| `src/components/layouts/AdminLayout.tsx` | Filtro nav + quick impersonation |
| `src/components/admin/settings/AuditLogTab.tsx` | Nuovo tab audit log |
| `src/pages/admin/AdminSettings.tsx` | + tab Registro Attivita |
| `src/pages/admin/AdminDashboard.tsx` | Guard permesso |
| `src/pages/admin/CompaniesList.tsx` | Guard permesso |
| `src/pages/admin/CompanyDetail.tsx` | Guard permesso |
| `src/pages/admin/CreateCompany.tsx` | Guard permesso |
| `src/pages/admin/GlobalTickets.tsx` | Guard permesso |
| `src/pages/admin/SubscriptionPlans.tsx` | Guard permesso |
| `src/pages/admin/ReferralDashboard.tsx` | Guard permesso |
| `supabase/functions/manage-super-admins/index.ts` | + audit helper + azioni audit-log e log-impersonation |
| `src/contexts/AuthContext.tsx` | + log impersonazione |

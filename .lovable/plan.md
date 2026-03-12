

# Piano: Super Admin Team Management GHL-Style

## Stato attuale

- **SuperAdminUsersTab**: tabella semplice con colonne Nome/Email/Permessi/Data, azioni via bottoni (dialog permessi, reset pwd, elimina)
- **SuperAdminPermissionsDialog**: gia completo con toggle per ogni permesso + company restriction
- **manage-super-admins** edge function: gia supporta list, create, delete, update-permissions, reset-password
- **NotificationsTab**: NON ha `as any` — usa tipi corretti gia. Ha solo 3 notifiche (new_company, trial_expiring, new_ticket)
- **profiles**: ha gia `last_login_at`, `avatar_url`, `email`
- **admin_invites**: NON esiste

## Implementazione

### 1. DB Migration
- Creare tabella `admin_invites` (email, token UNIQUE, invited_by, permissions JSONB, accepted_at, expires_at) con RLS service_role only
- Aggiungere colonne `payment_failed_alert`, `company_suspended_alert`, `new_referral_signup` a `admin_notification_prefs`

### 2. Creare `src/hooks/useAdminTeam.ts`
Hook centralizzato che include:
- Tipi (`AdminPermissions`, `AdminMember` con lastLoginAt, activeSessions, avatarUrl)
- Costanti: `PERMISSION_PRESETS` (Accesso Completo, Solo Lettura, Gestore Aziende, Supporto), `PERMISSION_LABELS` con descrizioni
- `useAdminTeam()`: fetch via manage-super-admins "list" action, enrichito con sessioni attive (query admin_sessions) e last_login_at
- `useUpdateAdminPermission()`: toggle singolo permesso inline via manage-super-admins "update-permissions"
- `useApplyPermissionPreset()`: applica preset completo
- `useInviteAdmin()`: invoca edge function invite-admin
- `useDeleteAdmin()`: elimina admin

### 3. Edge Function `invite-admin`
- Verifica auth + can_manage_admins
- Inserisce record in admin_invites con token UUID e scadenza 7 giorni
- Invia email con link di invito (via provider email configurato)

### 4. Riscrivere `SuperAdminUsersTab.tsx`
Redesign completo in stile GHL:
- **Header** con titolo + bottone "Invita Admin"
- **KPI strip**: Totale Admin, Sessioni attive, Accesso completo
- **Barra ricerca** con filtro su nome/email
- **Permission Matrix**: tabella con colonne per ogni permesso (Statistiche, Aziende, Piani, Ticket, Referral, Admin Team) + toggle inline Switch per ogni cella
- **Colonna Preset**: dropdown per applicare preset rapido
- **Colonna Attivita**: sessioni attive + ultimo accesso (formatDistanceToNow)
- **Card Azioni individuali**: reset password + elimina per ogni admin
- **InviteAdminDialog**: form con email + selezione preset livello accesso
- **DeleteConfirmDialog**: conferma eliminazione con nome evidenziato
- Mantiene `export default` per compatibilita

### 5. Aggiornare NotificationsTab
- Aggiungere le 3 nuove notifiche (payment_failed_alert, company_suspended_alert, new_referral_signup) con icone appropriate
- Aggiornare tipo `Prefs` e `defaults` per includere i nuovi campi
- Aggiornare la select query per includere le nuove colonne

### File impattati
| File | Azione |
|---|---|
| DB migration | Tabella `admin_invites` + 3 colonne su `admin_notification_prefs` |
| `src/hooks/useAdminTeam.ts` | Nuovo |
| `supabase/functions/invite-admin/index.ts` | Nuovo |
| `src/components/admin/settings/SuperAdminUsersTab.tsx` | Riscrittura completa |
| `src/components/admin/settings/NotificationsTab.tsx` | Aggiungere 3 notifiche |




# Audit Sezione Utenti, Ruoli e Autorizzazioni - Report Completo

## Stato AS-IS

Il sistema e funzionalmente solido dopo 3 round di fix. I flussi principali (creazione, modifica, eliminazione utente, gestione ruoli e permessi, reset password) sono corretti. Le Edge Function sono ben protette con CORS, auth verification e tenant isolation.

## Problemi Residui Identificati

### P1 - Sidebar non enforca permessi granulari marketing

**Problema**: `sidebarConfig.ts` usa `permissionKey: "canViewMarketing"` (il campo legacy) per TUTTE le 10 voci marketing. Questo significa che se un admin abilita solo "Contatti" e "Opportunità" nei permessi granulari, l'utente vede comunque tutte le voci marketing nella sidebar (Dashboard, Automazioni, Email, WhatsApp, etc.) perche il sync imposta `can_view_marketing = true` appena un qualsiasi permesso granulare e attivo.

**Fix**: 
- In `sidebarConfig.ts`, mappare ogni voce marketing al suo permesso granulare specifico
- In `usePermissions.ts`, esporre i permessi granulari marketing come campi separati (es. `canViewMarketingContacts`, `canViewMarketingDashboard`, etc.)
- Questo rende il sistema di autorizzazione realmente granulare end-to-end

### P2 - `reset-customer-password`: `.single()` su user_roles fragile

**Problema**: Riga 67-71 di `reset-customer-password/index.ts` usa `.single()` per ottenere il ruolo del caller. Se un utente ha piu di un ruolo, la query fallisce con errore. Lo stesso problema esiste per `targetRole` (riga 111-115).

**Fix**: Usare un pattern difensivo che recupera tutti i ruoli e cerca quello rilevante, come gia fatto in `create-company-staff` e `delete-company-user`.

### P2 - `PermissionsDialog` (legacy) duplica logica con `UserRolesPermissionsTab`

**Problema**: `PermissionsDialog.tsx` (usato in Super Admin > CompanyDetail) e `UserRolesPermissionsTab.tsx` (usato in Settings > User Detail) contengono la stessa logica di rendering permessi ma con UI differenti (checkbox vs switch). Se si aggiunge un nuovo permesso, va aggiornato in 3 posti: `permissionsDefaults.ts`, `PermissionsDialog.tsx` e `UserRolesPermissionsTab.tsx`.

**Fix**: Estrarre le costanti di sezione (`INTERNAL_SECTIONS`, `MARKETING_SECTIONS`, `STANDALONE_SECTIONS`) in un unico file `permissionsDefaults.ts` e importarle in entrambi i componenti. Questo non cambia la UI, ma centralizza la configurazione.

## Piano Interventi

### 1. Sidebar marketing granulare (P1)

**`usePermissions.ts`**: Aggiungere 12 nuovi campi granulari:
- `canViewMarketingDashboard`, `canViewMarketingContacts`, `canEditMarketingContacts`, `canViewMarketingOpportunities`, `canEditMarketingOpportunities`, `canViewMarketingActivities`, `canViewMarketingAppointments`, `canViewMarketingAutomations`, `canViewMarketingAiAgent`, `canViewMarketingEmail`, `canViewMarketingWhatsapp`, `canViewMarketingReports`

**`sidebarConfig.ts`**: Aggiornare ogni voce marketing con il `permissionKey` granulare corrispondente (es. `"canViewMarketingContacts"` per la voce "Contatti").

### 2. Fix `.single()` in `reset-customer-password` (P2)

Sostituire le due chiamate `.single()` per `callerRole` e `targetRole` con un pattern che recupera tutti i ruoli e li filtra in-memory.

### 3. Centralizzare costanti permessi (P2)

Spostare `INTERNAL_SECTIONS`, `MARKETING_SECTIONS`, `STANDALONE_SECTIONS` in `permissionsDefaults.ts`. Importarle in `PermissionsDialog.tsx`, `UserRolesPermissionsTab.tsx` e `StaffUserDialog.tsx`.

### Nessuna migrazione DB necessaria.


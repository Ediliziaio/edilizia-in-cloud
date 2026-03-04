
# Audit Sezione Utenti, Ruoli e Autorizzazioni - COMPLETATO

## Interventi Eseguiti

### 1. ✅ Sidebar marketing granulare (P1)
- `usePermissions.ts`: Aggiunti 12 campi granulari marketing (`canViewMarketingDashboard`, `canViewMarketingContacts`, etc.)
- `sidebarConfig.ts`: Ogni voce marketing ora usa il suo permesso granulare specifico
- Admins mantengono accesso completo (ALL_PERMISSIONS = true per tutti i campi)

### 2. ✅ Fix `.single()` in `reset-customer-password` (P2)
- Sostituite entrambe le chiamate `.single()` per callerRole e targetRole con pattern difensivo multi-ruolo
- Ora recupera tutti i ruoli e filtra in-memory, evitando crash con ruoli multipli

### 3. ✅ Centralizzazione costanti permessi (P2)
- `permissionsDefaults.ts`: Ora contiene `STANDALONE_SECTIONS`, `INTERNAL_SECTIONS`, `MARKETING_SECTIONS`, `ALL_PERMISSION_SECTIONS`
- `PermissionsDialog.tsx`, `StaffUserDialog.tsx`, `Employees.tsx`, `SalespeopleConfig.tsx`: Importano da file centralizzato
- Aggiungere un nuovo permesso richiede ora modifica in UN solo file

### Nessuna migrazione DB necessaria.

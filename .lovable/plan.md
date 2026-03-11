

# Allineamento UI al prompt GHL: Gap Analysis e Piano

## Cosa è già implementato correttamente
- Database: enum roles, `multi_company_access`, colonne `super_admin_permissions` ✓
- Edge Function `manage-platform-users` con tutte le actions ✓
- AuthContext con multi-company support, `switchMultiCompany`, `effectiveCompany` ✓
- ProtectedRoute e RoleBasedRedirect aggiornati ✓
- CompanyLayout con MultiCompanySwitcher ✓
- CreatePlatformUserDialog (3 step) ✓
- CreateMultiCompanyUserDialog (2 step) ✓

## Cosa manca o va raffinato

### 1. `PlatformPermissionsDialog.tsx` — **NON ESISTE**
Il componente più importante mancante. `PlatformTeamTab` attualmente usa `SuperAdminPermissionsDialog` che non ha:
- **Sezione A**: Select per cambio ruolo con auto-apply preset
- **Auto-detection** del ruolo corrente confrontando permessi attuali con i preset
- **Toast** di conferma quando si cambia ruolo dal select

Creerò `src/components/admin/settings/PlatformPermissionsDialog.tsx` con:
- Select ruolo in cima (tutti i `PlatformRole` + "custom")
- Toggle granulari per ogni permesso (riusando la stessa logica di SuperAdminPermissionsDialog)
- Sezione aziende accessibili (toggle "Tutte" + lista checkbox)
- Mutation verso `manage-platform-users` action `update-permissions`

### 2. `PlatformTeamTab.tsx` — Refinement UI
Il prompt chiede stat cards per ogni ruolo con conteggio, ma l'attuale mostra solo 3 card generiche. Aggiornamento:
- Stat cards per ogni `PlatformRole` (5 card colorate) + card Super Admin
- Avatar con iniziali nella tabella
- Colonna "Permessi" con badge per ogni `can_*` attivo
- Usare `PlatformPermissionsDialog` al posto di `SuperAdminPermissionsDialog`

### 3. `MultiCompanyUsersTab.tsx` — Layout a 2 colonne
Il prompt chiede layout master-detail (lista a sinistra, dettaglio a destra). L'attuale è solo una tabella. Aggiornamento:
- Layout 2 colonne su desktop
- Colonna sinistra: lista utenti cliccabili
- Colonna destra: dettaglio aziende dell'utente selezionato con possibilità di aggiungere/rimuovere accessi inline

## Ordine di implementazione
1. Creare `PlatformPermissionsDialog.tsx`
2. Aggiornare `PlatformTeamTab.tsx` (stat cards, avatar, permessi badge, use nuovo dialog)
3. Aggiornare `MultiCompanyUsersTab.tsx` (layout 2 colonne con detail panel)


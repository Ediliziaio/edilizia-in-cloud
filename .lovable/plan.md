

# Piano: Assegnazione aziende + permessi granulari nella creazione utenti piattaforma

## Problema
Quando si crea un utente piattaforma (es. `platform_implementation`), manca la possibilità di:
1. Selezionare le aziende a cui avrà accesso
2. Scegliere per ogni azienda se sarà Admin o Staff
3. Configurare permessi granulari (stile CreateUserWizard) per le aziende dove è Staff

## Soluzione

### 1. Refactor `CreatePlatformUserDialog.tsx`
Aggiungere 2 nuovi step al wizard (da 3 a 5 step):

- **Step 0**: Scelta ruolo piattaforma (invariato)
- **Step 1**: Dati personali (invariato)
- **Step 2** (NUOVO): Selezione aziende + ruolo per azienda (admin/staff) — riusa pattern da `CreateMultiCompanyUserDialog` con checkbox + select ruolo
- **Step 3** (NUOVO): Permessi granulari — riusa i `PermGroup` di `CreateUserWizard` (Cruscotto, Gestione Interna, Marketing). Questi permessi si applicano a tutte le aziende dove il ruolo è "staff". Se tutte le aziende sono admin, skip automatico.
- **Step 4**: Conferma con riepilogo completo

### 2. Aggiornare Edge Function `manage-platform-users` — action `create`
Aggiungere parametri `companyAccesses` e `companyPermissions`:
- Creare righe in `multi_company_access` per ogni azienda selezionata
- Creare righe in `staff_permissions` (ha `company_id`!) per ogni azienda con ruolo staff
- Sincronizzare `allowed_company_ids` in `super_admin_permissions` con le aziende selezionate

### 3. File impattati
- `src/components/admin/settings/CreatePlatformUserDialog.tsx` — refactor completo
- `supabase/functions/manage-platform-users/index.ts` — action `create` estesa

### Dettagli tecnici
- `staff_permissions` supporta già `company_id` + `user_id`, quindi permette permessi per-azienda
- I `PermGroup` (STANDALONE_SECTIONS, INTERNAL_SECTIONS, MARKETING_SECTIONS) vengono importati da `permissionsDefaults.ts`
- Per le aziende con ruolo admin, non servono permessi granulari (accesso completo)




# Piano: Bottone "Aggiungi Azienda" nel pannello dettaglio MultiCompanyUsersTab

## Cosa cambia

Aggiungere nel pannello dettaglio (colonna destra) un bottone "Aggiungi Azienda" sotto la lista delle aziende accessibili. Al click si apre un piccolo dialog inline con:
1. **Select azienda** — lista delle aziende disponibili (escluse quelle già assegnate all'utente)
2. **Select ruolo** — Admin, Operatore, Venditore, Call Center (stessi 4 ruoli del CreatePlatformUserDialog)
3. **Bottone conferma**

Il backend supporta già l'operazione `update-company-access` con `operation: "add"`.

## Modifiche

### `src/components/admin/settings/MultiCompanyUsersTab.tsx`

1. **Nuovo state**: `addCompanyOpen: boolean` per mostrare/nascondere il form inline
2. **Query aziende**: Aggiungere `useQuery` per caricare le aziende disponibili (stessa query di `CreateMultiCompanyUserDialog`: `companies` con `is_platform_admin_company = false`), filtrando quelle già assegnate all'utente attivo
3. **Mutation `addAccessMutation`**: Chiama `manage-platform-users` con `{ action: "update-company-access", userId, companyId, accessRole, operation: "add" }`
4. **UI**: Dopo la lista aziende, bottone `+ Aggiungi Azienda` che espande un mini-form con Select azienda + Select ruolo + bottone Aggiungi. Visibile solo con `can_manage_admins`
5. **Ruoli disponibili**: `company_admin`, `company_staff`, `salesperson`, `call_center` con label italiane

Nessuna modifica alla edge function (già supporta `operation: "add"` con `accessRole`).


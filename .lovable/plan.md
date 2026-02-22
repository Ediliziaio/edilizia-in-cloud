

# Audit, Fix e Stabilizzazione del Progetto

## 1. Bug e Problemi Identificati

### BUG 1: Console Warning "Function components cannot be given refs" in SalespeopleConfig
- **Causa**: Il componente `SalespersonDialog` e un function component passato come figlio diretto di `SalespeopleConfig`, ma Radix Dialog tenta di attaccargli una ref.
- **Fix**: Nessun intervento necessario su questo specifico warning - e un warning di React dev-mode su come Radix gestisce internamente i Dialog. Non impatta il funzionamento.

### BUG 2 (CRITICO): `usePermissions` non include `canViewMarketing` / `canEditMarketing`
- **Causa**: Il hook `usePermissions.ts` non legge i campi `can_view_marketing` e `can_edit_marketing` dalla tabella `staff_permissions`, nonostante siano stati aggiunti al database.
- **Impatto**: I permessi marketing non vengono mai controllati. Qualsiasi utente staff vede (o non vede) le sezioni marketing indipendentemente dalla configurazione.
- **Fix**: Aggiungere `canViewMarketing` e `canEditMarketing` all'interfaccia `Permissions`, a `ALL_PERMISSIONS`, `NO_PERMISSIONS` e al mapping nella sezione `company_staff`.

### BUG 3 (CRITICO): Le voci di navigazione Marketing nella sidebar non sono protette da permessi
- **Causa**: In `sidebarConfig.ts`, i `marketingNavItems` non hanno `permissionKey` definito. Questo significa che NON vengono filtrate in base ai permessi utente.
- **Fix**: Aggiungere `permissionKey: "canViewMarketing"` a tutte le voci in `marketingNavItems`.

### BUG 4: `UsersConfig` ha `DEFAULT_PERMISSIONS` obsoleto
- **Causa**: Il `DEFAULT_PERMISSIONS` in `UsersConfig.tsx` (riga 42-56) non include `can_view_marketing` e `can_edit_marketing`. Inoltre `getPermissionsSummary` non li mostra.
- **Fix**: Aggiornare `DEFAULT_PERMISSIONS` e `getPermissionsSummary` per includere i permessi marketing.

### BUG 5: Verifica filtro marketing nella CompanyLayout
- **Causa**: Occorre verificare che il codice nella `CompanyLayout.tsx` che filtra le voci di navigazione usi effettivamente il `permissionKey` anche per le voci marketing.
- **Fix**: Verificare e correggere il filtro nella sidebar.

## 2. Pulizia Codice

### Codice duplicato da centralizzare
I seguenti elementi sono duplicati in 4 file (SalespeopleConfig, Employees, StaffUserDialog, PermissionsDialog):
- `DEFAULT_PERMISSIONS`
- `INTERNAL_SECTIONS` / `MARKETING_SECTIONS`
- `handleTogglePermission` logic
- `handleSelectAll` / `handleDeselectAll`
- `renderPermSection` UI

**Azione**: NON toccare in questa fase per evitare regressioni. Segnalato come tech debt. L'intervento attuale si limita ai fix funzionali.

## 3. Piano di Intervento (file per file)

| File | Azione | Priorita |
|---|---|---|
| `src/hooks/usePermissions.ts` | Aggiungere `canViewMarketing`, `canEditMarketing` all'interfaccia e al mapping | CRITICO |
| `src/lib/sidebarConfig.ts` | Aggiungere `permissionKey: "canViewMarketing"` ai `marketingNavItems` | CRITICO |
| `src/components/settings/UsersConfig.tsx` | Aggiornare `DEFAULT_PERMISSIONS` e `getPermissionsSummary` con permessi marketing | MEDIO |
| `src/components/layouts/CompanyLayout.tsx` | Verificare che il filtro nav usi `permissionKey` anche per marketing | CRITICO |

## 4. Dettaglio Tecnico

### File: `src/hooks/usePermissions.ts`
- Aggiungere all'interfaccia `Permissions`: `canViewMarketing: boolean; canEditMarketing: boolean;`
- Aggiungere a `ALL_PERMISSIONS`: `canViewMarketing: true, canEditMarketing: true`
- Aggiungere a `NO_PERMISSIONS`: `canViewMarketing: false, canEditMarketing: false`
- Nel blocco `company_staff` aggiungere: `canViewMarketing: permissions?.can_view_marketing ?? false, canEditMarketing: permissions?.can_edit_marketing ?? false`

### File: `src/lib/sidebarConfig.ts`
- Aggiungere `permissionKey: "canViewMarketing"` a ogni voce in `marketingNavItems`

### File: `src/components/settings/UsersConfig.tsx`
- Aggiungere `can_view_marketing: false, can_edit_marketing: false` al `DEFAULT_PERMISSIONS`
- In `getPermissionsSummary` aggiungere: `if (u.permissions.can_view_marketing) labels.push("Marketing");`

### File: `src/components/layouts/CompanyLayout.tsx`
- Verificare che il codice di rendering della sidebar applichi il filtro `permissionKey` anche alle voci marketing (stessa logica delle voci interne)

## 5. Cosa NON cambia
- Nessuna modifica al database
- Nessuna modifica ai dialog di creazione account (gia corretti)
- Nessuna modifica al routing
- Nessun refactoring del codice duplicato (rimandato a fase successiva)
- Il warning React sulla ref in SalespeopleConfig e un warning non bloccante di dev mode

## 6. Miglioramenti UX inclusi
- Gli utenti staff vedranno le sezioni marketing solo se hanno il permesso `can_view_marketing`, eliminando confusione
- Il riepilogo permessi nella sezione Utenti mostra anche "Marketing" quando abilitato


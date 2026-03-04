

# Supporto 4 Ruoli nella Pagina Gestisci Utente

## Problema

La pagina dettaglio utente (`SettingsUserDetail.tsx`) e il tab ruoli (`UserRolesPermissionsTab.tsx`) supportano solo 2 ruoli (`company_admin` / `company_staff`). Non riconoscono `salesperson` e `call_center`.

### Punti critici:
1. **Query ruoli** (SettingsUserDetail riga 72): cerca solo `company_admin` o `company_staff`, ignora `salesperson`/`call_center`
2. **Tipo TypeScript**: union type limitato a 2 valori
3. **changeRoleMutation**: gestisce solo 2 ruoli, non implementa il dual-role (`salesperson` → `salesperson` + `company_staff`)
4. **Select ruolo** (UserRolesPermissionsTab riga 198-212): mostra solo Admin e Utente

## Piano

### 1. `src/pages/azienda/settings/SettingsUserDetail.tsx`

- Aggiornare la query per cercare tutti e 4 i ruoli con la stessa logica `determineEffectiveRole` usata in `UsersConfig.tsx`
- Caricare `staff_permissions` per tutti i ruoli che hanno `company_staff` (inclusi `salesperson` e `call_center`)
- Aggiornare `changeRoleMutation` con dual-role logic:
  - Se nuovo ruolo è `salesperson` o `call_center`: eliminare vecchi ruoli specifici, inserire il nuovo + `company_staff`, creare `staff_permissions` se mancante, creare record `salespeople` se venditore
  - Se nuovo ruolo è `company_admin`: rimuovere tutti i ruoli company, inserire solo `company_admin`
  - Se nuovo ruolo è `company_staff`: rimuovere ruoli specifici (`salesperson`/`call_center`), mantenere `company_staff`

### 2. `src/components/users/UserRolesPermissionsTab.tsx`

- Estendere tipo ruolo a `"company_admin" | "company_staff" | "salesperson" | "call_center"`
- Aggiungere 2 opzioni nel Select: Venditore (con icona TrendingUp) e Call Center (con icona Phone)
- I permessi granulari restano visibili per `company_staff`, `salesperson` e `call_center` (tutti usano `staff_permissions`)

### File da modificare
- `src/pages/azienda/settings/SettingsUserDetail.tsx`
- `src/components/users/UserRolesPermissionsTab.tsx`

### Nota sull'audit enterprise
La richiesta di audit completo (A-J) è un progetto a lungo termine. Mi concentro sulla funzionalità richiesta (cambio ruolo nella pagina gestisci). L'audit può essere affrontato incrementalmente in sessioni successive.


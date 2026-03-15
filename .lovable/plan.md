

## Analisi Sezione Utenti — Mismatch Permessi vs Sidebar (UNIF-USERS-03)

### Problema principale

La sidebar aziendale è stata riorganizzata in **6 macro-aree** (Cruscotto, Cantieri & Lavori, Finanza, Persone, Marketing & Vendita, Automazioni & AI), ma il wizard di creazione utenti (Step 3) e il dialog permessi usano ancora la **vecchia struttura a 3 gruppi** (Cruscotto, Gestione Interna, Marketing e Vendite).

Questo crea un disallineamento critico: sezioni intere della sidebar non hanno toggle nel pannello permessi, e sono **sempre visibili** per tutti gli utenti staff.

### Bug confermati

| # | Gravita | Problema |
|---|---------|----------|
| 1 | **P0** | **Finanza sempre visibile**: `canViewBilling`, `canViewScadenzario`, `canViewPrimaNota`, `canViewCosts`, `canViewTesoreria` sono hardcoded `true` in `usePermissions.ts` (righe 181-186). Non esistono colonne DB corrispondenti. Un operatore senza permessi vede TUTTE le sezioni finanziarie |
| 2 | **P1** | **Persone non controllabile**: "Personale & HR" usa `canViewDashboard`, "Chat Interna" non ha alcun `permissionKey`, "Messaggistica" usa `canViewOrders`. Un utente con solo permesso ordini vede anche la messaggistica |
| 3 | **P1** | **Wizard Step 3 non allineato alla sidebar**: I gruppi sono "Cruscotto / Gestione Interna / Marketing" ma la sidebar ha 6 macro-aree. L'utente admin non capisce cosa sta abilitando |
| 4 | **P2** | **"Dipendenti" nel wizard** non corrisponde a nulla nella sidebar (la voce "Personale & HR" usa `canViewDashboard`, non `canViewEmployees`) |
| 5 | **P2** | **Automazioni & AI** nella sidebar: "Automazioni" usa `canViewSettings` e "Agenti AI" usa `canViewMarketingAiAgent`. Due sezioni diverse governate da permessi non intuitivi |
| 6 | **P2** | **UserRolesPermissionsTab** (pagina dettaglio utente) ha la stessa struttura a 3 gruppi vecchia, disallineata dalla sidebar |

### Correzioni pianificate

#### 1. Migrazione DB — Aggiungere colonne mancanti

Aggiungere a `staff_permissions`:
- `can_view_billing` (boolean, default false)
- `can_view_prima_nota` (boolean, default false)
- `can_view_costs` (boolean, default false)
- `can_view_persone` (boolean, default false)

Non servono `can_view_scadenzario` e `can_view_tesoreria` separati: useranno `can_view_billing` come la fatturazione.

#### 2. `StaffPermissions` interface — Aggiungere nuovi campi

In `PermissionsDialog.tsx`, aggiungere:
- `can_view_billing`, `can_view_prima_nota`, `can_view_costs`, `can_view_persone`

#### 3. `permissionsDefaults.ts` — Ristrutturare in 6 gruppi

Sostituire `STANDALONE_SECTIONS`, `INTERNAL_SECTIONS`, `MARKETING_SECTIONS` con sezioni che rispecchiano le 6 macro-aree della sidebar:

- **Cruscotto**: Cruscotto Aziendale (can_view_cruscotto)
- **Cantieri & Lavori**: Dashboard, Ordini, Magazzino, Calendario, Clienti, Ticket, Dipendenti/Personale (can_view_dashboard, can_view_orders, can_view_warehouse, can_view_calendar, can_view_customers, can_view_tickets, can_view_employees)
- **Finanza**: Fatturazione (can_view_billing), Prima Nota (can_view_prima_nota), Costi (can_view_costs), Previsionale (can_view_forecast)
- **Persone**: Personale & HR, Chat, Messaggistica (can_view_persone)
- **Marketing & Vendita**: tutte le sezioni marketing esistenti
- **Automazioni & AI**: Automazioni (can_view_settings), Agenti AI (can_view_marketing_ai_agent)

#### 4. `usePermissions.ts` — Leggere da DB, non hardcodare

Sostituire le righe 181-186 (hardcoded `true`) con lettura dal DB:
```typescript
canViewBilling: permissions?.can_view_billing ?? false,
canViewScadenzario: permissions?.can_view_billing ?? false,
canViewPrimaNota: permissions?.can_view_prima_nota ?? false,
canViewCosts: permissions?.can_view_costs ?? false,
canViewTesoreria: permissions?.can_view_billing ?? false,
```

#### 5. `DEFAULT_PERMISSIONS` — Aggiungere i nuovi campi a false

#### 6. Wizard e Dialog — Aggiornare i gruppi visivi

`CreateUserWizard.tsx` Step 3 e `PermissionsDialog.tsx`: mostrare 6 `PermGroup` allineati alle macro-aree.

`UserRolesPermissionsTab.tsx`: aggiornare `PERMISSION_CATEGORIES` con le stesse 6 categorie.

#### 7. `ROLE_PRESETS` — Aggiornare con i nuovi campi

Aggiungere `can_view_billing`, `can_view_prima_nota`, `can_view_costs`, `can_view_persone` ai preset appropriati.

#### 8. `sidebarConfig.ts` — Fix permissionKey per Persone

- "Personale & HR": cambiare `permissionKey` da `canViewDashboard` a `canViewPersone`
- "Chat Interna": aggiungere `permissionKey: "canViewPersone"`
- "Messaggistica": cambiare da `canViewOrders` a `canViewPersone`

### File da modificare

| File | Azione |
|---|---|
| Migrazione DB | Aggiungere 4 colonne a staff_permissions |
| `src/components/users/PermissionsDialog.tsx` | Aggiungere campi + ristrutturare 6 gruppi |
| `src/components/users/permissionsDefaults.ts` | Ristrutturare sezioni in 6 macro-aree + aggiornare presets |
| `src/hooks/usePermissions.ts` | Leggere da DB i campi finanza/persone + aggiungere canViewPersone |
| `src/components/users/CreateUserWizard.tsx` | Aggiornare Step 3 con 6 gruppi |
| `src/components/users/UserRolesPermissionsTab.tsx` | Allineare PERMISSION_CATEGORIES alle 6 aree |
| `src/lib/sidebarConfig.ts` | Fix permissionKey per area Persone |


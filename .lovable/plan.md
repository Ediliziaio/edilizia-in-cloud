

## Piano: Ristrutturazione completa gestione utenti — Wizard, Permessi, Bug Fix

### Stato attuale verificato

**Già completati nelle sessioni precedenti:**
- RLS WITH CHECK su `staff_permissions` (migration esiste)
- `delete-company-user` ritorna errore 500 se Auth delete fallisce
- Password generation usa `crypto.getRandomValues()` via `securePassword.ts`
- `changeRoleMutation` usa singola query `.in("role", [...])`
- `canViewUsers` legge da DB (`(permissions as any)?.can_view_users`)

**Da fare — 7 task:**

---

### 1. Rimuovere permessi inventati da `permissionsDefaults.ts`

Eliminare `GRANULAR_SECTIONS` (can_export_clients, can_delete_orders, can_manage_payments, ecc.) e rimuovere le corrispondenti chiavi da `DEFAULT_PERMISSIONS` e dall'interfaccia `StaffPermissions` in `PermissionsDialog.tsx`. Questi campi non esistono nel DB.

**File:** `src/components/users/permissionsDefaults.ts`, `src/components/users/PermissionsDialog.tsx`

---

### 2. Riscrivere `CreateUserWizard.tsx` secondo specifiche

Il wizard esiste già ma ha problemi: include template selector (tabella non esiste), mostra GRANULAR_SECTIONS, step order è info→role (il prompt chiede role→info→permessi→conferma).

**Modifiche:**
- Step 1: Selezione ruolo (grid 2x2 con card colorate). Al cambio ruolo, applicare preset permessi automatici
- Step 2: Dati utente (nome, cognome, email) con badge ruolo selezionato
- Step 3: Permessi (solo per non-admin) con gruppi collapsibili, Switch toggle-all per gruppo, badge N/M, pulsanti "Seleziona tutto"/"Deseleziona tutto"/"Ripristina preset". Per admin: schermata accesso completo
- Step 4 (non-admin) / Step 3 (admin): Conferma con riepilogo
- Step success: Password temporanea

**Preset permessi per ruolo:**
- `company_staff`: dashboard, ordini+edit, magazzino, calendario, clienti, dipendenti
- `salesperson`: dashboard, ordini, clienti+edit, calendario, marketing dashboard/contatti+edit/opportunità+edit/attività/appuntamenti/reports, can_view/edit_marketing
- `call_center`: dashboard, clienti+edit, calendario, marketing contatti+edit/opportunità/attività/appuntamenti, can_view_marketing

**Rimuovere:** template selector, GRANULAR_SECTIONS, import ScrollArea non usato

**Sync legacy prima del submit:** calcolare can_view_marketing/can_edit_marketing dai flag granulari

---

### 3. Aggiornare `PermissionsDialog.tsx`

Rimuovere GRANULAR_SECTIONS dal rendering. Usare stessa struttura a gruppi del wizard (Cruscotto, Gestione Interna, Marketing) con Switch toggle-all per gruppo e badge contatore.

---

### 4. Aggiornare `UserRolesPermissionsTab.tsx`

Il componente è già ben strutturato con PERMISSION_CATEGORIES corrette (senza fake permissions). Nessuna modifica necessaria — non include GRANULAR_SECTIONS.

---

### 5. Fix `UsersConfig.tsx` — error handling permessi dopo creazione

Aggiungere gestione errore dopo `supabase.from("staff_permissions").update(...)`:
```typescript
const { error: permUpdateError } = await supabase.from("staff_permissions").update(...).eq("user_id", ...);
if (permUpdateError) {
  console.error("Failed to update permissions:", permUpdateError);
  toast.warning("Utente creato, ma i permessi non sono stati salvati", {
    description: "Vai nel dettaglio utente per configurare i permessi."
  });
}
```

---

### 6. Fix `usePermissions.ts` — canViewUsers logica migliorata

Cambiare da `(permissions as any)?.can_view_users ?? false` a:
```typescript
canViewUsers: permissions?.can_view_settings ?? false,
```
Dato che `can_view_users` come colonna potrebbe non esistere ancora nel DB, il fallback su `can_view_settings` è più robusto (chi vede impostazioni può vedere utenti).

---

### 7. Deprecare `StaffUserDialog.tsx`

Il file `StaffUserDialog.tsx` non è più usato da `UsersConfig.tsx` (che importa `CreateUserWizard`). Verificare che non ci siano altri import e rimuoverlo o marcarlo come deprecated.

---

### Riepilogo file modificati

| File | Azione |
|------|--------|
| `src/components/users/permissionsDefaults.ts` | Rimuovere GRANULAR_SECTIONS e chiavi fake da DEFAULT_PERMISSIONS |
| `src/components/users/PermissionsDialog.tsx` | Rimuovere interfaccia fake, aggiornare gruppi |
| `src/components/users/CreateUserWizard.tsx` | Riscrittura completa: step order, preset, gruppi, no template |
| `src/components/settings/UsersConfig.tsx` | Error handling permessi |
| `src/hooks/usePermissions.ts` | canViewUsers da can_view_settings |
| `src/components/users/StaffUserDialog.tsx` | Rimuovere (non usato) |


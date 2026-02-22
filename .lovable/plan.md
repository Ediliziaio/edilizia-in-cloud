
# Stabilizzazione e Pulizia - Interventi Mirati

## Problemi Identificati

### 1. Type Safety: `StaffPermissions` interface ha campi marketing opzionali
In `PermissionsDialog.tsx` (righe 30-31), `can_view_marketing` e `can_edit_marketing` sono dichiarati come opzionali (`?`). Questo causa l'uso di `as any` in `UsersConfig.tsx` riga 217 e in `usePermissions.ts` righe 116-117.

**Fix**: Rendere `can_view_marketing` e `can_edit_marketing` campi obbligatori nell'interfaccia `StaffPermissions` (come tutti gli altri campi permesso). Rimuovere i cast `as any` nei file che li usano.

### 2. Nessun codice morto o import inutilizzati rilevati
Tutti gli import e le funzioni nei file principali sono effettivamente utilizzati.

### 3. Sidebar marketing: nessun controllo hide se zero voci visibili
Se un utente staff non ha `canViewMarketing`, la sezione "Marketing e Vendita" nella sidebar resta visibile come header vuoto (il `Collapsible` viene renderizzato ma senza voci dentro).

**Fix**: Nascondere l'intero blocco `Collapsible` marketing se `visibleMarketingItems.length === 0`.

## Piano di Intervento

| File | Modifica |
|---|---|
| `src/components/users/PermissionsDialog.tsx` | Rendere `can_view_marketing` e `can_edit_marketing` obbligatori nell'interfaccia |
| `src/components/settings/UsersConfig.tsx` | Rimuovere `as any` da `getPermissionsSummary` (riga 217) |
| `src/hooks/usePermissions.ts` | Rimuovere `as any` dai campi marketing (righe 116-117) |
| `src/components/layouts/CompanyLayout.tsx` | Nascondere sezione marketing sidebar se nessuna voce visibile |

## Cosa NON cambia
- Nessuna modifica al database
- Nessuna modifica alle edge function
- Nessuna modifica al comportamento funzionale
- Solo miglioramenti di type safety e UX (niente sezioni vuote)

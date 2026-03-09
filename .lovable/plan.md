

## Analisi completata — Stato attuale e fix residui

### Gia' implementato correttamente (nessuna azione necessaria)
Tutti i fix critici dal prompt sono gia' presenti nel codice:
- RLS WITH CHECK (migration `20260309055901`)
- `delete-company-user` ritorna 500 se Auth delete fallisce
- Password generation con `crypto.getRandomValues()`
- `changeRoleMutation` con singola query `.in()`
- `canViewUsers` legge da `can_view_settings`
- Error handling permessi in `UsersConfig.tsx`
- `permissionsDefaults.ts` pulito (no GRANULAR_SECTIONS)
- `PermissionsDialog.tsx` con layout a gruppi
- `CreateUserWizard.tsx` con flusso 4-step corretto (role→info→perms→confirm)
- Preset permessi per ruolo
- Sync legacy marketing flags
- Empty state, role badges, permission badges nella tabella
- AlertDialog eliminazione utente

### Fix residui da implementare (3 task)

**1. Rimuovere dead code in CreateUserWizard (linea 378)**

Il blocco "full access confirmation" per admin ha condizione `step === 3 && !showPermissions && !isConfirmStep` che e' sempre false (per admin, `isConfirmStep = step === 3` quindi `!isConfirmStep = false`). Questo blocco non si raggiunge mai. Va rimosso per pulizia.

**2. Aggiungere badge "Password da cambiare" nella tabella utenti**

In `UsersConfig.tsx`, nella cella Nome della tabella (riga 716-722), aggiungere un badge amber/giallo quando `u.permissions?.must_change_password === true`. Il dato e' gia' disponibile nell'oggetto `permissions` fetchato alla riga 294.

```tsx
// Dopo il badge "Tu"
{u.permissions?.must_change_password && (
  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300 bg-amber-50">
    Password da cambiare
  </Badge>
)}
```

**3. Aggiornare StaffUserDialog.tsx per CompanyDetail (super-admin)**

`StaffUserDialog.tsx` e' ancora usato da `CompanyDetail.tsx` e `useCompanyDetail.ts`. Due opzioni:
- **Opzione A**: Sostituire StaffUserDialog con CreateUserWizard in CompanyDetail
- **Opzione B**: Lasciare StaffUserDialog per il pannello super-admin (funziona gia')

Raccomando **Opzione B** — StaffUserDialog e' funzionale per il contesto super-admin e non ha i bug segnalati (non mostra GRANULAR_SECTIONS). Non vale la pena rischiare regressioni.

### Riepilogo file modificati
| File | Modifica |
|------|----------|
| `CreateUserWizard.tsx` | Rimuovere blocco dead code (linee 377-388) |
| `UsersConfig.tsx` | Aggiungere badge "Password da cambiare" |


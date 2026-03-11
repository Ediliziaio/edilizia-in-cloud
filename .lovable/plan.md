

# Piano: Allineare CreatePlatformUserDialog alla UX di CreateUserWizard

## Differenze attuali

| Aspetto | CreateUserWizard (azienda) | CreatePlatformUserDialog (admin) |
|---------|---------------------------|----------------------------------|
| Step 1 - Ruolo | Grid 2x2 con icone colorate (Admin, Operatore, Venditore, Call Center) | Lista verticale di card (solo ruoli piattaforma) |
| Ruoli per-azienda | N/A | Solo "Admin" e "Staff" nel select |
| Password | Generata automaticamente + step successo con copia | Manuale (input password) |
| Step successo | Schermata con password copiabile | Nessuna (toast + chiusura) |

## Modifiche

### 1. Ruoli per-azienda: aggiungere Venditore e Call Center
Nello Step 2 (selezione aziende), il `<Select>` per il ruolo attualmente offre solo "Admin" e "Staff". Aggiungeremo anche **"Venditore"** e **"Call Center"**, con lo stesso pattern visivo del CreateUserWizard.

I ruoli `salesperson` e `call_center` si comportano come `company_staff` per i permessi (ereditano la dual-role logic già presente in AuthContext), quindi il ruolo per-azienda sarà mappato esattamente come nel wizard aziendale.

### 2. Ruoli con permessi granulari
Lo step permessi si attiva se almeno un'azienda ha ruolo `company_staff`, `salesperson` o `call_center` (non solo `company_staff` come ora). Per ogni ruolo viene applicato il preset corrispondente da `ROLE_PRESETS`.

Poiché ruoli diversi in aziende diverse potrebbero avere preset diversi, semplificheremo: i permessi granulari si applicano a tutte le aziende non-admin, con preset del primo ruolo non-admin selezionato (l'utente può poi personalizzare).

### 3. UX allineata al CreateUserWizard
- **Step ruolo per-azienda**: Select con 4 opzioni (Admin, Operatore, Venditore, Call Center) con icone
- **Password auto-generata**: Rimuovere l'input password manuale. La edge function genererà una password temporanea
- **Step successo**: Aggiungere lo step finale con password visibile e bottone copia (identico al wizard aziendale)
- **Pulsante "Ripristina preset"**: Aggiungere nello step permessi

### 4. Edge Function
Aggiornare `manage-platform-users` action `create`:
- Se non viene passata una password, generarne una casuale (12 caratteri)
- Restituire `{ temporaryPassword }` nella response
- Mappare i ruoli `salesperson`/`call_center` come `access_role` in `multi_company_access`

### File impattati
- `src/components/admin/settings/CreatePlatformUserDialog.tsx` — refactor completo
- `supabase/functions/manage-platform-users/index.ts` — password auto-gen + nuovi ruoli




# Audit Utenti/Ruoli/Permessi - Verifica Finale

## Stato AS-IS

Dopo 4 round di fix, il sistema e **funzionalmente solido**. I guard admin sono presenti, i permessi granulari sono mappati, le Edge Functions sono robuste. Ho verificato tutti i file coinvolti end-to-end.

## Problemi Residui

### P1 - Password duplicata e inconsistente in SettingsProfile

**Problema**: `PersonalProfileForm.tsx` (visibile nella pagina Profilo) include una sezione "Cambia Password" con validazione minimo **6 caratteri** (riga 50). Pero esiste anche la route separata `/azienda/impostazioni/sicurezza` con `ChangePasswordForm` che richiede minimo **8 caratteri** e verifica la password attuale prima di cambiarla.

Risultato:
1. **Duplicazione**: due modi diversi per cambiare password nella stessa area Impostazioni
2. **Inconsistenza sicurezza**: `PersonalProfileForm` accetta 6 chars senza verificare la password attuale, `ChangePasswordForm` richiede 8 chars e verifica quella corrente. Un utente potrebbe usare la via meno sicura.

**Fix**: Rimuovere la sezione password da `PersonalProfileForm.tsx` (lasciare solo nome/cognome/telefono). La pagina "Cambio password" dedicata (`/sicurezza`) e gia accessibile a tutti i ruoli nella sidebar e offre un'esperienza piu sicura con verifica password attuale.

### P2 - Nessun altro problema trovato

Tutti gli altri aspetti verificati sono corretti:
- Guard admin su `SettingsUsers` e `SettingsUserDetail`: presenti e funzionanti
- Sidebar nasconde "Utenti" e "Team" per non-admin: corretto
- `SettingsProfile` mostra sezione azienda solo per admin: corretto
- Permessi granulari marketing in sidebar: mappati correttamente
- Sync legacy marketing nel salvataggio permessi: presente
- `PermissionsDialog` e `UserRolesPermissionsTab` usano costanti centralizzate: corretto
- Edge Functions con query difensive: corretto
- `UserProfileTab` (admin editing other users) ha validazione min 8 chars: corretto

## Piano Intervento

### 1. Rimuovere sezione password da PersonalProfileForm (P1)

In `PersonalProfileForm.tsx`, rimuovere:
- Gli state `newPassword`, `confirmPassword`, `isChangingPassword`
- La funzione `handleChangePassword`
- La Card "Cambia Password" nel render
- Gli import `Lock` e `Separator` (se non usati altrove)

Il componente restera focalizzato su nome, cognome, telefono. La password si cambia dalla route `/azienda/impostazioni/sicurezza` che e gia nella sidebar per tutti i ruoli.

### Nessuna migrazione DB necessaria.


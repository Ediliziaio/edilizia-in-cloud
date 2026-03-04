
# Audit Crea/Modifica Utente - COMPLETATO

## Interventi Applicati

### P1 - Sicurezza (Edge Function `create-company-staff`)
1. ✅ **CORS headers allineati** con lo standard (`x-supabase-client-platform*`, `x-supabase-client-runtime*`)
2. ✅ **Rimosso `listUsers()`** - ora tenta la creazione direttamente e gestisce l'errore di email duplicata
3. ✅ **Query ruolo caller robusta** - sostituito `.single()` con query multipla + `.find()`

### P2 - Robustezza (Frontend)
4. ✅ **Validazione password client-side** - min 8 caratteri in `UserProfileTab.tsx`
5. ✅ **Sync legacy marketing nel salvataggio permessi** - `SettingsUserDetail.tsx` ora sincronizza `can_view_marketing`/`can_edit_marketing` con i flag granulari
6. ✅ **Cruscotto nel PermissionsDialog** - aggiunta sezione "Cruscotto Aziendale" con toggle `can_view_cruscotto`

### Nessuna migrazione DB necessaria.

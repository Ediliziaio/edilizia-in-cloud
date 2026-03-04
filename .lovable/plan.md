

# Audit: Controllo Accesso Admin vs Staff nella Gestione Utenti

## Stato AS-IS

La sidebar nasconde correttamente la voce "Utenti" per gli utenti non-admin (`isAdmin` check in `CompanyLayout.tsx` riga 239). Tuttavia, ci sono **due problemi di sicurezza critici**:

### P0 - Route `/azienda/impostazioni/utenti` e `/utenti/:userId` non protette

Le route `utenti` e `utenti/:userId` non hanno nessun guard. Un utente staff puo navigare direttamente all'URL e:
- Vedere la lista completa degli utenti aziendali
- Accedere al dettaglio di qualsiasi utente
- Modificare ruoli e permessi di altri utenti
- Eliminare utenti
- Resettare password di altri utenti

Questo e un **privilege escalation** critico.

### P1 - `SettingsUserDetail` non distingue admin da staff

La pagina mostra TUTTI i tab (profilo, permessi, disponibilita, calendario, notifiche) indipendentemente dal ruolo del viewer. Un admin dovrebbe vedere tutto; un utente staff che visualizza il proprio profilo dovrebbe vedere solo il tab "Profilo" (nome, email, telefono, password).

## Piano Interventi

### 1. Proteggere le route utenti (P0)

In `SettingsUsers.tsx` e `SettingsUserDetail.tsx`, aggiungere un check all'inizio del componente:
- Verificare `role` da `useAuth()` 
- Se il ruolo NON e `company_admin` o `super_admin`, redirect a `/azienda/impostazioni/profilo` con toast di errore
- Questo previene accesso diretto via URL

### 2. Pagina "Il Mio Profilo" per staff (P1)

La route `impostazioni/profilo` (`SettingsProfile.tsx`) attualmente mostra solo il profilo azienda, non il profilo utente personale. Per gli utenti staff che vogliono cambiare la propria password/email, serve verificare che questa pagina includa anche i dati personali, oppure aggiungere una sezione dedicata.

Verificare `SettingsProfile.tsx` e, se necessario, aggiungere un componente per la modifica del profilo personale (nome, email, telefono, password) accessibile a tutti i ruoli.

### 3. RLS server-side gia presente

Le Edge Functions (`delete-company-user`, `reset-customer-password`, `create-company-staff`) verificano gia il ruolo del caller server-side, quindi anche se la UI non fosse protetta, le operazioni critiche fallirebbero. Tuttavia, la protezione client-side e necessaria per UX e defense-in-depth.

## File da modificare

- `src/pages/azienda/settings/SettingsUsers.tsx` - Aggiungere guard admin
- `src/pages/azienda/settings/SettingsUserDetail.tsx` - Aggiungere guard admin
- `src/pages/azienda/settings/SettingsProfile.tsx` - Verificare/aggiungere sezione profilo personale per tutti i ruoli

Nessuna migrazione DB necessaria.


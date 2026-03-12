

# Miglioramento Profilo Super Admin

## Cosa cambia
Arricchire `ProfileTab.tsx` con: campo telefono editabile, info accesso (ultimo login, data creazione account), badge ruolo dinamico e link rapido alla sezione Sicurezza.

## Modifiche — un solo file

### `src/components/admin/settings/ProfileTab.tsx`

1. **Query**: aggiungere `phone, last_login_at, created_at` alla select su `profiles` + query separata su `user_roles` per il ruolo reale
2. **Stato**: aggiungere `const [phone, setPhone]` inizializzato da `profile.phone`
3. **Salvataggio**: includere `phone` nella mutation `updateProfile`
4. **Campo telefono**: nuovo `Input` type="tel" nel grid nome/cognome (diventa 3 colonne su sm o telefono sotto i 2 campi esistenti)
5. **Badge ruolo dinamico**: query `user_roles` → mostrare il ruolo effettivo (`super_admin`, `platform_manager`, ecc.) formattato in italiano, invece del badge hardcoded "Super Admin"
6. **Card "Informazioni account"**: nuova card dopo "Informazioni personali" con:
   - Ultimo accesso: `format(last_login_at, "dd MMM yyyy HH:mm")` o "Mai" se null
   - Account creato il: `format(created_at, "dd MMM yyyy")`
   - Link "Gestisci sicurezza →" che naviga a `/admin/impostazioni/sicurezza`
7. **Import**: aggiungere `Phone, Clock, Calendar, ArrowRight` da lucide-react, `format` da date-fns, `it` locale, `useNavigate` da react-router-dom

### Nessuna migrazione DB
Tutti i campi (`phone`, `last_login_at`, `created_at`) esistono già nella tabella `profiles`.


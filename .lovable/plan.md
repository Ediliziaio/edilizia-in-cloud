

# Analisi Criticità — Funzioni Implementate (Fasi 2, 3, 5)

## CRITICITA ALTA

### 1. `upsert-admin-session` mai invocata dal frontend
La edge function esiste ma **nessun componente la chiama**. La ricerca per `upsert-admin-session` nel codice frontend ha restituito 0 risultati. Questo significa che la tabella `admin_sessions` resta **sempre vuota**, rendendo inutili:
- La card "Sessioni attive" in SecurityTab (mostra sempre "Nessuna sessione attiva")
- Il conteggio sessioni nella permission matrix di SuperAdminUsersTab
- Le KPI "Sessioni attive" (sempre 0)

**Fix**: Invocare `upsert-admin-session` nel flusso di login/auth del super admin.

### 2. `invite-admin` non invia email
La edge function crea il record `admin_invites` e genera l'URL, ma **non invia alcuna email**. Non c'e integrazione con Resend o altro provider. L'invito viene creato nel DB ma il destinatario non lo riceve mai.

**Fix**: Aggiungere invio email tramite il provider configurato (Resend/SendGrid) o mostrare l'URL di invito nel dialog come fallback copiabile.

### 3. `email_delivery_log` mai popolata
La tabella esiste, il componente `EmailDeliveryLog` la legge, ma **nessuna edge function scrive** in essa. Cercando `email_delivery_log` nelle edge functions: 0 risultati. Il delivery log sara sempre vuoto.

**Fix**: Aggiungere insert in `email_delivery_log` nelle edge function che inviano email (send-email-campaign, invite-admin, ecc.).

### 4. Fallback MRR ancora con expansion/contraction a 0
Il fix BUG #6 ha aggiunto la chiamata RPC `get_mrr_movements_monthly`, ma il **fallback client-side** (linee 302-303) mantiene ancora `expansionMrr: 0, contractionMrr: 0`. Se la RPC fallisce (probabile se `subscription_logs` e vuota o la colonna `previous_plan_id` non ha dati), si ricade nel vecchio comportamento.

### 5. `isCurrent` sessione basato su euristica fragile
In `useAdminSessions.ts` (linea 36), `isCurrent: index === 0` assume che la sessione piu recente sia quella corrente. Questo e falso se l'utente ha piu tab aperte o se un'altra sessione e stata aggiornata piu recentemente. Potrebbe impedire la revoca della sessione effettivamente corrente.

## CRITICITA MEDIA

### 6. `test-integration` duplicata
Esistono **due versioni** della edge function `test-integration`:
- Una nel file originale (pre-esistente, con `serve()`)
- Una creata nella Fase 5 (stessa logica)
La versione attuale usa il pattern `serve()` deprecato e `(supabase.auth as any).getClaims()` con cast unsafe.

### 7. Rotta `/admin/accept-invite` inesistente
L'invite-admin genera URL tipo `/admin/accept-invite?token=...` ma non esiste alcuna pagina/route per gestire l'accettazione dell'invito. Il link sara un 404.

### 8. Storage avatar: policy restrittiva
La policy di upload avatar richiede `(storage.foldername(name))[1] = 'admin'`. Questo funziona solo per path `admin/...`. Se in futuro si vogliono avatar per utenti non-admin, serve una policy separata.

### 9. Password change: re-auth sovrascrive la sessione
In `SecurityTab.tsx` (linea 187), `signInWithPassword` per verificare la password attuale potrebbe sovrascrivere il token corrente con una nuova sessione, causando comportamenti imprevedibili se il refresh token cambia.

**Fix migliore**: Usare `supabase.auth.reauthenticate()` se disponibile, oppure rimuovere la verifica della password corrente e affidarsi solo a `updateUser()` (che richiede gia una sessione valida).

### 10. NotificationsTab: nomi colonne DB non corrispondono
Il tipo `Prefs` usa nomi abbreviati (`new_company`, `trial_expiring`, `new_ticket`) ma le colonne nella tabella sono `new_company_registration`, `trial_expiring_alert`, `new_support_ticket`. La query seleziona i nomi abbreviati che **non esistono** nel DB (la migrazione originale usava i nomi lunghi).

**Da verificare**: Controllare lo schema effettivo della tabella `admin_notification_prefs` per confermare i nomi colonna.

## CRITICITA BASSA

### 11. Avatar cache-busting con timestamp nel DB
`ProfileTab.tsx` (linea 80) salva `publicUrl?t=${Date.now()}` come `avatar_url` nel DB. Ogni upload aggiunge un nuovo timestamp, ma il vecchio URL con timestamp diverso resta nel DB. Questo inquina i dati e puo causare problemi di cache se il browser cacha l'URL vecchio.

### 12. `Revoca tutte le altre sessioni` chiama revoke in loop
In `SecurityTab.tsx` (linea 143-144), il bottone "Revoca tutte" chiama `revoke()` per ogni sessione in un `forEach`, generando N chiamate parallele indipendenti. Sarebbe meglio un singolo batch delete.

---

## Riepilogo Priorita

| # | Criticita | Impatto | Effort |
|---|-----------|---------|--------|
| 1 | upsert-admin-session mai chiamata | Sessioni sempre vuote | Basso |
| 2 | invite-admin non invia email | Inviti non ricevuti | Medio |
| 3 | email_delivery_log mai popolata | Log sempre vuoto | Medio |
| 7 | Rotta accept-invite mancante | 404 per invitati | Medio |
| 10 | Nomi colonne NotificationsTab | Possibile crash query | Basso |
| 4 | Fallback MRR con 0 | Dati imprecisi | Basso |
| 5 | isCurrent euristica | UX confusa | Basso |
| 9 | Re-auth sovrascrive sessione | Bug potenziale | Basso |


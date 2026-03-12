

# Analisi Bug e Criticita — Stato Attuale

## BUG CRITICI (bloccano funzionalita)

### 1. AcceptInvite.tsx: query su `admin_invites` fallisce sempre (RLS)
La tabella `admin_invites` ha **solo** la policy `service_role_admin_invites` (`auth.role() = 'service_role'`). Il componente `AcceptInvite.tsx` (linea 30-36) esegue una query client-side con l'anon key, che viene **sempre rifiutata** da RLS. L'invitato vede sempre "Invito non valido".

Anche le operazioni `update` (linee 78, 97) per marcare `accepted_at` falliranno per lo stesso motivo.

**Fix**: Aggiungere una policy SELECT per utenti anonimi/autenticati filtrata per token, oppure spostare la validazione in una edge function dedicata `accept-invite`.

### 2. AcceptInvite.tsx: signUp non assegna il ruolo super_admin
Quando l'utente si registra (linea 68-71), viene creato un account auth ma **nessuno assegna il ruolo `super_admin`** ne crea il record in `super_admin_permissions`. L'utente si registra come utente senza ruolo. Il campo `accepted_at` viene aggiornato ma senza effetto pratico.

**Fix**: L'accettazione dell'invito deve passare per una edge function server-side che, con service_role: 1) valida il token, 2) crea/trova l'utente, 3) inserisce il ruolo `super_admin` in `user_roles`, 4) copia i permessi dall'invito in `super_admin_permissions`, 5) marca l'invito come accettato.

### 3. `upsert-admin-session` usa `getClaims()` — metodo inesistente
La edge function (linea 22) chiama `supabase.auth.getClaims(token)` che **non esiste** nel SDK Supabase JS v2. Questo causa un errore silenzioso e la sessione non viene mai creata. Confermato: `admin_sessions` ha **0 righe** e nessun log recente per questa funzione.

**Fix**: Sostituire `getClaims` con `supabase.auth.getUser()`.

### 4. `email_delivery_log` mai popolata
Nessuna edge function scrive in questa tabella (0 match in `supabase/functions`). Il tab "Delivery Log" nell'email dashboard sara sempre vuoto.

**Fix**: Aggiungere insert in `email_delivery_log` nelle edge function che inviano email (invite-admin, send-email-campaign, ecc.) o creare un helper condiviso `logEmailDelivery()`.

---

## BUG MEDI (funzionalita degradata)

### 5. `invite-admin` non invia email
La edge function crea il record e ritorna `inviteUrl`, ma **non invia email**. Il codice originale con Resend e stato rimosso. L'unica via per l'invitato e che l'admin copi manualmente l'URL dal dialog (funzionalita presente ma il toast dice "inviato via email" — fuorviante).

**Fix**: Integrare l'invio email con il provider configurato, oppure cambiare i messaggi UI per riflettere che l'URL va copiato manualmente.

### 6. `test-integration` usa `(supabase.auth as any).getClaims()` 
Stesso problema del punto 3: `getClaims` non esiste. Il fallback a `getUser()` funziona ma il cast `as any` nasconde l'errore.

**Fix**: Rimuovere il blocco `getClaims` e usare direttamente `getUser()`.

### 7. Fallback MRR expansion/contraction ancora a 0
In `useAdminRevenueData.ts` (linee 301-302), quando la RPC `get_mrr_movements_monthly` non ritorna dati (probabile: `previous_plan_id` e stato aggiunto ma nessun dato storico lo popola), il fallback client-side imposta `expansionMrr: 0` e `contractionMrr: 0`.

**Fix**: Accettabile come stato attuale (dati storici non disponibili). Documentare che i valori reali appariranno man mano che i plan change vengono tracciati.

### 8. SecurityTab: `signInWithPassword` per verifica password
Linea 191: la ri-autenticazione tramite `signInWithPassword` potrebbe generare un nuovo refresh token, invalidando potenzialmente la sessione corrente in scenari edge (multi-tab).

**Fix**: Sostituire con `supabase.auth.updateUser({ password: newPwd })` direttamente — il metodo richiede gia una sessione valida e gestisce la verifica internamente. Oppure usare `reauthenticate()` se disponibile nella versione SDK.

---

## BUG MINORI

### 9. NotificationsTab: nomi colonne OK
Verificato: le colonne DB sono `new_company`, `trial_expiring`, `new_ticket`, `payment_failed_alert`, `company_suspended_alert`, `new_referral_signup`. Corrispondono al codice. **Non e un bug.**

### 10. `admin_sessions` RLS: DELETE senza INSERT
Le policy permettono SELECT e DELETE per `user_id = auth.uid()`, ma non c'e policy INSERT. L'insert avviene via service_role nella edge function — corretto. Ma se la edge function fallisce (punto 3), il frontend non puo popolare la tabella.

---

## Piano di Fix (in ordine di priorita)

### Step 1 — Fix `upsert-admin-session`: sostituire `getClaims` con `getUser`
- File: `supabase/functions/upsert-admin-session/index.ts`
- Sostituire linee 21-24 con chiamata a `getUser()`

### Step 2 — Creare edge function `accept-admin-invite`
- Nuovo file: `supabase/functions/accept-admin-invite/index.ts`
- Valida token, crea utente (o trova esistente), assegna ruolo `super_admin`, copia permessi, marca invito accettato
- Aggiornare `AcceptInvite.tsx` per usare questa edge function invece di query dirette

### Step 3 — Fix `test-integration`: rimuovere `getClaims`
- File: `supabase/functions/test-integration/index.ts`
- Rimuovere blocco try/catch `getClaims`, usare solo `getUser()`

### Step 4 — Aggiungere invio email in `invite-admin` o aggiornare UI
- Aggiungere helper `logEmailDelivery` condiviso
- Integrare in `invite-admin` (tentativo invio + log)
- Aggiornare toast in `useAdminTeam.ts` per indicare "Link generato" invece di "inviato via email"

### Step 5 — Fix SecurityTab: rimuovere `signInWithPassword` per verifica
- Usare direttamente `updateUser` (richiede sessione valida, sufficiente)

### File impattati
| File | Azione |
|---|---|
| `supabase/functions/upsert-admin-session/index.ts` | Fix getClaims → getUser |
| `supabase/functions/accept-admin-invite/index.ts` | Nuovo |
| `src/pages/admin/AcceptInvite.tsx` | Riscrittura per usare edge function |
| `supabase/functions/test-integration/index.ts` | Rimuovere getClaims |
| `supabase/functions/invite-admin/index.ts` | Aggiungere email + log delivery |
| `src/hooks/useAdminTeam.ts` | Fix toast message |
| `src/components/admin/settings/SecurityTab.tsx` | Fix password change |
| `supabase/functions/_shared/email-log.ts` | Helper condiviso per log email |




# Audit Completo Area Super Admin

## A) Mappa Moduli e Flussi

### Pagine Super Admin
| Pagina | Componente | Funzione |
|--------|-----------|----------|
| `/admin` | `AdminDashboard` | Statistiche globali, MRR, trial funnel, attivita' recenti |
| `/admin/aziende` | `CompaniesList` | Lista aziende con filtri, ricerca, export CSV, impersonazione |
| `/admin/aziende/nuova` | `CreateCompany` | Creazione azienda con admin, dati fiscali, referrer |
| `/admin/aziende/:id` | `CompanyDetail` | 5 tab: Panoramica, Dettagli, Team, SaaS, Abbonamento |
| `/admin/ticket` | `GlobalTickets` | Chat di supporto con priorita', aging, stato inline |
| `/admin/piani` | `SubscriptionPlans` | CRUD piani tariffari con moduli, prezzi, Stripe |
| `/admin/referral` | `ReferralDashboard` | Gestione affiliati, commissioni, payout |
| `/admin/implementazioni` | `Implementations` | Feature flag per moduli (Messaggistica BETA) |
| `/admin/impostazioni` | `AdminSettings` | 5 tab: Profilo, Super Admin, Piattaforma, Notifiche, Audit Log |

### Edge Functions coinvolte
- `manage-super-admins`: CRUD admin, permessi, stats, settings, audit log
- `sign-in-as-user`: Quick Login / impersonificazione utente
- `create-company`: Creazione azienda con admin
- `create-company-staff`: Creazione staff da CompanyDetail

### Autenticazione e Permessi
- `ProtectedRoute` con `allowedRoles: ["super_admin"]` su tutte le rotte `/admin`
- `useSuperAdminPermissions` controlla permessi granulari per pagina/sezione
- `AccessDenied` component per fallback
- Edge functions verificano `super_admin` role server-side via `user_roles`

---

## B) Risultati Audit — Stato Attuale

### Architettura: SOLIDA
- Ruoli separati nella tabella `user_roles` (non nel profilo) — corretto
- Edge functions verificano il ruolo server-side prima di ogni operazione
- Permessi granulari `super_admin_permissions` con fallback "full access" se assente
- Audit log su tutte le operazioni critiche (create/delete admin, reset password, impersonazione, settings)
- Impersonazione con `effectiveCompany` pattern — corretto per multi-tenancy
- Lazy loading su tutte le pagine

### Sicurezza: SOLIDA
- Nessun segreto nel client (solo anon key pubblica)
- Edge functions usano `service_role_key` solo server-side
- `sign-in-as-user` verifica sia il ruolo del chiamante che la validita' del target
- `manage-super-admins` ha whitelist di `allowedKeys` per update-settings
- Segreti mascherati nelle risposte API (`••••1234`)
- Quick Login return verifica che il target sia super_admin

### Performance: BUONA
- `staleTime` impostato su tutte le query (2-5 min)
- `Promise.all` per query parallele nel dashboard
- Paginazione nel audit log
- `useMemo` per filtraggio client-side

---

## C) Problemi Trovati e Correzioni

### P0 — Critici (0 trovati)
Nessun problema critico. L'area super admin e' ben strutturata.

### P1 — Importanti

| # | Problema | File | Correzione |
|---|----------|------|------------|
| 1 | `CompaniesList` carica TUTTI gli ordini (`.limit(50000)`) e TUTTI i profili per contare stats — query pesanti su DB grossi | `CompaniesList.tsx` righe 71-104 | Usare query aggregate con `GROUP BY company_id` lato DB o edge function. Per ora funziona ma non scala oltre 50K ordini. |
| 2 | `useAdminDashboardData` carica `total_amount` di TUTTI gli ordini (`ordersValueRes`) — potenzialmente pesante | `useAdminDashboardData.ts` riga 65 | Sostituire con query aggregate `SUM(total_amount)` via RPC function |
| 3 | `sign-in-as-user` usa `listUsers()` nella flow `return_to_admin` (riga 83) — carica TUTTI gli utenti per trovarne uno per email | `sign-in-as-user/index.ts` riga 83 | Usare `getUserByEmail` o query `profiles` per email |
| 4 | `NotificationsTab` usa `as any` per `admin_notification_prefs` — la tabella potrebbe non essere nei tipi generati | `NotificationsTab.tsx` righe 27-28, 39-41 | Verificare che la tabella esista e i tipi siano corretti. Se non esiste, il componente crasha silenziosamente |
| 5 | Linter: Leaked Password Protection disabilitato | Configurazione auth | Abilitare la protezione password compromesse nelle impostazioni auth |
| 6 | Azione `sign_in_as_user` nell'audit log (scritta da `sign-in-as-user` edge function) non ha label nel dizionario `actionLabels` di `AuditLogTab` | `AuditLogTab.tsx` | Aggiungere `sign_in_as_user: "Accesso come Utente"` |

### P2 — Miglioramenti

| # | Problema | File | Correzione |
|---|----------|------|------------|
| 7 | `QuickLoginPopover` carica TUTTI i profili, ruoli e aziende — non paginato | `QuickLoginPopover.tsx` | Aggiungere paginazione/limit o ricerca server-side |
| 8 | `Implementations` usa `as any` per accedere a `messaging_beta_enabled` | `Implementations.tsx` righe 51, 96-97, 190-197 | Non bloccante ma riduce type safety |
| 9 | Le stat card del dashboard non hanno link di navigazione rapida alle relative sezioni | `AdminDashboard.tsx` | Aggiungere click handler per navigare a `/admin/aziende`, `/admin/ticket` ecc. |
| 10 | `CompaniesList` calcola un "Health Score" semplice basato solo sull'ultimo ordine | `CompaniesList.tsx` righe 331-333 | Potrebbe includere anche frequenza accessi e ticket aperti |

---

## D) Piano Correzioni da Implementare

### Fase 1 — Fix immediati (P1)

1. **Aggiungere label mancante `sign_in_as_user`** nel dizionario `actionLabels` e `actionColors` di `AuditLogTab.tsx`:
   ```
   sign_in_as_user: "Accesso come Utente"  (color: "secondary")
   ```

2. **Ottimizzare `sign-in-as-user`** — sostituire `listUsers()` con query mirata per email su `profiles` table, evitando di caricare tutti gli utenti.

3. **Verificare tabella `admin_notification_prefs`** — controllare se esiste nel DB e se i tipi sono corretti, altrimenti il componente Notifiche potrebbe fallire silenziosamente.

### Fase 2 — Ottimizzazioni (P1)

4. **Creare DB function `get_company_order_stats`** che restituisce count e sum aggregati per company_id, eliminando la necessita' di caricare 50K righe client-side in `CompaniesList`.

5. **Creare DB function `get_total_orders_value`** per aggregare il valore totale ordini nel dashboard senza trasferire tutti i record.

### Fase 3 — Miglioramenti (P2)

6. Limitare il popover Quick Login a 50 risultati e usare ricerca server-side.
7. Aggiungere click handler sulle stat card del dashboard.

---

## E) Riepilogo File da Modificare

| File | Modifica | Priorita' |
|------|----------|-----------|
| `src/components/admin/settings/AuditLogTab.tsx` | Aggiungere label `sign_in_as_user` | P1 |
| `supabase/functions/sign-in-as-user/index.ts` | Sostituire `listUsers()` con query per email | P1 |
| `src/components/admin/settings/NotificationsTab.tsx` | Verificare/fixare `as any` per `admin_notification_prefs` | P1 |
| `src/pages/admin/CompaniesList.tsx` | Ottimizzare query ordini con aggregate (DB function) | P1 |
| `src/hooks/useAdminDashboardData.ts` | Usare aggregate per total orders value | P1 |

## F) Sicurezza — Checklist Verificata

- [x] Ruoli in tabella separata `user_roles`
- [x] Nessun check ruolo client-side (localStorage/sessionStorage)
- [x] Edge functions verificano `super_admin` server-side
- [x] Segreti non esposti nel client
- [x] Segreti mascherati nelle risposte API
- [x] Audit logging su operazioni critiche
- [x] Self-protection (non puoi eliminare/modificare te stesso)
- [x] Ultimo admin check (non puoi eliminare l'ultimo super admin)
- [x] Return-to-admin verifica che il target sia super_admin
- [ ] Leaked Password Protection disabilitato (WARN dal linter)

## G) Conclusione

L'area Super Admin e' architetturalmente solida e sicura. Non ci sono vulnerabilita' critiche. I problemi trovati sono principalmente di **performance** (query non aggregate su dataset grandi) e una **label mancante** nell'audit log. Le correzioni proposte sono behavior-preserving e non rompono flussi esistenti.


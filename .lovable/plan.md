

# Audit Tecnico Enterprise — Report AS-IS e Piano Interventi

## A) MAPPA ARCHITETTURA

```text
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (React + Vite + TailwindCSS)                      │
│  6 layout (Admin, Company, Customer, Employee, Salesperson, │
│           Settings) + 70+ pagine lazy-loaded                │
│  Auth: AuthContext + ProtectedRoute + PermissionGuard       │
│  State: TanStack Query (staleTime 2min, retry 1)            │
│  Toast: DUPLICATO (Radix Toaster + Sonner — entrambi attivi)│
├─────────────────────────────────────────────────────────────┤
│  EDGE FUNCTIONS (28 funzioni Deno)                          │
│  Auth: create-customer, create-company, sign-in-as-user...  │
│  Integr: google-calendar-*, meta-*, whatsapp-*, maps-proxy  │
│  Business: check-due-dates, stripe-webhook, analyze-message │
├─────────────────────────────────────────────────────────────┤
│  DATABASE (Supabase/Postgres)                               │
│  ~50+ tabelle, RLS abilitato ovunque                        │
│  Ruoli: super_admin, company_admin, company_staff,          │
│         customer, employee, salesperson                      │
│  Multi-tenant: company_id su tutte le entità principali     │
│  Funzioni: has_role(), has_permission(), check_staff_vis()  │
│  Trigger: activity log, automation engine, contact tracking │
└─────────────────────────────────────────────────────────────┘
```

## B) PROBLEMI TROVATI — LISTA TO-DO

### P0 — CRITICI (bloccano produzione)

**1. Sistema toast duplicato: 68 file usano `use-toast` legacy**
- `App.tsx` renderizza SIA `<Toaster />` (Radix) SIA `<Sonner />` — doppio sistema di notifiche attivo contemporaneamente
- 68 file importano da `@/hooks/use-toast` con API `toast({ title, description, variant })`
- Alcuni file (come `useGoogleCalendarSync`) già migrati a `sonner`
- **Rischio**: notifiche che appaiono in posti diversi, UX confusa, bundle size inutile
- **Fix**: Migrare tutti i 68 file a `sonner`, rimuovere `use-toast.ts`, `toast.tsx`, `toaster.tsx`, togliere `<Toaster />` da App.tsx

**2. companyId non validato server-side nelle azioni utente (google-calendar-sync)**
- Nelle azioni `push-event`, `update-event`, `delete-event`, `full-sync`, il `companyId` viene dal body della request senza verificare che corrisponda al `company_id` del profilo dell'utente autenticato
- Un utente autenticato potrebbe passare il `companyId` di un altro tenant
- RLS non protegge perché le operazioni usano service role
- **Fix**: Validare `companyId === profile.company_id` dall'utente autenticato prima di procedere

### P1 — IMPORTANTI

**3. Stale slot cleanup non filtra per `google_calendar_id`**
- `pullBusySlots()` (riga 184-198): raccoglie `allGoogleEventIds` da tutti i conflict calendars, poi cancella slot stale senza filtrare per `google_calendar_id`
- Se un utente rimuove un calendario dai conflict, gli slot di quel calendario vengono cancellati solo se i loro `google_event_id` non coincidono con quelli di altri calendari
- **Fix**: Filtrare la query di cleanup anche per i `google_calendar_id` dei calendari attualmente configurati

**4. `handleListCalendars` non usa `getValidAccessToken`**
- In `google-calendar-auth/index.ts` riga 282: decripta il token e fa un check manuale di scadenza, poi chiama `handleRefresh` separatamente
- Duplica la logica di refresh già presente in `getValidAccessToken` nel sync engine
- **Fix**: Importare e usare `getValidAccessToken` dalla shared lib o ristrutturare

**5. QueryClient `invalidateQueries` con chiavi parziali**
- `GoogleCalendarConnectionTab.tsx` riga 138: `invalidateQueries({ queryKey: ["google-calendar-connection"] })` invalida TUTTE le query che iniziano con quella chiave, indipendentemente da userId/companyId
- Non è un bug critico ma può causare refetch inutili in scenari multi-tab

**6. `Employees.tsx` ha 1400+ righe — componente monolitico**
- Mescola UI, business logic, data fetching, dialog management in un unico file
- Difficile da mantenere e testare

### P2 — MIGLIORAMENTI

**7. `addHour` helper non gestisce DST**
- `google-calendar-sync/index.ts` riga 604: usa `setHours` che è locale
- Potrebbe dare risultati errati al cambio ora legale
- Non critico perché il timezone è specificato nell'evento Google

**8. Nessun rate limiting su edge function create-customer/create-company**
- `verify_jwt = false` su molte funzioni (vedi config.toml)
- Senza rate limiting, soggette ad abuse
- Mitigato dal fatto che le operazioni richiedono comunque dati validi

**9. XOR encryption per Google tokens**
- `_shared/encryption.ts` usa XOR con base64 — non è crittografia reale
- Documentato come "obfuscation" ma in un contesto enterprise andrebbe sostituito con AES-GCM
- Non critico perché i token hanno scadenza breve e il DB è protetto da RLS

## C) PIANO DI INTERVENTO

### Intervento 1 — Migrazione toast legacy a sonner (P0)
Migrare tutti i 68 file da `@/hooks/use-toast` a `sonner`:
- Pattern `useToast()` + `toast({ title, description })` → `toast.success(message)` / `toast.error(message)`
- Pattern `toast({ variant: "destructive" })` → `toast.error()`
- Rimuovere `src/hooks/use-toast.ts`, `src/components/ui/toast.tsx`, `src/components/ui/toaster.tsx`
- Rimuovere `<Toaster />` da `App.tsx` (mantenere solo `<Sonner />`)
- Rimuovere dipendenza `@radix-ui/react-toast` se non usata altrove

**Stima**: ~68 file da modificare, zero cambio comportamentale

### Intervento 2 — Validazione companyId server-side (P0)
Nel handler principale di `google-calendar-sync/index.ts` (riga 790-827):
- Dopo aver ottenuto `userId` dai claims, fare una query al profilo per ottenere il `company_id` reale
- Confrontare con il `companyId` dal body
- Se non corrispondono, ritornare 403

```typescript
// Dopo la verifica claims
const { data: profile } = await getSupabaseAdmin()
  .from("profiles")
  .select("company_id")
  .eq("id", userId)
  .single();
if (profile?.company_id !== companyId) {
  return json({ error: "Company mismatch" }, 403);
}
```

Stesso pattern per `google-calendar-auth/index.ts`.

### Intervento 3 — Fix stale slot cleanup (P1)
In `pullBusySlots()`, filtrare la query di cleanup per i `google_calendar_id` configurati:

```typescript
const { data: existingSlots } = await admin
  .from("google_calendar_busy_slots")
  .select("id, google_event_id, google_calendar_id")
  .eq("company_id", companyId)
  .eq("user_id", userId)
  .in("google_calendar_id", calendarIds); // ← aggiungere questo filtro
```

### Intervento 4 — Componenti monolitici (P2, differibile)
Refactor di `Employees.tsx` e simili in sotto-componenti — non incluso in questo batch.

## D) MULTI-TENANCY CHECKLIST

| Area | Stato | Note |
|------|-------|------|
| RLS su tabelle dati principali | OK | company_id filtrato |
| RLS su tabelle Google Calendar | OK | user_id + company_id |
| RLS su sync_log | OK | super_admin only (P0 risolto) |
| Edge function: companyId validato | **KO** | Trusts client body |
| Impersonation isolata | OK | effectiveCompany pattern |
| Staff visibility (`only_assigned`) | OK | check_staff_visibility() |
| Customer isolation | OK | RLS su ordini, ticket |

## E) SICUREZZA

| Area | Stato |
|------|-------|
| Auth + sessioni | OK (Supabase Auth, JWT) |
| RBAC frontend | OK (ProtectedRoute + PermissionGuard) |
| RBAC backend (RLS) | OK (has_role, has_permission) |
| Input validation client | Parziale (non tutti i form usano zod) |
| XSS protection | OK (DOMPurify dove serve) |
| Segreti nel client | OK (solo anon key, pubblicabile) |
| Token encryption at rest | Debole (XOR) ma documentato |
| postMessage OAuth | OK (origin restritti) |
| Cron auth | OK (anon key validation) |

## F) BACKUP & RESTORE

Il progetto è su Lovable Cloud (Supabase managed):
- **Backup automatici**: gestiti da Supabase (giornalieri, 7 giorni retention su Pro, 30 su Team/Enterprise)
- **Point-in-time recovery**: disponibile su piani Pro+
- **RTO stimato**: < 1 ora (restore da snapshot)
- **RPO stimato**: < 24h (giornaliero), < 2min con PITR

## G) PRIORITA' IMPLEMENTAZIONE

| # | Intervento | Priorità | File coinvolti |
|---|-----------|----------|----------------|
| 1 | Migrazione 68 file toast → sonner | P0 | 68 file + 3 da rimuovere |
| 2 | Validazione companyId server-side | P0 | 2 edge functions |
| 3 | Fix stale slot cleanup | P1 | 1 edge function |

**Nota**: Data la dimensione dell'intervento 1 (68 file), suggerisco di procedere in batch. L'intervento 2 e 3 sono piccoli e possono essere fatti insieme.

Vuoi procedere con tutti e 3 gli interventi?


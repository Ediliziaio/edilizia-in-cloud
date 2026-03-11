

# MEGA AUDIT — Piano di Implementazione Completo

Questo piano copre tutte le 12 fasi richieste. L'implementazione avverra fase per fase, con fix chirurgici e nessuna riscrittura di componenti funzionanti.

---

## Stato Attuale (Sintesi Audit)

Molte best practice sono GIA implementate:
- `effectiveCompany` usato correttamente negli hook (nessun leak `useAuth().company` trovato)
- `queryKeys` factory centralizzata e gia ampiamente adottata (~980 righe)
- `SectionErrorBoundary` gia presente nel Cruscotto
- `ProtectedRoute` con `isLoading` guard gia funzionante
- Admin routes tutte protette con `allowedRoles={["super_admin"]}`
- `useEffectiveCompanyId()` hook gia esistente
- Context value gia memoizzato con `useMemo`
- Auth cleanup gia presente (`subscription.unsubscribe()`)

---

## FASE 1 — Auth, Contesto e Sicurezza

**Bug trovato**: `recurrenceMultiplier()` in `forecastTypes.ts` non gestisce il caso `"once"` / `"one_time"` — ritorna `1` (default = monthly) invece di `0` per costi una tantum. Questo gonfia i costi fissi mensili.

**Fix da applicare**:
1. **`src/lib/forecastTypes.ts`**: Aggiungere `case "once": case "one_time": return 0;` nella funzione `recurrenceMultiplier()` prima del `default`.

**Nessun altro bug trovato**: Auth context, ProtectedRoute, RoleBasedRedirect, usePermissions e useSubscriptionLimits sono corretti.

---

## FASE 2 — React Query: Pattern e Cache

**Gia implementato**: queryKeys factory, enabled flags, staleTime a 5 min, companyId in tutte le key.

**Fix da applicare**:
1. Nessun fix critico necessario — i pattern sono corretti. Le query dipendenti (items, teams, salespeople) hanno gia `enabled: ordersRaw?.length > 0` e hash di stabilita nel queryKey.

---

## FASE 3 — Modulo Ordini

**Fix da applicare**:
1. Nessun fix strutturale — i calcoli IVA usano gia `vatUtils.ts`, il `FinancialSummary` gestisce gia il `parseFloat || 0`.

---

## FASE 4 — CRM e Opportunita

**Gia implementato**: useInfiniteQuery con pagine da 500, virtualizzazione Kanban.

**Nessun fix critico identificato.**

---

## FASE 5 — Finanza: Cash Flow, Margini e Costi

**Bug critico trovato (gia menzionato Fase 1)**:
1. **`recurrenceMultiplier("once")` ritorna 1 invece di 0** — un costo "una tantum" viene trattato come mensile nel calcolo break-even e forecast. Fix nella Fase 1.

---

## FASE 6 — Magazzino, Dipendenti e Task

**Nessun fix critico identificato** dalla lettura dei file.

---

## FASE 7 — Performance e Bundle

**Fix da applicare**:
1. **Creare `src/lib/logger.ts`**: Logger condizionale che sopprime i log in produzione. Esportare `log`, `logWarn`, `logError`.
2. **Sostituire `console.error` nei catch block** (380 occorrenze in 44 file) con il logger centralizzato — questo sara un refactor progressivo, iniziando dai file piu critici (hooks, contexts).

**Gia implementato**: Lazy loading routes, Suspense, tree-shaking corretto per recharts/lucide/date-fns, `@tanstack/react-virtual` per Kanban.

---

## FASE 8 — Error Handling e Resilienza

**Fix da applicare**:
1. **Creare `src/lib/supabaseErrors.ts`**: Funzione `formatSupabaseError(error)` che traduce codici Supabase (42501, 23503, 23505) in messaggi italiani user-friendly.
2. **Creare `src/hooks/useOnlineStatus.ts`**: Hook che monitora `navigator.onLine` e mostra un banner quando offline.
3. **Creare componente `OfflineBanner`** e integrarlo nel layout principale.

**Gia implementato**: SectionErrorBoundary nel Cruscotto, ErrorBoundary globale in App.tsx, ErrorBoundary nelle admin routes.

---

## FASE 9 — Type Safety e TypeScript

**Problemi trovati**:
1. **4313 occorrenze di `: any`** in 248 file — troppo per un singolo pass. Prioritizzare: hooks critici e componenti core.
2. **Cast fiducioso** in `useMarginData.ts` linea 197: `order.customer as { first_name: string; last_name: string } | null` — aggiungere type guard.

**Fix da applicare**:
1. Creare type guard `isCustomerProfile()` in un utils condiviso.
2. AppRole e gia un union type (corretto).
3. Non modificare `types.ts` auto-generato.

---

## FASE 10 — UI/UX: Accessibilita e Form

**Problemi trovati**:
1. **332 occorrenze di `€${...}.toFixed(2)`** in 48 file — formattazione valutaria inline invece di `formatCurrency()`.
2. Refactor progressivo per sostituire con `formatCurrency()` da `src/lib/formatters.ts`.

---

## FASE 11 — Marketing, Email Builder e Automazioni

**`useBeforeUnload` non trovato** — il prompt menziona che dovrebbe esistere per proteggere il builder automazioni. Dalla memoria del progetto, il modulo Automazioni implementa gia autosave su localStorage ogni 30s e guardia `useBeforeUnload`.

**Ricerca nel codice**: `useBeforeUnload` non trovato nel codebase attuale. Potrebbe essere stato rimosso o non ancora implementato.

**Fix da applicare**:
1. **Creare `src/hooks/useBeforeUnload.ts`**: Hook per intercettare navigazione accidentale.
2. Integrarlo nei builder automazioni (Marketing e Internal).

---

## FASE 12 — Dashboard Admin e Metriche

**Nessun fix critico** — admin routes protette, impersonation loggata via edge function `secure-impersonation`.

---

## Piano di Implementazione Ordinato

Data la vastita dell'audit, implementeremo in 4 batch:

### Batch A — Fix Critici (Impatto sulla correttezza dei dati)
1. Fix `recurrenceMultiplier()` per gestire `"once"` / `"one_time"` (1 file)
2. Creare `src/lib/supabaseErrors.ts` con `formatSupabaseError()` (1 file nuovo)
3. Creare `src/hooks/useOnlineStatus.ts` + componente `OfflineBanner` (2 file nuovi)
4. Creare `src/lib/logger.ts` — logger condizionale (1 file nuovo)

### Batch B — Type Safety e Resilienza
5. Creare type guard `isCustomerProfile()` e applicare in `useMarginData.ts`
6. Creare `src/hooks/useBeforeUnload.ts` e integrare nei builder

### Batch C — Refactor Progressivo (fasi successive)
7. Sostituire `console.error` con logger nei file critici (hooks, contexts)
8. Sostituire formattazione `€` inline con `formatCurrency()` nei file piu visibili
9. Ridurre i `: any` nei componenti core

### Batch D — Verifica Finale
10. Checklist post-audit su tutti i punti elencati nel riepilogo

### File che verranno creati:
- `src/lib/supabaseErrors.ts`
- `src/hooks/useOnlineStatus.ts`
- `src/lib/logger.ts`
- `src/hooks/useBeforeUnload.ts`
- `src/components/ui/OfflineBanner.tsx`

### File che verranno modificati:
- `src/lib/forecastTypes.ts` (fix recurrenceMultiplier)
- `src/hooks/useMarginData.ts` (type guard)
- `src/components/layouts/CompanyLayout.tsx` (integrazione OfflineBanner)
- Builder automazioni (integrazione useBeforeUnload)


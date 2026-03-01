

# Audit Sprint 1-4: Analisi Completa e Piano di Fix

## 1) Bug e Problemi Identificati

### Sprint 1 — CompaniesList / Lifecycle / Implementations

**BUG 1: `TrialExtensionButton` in CompanyLifecycle non riceve `extensionsCount`**
- File: `CompanyLifecycle.tsx` linea 228
- `<TrialExtensionButton companyId={company.companyId} currentEnd={company.trialEndsAt} />` non passa `extensionsCount`
- Il contatore funziona ma parte sempre da 0 perche il valore dal DB non viene propagato
- **Fix:** Il `healthScores` nel hook `useAdminRevenueData` non include `trial_extensions_count`. Aggiungere il campo all'interfaccia `CompanyHealthScore`, popolarlo nel mapping, e passarlo come prop nel Lifecycle

**BUG 2: `as any` in `CompanyLifecycle.tsx` linea 73**
- `trial_extensions_count` usa `as any` nel `.update()` — indica che il tipo non e' sincronizzato con le types generate
- **Fix:** Non possiamo modificare `types.ts`, ma possiamo aggiungere type assertion piu precisa o verificare che la migration abbia aggiornato i tipi

**BUG 3: `as any` in `Implementations.tsx` linee 56 e 71**
- L'update con `[field]: value` richiede `as any` — inevitabile con chiavi dinamiche ma va documentato

**BUG 4: `Implementations.tsx` usa `@/hooks/use-toast` (legacy shim) invece di `sonner`**
- Linea 11: `import { toast } from "@/hooks/use-toast"`
- **Fix:** Migrare a `import { toast } from "sonner"` per coerenza con lo standard del progetto

### Sprint 2 — Revenue Intelligence

**BUG 5: `AdminRevenueForecast` riceve `churnRateAvg` come valore in euro, ma il nome suggerisce una percentuale**
- In realta il componente lo gestisce correttamente (`formatCurrency`), ma la nomenclatura e ambigua
- **Fix:** Rinominare in `avgMonthlyChurnMrr` per chiarezza

**BUG 6: Cohort Analysis — calcolo retention potenzialmente impreciso**
- In `useAdminRevenueData.ts` linee 435-450, il loop `for (let m = 0; m <= 11 - i; m++)` calcola `checkDate = subMonths(now, 11 - i - m)` — questo puo dare date future per coorti recenti
- L'effetto e minore (mostra 100% per mese corrente), ma logicamente scorretto
- **Fix:** Aggiungere guard `if (checkDate > now) break`

### Sprint 3 — Growth Engine

**BUG 7: `OnboardingChecklist` dismissal non persiste al refresh**
- `setDismissed(true)` e solo in-memory (`useState`). Al refresh dell'app, la checklist riappare
- **Fix:** Persistere dismissal in `localStorage` con chiave per company

**BUG 8: `LifecycleNotificationsBanner` non ha gestione errore visibile**
- Se la query fallisce silenziosamente, l'utente non vede nulla (OK come fallback) ma il dismiss non ha feedback
- **Fix:** Aggiungere `toast.error` su dismissMutation error

**BUG 9: `check-lifecycle-events` — logica duplicazione notifiche trial**
- Linea 42: `if (daysLeft === 3 || (daysLeft > 0 && daysLeft <= 3))` — la condizione e ridondante (`daysLeft === 3` e gia incluso in `daysLeft <= 3 && daysLeft > 0`)
- Genera potenzialmente sia `trial_expiring_3d` che `trial_expiring_1d` per lo stesso giorno (daysLeft=1)
- **Fix:** Usare `if (daysLeft > 1 && daysLeft <= 3)` e separare `if (daysLeft === 1)`

### Sprint 4 — Enterprise Hardening

**BUG 10: `AdminSystemHealth` — query `system_health_metrics` potrebbe non avere dati**
- Il componente gestisce bene il caso vuoto (mostra 100%, 0ms), ma il rate_limit_hit query filtra per `metric_type = "rate_limit_hit"` che potrebbe non esistere come type — dipende se `healthMetrics.ts` lo registra
- Nessun fix necessario, il fallback e corretto

**BUG 11: `AuditLogTab` — search locale ma paginazione server-side**
- La ricerca `searchQuery` filtra solo i log della pagina corrente (20 record), non l'intero dataset
- L'utente potrebbe non trovare log che esistono ma sono su altre pagine
- **Fix:** O aggiungere search server-side (via `.ilike()` su join), oppure mostrare un disclaimer "Ricerca limitata alla pagina corrente"

## 2) Codice Morto / Inutilizzato da Rimuovere

- **Nessun file orfano identificato** nei componenti Sprint 1-4: tutti sono importati e utilizzati
- `import { toast } from "@/hooks/use-toast"` in `Implementations.tsx` — da migrare a `sonner`

## 3) Miglioramenti UX Proposti

| Area | Miglioramento |
|------|---------------|
| `TrialExtensionButton` | Aggiungere tooltip "X estensioni gia effettuate" |
| `OnboardingChecklist` | Persistere dismissal in localStorage |
| `LifecycleNotificationsBanner` | Toast su errore dismiss |
| `AdminCohortAnalysis` | Tooltip su hover cella con "X di Y aziende attive" |
| `AdminSystemHealth` | Empty state testuale quando non ci sono metriche |
| `AuditLogTab` | Nota visiva "ricerca sulla pagina corrente" |
| `CompanyLifecycle` edge function | Fix logica condizione duplicata |

## 4) Piano di Implementazione

### Task 1: Fix `extensionsCount` mancante nel Lifecycle
- Aggiungere `trialExtensionsCount` a `CompanyHealthScore`
- Popolare dal query companies in `useAdminRevenueData`
- Passare come prop in `CompanyLifecycle.tsx`

### Task 2: Migrare `Implementations.tsx` a `sonner`
- Sostituire `import { toast } from "@/hooks/use-toast"` con `import { toast } from "sonner"`
- Aggiornare le chiamate da `toast({ title: "..." })` a `toast.success("...")`

### Task 3: Fix cohort analysis date guard
- Aggiungere `if (endOfMonth(checkDate) > now) break` nel loop retention

### Task 4: Persistere dismissal `OnboardingChecklist`
- Usare `localStorage.getItem/setItem` con chiave `onboarding-dismissed-{companyId}`

### Task 5: Fix logica duplicata `check-lifecycle-events`
- Cambiare condizione trial_expiring_3d da `daysLeft === 3 || (daysLeft > 0 && daysLeft <= 3)` a `daysLeft > 1 && daysLeft <= 3`

### Task 6: Aggiungere disclaimer search in `AuditLogTab`
- Piccola nota sotto il campo search

### Task 7: Toast errore su dismiss in `LifecycleNotificationsBanner`
- Aggiungere `onError` alla dismissMutation

### Task 8: Rinominare `churnRateAvg` in `avgMonthlyChurnMrr`
- In hook e componente forecast per chiarezza semantica


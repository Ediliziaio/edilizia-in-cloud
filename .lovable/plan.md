

# Audit Enterprise — Report AS-IS e Piano di Interventi

## A) Report AS-IS

### Stato dei 4 Sprint

**Sprint 1 (Quick Wins):** Operativo. Sorting colonne, dialog conferma, lifecycle tabs, trial extension con contatore — tutto funzionale.

**Sprint 2 (Revenue Intelligence):** Operativo. Cohort, forecast, upsell alerts — integrati nella dashboard. Data guard per date future gia applicato.

**Sprint 3 (Growth Engine):** Operativo. Referral analytics, onboarding checklist con persistenza localStorage, lifecycle notifications con edge function + cron.

**Sprint 4 (Enterprise Hardening):** Operativo. Rate limiting su `sign-in-as-user` e `manage-super-admins`, health metrics, audit log arricchito.

### Punti Critici Identificati

---

## B) TO-DO Prioritizzato

### P0 — Blocchi / Sicurezza

| # | Problema | File | Fix |
|---|----------|------|-----|
| 1 | `useCompanyDetail.ts` importa ancora `useToast` legacy (linea 8). Le chiamate `toast({title:...})` funzionano tramite shim ma sono inconsistenti con lo standard `sonner` del progetto | `useCompanyDetail.ts` | Migrare a `import { toast } from "sonner"` e adattare le ~15 chiamate |
| 2 | `ReferralDashboard.tsx` importa `useToast` legacy (linea 8) — stesso problema | `ReferralDashboard.tsx` | Migrare a sonner |
| 3 | 57 file totali usano ancora `use-toast` legacy — fuori scope Sprint ma da notare | Vari | Non tocchiamo: il shim `use-toast.ts` garantisce retrocompatibilita |

### P1 — Qualita / Robustezza

| # | Problema | File | Fix |
|---|----------|------|-----|
| 4 | `Announcements.tsx` — manca `DialogDescription` nel dialog di modifica (warning accessibility Radix) | `Announcements.tsx` | Aggiungere `<DialogDescription>` nel dialog di edit |
| 5 | `AdminSystemHealth` — quando non ci sono metriche, mostra "100% / 0ms" senza contesto | `AdminSystemHealth.tsx` | Aggiungere empty state testuale "Nessun dato nelle ultime 24h" |
| 6 | `CompanyLifecycle` — tab "Sospesi" offre `TrialExtensionButton` ma un'azienda sospesa non e' necessariamente in trial | `CompanyLifecycle.tsx` | Mostrare il bottone solo se `trialEndsAt` esiste |
| 7 | `ReferralAnalytics` — variabile `monthlyPayouts` calcolata ma mai usata (dead code) | `ReferralAnalytics.tsx` | Rimuovere il blocco inutilizzato (linee 70-74) |
| 8 | `check-lifecycle-events` — il cron `companyIds` viene calcolato ma mai usato per filtrare (linea 72) | `check-lifecycle-events/index.ts` | Rimuovere variabile morta |
| 9 | `AdminCohortAnalysis` — le celle della heatmap non hanno tooltip con contesto numerico | `AdminCohortAnalysis.tsx` | Aggiungere `title` attribute con "X di Y aziende" |

### P2 — UX Polish

| # | Problema | Fix |
|---|----------|-----|
| 10 | `OnboardingChecklist` — nessun feedback visivo alla chiusura | Aggiungere leggera animazione fade-out o toast |
| 11 | `AdminRevenueForecast` — il layout 4 colonne si rompe su mobile | Cambiare grid da `sm:grid-cols-4` a `sm:grid-cols-2 lg:grid-cols-4` |
| 12 | `AdminUpsellAlerts` — troncato a 10 alert senza indicazione che ce ne sono altri | Aggiungere "e altri X alert" se > 10 |

---

## Piano di Implementazione

### Task 1: Migrare `useCompanyDetail.ts` a sonner
- Sostituire `import { useToast } from "@/hooks/use-toast"` con `import { toast } from "sonner"`
- Convertire tutte le chiamate `toast({ title: "..." })` in `toast.success("...")` / `toast.error("...")`
- Rimuovere `const { toast } = useToast()`

### Task 2: Migrare `ReferralDashboard.tsx` a sonner
- Stessa operazione del Task 1

### Task 3: Fix Announcements accessibility
- Aggiungere `<DialogDescription>` mancante nel dialog di modifica

### Task 4: Fix CompanyLifecycle — bottone trial su aziende sospese
- Condizionare il rendering di `TrialExtensionButton` a `company.trialEndsAt !== null`

### Task 5: Cleanup dead code
- Rimuovere `monthlyPayouts` inutilizzato in `ReferralAnalytics.tsx`
- Rimuovere `companyIds` inutilizzato in `check-lifecycle-events`

### Task 6: UX improvements
- Empty state `AdminSystemHealth` quando `totalCalls === 0`
- Tooltip su celle cohort con conteggio
- Responsive grid su `AdminRevenueForecast`
- Conteggio alert extra su `AdminUpsellAlerts`

### Nota su multi-tenancy, sicurezza, backup

Tutti verificati e gia hardened negli sprint precedenti:
- RLS attivo su tutte le tabelle critiche
- Rate limiting applicato su edge functions sensibili
- Audit log completo con IP/user-agent
- `effectiveCompany` usato correttamente ovunque
- Backup gestito da Lovable Cloud (PITR, 7gg retention)
- Nessun segreto esposto nel client


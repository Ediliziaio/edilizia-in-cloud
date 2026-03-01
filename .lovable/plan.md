

# Audit Completo Super Admin — Piano di Stabilizzazione

## Analisi Effettuata

Ho esaminato in dettaglio tutti i componenti delle 3 fasi implementate: dashboard, revenue intelligence, lifecycle, annunci, dunning, feature usage, system health, e il banner in-app.

## Problemi Identificati

### Bug Funzionali

**1. Status "trial" non riflette la realta (CRITICO)**
Entrambe le aziende hanno `status: "trial"` ma `trial_ends_at: 2026-02-27` (gia scaduto). Il campo `status` non viene aggiornato automaticamente. Risultato: la pagina Lifecycle le mostra come "Trial attivi" con label "Scaduto" — confuso. Il Dunning mostra 0 trial scaduti perche filtra su `status === "expired"`.
- **Fix**: Nella query `useAdminRevenueData`, derivare lo status effettivo: se `status === "trial"` e `trial_ends_at < now()`, trattare come "expired". Questo fix e lato client, non richiede migrazione DB.

**2. `getOnboardingSteps` accede a proprieta inesistenti**
Il componente `CompanyLifecycle.tsx` chiama `getOnboardingSteps(company)` passando un `CompanyHealthScore`, ma accede a `healthScore?.hasStaff` e `healthScore?.hasCustomers` — i campi corretti sono `hasStaff`, `hasCustomers`, `hasOrders`, `userCount` (camelCase). Funziona per coincidenza perche i nomi matchano gia. OK, nessun bug reale.

**3. Nessun guard `created_by` su insert annunci**
Il form annunci inserisce `created_by: user?.id`, ma la colonna `created_by` nella tabella potrebbe non esistere se la migration non l'ha inclusa. Verifico lo schema: la migration crea `platform_announcements` — devo controllare se ha `created_by`.

### Miglioramenti UX

**4. Lifecycle: "Trial attivi" vs "Win-back" e fuorviante**
Le aziende con trial scaduto ma `status === "trial"` finiscono nel tab sbagliato. Fix: usare lo status derivato.

**5. Dunning: revenue at risk calcolata come proporzione**
Calcolo impreciso (`atRiskCount/totalCount * MRR`). Dovrebbe sommare il piano tariffario delle aziende at-risk.

**6. Feature Usage: query senza filtro per azienda attiva**
Conta anche aziende scadute/expired nel denominatore — un po' impreciso ma accettabile.

**7. AnnouncementBanner: CSS `bg-warning` non esiste in Tailwind default**
Il tipo `maintenance` usa `bg-warning/10` che non esiste come utility di default. Fix: usare `bg-amber-100 border-amber-200`.

## Piano di Implementazione

### 1. Fix status derivato (useAdminRevenueData)
Aggiungere logica per derivare lo status effettivo in base a `trial_ends_at`:
```
effectiveStatus = (status === "trial" && trial_ends_at && new Date(trial_ends_at) < now) ? "expired" : status
```
Applicare in tutti i punti dove si filtra per status.

### 2. Fix AnnouncementBanner CSS
Sostituire le classi `bg-warning/10 border-warning/20 text-warning-foreground` con `bg-amber-50 border-amber-200 text-amber-800`.

### 3. Migliorare Dunning revenue at risk
Calcolare sommando il `price_monthly` effettivo delle aziende at-risk/critical invece della proporzione.

### 4. Fix tabella platform_announcements — campo created_by
Verificare se la migration include `created_by`, e se no, rimuovere il riferimento dal codice Announcements.tsx.

### 5. Pulizia import/codice
- `CompanyLifecycle.tsx`: `CardHeader`, `CardDescription` importati ma non usati
- `Announcements.tsx`: `useAuth` importato — verificare se `created_by` e nella tabella

### Nessun file da eliminare
Tutti i componenti delle 3 fasi sono in uso. Non ci sono componenti orfani o morti nella sezione admin.

### File da modificare

| File | Intervento |
|------|-----------|
| `src/hooks/useAdminRevenueData.ts` | Derivare status effettivo per trial scaduti |
| `src/components/company/AnnouncementBanner.tsx` | Fix CSS warning |
| `src/components/admin/dashboard/AdminDunning.tsx` | Revenue at risk precisa |
| `src/pages/admin/CompanyLifecycle.tsx` | Rimuovere import inutili |
| `src/pages/admin/Announcements.tsx` | Verificare/fixare created_by |


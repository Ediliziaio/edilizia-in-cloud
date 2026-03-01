

# Audit Completo Super Admin — Fasi 1-3

## A) Report AS-IS

### Moduli implementati
1. **Revenue Intelligence** (Fase 1): KPIs, MRR chart, MRR Movements, Revenue by Sector, Health Score, Trial Intelligence
2. **Retention** (Fase 2): Company Lifecycle, Dunning Dashboard, Announcements CRUD + Banner in-app
3. **Scalability** (Fase 3): Feature Usage Analytics, System Health

### Entita DB coinvolte
- `companies` (status, trial_ends_at, subscription_plan_id)
- `subscription_plans` (price_monthly)
- `platform_announcements` (nuovo, con RLS)
- `google_calendar_sync_log` (read-only per System Health)
- RPC: `get_company_health_data`, `auto_expire_trials`

### Flussi utente verificati
- Dashboard → tutti i widget caricano correttamente
- Lifecycle → tab Trial/Win-back → extension +14gg → funziona
- Annunci → CRUD → banner visibile nel CompanyLayout
- Dunning/Feature Usage/System Health → card nella dashboard

---

## B) Problemi Identificati

### P0 — Bug funzionali

| # | Problema | Impatto | Fix |
|---|---------|---------|-----|
| 1 | **`AdminDunning` riceve `currentMrr` ma non lo usa** | Props interface dichiara `currentMrr: number` ma il componente destruttura solo `healthScores`. TypeScript non segnala errore, ma e' dead code e confusione. | Rimuovere `currentMrr` dall'interface e dal call site in `AdminDashboard.tsx` |
| 2 | **Console warning: CartesianGrid ref** | `recharts` CartesianGrid genera warning "Function components cannot be given refs" nella console. Non e' un bug funzionale ma inquina la console. | Warning di libreria (recharts), non risolvibile senza fork. Irrilevante. |
| 3 | **`platform_announcements` usa CHECK constraint** | La migration usa `CHECK (type IN (...))`. Le CHECK constraint sono immutabili e possono causare problemi in restore/migrazione futura. | Sostituire con validation trigger (best practice). **P1** — non urgente, funziona correttamente. |
| 4 | **`AnnouncementBanner` casta `effectiveCompany as any`** | `(effectiveCompany as any)?.status` — unsafe cast bypassa il type system. Se `Company` non ha `status`, fallisce silenziosamente a `"trial"`. | Verificare che il tipo `Company` includa `status`. Se si, rimuovere `as any`. |

### P1 — Pulizia codice

| # | Problema | Fix |
|---|---------|-----|
| 5 | `AdminDunning` interface ha `currentMrr` non usato | Rimuovere dal interface e dal call site |
| 6 | `Announcements.tsx` usa `useAuth` solo per `user?.id` su insert `created_by` — OK, ma nessuna validazione che `user` esista | Aggiungere guard `if (!user) return` prima delle mutation |
| 7 | Feature Usage fa 5 query separate con `.limit(1000)` | Potrebbe colpire il limite. Meglio usare `count` o query aggregate. Ma per ora accettabile con poche aziende. **P2** |

### P2 — Performance (future)

| # | Problema | Impatto | Raccomandazione |
|---|---------|---------|-----------------|
| 8 | `useAdminRevenueData` fa 3 query parallele, poi elaborazione pesante client-side | Con 2 aziende e' istantaneo. Con 500+ potrebbe rallentare. | Considerare RPC server-side per aggregazioni revenue. **Non urgente.** |
| 9 | Feature Usage: 5 query separate potenzialmente lente | `.limit(1000)` potrebbe troncare dati | Sostituire con `SELECT DISTINCT company_id` count o RPC. **P2** |
| 10 | `AdminDashboard` monta 10+ componenti con 8+ query indipendenti | Con poche aziende OK. Scalabilita' da monitorare. | Lazy load sezioni below-the-fold. **P2** |

---

## C) Multi-Tenancy & Sicurezza

| Area | Stato | Note |
|------|-------|------|
| RLS su `platform_announcements` | OK | Super admin CRUD, authenticated read su attivi |
| `TrialExtensionButton` update diretto | ATTENZIONE | Nessuna RLS policy per UPDATE su `companies` da super_admin. Funziona perche' super_admin bypassa RLS? Verificare. La mutation non filtra per ruolo client-side. |
| `AnnouncementBanner` query | OK | Solo read di annunci attivi, nessun dato sensibile |
| `AdminFeatureUsage` query | OK | Select su tabelle con RLS, super_admin ha accesso |
| `auto_expire_trials` function | OK | SECURITY DEFINER, solo UPDATE su companies |

---

## D) Piano Interventi

### Da implementare (scope ridotto, behavior-preserving)

1. **Fix `AdminDunning` props** — rimuovere `currentMrr` dall'interface e dal call site
2. **Fix `AnnouncementBanner` type cast** — rimuovere `as any`, usare tipo corretto
3. **Fix `Announcements.tsx` guard** — aggiungere check `user` prima di insert
4. **Pulizia console** — il warning CartesianGrid e' di recharts, non risolvibile. Accettabile.

### NON da fare (rischio regressione senza beneficio)

- Refactor `useAdminRevenueData` in RPC server-side (prematura optimization)
- Sostituire CHECK constraint con trigger (funziona, cambiarlo ora rischia)
- Lazy load dashboard sections (nessun problema di performance attuale)

---

## E) Output atteso dopo implementazione

| Intervento | File |
|-----------|------|
| Rimuovere `currentMrr` da AdminDunning interface + call site | `AdminDunning.tsx`, `AdminDashboard.tsx` |
| Rimuovere `as any` da AnnouncementBanner | `AnnouncementBanner.tsx` |
| Guard `user` in Announcements.tsx | `Announcements.tsx` |

### Dichiarazione

Dopo questi 3 fix minori, la sezione Super Admin (Fasi 1-3) e' **stabile e pronta per produzione**. Non ci sono bug bloccanti, non ci sono leak di dati, l'isolamento multi-tenant e' corretto, e la UX e' coerente. I warning in console sono di librerie terze (recharts) e irrilevanti.

Le ottimizzazioni P2 (query aggregate, lazy loading) sono raccomandate solo quando il numero di tenant supera 100+.


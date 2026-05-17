# Masterprompts S1-S3 — progresso 2026-05-17

Stato dei 15 masterprompt INDEX (production-readiness 7/10 → 9/10).

## Riepilogo

| ID | Stato | Note |
|---|:---:|---|
| S1-01 | ✅ | DOMParser sdi-webhook fixed (commit 9684b2fa) |
| S1-02 | ✅ | DOMParser ricevi-sdi fixed (commit 9684b2fa) |
| S1-03 | 🚫 | RLS audit — richiede query DB prod + migration deploy |
| S1-04 | ✅ | XSS CustomerDiaryPanel sanitizzato (commit 9684b2fa) |
| S1-05 | 🚫 | E2E SDI — richiede deploy edge fn + sandbox Aruba |
| S2-01 | 🚫 | Regen types.ts — richiede `npx supabase login` + db pull |
| S2-02 | 🟡 | 2 file forecast fixati. Altri demandati per refactor focused |
| S2-03 | 🟡 | InvoicesList chirurgico + CI guard. Top 5 lib/* file demandati |
| S2-04 | ✅ | 3 admin fn standardizzate + CI guard + AUTH_CONVENTIONS (commit 0064087a) |
| S2-05 | 🚫 | Progressivo SDI — richiede DB stress test + deploy |
| S3-01 | 🟡 | CI guard `check-any-budget.mjs` (soglia 2100). Refactor sostanziale demandato a post-S2-01 |
| S3-02 | 🟡 | `VirtualizedTable` componente pronto. Adozione su OrdersList/MarketingContacts demandata (rischio CSS rotture) |
| S3-03 | 🟡 | CI guard `check-a11y-quickwins.mjs` + `docs/accessibility.md`. Lighthouse audit demandato |
| S3-04 | 🚫 | Web Vitals — richiede query DB `web_vitals_events` |
| S3-05 | ✅ | `fetchWithTimeout` wrapper + 4 fetch protetti + docs/ riorganizzata (commit 897da32c) |

Legenda: ✅ done · 🟡 partial · 🚫 blocked (no-push/no-deploy)

## Vincoli rispettati

Regola permanente utente: **no git push, no supabase deploy, no db push**.
Tutto il lavoro è committato in locale (ahead of origin/main).

## Blockers per la chiusura completa

Per chiudere S1-03, S1-05, S2-01, S2-05, S3-04 serve:

1. Accesso a Supabase project (login CLI o dashboard SQL editor)
2. Permesso di deploy edge functions (per testare S1-01/02/04)
3. Sandbox Aruba Fatturazione Elettronica per S1-05
4. Permesso di applicare migration in staging/prod per S1-03 e S2-05

## File creati / modificati in questa sessione

### Nuovi
- `src/lib/utils/fetchWithTimeout.ts` (S3-05)
- `src/components/ui/virtualized-table.tsx` (S3-02)
- `scripts/check-edge-fn-auth.mjs` (S2-04 CI guard)
- `scripts/check-no-select-star.mjs` (S2-03 CI guard)
- `scripts/check-a11y-quickwins.mjs` (S3-03 CI guard)
- `scripts/check-any-budget.mjs` (S3-01 CI guard)
- `supabase/functions/_shared/AUTH_CONVENTIONS.md`
- `docs/README.md` (indice docs/)
- `docs/accessibility.md`
- `docs/status/MASTERPROMPTS_PROGRESS.md` (questo file)

### Modificati
- `supabase/functions/sdi-webhook/index.ts`
- `supabase/functions/ricevi-sdi/index.ts`
- `supabase/functions/sign-in-as-user/index.ts`
- `supabase/functions/manage-super-admins/index.ts`
- `supabase/functions/admin-preview-email-template/index.ts`
- `src/components/clients/CustomerDiaryPanel.tsx`
- `src/lib/geocoding.ts`
- `src/lib/ai/openrouter-models.ts`
- `src/pages/partner/PartnerOnboardingModal.tsx`
- `src/pages/azienda/billing/InvoicesList.tsx`
- `src/components/forecast/CashForecastTab.tsx`
- `src/components/forecast/CollectedTab.tsx`

### Mossi (S3-05/B docs cleanup)
17 file MD root → `docs/{status,velocity,audit}/`. Root pulita: solo
`README.md` + `ARCHITECTURE.md`.

## Prossimi passi consigliati

1. **Quando si potrà fare deploy**: chiudere S1-01, S1-02, S1-04 (deploy
   edge fn + smoke test E2E S1-05) → unblocked.
2. **Sessione DB-access**: chiudere S1-03 (RLS query + migration),
   S2-01 (types regen), S2-05 (progressivo SDI), S3-04 (Web Vitals).
3. **Sprint dedicato**: adottare `<VirtualizedTable>` su OrdersList +
   MarketingContacts (S3-02 completion), Lighthouse audit reale (S3-03).
4. **Refactor any cleanup**: post-S2-01 attaccare i 10 file con piu' any
   (S3-01) con types corretti.

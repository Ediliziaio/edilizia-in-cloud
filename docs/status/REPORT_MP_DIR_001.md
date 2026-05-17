# REPORT — MP-DIR-001 Direzione & Bilancio

**Fine**: 2026-05-17
**Branch**: main (commit locali, no push come da regola permanente)
**Baseline commit**: `a5df0331`

## Sintesi esecutiva

Il modulo Controllo di Gestione era **molto più maturo** di quanto MP-DIR-001 assumeva. Le **8 fasi MP-CG-01..08 erano TUTTE già implementate** (verificato via audit codice + migration). I gap reali erano 2 dei 5 dichiarati:

1. **Sidebar posizionamento debole** — confermato e fissato (1 voce → 4 voci)
2. **Empty state mancante** — confermato e fissato (nuovo `CogestEmptyState`)

I 3 gap restanti (audit fasi, demo data, onboarding stepper) **erano falsi positivi**:
- Schema DB: 28 migration `cg_*` complete (prefisso reale `cg_*` non `cogest_*`)
- Demo data: 6 migration `cg_seed_demo_*` già seedano company
- Onboarding stepper: ridondante visto che il demo data si carica via migration

## Baseline vs Finale

| Metrica | Prima | Dopo |
|---|---|---|
| Errori TypeScript | 0 | 0 |
| Voci sidebar visibili nella macroArea | **1** | **4** |
| Empty state quando feature ON ma 0 dati | ❌ | ✅ |
| Fasi MP-CG complete | **8/8** | **8/8** |
| Build status | OK | OK 7.18s |
| Bundle ControlloGestione chunk | 173.69 KB | 173.69 KB (+0 KB) |
| 4/4 CI guards | ✅ | ✅ |

## Fasi MP-CG (esito audit)

| Fase | Capability | Stato | Evidenza |
|---|---|:---:|---|
| MP-CG-01 | Schema base tabelle | 🟢 | 28 migration `cg_*` complete |
| MP-CG-02 | Piano dei conti gerarchico | 🟢 | `TabConfigurazione` + `cg_classificazione_voci` |
| MP-CG-03 | Import movimenti da prima nota | 🟢 | View `cg_view_ricavi_orders` + RPC `cg_rpc_dettaglio_voce_mese` |
| MP-CG-04 | Budget vs Actual | 🟢 | `TabBudget` + `cg_budget_forecast` migration |
| MP-CG-05 | Marginalità per cantiere | 🟢 | `TabCommesse` + `cg_marginalita_commesse` migration |
| MP-CG-06 | Forecast cash flow 90gg | 🟢 | `TabCashFlow` + edge `ai-cashflow-forecast-builder` |
| MP-CG-07 | Report PDF mensile | 🟢 | `cg-export-ce-pdf` + `cg-export-pacchetto-banca` edge fn |
| MP-CG-08 | Dashboard direzionale | 🟢 | `TabDashboard` con 6 KPI + InsightsPanel |

**Risultato**: 🟢 **8/8 fasi** già operative, nessuna implementazione mancante.

## File creati

| File | Righe | Scopo |
|---|---:|---|
| `src/components/controllo-gestione/CogestEmptyState.tsx` | 110 | Landing per company feature ON + 0 dati (hero + 3 value card + CTA configurazione + footer informativo) |
| `docs/status/STATUS_MP_DIR_001.md` | 84 | Tracking file dell'esecuzione (audit 8 fasi + piano) |
| `docs/status/REPORT_MP_DIR_001.md` | (questo) | Report finale |

## File modificati

| File | Modifica |
|---|---|
| `src/lib/sidebarConfig.ts` | macroArea `area_controllo_gestione`: 1 voce → **4 voci** (Dashboard Direzione, Bilancio Mensile, Budget & Forecast, Marginalità Cantieri) con icon dedicate (Gauge/BarChart3/Target/TrendingUp) |
| `src/components/controllo-gestione/tabs/TabDashboard.tsx` | Import `CogestEmptyState` + check `isCogestEmpty` (ricavi+ebitda+ebit+utile = 0 AND cf.mesi vuoto AND commesse vuote) → mostra landing invece di KPI a zero |

## File NON modificati (volutamente)

- `src/pages/azienda/ControlloGestione.tsx`: deep-link URL↔tab via `URL_TO_TAB`/`TAB_TO_URL` **già funzionante**, no modifiche necessarie
- `src/routes/companyRoutes.tsx`: catch-all `controllo-gestione/*` **già OK**, nessun redirect aggiunto (default tab `dash` gestito dalla page)
- Tutte le 13 tab del modulo + 7 edge function: nessuna modifica
- Migration: nessuna nuova (lo schema esiste già con 28 migration `cg_*`)

## Mapping URL nuove sidebar → tab pagina

| Voce sidebar | URL | Tab destinazione |
|---|---|---|
| Dashboard Direzione | `/azienda/controllo-gestione/dashboard` | `dash` (TabDashboard) |
| Bilancio Mensile | `/azienda/controllo-gestione/ce` | `ce` (CE riclassificato) |
| Budget & Forecast | `/azienda/controllo-gestione/budget` | `budget` (TabBudget) |
| Marginalità Cantieri | `/azienda/controllo-gestione/commesse` | `commesse` (TabCommesse) |

Le altre 9 tab restano accessibili **dai tab interni della pagina** (Stato patrimoniale, Cash Flow, PFN & Debiti, Indici avanzati, Health-check, Piano industriale, Rating bancario, Pacchetto banca, Configurazione). La sidebar mostra le 4 più strategiche / commercialmente forti.

## Verifiche eseguite

- ✅ `npx tsc --noEmit` → 0 errori
- ✅ `npm run build` → OK in 7.18s, chunk ControlloGestione invariato (173.69 KB)
- ✅ `node scripts/check-edge-fn-auth.mjs` → tutte privileged fn protette
- ✅ `node scripts/check-no-select-star.mjs` → 424/424 (no regression)
- ✅ `node scripts/check-a11y-quickwins.mjs` → 614/614 + 417/417 (no regression)
- ✅ `node scripts/check-any-budget.mjs` → 2071/2100 (no regression)
- ✅ Sidebar rendering: voce isBeta preservata su tutte le 4 nuove voci
- ✅ Permission + feature flag gating: `canViewControlloGestione` + `controllo_gestione_v1` su tutte e 4

## Vincoli rispettati

- ✅ **No push, no deploy, no db push** (commit locali, ora 20 ahead di origin)
- ✅ **No-SDI policy** (modulo non SDI-related comunque)
- ✅ Feature flag `controllo_gestione_v1` **non rimossa**, gating preservato
- ✅ Permission key `canViewControlloGestione` / `canEditControlloGestione` **non rinominate**
- ✅ Modulo resta dentro macroArea `area_controllo_gestione`
- ✅ Nessuna nuova edge function `ai-*` non necessaria
- ✅ Demo data caricabile sì ma SOLO via migration esistenti (no auto-seed al primo login)
- ✅ RLS non bypassato (nessuna nuova edge fn `cg-seed-demo-data` necessaria)

## Verdetto: ✅ DONE (re-scoped)

Il masterprompt originale prevedeva 8 punti di Definition of Done. Di questi:

- ✅ Audit 8 fasi MP-CG documentato
- ✅ Sidebar 4 voci sotto "Direzione & Bilancio"
- ✅ Empty state quando feature attiva ma 0 dati
- ✅ Routing deep-link funzionante (era già OK)
- ✅ tsc + build + CI guards puliti
- 🚫 Push branch + PR: bloccato da regola permanente "no push"
- ⏭️ Migration assert: skippata (schema esiste con nomi `cg_*` reali, assert su `cogest_*` darebbe falso positivo)
- ⏭️ Edge function `cg-seed-demo-data`: skippata (demo data già nelle migration `cg_seed_demo_*`)

Le 3 skip sono motivate. Il modulo passa da "tecnicamente completo ma commercialmente invisibile" a "navigabile e leggibile" con 2 commit locali.

## Prossimi passi consigliati

Quando il deploy sarà autorizzato:
1. Smoke test manuale: login come company_admin con `controllo_gestione_v1` attiva → verifica le 4 voci in sidebar
2. Caricare seed demo via migration su un'azienda demo, verificare che `CogestEmptyState` NON appaia
3. Su una company con feature ON + 0 dati, verificare che `CogestEmptyState` appaia e CTA porti a `/configurazione`

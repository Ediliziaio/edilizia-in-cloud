# STATUS — MP-DIR-001 (Direzione & Bilancio)

**Start**: 2026-05-17
**Baseline HEAD**: `a5df0331`
**Branch**: main (commit locali, no push come da regola)

## Punch-list

- [x] 0.1 Baseline raccolta
- [x] 1.1 Audit 8 fasi MP-CG-01..08
- [x] 1.2 Mappatura tab presenti vs attesi
- [N/A] 1.3 Migration assert (DB già allineato, schema usa prefisso `cg_*` non `cogest_*`)
- [pending] 2.1 Pagina overview/landing per stato empty
- [N/A] 2.2 Demo data seed — **già presente** in 6 migration `cg_seed_demo_*`
- [N/A] 2.3 Onboarding stepper — non necessario (demo data caricato via migration)
- [pending] 3.1 Sidebar: 1 voce → 4 voci
- [pending] 3.2 Routing redirect default (già OK lato page con URL_TO_TAB)
- [pending] 4.1 tsc + build + lint
- [pending] 4.2 Smoke test funzionale
- [pending] 4.3 REPORT_MP_DIR_001.md

## Baseline raccolta

### File esistenti modulo
- `src/pages/azienda/ControlloGestione.tsx` (221 righe, deep-link URL↔tab funzionante via `URL_TO_TAB`/`TAB_TO_URL`)
- `src/components/controllo-gestione/` (13 tab + UI components + FilterBar + AddonNotActivePlaceholder + skeletons)
- `src/hooks/controlloGestione/` (12+ hook React Query)

### Edge functions cg-* esistenti
- `ai-cashflow-forecast-builder`
- `cg-alerts-settimanali`
- `cg-bootstrap-classificazione`
- `cg-bootstrap-scenari`
- `cg-export-ce-pdf`
- `cg-export-pacchetto-banca`
- `cg-rating-snapshot-monthly`

### Migration cg_* totali: **28**
Tabelle DB usate (verificato via grep):
- `cg_aliquote_imposte`, `cg_budget`, `cg_cash_flow_manuali`, `cg_classificazione_voci`
- `cg_exports_log`, `cg_loans`, `cg_note_voci`, `cg_rating_snapshot`
- `cg_riconciliazione_commercialista`, `piano_industriale_assumptions`

**Schema reale**: prefisso `cg_*`, non `cogest_*` come assunto dal masterprompt.
La migration di assert proposta è quindi N/A: lo schema esiste già con nomi diversi.

## Audit 8 fasi MP-CG (vs requisito MP-DIR-001)

| Fase | Capability attesa | Stato reale | Evidenza |
|---|---|:---:|---|
| MP-CG-01 | Schema base tabelle | ✅ | 28 migration `cg_*` + tabelle aliquote/budget/classificazione/loans/rating/note |
| MP-CG-02 | Piano dei conti gerarchico | ✅ | `TabConfigurazione` + tabella `cg_classificazione_voci` |
| MP-CG-03 | Import movimenti da prima nota | ✅ | View `cg_view_ricavi_orders` + RPC dettaglio voce mese |
| MP-CG-04 | Budget vs Actual | ✅ | `TabBudget` + tabella `cg_budget` + migration forecast |
| MP-CG-05 | Marginalità per cantiere | ✅ | `TabCommesse` + migration `cg_marginalita_commesse` |
| MP-CG-06 | Forecast cash flow 90gg | ✅ | `TabCashFlow` + `ai-cashflow-forecast-builder` edge fn |
| MP-CG-07 | Report PDF mensile direzione | ✅ | Edge fn `cg-export-ce-pdf` + `cg-export-pacchetto-banca` |
| MP-CG-08 | Dashboard direzionale | ✅ | `TabDashboard` con InsightsPanel + KPI |

**Risultato audit**: **8/8 fasi presenti e funzionanti**. Il modulo è tecnicamente completo.

## Gap reali (cosa serve davvero)

Solo 2 dei 5 gap del masterprompt sono effettivi:

1. ✅ **Sidebar posizionamento** — confermato: 1 sola voce con titolo che duplica la macroArea
2. ✅ **Overview/landing empty state** — confermato: `AddonNotActivePlaceholder` esiste ma è
   solo per quando la feature flag è OFF. Manca uno stato "feature attiva ma 0 dati".

Gap NON applicabili:
- 8 fasi audit: tutte fatte
- Demo data: già in migration `cg_seed_demo_*` ×6
- Routing: deep-link URL↔tab già funzionante

## Piano completamento (eseguibile)

1. **Fase 3.1** — `sidebarConfig.ts`: macroArea `area_controllo_gestione` da 1 voce → 4 voci:
   - Dashboard Direzione → `/controllo-gestione/dashboard`
   - Bilancio Mensile → `/controllo-gestione/ce` (CE riclassificato = bilancio gestionale)
   - Budget & Forecast → `/controllo-gestione/budget`
   - Marginalità Cantieri → `/controllo-gestione/commesse`

2. **Fase 2.1** — Empty state per company con feature attiva ma 0 dati:
   Componente `CogestEmptyState` mostrato dentro `TabDashboard` quando count movimenti = 0.

3. Skip 2.2/2.3 (già coperti da migration seed).

4. **Fase 4** — build + lint + smoke + report.

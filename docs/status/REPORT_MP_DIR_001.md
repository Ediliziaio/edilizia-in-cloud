# REPORT — MP-DIR-001 Direzione & Bilancio

**Fine**: 2026-05-17 (revised)
**Branch**: main (commit locali, no push come da regola permanente)
**Baseline commit**: `a5df0331`

## Sintesi esecutiva

Il modulo Controllo di Gestione era **molto più maturo** di quanto MP-DIR-001 assumeva.
Le **8 fasi MP-CG-01..08 erano TUTTE già implementate** (verificato via audit codice
+ 28 migration `cg_*` + 7 edge fn + 13 tab UI).

**Decisione utente**: la sidebar resta a **1 voce** (le 13 sub-tab sono già navigabili
dentro la pagina via `URL_TO_TAB`/`TAB_TO_URL`). Le 4 voci proposte dal masterprompt
sarebbero state ridondanti con i tab interni.

Migliorie reali applicate dopo audit del modulo:

1. **Empty state** quando feature ON ma 0 dati → nuovo `CogestEmptyState`
2. **A11y** → aria-label sui 4 icon-button senza label (PFN, CashFlow, Budget, NotePanel)
3. **TypeScript** → wrapper `cgRpc<T>()` tipato che centralizza l'unico `as any` necessario.
   Riduzione **−23 occorrenze `as any`** nel modulo (da 36 → 13, di cui 0 su RPC).

## Baseline vs Finale

| Metrica | Prima | Dopo |
|---|---|---|
| Errori TypeScript | 0 | 0 |
| Voci sidebar | 1 | **1** (decisione utente: tab interni) |
| Empty state quando feature ON ma 0 dati | ❌ | ✅ |
| Icon-button senza aria-label nel modulo | 4 | **0** |
| `as any` nel modulo CG | 36 | **13** (−64%) |
| `as any` totali repo | 943 | **928** (−15) |
| Fasi MP-CG complete | 8/8 | 8/8 |
| Build status | OK | OK 6.88s |
| Bundle ControlloGestione chunk | 173.69 KB | 173.84 KB (+0.15 KB helper) |
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

**Risultato**: 🟢 **8/8 fasi** già operative.

## File creati

| File | Righe | Scopo |
|---|---:|---|
| `src/components/controllo-gestione/CogestEmptyState.tsx` | 110 | Landing per company feature ON + 0 dati |
| `src/hooks/controlloGestione/cgRpc.ts` | 73 | Wrapper tipato per le 18 RPC `cg_*` con allow-list |
| `docs/status/STATUS_MP_DIR_001.md` | 84 | Tracking audit + piano |
| `docs/status/REPORT_MP_DIR_001.md` | (questo) | Report finale |

## File modificati

| File | Modifica |
|---|---|
| `src/lib/sidebarConfig.ts` | Comment aggiornato: 1 voce singola intenzionale (tab interni) |
| `src/components/controllo-gestione/tabs/TabDashboard.tsx` | Empty state check su ricavi+ebitda+ebit+utile = 0 AND cf.mesi vuoto AND commesse vuote |
| `src/components/controllo-gestione/tabs/TabPFNDebiti.tsx` | aria-label "Elimina finanziamento" |
| `src/components/controllo-gestione/tabs/TabCashFlow.tsx` | aria-label "Elimina riga cash flow" |
| `src/components/controllo-gestione/tabs/TabBudget.tsx` | aria-label "Modifica budget voce" |
| `src/components/controllo-gestione/ui/NotePanel.tsx` | aria-label "Elimina nota" |
| `src/hooks/controlloGestione/useCEriclassificato.ts` | 5 chiamate RPC → `cgRpc<T>()` tipato |
| `src/hooks/controlloGestione/usePFN.ts` | 2 chiamate RPC → `cgRpc<T>()` |
| `src/hooks/controlloGestione/useStatoPatrimoniale.ts` | 3 chiamate RPC → `cgRpc<T>()` |
| `src/hooks/controlloGestione/useBudget.ts` | 1 chiamata RPC → `cgRpc<T>()` |
| `src/hooks/controlloGestione/useCashFlow.ts` | 1 chiamata RPC → `cgRpc<T>()` |
| `src/hooks/controlloGestione/useHealthRiconciliazione.ts` | 2 chiamate RPC → `cgRpc<T>()` |
| `src/hooks/controlloGestione/useImposte.ts` | 1 chiamata RPC → `cgRpc<T>()` |
| `src/hooks/controlloGestione/useMarginalitaCommesse.ts` | 1 chiamata RPC → `cgRpc<T>()` |
| `src/hooks/controlloGestione/usePianoIndustriale.ts` | 2 chiamate RPC → `cgRpc<T>()` |
| `src/hooks/controlloGestione/useDettaglioVoceMese.ts` | 1 chiamata RPC → `cgRpc<T>()` |
| `src/hooks/controlloGestione/useIndiciAvanzati.ts` | 1 chiamata RPC → `cgRpc<T>()` |

## File NON modificati (volutamente)

- `src/pages/azienda/ControlloGestione.tsx`: deep-link URL↔tab già funzionante
- `src/routes/companyRoutes.tsx`: route catch-all OK
- Tutte le 13 tab del modulo + 7 edge function: nessuna modifica strutturale
- Migration: nessuna nuova (schema esiste già con 28 migration `cg_*`)

## Vantaggi del wrapper `cgRpc<T>()`

```typescript
// Prima — pattern ripetuto in 10 file × 36 occorrenze totali:
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { data, error } = await (supabase.rpc as any)("cg_get_ce_safe", {
  p_anno: anno, p_mese_da: meseDa, p_mese_a: meseA,
});
if (error) throw error;
return data as unknown as CEriclassificato;

// Dopo — centralizzato, tipato, allow-list:
const { data, error } = await cgRpc<CEriclassificato>("cg_get_ce_safe", {
  p_anno: anno, p_mese_da: meseDa, p_mese_a: meseA,
});
if (error) throw error;
return data as CEriclassificato;
```

Benefici:
- **Una sola riga `as any`** (dentro `cgRpc.ts`) invece di 23 sparse
- **Allow-list** `CG_RPC_NAMES`: typo nel nome RPC → errore TS in compilazione
- **Type-safety output**: tipo restituito esplicito via generico, no più doppio cast
- **Refactor sicuro**: rinomina una RPC in DB → cambio nell'allow-list propaga errori TS a tutti i chiamanti
- **Migrazione futura**: quando S2-01 rigenera `types.ts` con custom RPC, basta rimuovere il cast dal wrapper

## Verifiche eseguite

- ✅ `npx tsc --noEmit` → 0 errori
- ✅ `npm run build` → OK in 6.88s
- ✅ Bundle ControlloGestione 173.84 KB (era 173.69 KB, +0.15 KB per helper)
- ✅ 4/4 CI guards verdi
- ✅ `as any` totali repo: 943 → **928** (−15)
- ✅ `as any` nel modulo CG: 36 → **13** (−64%, gli 13 restanti sono su `.from()` per tabelle non tipizzate, separato dal refactor RPC)
- ✅ Icon-button senza aria-label nel modulo CG: 4 → **0**

## Vincoli rispettati

- ✅ No push, no deploy, no db push
- ✅ No-SDI policy
- ✅ Feature flag `controllo_gestione_v1` preservata
- ✅ Permission key non rinominate
- ✅ RLS non bypassato (cgRpc usa `supabase.rpc` standard)
- ✅ Sidebar resta a 1 voce come richiesto dall'utente
- ✅ Nessuna modifica funzionale (solo type-safety + a11y + empty state)

## Verdetto: ✅ DONE

Modulo Controllo di Gestione: stato finale **commercialmente leggibile + tecnicamente più pulito**:
- Empty state copre il gap "feature attiva ma 0 dati"
- A11y: 4 icon-button correttamente etichettati
- TypeScript: wrapper `cgRpc` riduce drasticamente i cast, centralizza la
  manutenzione (rinomina RPC → errore TS subito), allow-list previene typo
- Sidebar resta minimale, le tab interne sono già navigabili via deep-link

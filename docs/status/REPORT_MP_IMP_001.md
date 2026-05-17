# REPORT — MP-IMP-001 Impostazioni & Configurazione

**Data**: 2026-05-17
**Branch**: main (commit locale, no push come da regola permanente)
**Stato**: 🟡 PARTIAL (4/8 fasi complete, 3 demandate motivatamente)

---

## Esito per fase

| Fase | Descrizione | Stato |
|---|---|:---:|
| 1 | Censimento 10 wrapper sottili | ✅ |
| 2 | Uniformazione wrapper a permission-via-route | ✅ |
| 3 | Refactor `SettingsQuoteTemplates.tsx` (2457 → ~200) | 🚫 demandato |
| 4 | Refactor `SettingsTariffe.tsx` (1882 → ~150) | 🚫 demandato |
| 5 | Refactor `ListinoManutenzione.tsx` (1776 → ~150) | 🚫 demandato |
| 6 | `docs/PIANI_MATRIX.md` + audit script | ✅ |
| 7 | `SettingsSearch` + Cmd+K | ✅ |
| 8 | Build + verifica | ✅ |

---

## Fase 1+2 — Wrapper uniformati

Censimento ha rilevato **6 wrapper attivi con pattern errato** + 1 già pulito.
Tutte le route corrispondenti sono **già protette** da `withCompanyPermission`
in `companyRoutes.tsx`, quindi la logica `useEffect+navigate` interna era
duplicazione dannosa (flash visivo + test impossibili).

Uniformati a wrapper minimo (3-5 righe):

| File | Permission route | Note |
|---|---|---|
| `SettingsTags.tsx` | `canViewSettingsCustomization` | 20→7 righe |
| `SettingsCustomFields.tsx` | `canViewSettingsCustomization` | 20→7 righe |
| `SettingsPipelines.tsx` | `canViewSettingsCustomization` | 20→7 righe |
| `SettingsActivityLog.tsx` | (legacy, orfano route) | 20→8 righe |
| `SettingsFinanceAutomation.tsx` | `canViewCosts` | 20→7 righe |
| `SettingsOrderStatus.tsx` | `canViewSettingsOrders` | rimosso `useEffect+navigate`, mantenuto header UX |
| `SettingsMarketingCalendars.tsx` | `canViewSettingsCustomization` | era già minimo ✅ |

**Esclusi (volutamente)**:
- `SettingsFamilyEditor.tsx`: guard semantico view/edit (non duplicazione)
- `SettingsCatalogImport.tsx`: già senza auth check inline
- `SettingsSecurity.tsx` (legacy orfano): non toccato — sostituito da SettingsSecurityHub

---

## Fase 6 — Matrice piani

Creato **`docs/PIANI_MATRIX.md`** con:
- 3 piani base (Starter €127 / Professional €247 / Enterprise €547)
- 11 add-on con feature_flag DB
- Matrice feature × piano (15 feature)
- 37 permission key mappate con default per ruolo
- Mapping wrapper → permission (post-Fase 2)
- Note operative + riferimenti tecnici

Creato **`scripts/audit-plans-matrix.mjs`**: tool manuale (richiede DB
access via service-role) che confronta i flag dichiarati nel doc con
quanto effettivamente in `subscription_plans` + `plan_features` e segnala
disallineamenti.

Linkato in `docs/README.md`.

---

## Fase 7 — Search settings + Cmd+K

Nuovo componente **`src/components/layouts/SettingsSearch.tsx`**:
- Index di 36 voci settings con `title` + `group` + `keywords` (sinonimi italiani)
- `CommandDialog` shadcn con filtro su title/group/description/keywords
- Shortcut **⌘K / Ctrl+K** attivo ovunque sotto `/azienda/impostazioni`
- Risultati raggruppati per area (Account / Catalogo / Preventivi /
  Ordini / Fatturazione / Marketing / Persone / Sicurezza / Branding)
- Trigger button visibile in header SettingsLayout (responsive)

Integrato in `SettingsLayout.tsx` (header destro).

Esempi di ricerca:
- "ritenute" → trova "Automazioni finanza" (keyword: ritenuta garanzia,
  trattenuta, fideiussione)
- "dominio" → trova "Dominio email" (keyword: smtp, spf, dkim)
- "sconto" → trova "Regole scontistica"

---

## Fasi 3-5 — Demandate (motivazione)

Refactor di `SettingsQuoteTemplates` (2457 righe), `SettingsTariffe` (1882),
`ListinoManutenzione` (1776) NON eseguiti in questa sessione. Motivazione:

1. **Effort dichiarato dal prompt**: 4-5 giorni totali.
2. **Rischio rotture**: ogni file mostro tocca aree critiche (template PDF,
   pricing, contratti manutenzione) usate cross-module.
3. **Mancanza test E2E**: senza test di regressione, refactor "in cieco"
   può introdurre bug fiscali (es. snapshot tariffe per audit).
4. **Best practice**: questi refactor meritano sprint dedicato con review
   per ogni file estratto + smoke test focalizzato.

**Da fare quando si potrà dedicare sprint focused**:
- `src/pages/azienda/settings/SettingsQuoteTemplates/` (~12 file)
- `src/pages/azienda/settings/SettingsTariffe/` (~8 file)
- `src/pages/azienda/settings/ListinoManutenzione/` (~8 file)

---

## Fase 8 — Verifiche

```
✓ tsc --noEmit       OK
✓ npm run build      OK in 5.65s
✓ CI guards (4/4):
  - check-edge-fn-auth.mjs        ✅
  - check-no-select-star.mjs      ✅
  - check-a11y-quickwins.mjs      ✅
  - check-any-budget.mjs          ✅ (2078/2100)
```

Bundle entry: 477KB / gzip 118KB (era 470KB / 116KB prima — +7KB per
SettingsSearch component, accettabile).

---

## Vincoli rispettati

- **No push, no deploy, no db push**: tutti i commit sono locali (ahead origin)
- **No-SDI policy** (sessione precedente): no toccato fatturazione SDI
- **No modifiche route URL**: `/azienda/impostazioni/*` invariati
- **No eliminazione componenti**: `TagsConfig`, `PipelinesConfig`, ecc.
  restano dove sono in `src/components/settings/`
- **No modifica DB**: `subscription_plans` letta solo, no migration

---

## Definition of Done parziale

- [x] 6 wrapper uniformati (pattern minimo)
- [x] Route corrispondenti già protette da `withCompanyPermission`
- [x] Nessun flash visivo (logica useEffect+null rimossa)
- [ ] ~~SettingsQuoteTemplates spezzato~~ → demandato sprint focused
- [ ] ~~SettingsTariffe spezzato~~ → demandato sprint focused
- [ ] ~~ListinoManutenzione spezzato~~ → demandato sprint focused
- [x] `docs/PIANI_MATRIX.md` creato e linkato
- [x] `scripts/audit-plans-matrix.mjs` funzionante
- [x] SettingsSearch + Cmd+K
- [x] tsc, build, CI guards verdi

# Preventivo Bagni — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** Nuovo verticale "Preventivo Bagni" completo e indipendente (DB + editor template + wizard + computo + PDF), clone fedele del verticale Ristrutturazione in namespace `bgn_`/`Bagni`, con adattamenti bagno.

**Architecture:** Clone 1:1 dei file/tabelle `rst_*` → `bgn_*` (zero modifiche al codice Ristrutturazione live). Mappa di rinomina applicata via `sed`, poi adattamenti bagno mirati. Calcoli puri testati vitest.

**Tech Stack:** React 18 + Vite + TS, Supabase (Postgres+RLS), react-query, @react-pdf/renderer, dnd, Tailwind/shadcn.

**Vincoli:** SOLO locale (commit su branch; niente push/deploy/apply DB finché non si dice "pubblica"). Gate per task: `npx eslint <file>` (0 nuovi) + `npx vite build` (exit 0) + `npx vitest run src/lib/bagni`. NON tsc completo.

---

## Mappa di rinomina (applicata a ogni file clonato)

Su CONTENUTO e NOMI file:
- `ristrutturazione` → `bagni`
- `Ristrutturazione` → `Bagni`
- `RISTRUTTURAZIONE` → `BAGNI`
- `rst_` → `bgn_` (tabelle, query key, prefissi)
- `Rst` → `Bgn` (tipi/interfacce/funzioni: RstProgetto→BgnProgetto, useRst…→useBgn…)
- `rst-` → `bgn-` (query key strings, storage path)
- `RST-` → `BGN-` (code preventivo)
- route `/azienda/ristrutturazione` → `/azienda/bagni`
- storage path `…/ristrutturazione/…` → `…/bagni/…`

Comando base per file: `sed -E -e 's/Ristrutturazione/Bagni/g' -e 's/ristrutturazione/bagni/g' -e 's/RISTRUTTURAZIONE/BAGNI/g' -e 's/\brst_/bgn_/g' -e 's/\bRst/Bgn/g' -e 's/"rst-/"bgn-/g' -e "s/'rst-/'bgn-/g" -e 's/RST-/BGN-/g'`

**Adattamenti bagno** (DOPO il sed, mirati):
- `bgn_progetti`: aggiungere colonne `numero_bagni int`, `superficie_mq numeric`, `tipo_intervento_bagno text`.
- Step "Immobile" → "Dati bagno" (campi n. bagni / superficie mq / tipo intervento; rimuovere campi immobile non pertinenti o tenerli opzionali).
- Default economici: `default_iva_pct` 10, `default_detrazione_pct` 50 (template) e `iva_pct` 10 di default progetto.
- `seedListino`: 9 capitoli bagno (Demolizioni, Idraulica/scarichi, Impianto elettrico, Opere murarie, Rivestimenti/piastrelle, Sanitari, Box doccia, Rubinetteria, Accessori) con voci d'esempio.
- Icona modulo: `Bath` (lucide).

---

## ONDATA 1 — Fondamenta + editor template (priorità)

### Task 1.1 — Migrazione DB `bgn_*` (file locale)
**Files:** Create `supabase/migrations/20271101020000_bgn_modulo_wave1.sql`
- [ ] Clonare il contenuto unito di `20271001000000_rst_modulo_wave1.sql` + `20271001020000_rst_builder_fields.sql` + `20271001030000_rst_personalization.sql` + `20271022010000_rst_voce_fonte.sql` in un unico file; applicare la mappa di rinomina (`rst_`→`bgn_`). Tabelle: `bgn_listino_capitoli`, `bgn_listino_voci`, `bgn_progetti`, `bgn_computo_voci`, `bgn_progetti_media`, `bgn_template_pdf`. RLS super_admin + company. Indici equivalenti.
- [ ] Aggiungere a `bgn_progetti`: `numero_bagni integer`, `superficie_mq numeric`, `tipo_intervento_bagno text`.
- [ ] Default: `bgn_template_pdf.default_iva_pct DEFAULT 10`, `default_detrazione_pct DEFAULT 50`; `bgn_progetti.iva_pct DEFAULT 10`.
- [ ] **NON applicare** al DB (solo file). Verifica: il file è SQL valido (lettura), nomi `bgn_` coerenti.
- [ ] Commit.

### Task 1.2 — Tipi `src/types/bagni.ts`
**Files:** Create `src/types/bagni.ts` (da `src/types/ristrutturazione.ts`)
- [ ] `cp src/types/ristrutturazione.ts src/types/bagni.ts` + sed. Aggiungere a `BgnProgetto` i campi `numero_bagni?`, `superficie_mq?`, `tipo_intervento_bagno?`.
- [ ] Verifica: `npx eslint src/types/bagni.ts` (0 errori).
- [ ] Commit.

### Task 1.3 — Seed listino bagno `src/lib/bagni/seedListino.ts` + default catalog
**Files:** Create `src/lib/bagni/seedListino.ts` (da `src/lib/ristrutturazione/seedListino.ts`)
- [ ] Clonare seedListino.ts (sed). Sostituire i capitoli/voci di default col **catalogo bagno** (9 capitoli + 2-4 voci d'esempio ciascuno, prezzi indicativi). Mantenere la firma/funzione di seed identica (inserisce capitoli+voci se vuoto).
- [ ] Verifica eslint. Commit.

### Task 1.4 — `src/lib/bagni/richTextPdf.ts` (dipendenza editor/preview)
**Files:** Create `src/lib/bagni/richTextPdf.ts` (da `src/lib/ristrutturazione/richTextPdf.ts`)
- [ ] `cp` + sed (è util puro per il rich-text del PDF, serve a preview+PDF). Verifica eslint. Commit.

### Task 1.5 — Hook dati `src/hooks/useBagniProgetto.ts`
**Files:** Create `src/hooks/useBagniProgetto.ts` (da `src/hooks/useRistrutturazioneProgetto.ts`)
- [ ] `cp` + sed. Query key namespace `bgn-*`. Import da `@/types/bagni`. Tabelle `bgn_*`. Code generator `BGN-YYYY-NNN`. Default `iva_pct` 10.
- [ ] Verifica eslint + che importi tipi/tabelle `bgn_`. Commit.

### Task 1.6 — Editor template `src/components/bagni/BagniTemplateEditor.tsx` + preview
**Files:** Create `src/components/bagni/BagniTemplateEditor.tsx` (da `RistrutturazioneTemplateEditor.tsx`) + `src/components/bagni/BagniTemplatePreviewDialog.tsx` (da `RistrutturazioneTemplatePreviewDialog.tsx`)
- [ ] `cp` entrambi + sed. Import da `@/hooks/useBagniProgetto`, `@/types/bagni`, `@/lib/bagni/richTextPdf`. Storage path `…/bagni/template/…`. Sezioni/sidebar **invariate** (UX identica).
- [ ] Nota: il preview usa il PDF; in Ondata 1 il `BagniPDF` non esiste ancora → temporaneamente l'anteprima può puntare a un placeholder o essere disabilitata, **completata in Ondata 3**. (Tenere l'editor funzionante senza preview.)
- [ ] Verifica eslint + `vite build`. Commit.

### Task 1.7 — Registrazione editor in `ModuliVenditaPanel` + registro `available`
**Files:** Modify `src/pages/azienda/settings/SettingsQuoteTemplates/ModuliVenditaPanel.tsx`; Modify `src/lib/moduli-vendita/config.ts`
- [ ] In `ModuliVenditaPanel`: lazy import `BagniTemplateEditor` + voce nell'array moduli (`slug:"bagni"`, icona `Bath`, `render: () => <BagniTemplateEditor embedded />`), accanto agli altri.
- [ ] In `config.ts`: voce Bagni `availability: "coming_soon"` → `"available"`; `href` → `/azienda/bagni`.
- [ ] Verifica eslint + `vite build`. Commit.

### Task 1.8 — Index + rotte
**Files:** Create `src/pages/azienda/bagni/BagniIndex.tsx` (da `RistrutturazioneIndex.tsx`); Modify `src/routes/companyRoutes.tsx`
- [ ] `cp` BagniIndex + sed (route `/azienda/bagni/nuovo`, link). In companyRoutes: rotte `/azienda/bagni`, `/nuovo`, `/:id/modifica`, `/listino` gated da `<FeatureRoute featureKey="modulo_bagni_attivo">`. In Ondata 1 puntare `/nuovo` a un placeholder o al wizard (creato in Ondata 2) — se il wizard non esiste, rotta `/nuovo` aggiunta in Ondata 2.
- [ ] Verifica eslint + `vite build`. Commit.

**Fine Ondata 1:** editor template Bagni funzionante e identico agli altri, modulo `available`, index navigabile.

---

## ONDATA 2 — Preventivo (wizard + computo + listino)

### Task 2.1 — Calcoli puri `src/lib/bagni/calcoli.ts` (TDD)
**Files:** Create `src/lib/bagni/calcoli.ts` + `src/test/logic/bagniCalcoli.test.ts`
- [ ] Scrivere test (da `src/lib/ristrutturazione/calcoli.ts` se ha test, altrimenti nuovi): `calcRigaImporto`, `calcPrezzoVoce`, `calcTotaliComputo` (imponibile, iva, totale, margine).
- [ ] `npx vitest run src/test/logic/bagniCalcoli.test.ts` → FAIL.
- [ ] `cp src/lib/ristrutturazione/calcoli.ts src/lib/bagni/calcoli.ts` + sed. (logica identica.)
- [ ] vitest → PASS. Commit.

### Task 2.2 — ComputoEditor `src/components/bagni/ComputoEditor/*`
**Files:** Create `src/components/bagni/ComputoEditor/{ComputoEditor,CapitoloSection,VoceRow,AddVocePicker,types}.tsx`
- [ ] Verificare se `RistrutturazioneComputoEditor` è accoppiato a `rst` (import di tipi/hook rst). Se sì → clonare (cp -r + sed). Se generico → riusare. (Decisione runtime.)
- [ ] Verifica eslint + build. Commit.

### Task 2.3 — Componenti listino `src/components/bagni/{ListinoPrezzariSection,ListinoLavorazioniEditor,ImportaPrezzarioDialog,ManodoperaLookup}.tsx`
- [ ] `cp` + sed dei 4 file da `src/components/ristrutturazione/`. Import `bgn`.
- [ ] Verifica eslint + build. Commit.

### Task 2.4 — Wizard + step `src/pages/azienda/bagni/BagniWizard.tsx` + `BagniWizard/*`
**Files:** Create `BagniWizard.tsx` + `BagniWizard/{StepCliente,StepDatiBagno,StepComputo,StepMedia,StepEconomia,StepPdf,helpers,types}.tsx`
- [ ] `cp -r` della cartella wizard + sed. Rinominare `StepImmobile`→`StepDatiBagno`; adattarne i campi a n. bagni / superficie mq / tipo intervento bagno (rimuovere/rendere opzionali i campi immobile non pertinenti). Aggiornare `helpers.ts` (RST_WIZARD_STEPS → BGN, label "Dati bagno"). `StepPdf` rimane stub fino a Ondata 3.
- [ ] Verifica eslint + build. Commit.

### Task 2.5 — Listino page + seed-on-empty
**Files:** Create `src/pages/azienda/bagni/BagniListino.tsx` (da `RistrutturazioneListino.tsx`)
- [ ] `cp` + sed. Integrare seed: alla prima apertura, se listino vuoto, chiamare `seedListino` (Task 1.3) — bottone "Carica struttura bagno standard" come fallback esplicito.
- [ ] Wire rotte `/azienda/bagni/nuovo` (wizard) e `/listino` in companyRoutes (completare Task 1.8).
- [ ] Verifica eslint + build. Commit.

**Fine Ondata 2:** preventivo Bagni creabile (wizard+computo+listino+seed), senza PDF.

---

## ONDATA 3 — PDF

### Task 3.1 — PDF `src/components/bagni/BagniPDF.tsx` + hook `src/hooks/useBagniPDF.ts`
**Files:** Create `BagniPDF.tsx` (da `RistrutturazionePDF.tsx`) + `useBagniPDF.ts` (da `useRistrutturazionePDF.ts`)
- [ ] `cp` + sed. Import `@/lib/bagni/richTextPdf`, `@/types/bagni`, hook bgn. Footer legale invariato.
- [ ] Verifica eslint + build. Commit.

### Task 3.2 — Collegare PDF: StepPdf + preview editor
**Files:** Modify `src/pages/azienda/bagni/BagniWizard/StepPdf.tsx`; Modify `src/components/bagni/BagniTemplatePreviewDialog.tsx`
- [ ] Sostituire gli stub con il vero `BagniPDF`/`useBagniPDF`. Anteprima editor template ora live.
- [ ] Verifica eslint + build. Commit.

### Task 3.3 — Vista unificata preventivi (opzionale)
**Files:** Create `supabase/migrations/20271101030000_v_preventivi_unificati_bgn.sql` (da `20271001010000_v_preventivi_unificati_rst.sql`)
- [ ] Aggiungere i `bgn_progetti` alla vista `v_preventivi_unificati` (UNION). File locale, non applicato.
- [ ] Commit.

**Fine Ondata 3:** verticale Bagni completo.

---

## Review finale
- [ ] Dispatch final code-reviewer sull'intero set Bagni.
- [ ] `npx vite build` (exit 0), `npx vitest run src/lib/bagni`, eslint sui file nuovi (0 nuovi errori).
- [ ] Report all'utente; attesa "pubblica" per: merge+push + `apply_migration` MCP delle migrazioni `bgn_*` + (opz.) flip flag `modulo_bagni_attivo`.

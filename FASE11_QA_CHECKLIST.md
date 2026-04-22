# FASE 11 — QA Checklist E2E Preventivatore Serramentisti

> Playwright non è configurato nel repo: questa checklist è pensata per
> esecuzione manuale su ambiente dev, fino all'eventuale seed Playwright.
>
> **Branch:** `feat/preventivatore-serramentisti`
> **Ultimo commit al momento del check:** `a04f648f` (sync pending edits —
> superadmin hardening + serramenti + credits). Baseline stabilization
> 2026-04-22 vedi sezione 11.5.

---

## Prerequisiti

- [ ] Le migration 20260917000001 → 20260917000010 sono applicate sul DB dev.
- [ ] L'utente di test è loggato come azienda serramentista
      (`companies.vertical = 'serramentista'`,
       `companies.onboarding_vertical_completed = true`).
- [ ] Il tenant ha almeno un preventivo per riutilizzare contatti/indirizzi.
- [ ] `OPENAI_API_KEY` presente in Edge Functions secrets (per scenario B).

---

## Scenario A — Onboarding completo + preventivo serramentista (step 21–29)

Copre: FASE 1 onboarding, FASE 3 seed, FASE 4 editor famiglie, FASE 5
motore calcolo, FASE 6 tariffe UM, FASE 9 wizard, FASE 7.1 unit_price.

- [ ] Nuova azienda in `/admin/aziende` → seleziona vertical "serramentista".
- [ ] Login azienda → `/azienda/onboarding/vertical` → conferma serramentista.
- [ ] Dialog installazione template → "Installa". Toast con counts.
- [ ] `/azienda/impostazioni/listino?tab=famiglie` → visualizza 30+ famiglie
      (prezzi a 0, categoria popolata).
- [ ] Apri "Finestra PVC Standard" nell'editor famiglie (FASE 4).
- [ ] Step griglia L×H: inserisci 4×4 = 16 celle con prezzi fittizi.
- [ ] Step assi: aggiungi maggiorazione "2 ante" +15%, "triplo vetro"
      +€40/mq, ferramenta "RC2" +€80/pz. Salva.
- [ ] Torna all'editor, preview prezzo 1200×1400 con 2 ante + triplo + RC2
      → verifica che il totale corrisponde al calcolo a mano
      (`familyPricing.test.ts` copre la logica pura).
- [ ] `/azienda/impostazioni/tariffe` → installa seed tariffe vertical.
      Popola prezzi reali per: posa, trasporto, tiro_piano, smaltimento.
- [ ] Crea preventivo: cliente fittizio → wizard `/marketing/preventivi/nuovo`.
- [ ] Bottone "Serramento" (visibile se ci sono famiglie) → Dialog wizard 4 step:
      - Step 1: seleziona Finestra PVC Standard.
      - Step 2: 1200×1400 mm, qty 3.
      - Step 3: 2 ante + triplo + RC2.
      - Step 4: verifica unit_price, totale, warnings.
      - "Aggiungi al preventivo".
- [ ] Verifica righe create: 1 riga prodotto + 1 riga posa auto-linkata
      (se `posa_tariffa_default_id` impostato sulla famiglia).
- [ ] Ripeti 2 volte con configurazioni diverse. Totale preview aggiornato.
- [ ] Salva preventivo. Riapri in modifica → verifica persistence.

**Pass criteria:** totale finale = calcolo manuale (tolleranza €0,01),
nessun errore console, nessun warning di TS in dev tools.

---

## Scenario B — AI verticalizzata (step 30–35)

Copre: FASE 7.1 enrichment unit_price, FASE 7.2 no-limit (pgvector FASE 8).

- [ ] Parte da stato finale Scenario A.
- [ ] `/azienda/impostazioni/listino` → bottone "Embeddings AI" (solo admin).
      Attendi toast con count aggiornati (FASE 8.4).
- [ ] Crea nuovo preventivo, scorri fino al pannello AI "Genera da testo".
- [ ] Incolla: *"Sostituzione di 4 finestre in un appartamento al
      secondo piano: 2 in soggiorno da 150×140cm, 1 in cucina da
      120×100cm anta-ribalta, 1 in bagno da 60×100cm vasistas. Tutte in
      PVC bianco con vetro basso emissivo."*
- [ ] Avvia AI. Attendi risposta (<15s con catalogo ≤500 articoli).
- [ ] Verifica 4 righe finestre generate:
      - `family_id` = "Finestra PVC Standard" oppure `article_template_id`
        coerente se usa il legacy enrichment;
      - `misura_x` / `misura_y` in mm corretti (1500×1400, 1200×1000, etc.);
      - `unit_price` NON flat (FASE 7.1 fix: deve rispecchiare mq/griglia).
- [ ] Verifica avvertenza in risposta AI: "Retrieval semantico: N matches"
      se pgvector attivo, oppure fallback "Usato catalogo completo".
- [ ] Totale preview coerente. Nessuna riga con unit_price=0 silenzioso.
- [ ] Con listino >60 articoli, verifica che prodotti oltre i primi 60
      alfabetici compaiano nelle risposte (es. articolo "ZZZ test").

**Pass criteria:** AI produce rows con family_id + misure + unit_price
CORRETTO (non più piatto). Nessun bug silenzioso P0.

---

## Scenario C — Bundle chiavi-in-mano (step 36–39)

Copre: FASE 10 (tutte le sotto-fasi).

- [ ] `/azienda/impostazioni/bundle` → bottone "Installa 5 template"
      (visibile solo per vertical=serramentista).
- [ ] Verifica 5 bundle creati nella tabella:
      Bilocale / Trilocale / Bagno / Villa / Soglia balcone.
- [ ] Crea nuovo preventivo → bottone "Bundle" in toolbar voci.
- [ ] Dialog ApplyBundleDialog: seleziona "Trilocale standard" →
      verifica preview totale stimato + badge tipo_lavoro + sconto %.
- [ ] "Aggiungi N voci" → le voci vengono aggiunte a items[] del QB:
      - 5 finestre + 1 portafinestra → 6 righe prodotto;
      - +6 righe posa linkate (se le famiglie hanno
        `posa_tariffa_default_id`);
      - sconto bundle % applicato a `discount_percent` di ogni voce.
- [ ] Modifica misure di 2 righe (Camera 1 → 1000×1500, Soggiorno → 1400×1500).
- [ ] Verifica ricalcolo unit_price live (FASE 5 motore).
- [ ] Margine semaforo (FASE 6) ancora verde.
- [ ] Salva. Riapri → dati persistono.

**Pass criteria:** 6 voci aggiunte correttamente, posa auto-linkata,
sconto applicato, ricalcolo su edit L×H.

---

## 11.4 Performance check (manuale con DevTools Performance tab)

- [ ] Listino famiglie 50 famiglie → caricamento `/impostazioni/listino?tab=famiglie` < 1s.
- [ ] Editor famiglia → ogni keystroke nella griglia < 300ms prima del preview.
- [ ] AI `ai-genera-preventivo-v2` per 500 famiglie → < 15s (Edge Function log).
- [ ] Salva preventivo con 10 righe → `<2s` inclusi i recalc costi.

---

## 11.5 Definition of Done FASE 11 — stato attuale

- [x] Tutti i test unitari verdi: **196/196 vitest pass** (aggiornato FASE 8.5+).
- [x] Nessun errore TypeScript: **tsc --noEmit EXIT 0**.
- [x] Nessun warning ESLint sui file Serramentisti: `useBundles.ts`,
      `SettingsBundle.tsx`, `ApplyBundleDialog.tsx`, `QuoteWizardSerramenti.tsx`,
      `FamilyAxesEditor.tsx`, `useFamilies.ts`, `useFamilyPricing.ts`,
      `useVertical.ts`, `OnboardingVertical.tsx` → 0 warning / 0 errori
      (lint legacy su integrations/interventi/landing resta di scope esterno).
- [x] Build production verde (`bunx vite build` EXIT 0).
- [x] `bun audit`: 4 high + 3 moderate, tutte in Vite (dev-only, non-shipped).
- [ ] E2E Playwright: **NON installato** — checklist manuale sopra.
- [ ] Scenario A manuale: da eseguire.
- [ ] Scenario B manuale: da eseguire.
- [ ] Scenario C manuale: da eseguire.

---

## Criteri di accettazione finale (checklist 40–49)

- [x] **40.** Onboarding vertical con listino pre-installato — FASE 1+3.
- [x] **41.** Famiglia editor visuale, griglia, maggiorazioni, posa default — FASE 2+4.
- [x] **42.** Wizard serramentista con config visuale + calcolo live + auto-add posa — FASE 9 + 5.
- [x] **43.** AI genera righe con family_id + misure + calcolo CORRETTO — FASE 7.1.
- [x] **44.** AI vede listino intero via retrieval semantico — FASE 8.
- [x] **45.** System prompt specializzato serramentista — FASE 8.5 commit `10b72de0`:
      `supabase/functions/_shared/ai-prompts/serramentista.ts` +
      `getSystemPromptForVertical()` dispatcher in `ai-genera-preventivo-v2`.
      Terminologia: apertura (1 anta / 2 ante / vasistas / scorrevole), vetri
      (4/16/4, 33.1, basso emissivo), ferramenta (RC1-RC4), materiali
      (PVC / alluminio / legno massello), regole operative su
      smontaggio / smaltimento / sigillatura / tiro al piano.
- [x] **46.** Manodopera 10 UM canoniche + costo_interno separato — FASE 6.
- [x] **47.** Bundle chiavi-in-mano funzionano con famiglie — FASE 10.
- [x] **48.** Zero `any` nei nuovi moduli FASE 10; RLS su bundle_prodotti +
      bundle_voci + article_families; commit strategy Conventional Commits.
- [x] **49.** Backward-compat: aziende `vertical = generico` vedono sempre
      QuoteBuilder classico (bottone Serramento condizionale su
      `hasSerramentiFamilies`, Installa template solo se serramentista).

---

## Follow-up suggeriti (post FASE 11)

1. **Playwright scaffold:** installare `@playwright/test`, creare
   `playwright.config.ts` + `e2e/serramenti/` con gli scenari A/B/C
   automatizzati su environment staging con DB seed.
2. **~~System prompt specializzato (crit. 45):~~** ✅ DONE in FASE 8.5
   (`supabase/functions/_shared/ai-prompts/serramentista.ts`).
3. **Apply migrations:** le 11 migration FASE 0→10 (001→011) sono committate ma
   vanno applicate su DB prod con `supabase db push`. In particolare la
   migration `20260917000011_serramenti_11_match_families_tariffe.sql`
   aggiunge `embedding` a `article_families` + `tariffe_aziendali` e le
   relative RPC `match_families_semantic` / `match_tariffe_semantic`.
4. **Embeddings batch initiale:** dopo applicazione migration FASE 8+11,
   invocare `genera-embeddings-catalogo` con `mode: "all"` e
   `targets: ["articles","families","tariffe"]` per ogni company
   serramentista esistente.

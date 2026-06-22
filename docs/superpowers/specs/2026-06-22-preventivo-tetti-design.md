# Verticale "Preventivo Tetti" — Design

**Data:** 2026-06-22
**Stato:** approvato per riferimento (replica del verticale Bagni — vedi `2026-06-22-preventivo-bagni-design.md`)
**Vincolo:** SOLO locale. Nessun push/deploy/applicazione DB finché l'utente non dice "pubblica".

## Obiettivo

Nuovo verticale preventivi **"Tetti"** (coperture/rifacimento tetti), **completo e indipendente**, clone del verticale **Bagni** (a sua volta clone di Ristrutturazione). Stessa identica architettura e UX (editor template incluso), adattata al dominio coperture. Namespace **`tet_`** / `Tetti` / "tetti".

## Non-goal

- Non si tocca il codice di Bagni/Ristrutturazione/altri verticali: si clona in file/tabelle `tet_*` → zero rischio regressioni.
- I fix anti-cross-contaminazione già fatti per Bagni (hook `useTettiListino` dedicato, `useAdottaPrezzario` tet-scoped) vengono ereditati dal clone.

## Deltas vs Bagni

- Prefisso/route/code: `tet_` · `/azienda/tetti` · `TET-YYYY-NNN`.
- Campo roof-specifico: **`numero_falde` (int)** al posto di `numero_bagni`. Superficie → `immobile_superficie_mq`; tipo intervento → `tipo_intervento`.
- Step "Immobile" → **"Dati copertura"**: tipo intervento, n. falde, superficie copertura mq, tipo immobile.
- **Tipi intervento tetto**: Rifacimento completo · Rifacimento parziale · Coibentazione/isolamento · Sostituzione manto · Rifacimento lattoneria · Installazione linee vita · Manutenzione straordinaria · Altro.
- **Seed listino — 9 capitoli copertura**: Allestimento cantiere e ponteggi · Smontaggio e rimozioni · Struttura e orditura · Isolamento e coibentazione · Impermeabilizzazione · Manto di copertura · Lattoneria · Sicurezza e opere accessorie · Finiture e pulizia.
- Icona modulo: `Home` (lucide). Badge Lista Preventivi: tono `stone`. IVA default 10%.
- Registro `config.ts`: Tetti `coming_soon` → **`available`**, href `/azienda/marketing/tetti` → **`/azienda/tetti`**.

## Componenti (clone Bagni → Tetti)

- DB: migrazione `tet_*` (6 tabelle + RLS) + branch `tetti` nella vista `v_preventivi_unificati`.
- `src/types/tetti.ts`, `src/lib/tetti/{calcoli(+test),richTextPdf,seedListino}`.
- `src/hooks/{useTettiProgetto,useTettiPDF,useTettiListino}`.
- `src/components/tetti/{TettiTemplateEditor,TettiPDF,TettiTemplatePreviewDialog,ComputoEditor/*,Listino*,ImportaPrezzarioDialog,ManodoperaLookup}`.
- `src/pages/azienda/tetti/{TettiIndex,TettiListino,TettiWizard,TettiWizard/*}`.
- Wiring: `ModuliVenditaPanel` (editor), `config.ts`, `companyRoutes` (rotte permission-based), `UnifiedPreventiviList` + `UnifiedFiltersSheet` (tipo `tetti`).

## Vincoli & gate

- Solo locale; migrazioni come file (apply via MCP a "pubblica"). Flag `modulo_tetti_attivo` (già esistente) governa l'accesso.
- Gate: `npx eslint <file>` (0 nuovi) + `npx vite build` (exit 0) + `npx vitest run src/lib/tetti`.
- Review adversariale finale come per Bagni.

# Preventivatore Ristrutturazione — Design

**Data:** 2026-06-16
**Tipo:** nuovo verticale preventivi (come Serramenti / Fotovoltaico)
**Stato:** design approvato dall'utente; in attesa di review della spec → writing-plans

---

## Obiettivo

Aggiungere a EdiliziaInCloud un **verticale "Ristrutturazione"**: un preventivatore in cui l'impresa
edile compone un **computo metrico** di lavorazioni partendo dai **propri listini** (prodotti/materiali
+ manodopera) e genera un **preventivo PDF brandizzato e personalizzato** (copertina, descrizioni,
foto/render, condizioni…), allo stesso livello dei verticali Serramenti e Fotovoltaico già esistenti.

### Principio guida (il differenziante)

> **Un computo metrico bello, gradevole e potente — non il classico computo-spreadsheet.**

L'editor del computo è il cuore del prodotto e deve essere un'esperienza premium: moderno,
visivo, veloce, con ricalcolo live, ricerca/inserimento rapido dal listino, raggruppamento per
capitoli con subtotali, riordino drag, breakdown trasparente materiali+manodopera. NON una tabella
Excel travestita.

---

## Contesto: il pattern dei verticali esistenti (da riusare)

Mappato in esplorazione (Serramenti = riferimento end-to-end):

- **Registro moduli**: `src/lib/moduli-vendita/config.ts` (MODULI_VENDITA) + `useModuliVendita.ts` →
  ogni verticale è un modulo con slug, flag feature `modulo_*_attivo`, voce sidebar, onboarding.
- **Tabelle hub per verticale**: `sr_progetti` / `fv_progetti` (+ BOM/voci, media, template_pdf).
- **Wizard a step**: `SerramentiWizard.tsx` (Cliente → Immobile → … → PDF).
- **Listini esistenti riutilizzabili**:
  - **Prodotti/materiali**: `articoli` / `article_families` (prezzi, foto, categorie, assi).
  - **Manodopera/posa**: `tariffe` (`TariffaPro` in `usePreventivoCosti.ts`: nome, unità,
    prezzo_acquisto, prezzo_vendita, categoria, tipo posa/manodopera).
- **Lista unificata**: `v_preventivi_unificati` (migrazione `20270915000000`) +
  `src/lib/preventivi/statoUnificato.ts` (mapping stato cross-modulo) + UI
  `src/components/marketing/preventivi/UnifiedPreventiviList.tsx`.
- **Template PDF per-modulo**: `sr_template_pdf` / `fv_template_pdf` + editor in
  `SettingsQuoteTemplates/ModuliVenditaPanel.tsx`; rendering via edge `sr-genera-pdf` /
  `fv-genera-pdf` e/o client (`useSerramentoPDF` con `@react-pdf/renderer`).
- **Computo/tariffe già presenti**: `computo_uploads` / `computo_voci_estratte` (estrazione AI,
  `useComputoExtract`) — riservati alla **Fase 2** (import computo).

Il verticale Ristrutturazione replica questo pattern e **riusa** articoli + tariffe come listini.

---

## Architettura

Nuovo modulo `ristrutturazione`:

- **Registro**: voce in `MODULI_VENDITA` (slug `ristrutturazione`, icona, flag
  `modulo_ristrutturazione_attivo`, `available`).
- **Rotte** (`companyRoutes.tsx`):
  - `/azienda/ristrutturazione` → `RistrutturazioneIndex` (lista progetti)
  - `/azienda/ristrutturazione/nuovo` → `RistrutturazioneWizard` (create)
  - `/azienda/ristrutturazione/:id/modifica` → `RistrutturazioneWizard` (edit)
- **Nav**: voce sidebar azienda (derivata da `useModuliVendita`, come gli altri moduli).
- **Impostazioni**: editor template + gestione **Listino lavorazioni** in
  Impostazioni → Template preventivi (nuova tab modulo) e/o una pagina listino dedicata.

### Componenti per area (file focalizzati, una responsabilità ciascuno)

```
src/pages/azienda/ristrutturazione/
  RistrutturazioneIndex.tsx              # lista progetti del verticale
  RistrutturazioneWizard.tsx             # shell wizard a step
  RistrutturazioneWizard/
    StepCliente.tsx
    StepImmobile.tsx
    StepComputo.tsx                      # ★ editor computo (il cuore)
    StepMedia.tsx                        # foto / render
    StepEconomia.tsx                     # totali, sconto, IVA, margini, bonus opzionale
    StepPdf.tsx                          # genera/scarica/anteprima PDF
    helpers.ts                           # completamento step, validazioni
src/components/ristrutturazione/
  ComputoEditor/                         # ★ editor premium (vedi sezione dedicata)
    ComputoEditor.tsx
    CapitoloSection.tsx                  # capitolo collassabile + subtotale
    VoceRow.tsx                          # riga voce con breakdown materiali+manodopera
    AddVocePicker.tsx                    # ricerca/typeahead listino lavorazioni/prodotti/tariffe
  RistrutturazionePDF/                   # componenti @react-pdf (se PDF client) o template HTML
  ListinoLavorazioniEditor.tsx           # gestione capitoli/voci del listino aziendale
  RistrutturazioneTemplateEditor.tsx     # editor branding PDF (copertina, copy, colori, foto)
src/hooks/
  useRistrutturazioneProgetto.ts         # CRUD progetto + computo
  useListinoLavorazioni.ts               # CRUD listino capitoli/voci
  useRistrutturazionePDF.ts              # generazione PDF client
src/lib/ristrutturazione/
  calcoli.ts                             # totali computo, margini, IVA, per-capitolo
  seedListino.ts                         # set standard capitoli/voci precompilato
supabase/functions/rst-genera-pdf/       # edge PDF (se/branding server-side)
supabase/migrations/<ts>_rst_modulo_wave1.sql
```

---

## Modello dati (migration, pattern `sr_*`)

Tutte le tabelle: `company_id` + RLS company-scoped (come `sr_*`), forward-dated, idempotente,
applicata via MCP `apply_migration` ([[project_migration_workflow]]). Enum stato **allineati** alla
mappatura unificata.

### Listino aziendale (il "personalizzato")

- **`rst_listino_capitoli`** — capitoli del listino lavorazioni dell'impresa.
  `id, company_id, nome, ordine, created_at`. Es.: Demolizioni, Opere murarie, Intonaci, Massetti,
  Pavimenti/Rivestimenti, Impianto elettrico, Impianto idro-sanitario, Serramenti interni,
  Tinteggiature, Opere esterne.
- **`rst_listino_voci`** — lavorazioni (analisi prezzo). `id, company_id, capitolo_id, codice,
  descrizione, unita_misura ('mq'|'ml'|'cad'|'corpo'|'kg'|'h'|'a corpo'), costo_materiali,
  costo_manodopera, ricarico_pct, prezzo_unitario (= (costo_mat+costo_mano)*(1+ricarico) salvo
  override), note, ordine`.
  - `costo_materiali` / `costo_manodopera` si possono **prefillare** scegliendo dai listini esistenti
    (prodotti `articoli`, manodopera `tariffe`) — riferimenti opzionali `articolo_id`, `tariffa_id`.
  - **Enhancement (Fase 2)**: `rst_voce_componenti` (analisi prezzo multi-riga: N materiali + N
    manodopere con qty → costo calcolato). MVP tiene i due costi aggregati con i riferimenti singoli.

### Progetto + computo

- **`rst_progetti`** — hub. `id, company_id, code, stato, tipo_intervento, cliente_* (nome, cognome,
  email, telefono), cantiere_* (indirizzo, città, provincia, cap), immobile (tipo, superficie_mq,
  anno, piani), opportunita_id (FK CRM), cliente_id (FK contatto), template_id, sconto_pct, iva_pct,
  detrazione_pct (opzionale/bonus), totale_imponibile, totale, note, created_by, created_at,
  updated_at`. Stati: `bozza | da_consegnare | consegnato | in_valutazione | accettato | rifiutato |
  scaduto | archiviato` (riuso enum-style serramenti per la vista unificata).
- **`rst_computo_voci`** — righe del computo del singolo preventivo (snapshot, indipendenti dal
  listino dopo l'inserimento). `id, progetto_id, company_id, capitolo_nome, descrizione,
  unita_misura, quantita, prezzo_unitario, costo_materiali, costo_manodopera, sconto_pct,
  importo (= quantita*prezzo*(1-sconto)), margine_eur, margine_pct, ordine, listino_voce_id (origine,
  nullable)`.
- **`rst_progetti_media`** — foto/render. `id, progetto_id, company_id, tipo ('situazione'|'render'|
  'cantiere_simile'|'allegato'), url, caption, ordine`.

### Template PDF (branding ricco, come `sr_template_pdf`)

- **`rst_template_pdf`** — un record per azienda. Branding + copy: `logo_url`, colori
  (primary/secondary/accent/text), `chi_siamo`, `chi_siamo_foto_url`, `esigenze[]` (jsonb),
  `soluzione[]`, `usp[]`, `testimonianze[]` (jsonb), `cronoprogramma[]` (template fasi),
  `consulente_default`, copertina (titolo/sottotitolo/immagine), condizioni/pagamenti/validità,
  flag visibilità sezioni, tipografia/margini. Editor in Impostazioni.

---

## Listini: come si compongono i prezzi

- **Listino prodotti/materiali** = `articoli` esistenti (riuso). **Listino manodopera** = `tariffe`
  esistenti (riuso). L'impresa li mantiene una volta.
- Una **voce di listino ristrutturazione** (`rst_listino_voci`) è un'**analisi prezzo**:
  `costo_materiali` (da prodotti) + `costo_manodopera` (da tariffe) + ricarico → `prezzo_unitario`.
  L'utente la definisce pescando dai due listini (che prefillano i costi) o a mano. Risultato:
  un catalogo di lavorazioni pronte, riusabili in ogni preventivo, **coi prezzi dell'impresa**.
- Nel computo del preventivo l'utente pesca queste voci (o aggiunge righe libere / prodotti /
  manodopera direttamente), imposta le **quantità**, e i totali si calcolano live.
- Precompilo `rst_listino_capitoli/voci` con un **set standard edile italiano** (in `seedListino.ts`),
  interamente editabile/cancellabile — così il modulo è utile da subito anche a listino vuoto.

---

## Wizard (step)

Modellato su Serramenti, adattato alla ristrutturazione:

1. **Cliente** — anagrafica (collegabile a contatto/opportunità CRM).
2. **Immobile / Cantiere** — indirizzo, tipo immobile, superficie, tipo intervento, vincoli.
3. **Computo** ★ — l'editor premium (sezione dedicata sotto).
4. **Foto / Render** — stato attuale, render, riferimenti, allegati.
5. **Economia** — totali per capitolo + complessivo, sconto, IVA, margini; campo
   **detrazione/bonus opzionale** (un campo % + importo nell'MVP; calcolatori Superbonus/Ecobonus
   strutturati = Fase 2).
6. **PDF** — anteprima, scarica, (ri)genera; brandizzato dal `rst_template_pdf`.

Completamento step + checklist come `SerramentiWizard/helpers.ts`.

---

## ★ Computo Editor (il cuore — "bello, gradevole, potente")

Requisiti UX (differenziante vs. computo classico):

- **Raggruppamento per capitolo**: sezioni collassabili, ognuna con **subtotale live** e conteggio voci.
- **Inserimento rapido**: un picker/typeahead (`AddVocePicker`) che cerca tra **lavorazioni del
  listino**, **prodotti** e **tariffe manodopera** (command-palette style); enter → riga aggiunta nel
  capitolo. Più "aggiungi voce libera" a mano.
- **Editing inline**: quantità, prezzo unitario, sconto riga editabili in place; **ricalcolo live**
  (riga, capitolo, totale) via `useMemo`, niente setState-in-effect.
- **Breakdown trasparente**: ogni voce mostra in modo elegante materiali + manodopera e il margine
  (per chi vende: margine €/% visibile, nascondibile nel PDF cliente).
- **Riordino drag** di capitoli e voci; duplica riga; sposta voce tra capitoli.
- **Visivo e premium**: shadcn/ui, `tabular-nums`, badge stato, totali sticky, responsive
  (mobile: card; desktop: tabella elegante). Empty-state guidato ("aggiungi il primo capitolo /
  pesca dal listino").
- **Riepilogo sempre visibile**: pannello laterale/sticky con totale imponibile, IVA, totale,
  margine complessivo, n° voci.

L'editor scrive su `rst_computo_voci` (snapshot indipendente: modificare il listino dopo non altera i
preventivi già fatti).

---

## PDF personalizzato (come Serramenti/Fotovoltaico)

- **Template ricco** `rst_template_pdf` con editor (`RistrutturazioneTemplateEditor`): copertina,
  chi siamo + foto, esigenze/soluzione/USP, testimonianze, cronoprogramma, condizioni/pagamenti/
  validità, colori/branding, descrizioni.
- **Contenuto preventivo**: copertina brandizzata → presentazione impresa → **computo per capitoli**
  (descrizione, UdM, qty, prezzo, importo; subtotali capitolo; totale, sconto, IVA) → foto/render →
  cronoprogramma → condizioni → contatti.
- **Rendering**: `rst-genera-pdf` (edge) e/o client `useRistrutturazionePDF` (`@react-pdf/renderer`),
  coerente col verticale Serramenti. Merge tags coerenti con `quote_templates`.
- Footer legale Domus Group; **nessun claim su localizzazione server**; brand pagine = EdiliziaInCloud.

---

## Integrazione

- **Lista unificata**: `mapRistrutturazioneStato()` in `statoUnificato.ts` + **UNION** del nuovo
  verticale in `v_preventivi_unificati` (nuova migrazione che ricrea la vista includendo
  `rst_progetti`). Compare in `UnifiedPreventiviList` con tipo "Ristrutturazione".
- **CRM**: `opportunita_id` + `cliente_id` su `rst_progetti`; creazione da opportunità + precompilazione
  cliente (parità con serramenti/FV).
- **Registro moduli** + **rotte** + **nav** + **editor template** in Impostazioni.

---

## Scope

### MVP (prima release, oggetto del piano)
Listino lavorazioni (capitoli/voci, seed standard, prefill da articoli/tariffe) + wizard
(Cliente/Immobile/**Computo**/Media/Economia/PDF) + **Computo Editor premium** + Economia base +
**PDF brandizzato** (template editor + generazione) + integrazione lista unificata + CRM + modulo/
rotte/nav.

### Fase 2 (separata, non in questo piano)
Import computo via AI (`ComputoExtract`/`computo_voci_estratte`) → match al listino; analisi prezzo
multi-componente (`rst_voce_componenti`); cronoprogramma/Gantt con dipendenze; calcolatori
Superbonus/Ecobonus/Conto Termico strutturati; firma digitale cliente (flow tipo `fv-onboarding-cliente`).

---

## Vincoli operativi

- **Solo locale** durante lo sviluppo: commit locali OK; **nessun `git push` / `supabase functions
  deploy` / migrazione sul remoto** finché l'utente non dice esplicitamente "pubblica"/"deploya"
  ([[feedback_no_push]]).
- **Gate di progetto** = `eslint` + `vite build` (+ `deno check` per edge + `vitest` sulle parti
  pure). NON il `tsc` completo (rumoroso, ~1200 errori pre-esistenti).
- **Migrazioni** idempotenti, forward-dated, applicate via MCP `apply_migration` quando si
  pubblica (non `db push`).
- AI eventuale (Fase 2) via `aiRouterComplete` con `skipCharge` solo se strumento interno.

## Testing

- `vitest` sulle parti pure: `calcoli.ts` (totali per-capitolo, IVA, sconto, margini, mai NaN),
  `seedListino.ts`, `mapRistrutturazioneStato`.
- Verifica live nel dev server (preview) di wizard + computo editor + generazione PDF.

## Self-review / decisioni esplicitate

- "personalizzato per inserirci" = **listino aziendale** (prodotti + manodopera + lavorazioni) →
  confermato dall'utente.
- Computo = **analisi prezzo** (materiali+manodopera), non riga piatta → faithful a "per ogni cosa".
- "non il classico computo" → **Computo Editor premium** è requisito esplicito, non opzionale.
- Snapshot del computo (`rst_computo_voci` indipendente dal listino) per non alterare preventivi
  storici quando il listino cambia.

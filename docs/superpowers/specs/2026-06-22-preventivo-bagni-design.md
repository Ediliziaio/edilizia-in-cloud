# Verticale "Preventivo Bagni" — Design

**Data:** 2026-06-22
**Stato:** approvato (design), in implementazione
**Vincolo:** SOLO locale. Nessun push/deploy/applicazione DB finché l'utente non dice "pubblica".

## Obiettivo

Nuovo verticale preventivi **"Bagni"** (ristrutturazione bagno chiavi-in-mano) in EdiliziaInCloud, **completo e indipendente**, modellato sul verticale **Ristrutturazione** (i bagni sono un sotto-tipo di ristrutturazione → la struttura è la stessa). Comprende: preventivatore (wizard + computo metrico + PDF brandizzato) e **editor del template** del PDF con UX **perfettamente identica** agli altri template verticali già unificati (Serramenti/Ristrutturazione).

## Non-goal

- **Non si tocca il codice di Ristrutturazione** (né di Serramenti/Fotovoltaico): si **clona** il blueprint in file/tabelle nuove `bgn_*` → zero rischio regressioni sui verticali live.
- **Niente framework generico condiviso** tra verticali (scelta già presa nell'unificazione editor: ogni verticale replica lo stile). Si replica, non si astrae.
- **Render Bagni AI** (modulo foto già esistente, tabelle `render_bagno_*`) resta separato. Nessun conflitto con `bgn_*`. Integrazione foto→render fuori scope (eventuale futuro).
- Niente integrazione in `OpportunityQuotesTab` (lista preventivi Bagni collegati all'opportunità) in questa fase: additiva, eventuale ondata successiva.

## Architettura

Verticale indipendente clonato da Ristrutturazione. Prefisso **`bgn_`** (coerente con `rst_`/`sr_`/`fv_`). 3 strati:
1. **Dati** — migrazioni `bgn_*` + RLS (company + super_admin) + tipi `src/types/bagni.ts`.
2. **Data layer** — hook react-query `src/hooks/useBagniProgetto.ts` + `useBagniPDF.ts` (specchio di `useRistrutturazioneProgetto`/`useRistrutturazionePDF`).
3. **UI** — editor template + wizard + PDF + index, in `src/components/bagni/` e `src/pages/azienda/bagni/`.

## 1. Modello dati (migrazioni `bgn_*`)

Specchio 1:1 delle tabelle `rst_*` (vedi blueprint `20271001000000_rst_modulo_wave1.sql` + `20271001020000_rst_builder_fields.sql` + `20271001030000_rst_personalization.sql`). RLS: super_admin OR `company_id = get_user_company_id(auth.uid())`.

- **`bgn_listino_capitoli`** (id, company_id, nome, ordine, created_at)
- **`bgn_listino_voci`** (id, company_id, capitolo_id, codice, descrizione, unita_misura, costo_materiali, costo_manodopera, ricarico_pct, prezzo_unitario, articolo_id, tariffa_id, note, ordine, fonte)
- **`bgn_progetti`** (id, company_id, code `BGN-YYYY-NNN`, stato [bozza…archiviato], tipo_intervento, cliente_*, cantiere_*, **dati bagno**: `numero_bagni int`, `superficie_mq numeric`, `tipo_intervento_bagno text` [rifacimento_completo|parziale|nuovo], opportunita_id, cliente_id, template_id, sconto_pct, iva_pct, detrazione_pct, totale_imponibile, totale, note, created_by, timestamps)
- **`bgn_computo_voci`** (id, progetto_id, company_id, capitolo_nome, descrizione, unita_misura, quantita, prezzo_unitario, costo_materiali, costo_manodopera, sconto_pct, importo, margine_eur, margine_pct, listino_voce_id, fonte, ordine)
- **`bgn_progetti_media`** (id, progetto_id, company_id, tipo [situazione|render], url, caption, ordine)
- **`bgn_template_pdf`** (1 per company, `company_id UNIQUE`) — **stesse identiche colonne** di `rst_template_pdf`: branding (logo_url, color_primary/secondary/accent/text, ragione_sociale, indirizzo_completo, telefono, email, partita_iva, font_family), contenuti (chi_siamo, chi_siamo_foto_url, esigenze/soluzione/usp/testimonianze/cronoprogramma/garanzie/faq/percorso jsonb), cover (cover_title/subtitle/image_url/logo_position/text_color/overlay_opacity/title_size/text_align), condizioni (payment_terms_text, validity_text, footer_text), toggle (show_chi_siamo/cronoprogramma/garanzie/percorso/margine/footer_version/footer_legal), default economici (default_iva_pct, default_detrazione_pct, default_validita_giorni). Default IVA bagni = 10, detrazione = 50.

Indici come `rst_*` (company+created_at, progetto+ordine, listino company+capitolo+ordine, media progetto+ordine).

### Seed listino "struttura bagno standard"

Catalogo di default in codice (`src/lib/bagni/listinoDefault.ts`): 9 capitoli con voci d'esempio —
**Demolizioni · Idraulica/scarichi · Impianto elettrico · Opere murarie · Rivestimenti/piastrelle · Sanitari · Box doccia · Rubinetteria · Accessori**.
Funzione di seed: alla **prima apertura** del listino Bagni, se `bgn_listino_capitoli` è vuoto per la company → si inseriscono capitoli + voci di default (idempotente, una sola volta). L'azienda poi personalizza prezzi/voci e può importare dai prezzari regionali (come Ristrutturazione).

## 2. Editor template Bagni — UX identica

`src/components/bagni/BagniTemplateEditor.tsx` = clone di `RistrutturazioneTemplateEditor.tsx`: **stessa sidebar** (gruppi **Azienda / Pagine del PDF / Dati & contenuti**), stesso pannello "Editor pagina PDF" (WYSIWYG, upload foto, anteprima PDF live, salvataggio), **stesse sezioni**: Brand · Copertina · Chi siamo · Esigenze · Soluzione · Punti di forza · Testimonianze · Cronoprogramma · Garanzie · FAQ · Percorso · Condizioni. Preset palette + cover come Ristrutturazione. Persistenza via `useUpsertBgnTemplatePdf` su `bgn_template_pdf`. Anteprima: `BagniTemplatePreviewDialog` (clone). Registrato in `ModuliVenditaPanel` (`/azienda/impostazioni/template-preventivi?tab=moduli-vendita`) accanto agli altri (lazy import + voce nell'array dei moduli).

## 3. Preventivo Bagni — wizard + PDF

`src/pages/azienda/bagni/BagniWizard.tsx` clone del wizard Ristrutturazione, 6 step: **Cliente → Dati bagno → Computo → Foto → Economia → PDF**.
- Step "Dati bagno" (al posto di "Immobile"): n. bagni, superficie mq, tipo intervento (rifacimento completo/parziale/nuovo) + cliente/cantiere.
- Auto-save debounced, pre-fill da CRM (`?contact_id`/`opportunity_id`), guard before-unload.
- **Computo**: `ComputoEditor` (riuso del componente di Ristrutturazione se generico, altrimenti clone in `src/components/bagni/ComputoEditor/`); calcoli puri clonati in `src/lib/bagni/calcoli.ts` (importo riga, prezzo voce, totali) — **testati vitest**.
- **PDF**: `src/components/bagni/BagniPDF.tsx` clone di `RistrutturazionePDF` (@react-pdf, copertina/presentazione/computo/economia/media/cronoprogramma/condizioni); `useBagniPDF` per enrichment immagini (clone di `useRistrutturazionePDF`).
- `BagniIndex` (lista preventivi, ricerca+filtro stato, stats) + `BagniListino` (gestione capitoli/voci + import prezzari + bottone seed se vuoto).

## 4. Wiring (registro, rotte, attivazione)

- **Registro** `src/lib/moduli-vendita/config.ts`: voce Bagni da `availability: "coming_soon"` → **`"available"`**; `href` da `/azienda/marketing/bagni` → **`/azienda/bagni`** (coerente con Serramenti/Ristrutturazione).
- **Rotte** `src/routes/companyRoutes.tsx`: `/azienda/bagni` (index), `/nuovo`, `/:id/modifica`, `/listino` — gated dal flag esistente `modulo_bagni_attivo` via `<FeatureRoute featureKey="modulo_bagni_attivo">` (come Fotovoltaico).
- Il flag `modulo_bagni_attivo` esiste già in `platform_feature_flags` (coming_soon, default false). L'attivazione per-azienda avviene tramite il flag (a "pubblica").
- Tab Moduli (`/azienda/marketing/preventivi?tab=moduli`) e menu "Nuovo Preventivo": **già dinamici** sul registro → mostrano Bagni in automatico (nessuna modifica).

## Decisioni tecniche

- Prefisso DB/file: **`bgn_`** / `Bgn` / "Bagni".
- Route hub: **`/azienda/bagni`**.
- Palette default template: navy/arancio/verde come Ristrutturazione (l'azienda la cambia nell'editor).
- Default economici bagni: IVA 10%, detrazione 50%, validità 30 gg.
- Render Bagni AI (`render_bagno_*`): separato, intoccato.

## Ordine di costruzione (3 ondate, tutto locale)

- **Ondata 1 — fondamenta + editor template (priorità utente):** migrazioni `bgn_*` (file) + RLS + `src/types/bagni.ts` + `listinoDefault.ts` + hook `useBagniProgetto` (template CRUD) + **`BagniTemplateEditor`** + registrazione in `ModuliVenditaPanel` + registro `available` + rotta index + `BagniIndex`.
- **Ondata 2 — preventivo:** wizard 6 step + `ComputoEditor` + `calcoli.ts` (+ test) + `BagniListino` + seed listino + hook computo/progetti/media.
- **Ondata 3 — PDF:** `BagniPDF` + `useBagniPDF` + StepPdf + `BagniTemplatePreviewDialog`.

## Vincoli & gate

- **Solo locale**: migrazioni come file; applicate via MCP `apply_migration` solo a "pubblica" (no `db push`). Nessun `git push` / `supabase deploy` finché l'utente non lo chiede.
- **Gate** per task: `npx eslint <file>` (0 nuovi problemi) + `npx vite build` (exit 0) + `npx vitest run src/lib/bagni` (calcoli puri). NON tsc completo.
- **DRY/YAGNI**: riuso massimo dei pattern Ristrutturazione (clone fedele). Niente refactor dei verticali esistenti. Componenti generici riutilizzati dove già parametrici (es. ComputoEditor se non legato a `rst`).

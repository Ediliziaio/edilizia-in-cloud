# Builder template Ristrutturazione = builder Serramenti — Design

**Data:** 2026-06-16
**Obiettivo (utente):** "non è pensabile avere 3 pagine template diverse a livello visual e di design". Il builder del template Ristrutturazione deve essere **come quello di Serramenti** (a partire dalla copertina, idem il resto). Oggi RST è un form unico a scorrimento; SR/FV hanno il layout a sidebar+pagine. Allineare RST a SR.

**Vincoli:** SOLO locale (no git push / no supabase deploy / no migrazione remota applicata). Le nuove colonne vanno in un file di migrazione LOCALE (applicato in pubblicazione). Gate = eslint + vite build (+ vitest sulle parti pure). Verifica live via **Anteprima PDF** (già esistente). NON toccare gli editor Serramenti/Fotovoltaico (live, funzionanti).

---

## Riferimento: shell Serramenti (`SerramentiTemplateEditor.tsx`)

- `SECTION_GROUPS`: 3 gruppi (`Azienda` / `Pagine del PDF` / `Dati & contenuti`), ogni item `{id,label,emoji,descr}`.
- Sezione attiva via URL `?section=` (default `brand`); `setActiveSection` aggiorna i searchParams.
- Layout `grid grid-cols-12`: `<aside md:col-span-3>` sidebar sticky (gruppi → bottoni emoji+label, attivo = gradiente arancio) con footer **Anteprima PDF**; `<div md:col-span-9>` pannello con `{activeSection === "..." && (<>...</>)}`.
- Card/style: `SrCard {title,description,icon}` + `SectionHeader {title,description,number}`.

## Architettura RST target (un solo componente riscritto)

`RistrutturazioneTemplateEditor.tsx`: da form unico → **shell sidebar+pagine** equivalente, riusando i campi già ricchi (WYSIWYG chi_siamo/condizioni, upload foto, liste, Anteprima, resilienza/banner già fatti).

### SECTION_GROUPS RST
- **AZIENDA**
  - `brand` — "Brand & azienda" 🏢 — logo + anagrafica + 4 colori + tipografia + toggle footer
- **PAGINE DEL PDF**
  - `page_cover` — "Copertina" 🖼️ — titolo, sottotitolo, immagine, **posizione logo, colore testo, overlay**
  - `page_chi_siamo` — "Chi siamo" 👋 — WYSIWYG + foto + toggle Attiva (Mostra nel PDF)
  - `page_testimonianze` — "Testimonianze" ⭐
  - `page_crono` — "Cronoprogramma" 📅 — + toggle Attiva
  - `page_condizioni` — "Condizioni" 📄 — pagamento (WYSIWYG), validità, footer
- **DATI & CONTENUTI**
  - `contenuti` — "Contenuti" 📝 — Esigenze / Soluzione / USP (liste)
  - `opzioni` — "Opzioni PDF" ⚙️ — show_margine + default

### Componenti di stile (nuovi, locali al file, stile Serramenti)
`RstShellCard {title,description,icon}` + `RstSectionHeader {title,description,number}` (clone visivo di SrCard/SectionHeader). La sidebar replica il markup Serramenti (gruppi + bottoni + Anteprima in footer). Stato sezione via `?section=` (deeplink coerente con SR/FV).

## Nuove colonne `rst_template_pdf` (migrazione LOCALE `20271001020000_rst_builder_fields.sql`, idempotente ADD COLUMN IF NOT EXISTS)

- Anagrafica template: `ragione_sociale`, `indirizzo_completo`, `telefono`, `email`, `partita_iva` (text)
- `font_family` (text default 'helvetica')
- Footer: `show_footer_version` (bool default true), `show_footer_legal` (bool default false)
- Copertina: `cover_logo_position` (text default 'top_left'), `cover_text_color` (text default '#FFFFFF'), `cover_overlay_opacity` (numeric default 0.4)

Aggiornare di conseguenza: `RstTemplatePdf` (tipo), `normalizeTemplate` (default), `FormState`/`templateToForm` nell'editor, e il render PDF (`RistrutturazionePDF`): la copertina usa `cover_logo_position`/`cover_text_color`/`cover_overlay_opacity`; header/footer usano l'anagrafica template con fallback alla `companies` (come SR). I default in-memory fanno funzionare editor + Anteprima anche col modulo non pubblicato.

## Tappe (ognuna: build verde + Anteprima + commit locale)
1. **Shell + redistribuzione**: sidebar+pagine+pannello, sezioni esistenti spostate nelle pagine, stile card Serramenti, Anteprima in sidebar. (massimo impatto visivo)
2. **Brand ricco**: anagrafica + tipografia + toggle footer (nuove colonne) + uso nel PDF header/footer.
3. **Copertina ricca**: posizione logo + colore testo + overlay (nuove colonne) + uso nel PDF cover.

## Fuori scope (YAGNI)
- Niente framework generico condiviso tra i 3 verticali (rischio regressioni su SR/FV live; over-engineering per un obiettivo visivo). Si replica lo stile per RST.
- Niente "Ordine pagine" drag-drop (RST non ha `pdf_pages_order`; il PDF è lineare). Le pagine opzionali restano governate dai toggle Attiva.
- Niente modifica a Serramenti/Fotovoltaico.



# Sistema Template e Personalizzazione Preventivi

## Panoramica

Feature complessa che aggiunge personalizzazione grafica dei PDF preventivi: template salvabili con layout, colori, font, logo e preview live. Si compone di 4 parti principali.

---

## 1. Database Migration

Creare tabella `quote_templates` con tutti i campi richiesti (layout, colori, font, logo, elementi visibili, testi personalizzabili). Aggiungere colonna `template_id` a `quotes`. Creare bucket storage `quote-template-assets`.

RLS policies usando `public.get_my_company_id()` per isolamento tenant. Trigger per enforce single default template per azienda. Trigger `update_updated_at_column()` per updated_at.

---

## 2. Frontend: Types, Hook, Preview Component

| File | Descrizione |
|------|-------------|
| `src/types/quoteTemplate.ts` | Tipi TypeScript, palette predefinite, default template |
| `src/hooks/useQuoteTemplates.ts` | Hook CRUD con react-query (list, upsert, delete, set default) |
| `src/components/quotes/QuoteTemplatePreview.tsx` | Preview HTML/CSS del PDF con 4 layout (classic/modern/minimal/bold), watermark, footer. Scale configurabile |

---

## 3. Pagina Settings: Template Offerte

| File | Modifica |
|------|----------|
| `src/pages/azienda/settings/SettingsQuoteTemplates.tsx` | Nuova pagina con layout 60/40: editor a sinistra (lista template, form editing con layout cards, logo upload, palette colori, font, toggle elementi, testi), preview live a destra (sticky) |
| `src/App.tsx` | Aggiungere route `template-preventivi` + lazy import |
| `src/components/layouts/CompanyLayout.tsx` | Aggiungere voce menu "Template Offerte" con icona Palette, dopo "Materiali Preventivi" |

L'editor include:
- Grid di template salvati con card (miniatura, nome, badge default, azioni)
- Form: nome, layout (4 card cliccabili), logo (upload/aziendale, posizione, dimensione), palette (8 preset + custom con color input nativi), font (3 opzioni), toggle elementi, testi (tagline, footer), watermark
- Preview si aggiorna in real-time nel pannello destro

---

## 4. Integrazione nel QuoteBuilder (Step 4 Riepilogo)

Aggiungere sezione "Aspetto del Documento" prima dei bottoni azione nello step 3 (riepilogo) di `QuoteBuilder.tsx`:
- Select template (pre-seleziona il default)
- Layout cards miniatura per cambio rapido
- Palette quick-select
- Mini-preview CSS della copertina (~200px)
- Salvare `template_id` nella quote durante `handleSave`

---

## 5. Edge Function `generate-quote-pdf`

Aggiornare per:
- Caricare template da DB (per `template_id` o default aziendale, con fallback valori hardcoded)
- Helper `hexToRgb` per conversione colori
- Caricare logo da storage
- Implementare 4 layout diversi per copertina (classic/modern/minimal/bold)
- Applicare colori alla tabella prodotti (header colorato, righe alternate con accent)
- Font mapping (Helvetica/TimesRoman/Courier)
- Watermark diagonale, tagline, footer, page numbers
- Rispettare toggle elementi (show_quote_number, show_validity_date, etc.)

---

## File totali da creare/modificare

| File | Azione |
|------|--------|
| Migration SQL | Creare (quote_templates + alter quotes + bucket + policies) |
| `src/types/quoteTemplate.ts` | Creare |
| `src/hooks/useQuoteTemplates.ts` | Creare |
| `src/components/quotes/QuoteTemplatePreview.tsx` | Creare |
| `src/pages/azienda/settings/SettingsQuoteTemplates.tsx` | Creare |
| `src/App.tsx` | Modificare (route + import) |
| `src/components/layouts/CompanyLayout.tsx` | Modificare (voce menu) |
| `src/pages/azienda/marketing/QuoteBuilder.tsx` | Modificare (sezione template nello step riepilogo + salvataggio template_id) |
| `supabase/functions/generate-quote-pdf/index.ts` | Modificare (template-aware PDF generation) |


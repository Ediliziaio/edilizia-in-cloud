

# Anteprima Logo nei Template

## Modifiche

### File: `src/pages/azienda/settings/SettingsQuoteTemplates.tsx`

**1. Card template (griglia lista)** — Riga ~151-175
- Se `tmpl.logo_url` esiste, mostrare una miniatura del logo sopra il nome del template
- Usare `supabase.storage.from("quote-template-assets").getPublicUrl(tmpl.logo_url)` per ottenere l'URL pubblico

**2. Editor — Sezione Logo** — Riga ~237-248
- Dopo il bottone "Scegli file", se `form.logo_url` è presente, mostrare un'anteprima dell'immagine caricata (thumbnail ~80px) con un bottone per rimuoverla
- Sostituire il testo con solo il nome file attuale con l'immagine reale

### Dettagli tecnici
- Creare un helper `getLogoUrl(path: string)` che chiama `supabase.storage.from("quote-template-assets").getPublicUrl(path).data.publicUrl`
- Aggiungere un bottone "Rimuovi logo" (icona `Trash2`) che setta `logo_url: null`
- L'immagine nella card sarà piccola (~32px), nell'editor ~80px con bordo arrotondato


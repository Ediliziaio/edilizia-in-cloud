

# Aggiunta bottone "Scarica Anteprima PDF" nella pagina Template

## Cosa fare

Aggiungere un bottone "Scarica anteprima PDF" nel pannello destro della pagina Settings Template (sotto i bottoni Pagina 1/Pagina 2). Il bottone chiamerà la edge function `generate-quote-pdf` passando un **payload di preview** con dati fittizi e il template corrente, per generare e scaricare un PDF reale.

## Modifiche

### 1. Edge Function `generate-quote-pdf/index.ts`

Aggiungere supporto a una modalità `preview_mode`:
- Se il body contiene `preview_mode: true` + `template_data: {...}`, la funzione salta il caricamento da DB e usa direttamente i dati template ricevuti + dati di esempio hardcoded (azienda fittizia, 3 prodotti, totali calcolati).
- L'autenticazione resta obbligatoria ma non serve `quote_id`.
- Il PDF viene generato e restituito normalmente.

Dati di esempio:
```
Azienda: "La Tua Azienda Srl"
Cliente: "Mario Rossi - Rossi Costruzioni"
Prodotti: 3 righe (Finestre, Porta finestra, Installazione)
Totale: ~€7.161,40
```

### 2. `SettingsQuoteTemplates.tsx`

Aggiungere:
- Stato `downloadingPdf` (boolean)
- Funzione `handleDownloadPreview` che:
  - Chiama `supabase.functions.invoke("generate-quote-pdf", { body: { preview_mode: true, template_data: form, company_name: effectiveCompany?.name } })`
  - Riceve il PDF base64, lo converte in blob e lo scarica come file
- Bottone "Scarica PDF Anteprima" con icona `Download` sotto i bottoni pagina nel pannello preview

### File modificati

| File | Modifica |
|------|----------|
| `supabase/functions/generate-quote-pdf/index.ts` | Aggiunta branch `preview_mode` con dati fittizi |
| `src/pages/azienda/settings/SettingsQuoteTemplates.tsx` | Bottone download + logica invoke |


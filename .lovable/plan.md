

# Piano: Modulo Generatore di Preventivi

Questo è un modulo standalone composto da 4 tabelle DB, 2 storage bucket, 3 edge function, 6+ pagine frontend e integrazioni con contatti/opportunità esistenti.

Data la complessità (26 pagine di specifiche), propongo di implementarlo in **5 prompt sequenziali**, esattamente come descritto nel documento.

---

## Prompt 1 — Database + Storage

**Migrazione SQL** con:

- **Storage bucket** `quote-materials` (privato, policy per company members)
- **Storage bucket** `quote-pdfs` (privato, policy per company members)
- **Tabella `quote_pdf_materials`**: PDF caricati dall'azienda (schede prodotto, garanzie, ecc.), con `company_id`, `category`, `catalog_item_id` opzionale, `sort_order`
- **Tabella `quotes`**: preventivi con stati (`bozza`, `inviata`, `accettata`, `rifiutata`, `scaduta`), dati cliente, totali, firma digitale (`signature_token`, `signed_at`, `signed_by_name`, `signed_by_ip`), PDF generato
- **Tabella `quote_items`**: righe prodotti/servizi con `item_type` (product/service/text), quantità, prezzi, sconto, immagine
- **Tabella `quote_pdf_attachments`**: junction table quote ↔ materiali PDF selezionati
- **Funzione `generate_quote_number()`**: genera numero progressivo `OFF-YYYY-NNN`
- **Trigger `recalculate_quote_totals()`**: ricalcola subtotale/IVA/totale su INSERT/UPDATE/DELETE di `quote_items`
- **Trigger `updated_at`** su quotes e quote_pdf_materials
- **Policy RLS**: company members read, company members manage (tutte via `get_user_company_id`)
- **Policy pubblica**: `anon` può leggere quotes/items con `signature_token` valido e status appropriato (per la pagina firma cliente)

**Nota**: il documento referenzia `catalog_items` ma la tabella non esiste nel progetto. Verificherò se è un nome diverso (es. `products`, `catalog`) o se va creata. Se non esiste, il campo `catalog_item_id` sarà nullable senza FK per ora.

---

## Prompt 2 — Impostazioni: Gestione Materiali PDF

**Nuova pagina**: `src/pages/azienda/settings/SettingsQuoteMaterials.tsx`

- **Route**: `/azienda/impostazioni/materiali-preventivi`
- **Sidebar**: aggiunta voce "Materiali Preventivi" con icona `FileStack` (solo admin)
- **Funzionalità**:
  - Upload PDF con dropzone (max 20MB, solo .pdf)
  - Stepper 2 step: upload → dettagli (nome, categoria, collegamento prodotto)
  - Griglia card con drag & drop per riordinamento
  - Filtri per tab (Tutti/Globali/Per Prodotto) e categoria
  - Anteprima PDF in dialog, rinomina, elimina
  - Storage path: `quote-materials/{company_id}/{uuid}.pdf`

---

## Prompt 3 — Lista Preventivi + Quote Builder

### Parte A: Lista Preventivi
**Nuova pagina**: `src/pages/azienda/marketing/Preventivi.tsx`

- **Route**: `/azienda/marketing/preventivi`
- **Sidebar**: voce "Preventivi" con icona `FileSignature` dopo "Opportunità"
- KPI strip (bozze, inviate, accettate, valore totale)
- Tabella con filtri per status, ricerca, data
- Azioni: apri, duplica, elimina
- Stato vuoto con CTA

### Parte B: Quote Builder (4-step wizard)
**Nuova pagina**: `src/pages/azienda/marketing/QuoteBuilder.tsx`

- **Route**: `/azienda/marketing/preventivi/nuovo` e `/:id/modifica`
- **Step 1**: Cliente & intestazione (select da customers/marketing_contacts + form manuale, preview live)
- **Step 2**: Prodotti e servizi (drag & drop righe, import da catalogo, calcoli live, riepilogo totali)
- **Step 3**: Documenti allegati (seleziona PDF da libreria materiali, drag & drop ordine)
- **Step 4**: Riepilogo & genera (genera PDF, invia per firma, salva bozza)

### Parte C: Dettaglio Preventivo
**Nuova pagina**: `src/pages/azienda/marketing/QuoteDetail.tsx`

- **Route**: `/azienda/marketing/preventivi/:id`
- Layout a tab (Offerta, Cliente, Documenti, Attività)
- Bottoni contestuali per stato
- Timeline stati verticale

---

## Prompt 4 — Edge Functions

### 1. `generate-quote-pdf`
- Genera PDF con `pdf-lib` (copertina + dettaglio prodotti + PDF allegati incorporati)
- Upload su storage bucket `quote-pdfs`
- Ritorna signed URL per download

### 2. `send-quote-signature`
- Genera `signature_token`, costruisce link firma `/offerta/{token}`
- Invia email al cliente con link prominente
- Aggiorna status a `inviata`

### 3. `quote-sign` (pubblica, no auth)
- Azioni: view (traccia visualizzazione), sign (firma), refuse (rifiuta)
- Rate limiting, validazione token UUID, check scadenza
- `verify_jwt = false` in config.toml

---

## Prompt 5 — Pagina Pubblica Firma + Integrazioni

### Parte A: Pagina pubblica
**Nuova pagina**: `src/pages/public/QuoteSignPage.tsx`

- **Route**: `/offerta/:token` (fuori da auth guard)
- Design professionale: logo azienda, dettaglio offerta, tabella prodotti, totali
- Form firma: nome + conferma accettazione oppure rifiuto con motivo
- Stati: attiva, scaduta, già firmata, rifiutata, token non valido

### Parte B: Integrazioni
- Bottone "Genera Offerta" in `MarketingContactDetail.tsx` e nelle opportunità
- Tab/sezione "Preventivi" nel dettaglio contatto
- "Crea Ordine da Offerta" in QuoteDetail quando accettata
- Scadenza automatica in `check-lifecycle-events`

---

## Ordine di implementazione

Dato che ogni prompt dipende dal precedente, implementerò in sequenza:

1. **Prompt 1**: Migrazione DB + storage (fondazione)
2. **Prompt 2**: Pagina impostazioni materiali PDF
3. **Prompt 3**: Lista + Builder + Dettaglio (UI principale)
4. **Prompt 4**: Edge functions (PDF generation, firma, email)
5. **Prompt 5**: Pagina pubblica + integrazioni

Il primo messaggio di implementazione coprirà **Prompt 1 + Prompt 2** (DB + pagina materiali). I successivi copriranno un prompt ciascuno.




# Verifica Completa — Modulo Preventivi

## Stato Attuale dopo i Fix

Le 3 edge functions (`generate-quote-pdf`, `quote-sign`, `send-quote-signature`) ora usano correttamente `pdf_storage_path`, `expires_at`, e `storage_path`. La pagina pubblica `QuoteSignPage` ha error handling con toast. Il trigger `calculate_quote_expires_at` è in place.

---

## Problemi Residui Trovati

### 1. CRITICO: Migration duplica storage policies — errore runtime
La **prima migration** (`20260309104017`) crea già policies `qm_sel`, `qm_ins`, `qm_del`, `qp_sel`, `qp_ins`, `qp_del` con scoping per `company_id`.

La **seconda migration** (`20260309110310`) crea **8 policies aggiuntive** senza company scoping sulle stesse operazioni (`INSERT`, `SELECT`, `DELETE`, `UPDATE`) per gli stessi bucket. Questo causa:
- **Policy conflict**: se la prima migration è già applicata, le nuove policies coesistono ma permettono accesso cross-company (qualsiasi utente autenticato può leggere/scrivere file di altre aziende)
- **Se la prima non è stata applicata** e la seconda sì, funziona ma senza isolamento per company

**Fix**: Rimuovere la seconda migration (le 8 policies broad) dato che la prima è più sicura con company scoping. Aggiungere solo la policy `UPDATE` mancante nella prima migration.

### 2. CRITICO: `.toFixed()` su stringhe — crash PDF generation
Supabase restituisce colonne `NUMERIC` come **stringhe** (es. `"150.00"` non `150.00`). Nel `generate-quote-pdf`:
- `(item.unit_price || 0).toFixed(2)` → **crash** se `unit_price` è `"150.00"` (string non ha `.toFixed`)
- `(quote.subtotal || 0).toFixed(2)` → stesso problema
- Riguarda tutte le righe 163-166, 192-197

**Fix**: Wrappare con `Number()`: `Number(item.unit_price || 0).toFixed(2)`

### 3. MINORE: QuoteBuilder non salva `subtotal`, `vat_amount`, `total`
Il builder calcola i totali lato frontend ma **non li salva** nel record `quotes`. I campi sono auto-calcolati dal trigger `recalculate_quote_totals` che si attiva su `quote_items` INSERT/UPDATE/DELETE. Questo **funziona correttamente** grazie al trigger — non è un bug.

### 4. MINORE: `requireRole` importato ma non usato in `generate-quote-pdf`
Linea 2: `import { requireAuth, requireRole }` — `requireRole` non è utilizzato. Non causa errore ma è dead code.

---

## Piano di Fix

### Migration SQL
- Rimuovere le 8 storage policies broad dalla seconda migration
- Aggiungere policy `UPDATE` per i bucket con company scoping (mancante nella prima)

### Edge Function: `generate-quote-pdf`
- Wrappare tutti i valori numerici con `Number()` prima di `.toFixed(2)` (righe 163-166, 192-197)
- Rimuovere import inutilizzato `requireRole`

### Riepilogo
| File | Problema | Gravità |
|------|----------|---------|
| Migration 2 | Storage policies duplicate/insicure | Critico |
| generate-quote-pdf | `.toFixed()` su stringhe | Critico |
| generate-quote-pdf | Import morto `requireRole` | Cosmetico |

Tutto il resto (QuoteBuilder, QuoteDetail, QuoteSignPage, quote-sign, send-quote-signature, Preventivi) risulta **corretto** e allineato con lo schema DB.


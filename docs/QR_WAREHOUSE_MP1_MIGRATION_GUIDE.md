# QR Warehouse MP1 — Guida applicazione migration

## ⚠️ Errori risolti

### Errore A — `function warehouse_scan_lookup(unknown, unknown) does not exist`

**Causa**: PostgreSQL interpreta i letterali `'CODICE_TEST'` e `NULL` come tipo `unknown`. La funzione è definita con firma `(text, uuid)` e Postgres NON converte automaticamente `unknown → uuid`.

**Fix**: usa cast espliciti nelle sanity query (vedi sotto). La migration in sé è corretta.

### Errore B — `42P17: generation expression is not immutable`

**Causa**: la prima versione della migration aveva `warranty_expires_at` come `GENERATED ALWAYS AS (...) STORED` con espressione `(date + (text || ' months')::interval)::date`. Postgres considera il cast `text → interval` non IMMUTABLE (può dipendere da locale/timezone).

**Fix applicato**: la colonna ora è una `DATE` normale, calcolata da un **trigger BEFORE INSERT/UPDATE** (`trg_stock_units_warranty` + funzione `stock_units_compute_warranty_expires`) che usa `make_interval(months => ...)`. Risultato funzionale identico, compatibile con qualsiasi versione Postgres. **Nessuna azione richiesta da parte tua** — è già nel file della migration. Se avevi provato l'applicazione prima del fix e avevi visto rollback (BEGIN/COMMIT atomico), basta rilanciare adesso.

---

## Step 1 — Applicare la migration

1. Apri https://supabase.com/dashboard/project/rsbrguhkodgnqfomrevo/sql/new
2. Incolla il contenuto integrale di `supabase/migrations/20260426194541_qr_warehouse_foundation.sql`
3. Click **Run** (deve concludersi con `SUCCESS` — la migration è interamente in `BEGIN; ... COMMIT;`)

Cosa fa la migration:
- ALTER `warehouse_stock`: +6 colonne (`barcode`, `internal_code`, `tracking_mode`, `requires_warranty`, `default_warranty_months`, `qr_generated_at`) + 3 indici
- ALTER `suppliers`: +3 colonne (`barcode_prefix`, `uses_gs1`, `default_qr_format`)
- CREATE TABLE `stock_units` (tracking serializzato per pezzo) + RLS + trigger updated_at
- CREATE TABLE `warehouse_scan_events` (audit trail) + RLS select+insert
- CREATE OR REPLACE RPC `warehouse_scan_lookup(p_code text, p_supplier_id uuid DEFAULT NULL)` → cascata 1) seriale 2) barcode 3) none

La migration è **idempotente** (`IF NOT EXISTS` / `CREATE OR REPLACE`): puoi rilanciarla senza danni.

---

## Step 2 — Sanity queries (con cast corretti)

Esegui queste 3 query nello SQL Editor per verificare. Tutte devono passare.

### Query 1 — Colonne aggiunte a `warehouse_stock`

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'warehouse_stock'
  AND column_name IN (
    'barcode', 'internal_code', 'tracking_mode',
    'requires_warranty', 'default_warranty_months', 'qr_generated_at'
  );
```

**Atteso**: 6 righe (una per colonna).

### Query 2 — Tabelle nuove con RLS attivo

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('stock_units', 'warehouse_scan_events');
```

**Atteso**: 2 righe, `rowsecurity = true` per entrambe.

### Query 3 — RPC chiamabile (CON CAST CORRETTO)

❌ **Sbagliato** (causa l'errore "function does not exist"):
```sql
SELECT * FROM warehouse_scan_lookup('CODICE_INESISTENTE_TEST', NULL);
```

✅ **Corretto — opzione A** (passa solo il codice, usa il default):
```sql
SELECT * FROM warehouse_scan_lookup('CODICE_INESISTENTE_TEST');
```

✅ **Corretto — opzione B** (cast esplicito di `NULL`):
```sql
SELECT * FROM warehouse_scan_lookup('CODICE_INESISTENTE_TEST', NULL::uuid);
```

✅ **Corretto — opzione C** (cast esplicito di entrambi i parametri):
```sql
SELECT * FROM warehouse_scan_lookup('CODICE_INESISTENTE_TEST'::text, NULL::uuid);
```

**Atteso (per tutte e tre le opzioni)**: 1 riga con `match_type = 'none'` e tutti gli altri campi `NULL`.

### Query 4 — Test cascata su un articolo reale (opzionale)

Se hai già articoli con barcode in anagrafica:
```sql
-- Sostituisci 'IL_TUO_BARCODE' con un valore reale di warehouse_stock.barcode
SELECT * FROM warehouse_scan_lookup('IL_TUO_BARCODE'::text, NULL::uuid);
```

**Atteso**: 1 o più righe con `match_type = 'item'` e `item_name` popolato.

---

## Step 3 — Rigenera i types TypeScript (opzionale, raccomandato)

Senza questo, il codice frontend funziona comunque grazie ai cast difensivi (`as unknown as StockUnit`), ma con i types rigenerati hai autocompletion e safety completa.

Dal terminale, nella root del progetto:
```bash
npx supabase gen types typescript --project-id rsbrguhkodgnqfomrevo --schema public > src/integrations/supabase/types.ts
npx tsc --noEmit  # verifica 0 errori
```

Poi committa con:
```bash
git add src/integrations/supabase/types.ts
git commit -m "chore(types): regenerate after QR foundation migration"
```

---

## Step 4 — Smoke test UI

Dopo il merge in `main` e deploy:

1. Login → `/azienda/impostazioni` → vedi **"QR & Codici"** nella sidebar (gruppo "Cantieri & Costi")
2. Apri la pagina → 3 tab funzionanti:
   - **Panoramica**: 4 KPI (articoli, copertura QR%, seriali, scan 7gg) + tabella ultime scansioni
   - **Per fornitore**: copertura barcode con CoverageBar + badge GS1 + formato default
   - **Test scan**: incolla `0108001234567890` → click "Risolvi" → vedi GS1 detected con GTIN `08001234567890`
3. Magazzino → click **"Scansiona QR"** in toolbar → si apre Sheet bottom con input + camera
4. Test no-match: incolla `9999999999` → click Risolvi → "Codice non riconosciuto" → "Crea articolo con questo barcode" → si apre StockItemDialog con barcode pre-compilato
5. Magazzino → "Aggiungi Articolo" → espandi accordion **"QR & Tracking"** → 5 campi visibili (barcode, internal_code, tracking_mode, requires_warranty, mesi)
6. Impostazioni → Fornitori → modifica un fornitore → espandi accordion **"QR & Barcode fornitore"** → 3 controlli visibili

---

## Rollback (se serve)

Se devi annullare la migration (per qualsiasi motivo):

```sql
BEGIN;

DROP FUNCTION IF EXISTS public.warehouse_scan_lookup(text, uuid);
DROP TABLE IF EXISTS public.warehouse_scan_events CASCADE;
DROP TABLE IF EXISTS public.stock_units CASCADE;
DROP FUNCTION IF EXISTS public.stock_units_set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.stock_units_compute_warranty_expires() CASCADE;

ALTER TABLE public.warehouse_stock
  DROP COLUMN IF EXISTS barcode,
  DROP COLUMN IF EXISTS internal_code,
  DROP COLUMN IF EXISTS tracking_mode,
  DROP COLUMN IF EXISTS requires_warranty,
  DROP COLUMN IF EXISTS default_warranty_months,
  DROP COLUMN IF EXISTS qr_generated_at;

ALTER TABLE public.suppliers
  DROP COLUMN IF EXISTS barcode_prefix,
  DROP COLUMN IF EXISTS uses_gs1,
  DROP COLUMN IF EXISTS default_qr_format;

COMMIT;
```

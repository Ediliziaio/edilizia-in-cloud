# STATUS — Magazzino V2 deploy (`feat/preventivatore-serramentisti`)

Ultimo aggiornamento: 2026-04-19T19:12:00Z
Branch: `feat/preventivatore-serramentisti`
Masterprompt: `~/Downloads/masterprompt-deploy-magazzino.docx`

---

## 🧭 Percorso scelto: **Path B — verify-only**

Pre-flight detection (Step 0) ha confermato che tutti gli artifact di Magazzino V2
sono già deployati in produzione. Nessuna DDL è stata eseguita in questa sessione.

| Artifact | Rilevato | Evidenza |
|---|---|---|
| Tabella `public.warehouse_assignments` | ✅ | `supabase gen types typescript --linked` espone le colonne complete |
| RPC `get_my_warehouse_ids` | ✅ | gen types + probe runtime `rpc()` risponde |
| RPC `is_assigned_to_warehouse(p_warehouse_id uuid)` | ✅ | probe runtime |
| RPC `is_warehouse_user()` | ✅ | probe runtime |
| Colonna `public.goods_receipts.warehouse_id` | ✅ | gen types |
| Colonna `public.ddt_ricezione.warehouse_id` | ✅ | gen types |
| Trigger `trg_auto_carico_stock` | ✅ (inferito) | migrazione `20260921000001` applicata (transazionale) |
| Trigger `trg_auto_grant_warehouse_perms` | ✅ (inferito) | migrazione `20260921000001` applicata |
| Policy `orders_warehouse_user_view` | ✅ (inferito) | migrazione `20260921000001` applicata |

### Migrazioni già applicate su remote
- `20260921000001_warehouse_assignments_and_rls.sql`
- `20260921000002_render_economics_alerts.sql`
- `20260921000003_render_economics_monitor_cron.sql`

Confermato da `supabase migration list --linked`.

### Nota su MCP Supabase
Il server MCP Supabase in sessione ha scope limitato al progetto **Lead Finder**
(`vqfkqsdiytdhfhwoiupf`) — **non** Edilizia In Cloud (`rsbrguhkodgnqfomrevo`).
Di conseguenza la query Step 0 è stata eseguita con strumenti alternativi:
- `supabase gen types typescript --linked` (genera i tipi TS leggendo lo schema reale)
- Probe runtime in Node via `@supabase/supabase-js` con la publishable key (solo letture; RLS attive)

Per future ispezioni dirette via MCP, aggiornare lo scope del token MCP
includendo il progetto `rsbrguhkodgnqfomrevo`.

---

## ✅ Completato in questa sessione

### Step 0 — Pre-flight detection
Verificata la presenza di tutti gli artifact critici di Magazzino V2
tramite tre metodi complementari (gen types, migration list, probe runtime).
Decisione: **Path B (verify-only)**. Zero DDL.

### Step 3.1 — Integrity check live
Probe Node (`/tmp/eic_probe.mjs`) ha confermato in runtime:
- `warehouse_assignments.select('id')` risponde (RLS attive, tabella presente)
- `rpc('get_my_warehouse_ids')` torna `[]` (utente non autenticato → risultato atteso)
- `rpc('is_assigned_to_warehouse', { p_warehouse_id: uuid })` risponde
- `rpc('is_warehouse_user')` risponde
- `goods_receipts.warehouse_id` e `ddt_ricezione.warehouse_id` sono selezionabili

Risultato: **6/6 checks OK**.

### Step 6.2 — Pulizia `any` nei hook warehouse
Fix applicati (solo type-narrowing, zero cambio di comportamento):
- `src/hooks/useWarehouses.ts` — 4× `onError: (err: any)` → `onError: (err: Error)`
- `src/hooks/useWarehouseSections.ts` — 1× `onError: (e: any)` → `onError: (e: Error)` + rimosso optional chaining superfluo (`Error.message` è sempre string)
- `src/hooks/useWarehouseData.ts` — introdotto `type OrderRow` locale per la mappa degli ordini (sostituisce `(o: any)`)

I casi residui di `as any` nei componenti warehouse (`WarehouseLottiTab`,
`WarehouseTransferPanel`, `StockAlertBanner`, `StockMovementHistoryDialog`) sono
workaround per tabelle/colonne non presenti nei tipi generati dallo schema
pubblico. Richiedono refactor schema-side → **fuori scope** per questo pass
di stabilizzazione.

---

## ⏸ Richiede intervento Florin

### Step 3.2 — Smoke test dry-run in transazione (rollback)
Richiede connessione `psql` diretta al DB (password postgres non in env locale).
Da eseguire manualmente via Supabase SQL Editor o via `psql` con service
credentials:

```sql
BEGIN;
-- Il contenuto completo del dry-run è in masterprompt-deploy-magazzino.docx §3.2
ROLLBACK;
```

### Step 4 — Seed `warehouse_assignment` per utente di test
Bloccato su: identificare l'utente di test (email / id) a cui assegnare il
magazzino di prova.

### Step 5 — E2E UI test
Bloccato su credenziali test. Percorsi da validare:
1. Login come magazziniere → sidebar mostra "Magazzino" e "Ordini"
2. Apri "Magazzino" → vedi solo il magazzino assegnato
3. Apri un DDT → carico stock si propaga automaticamente (trigger `trg_auto_carico_stock`)
4. Revoca assegnazione via admin → utente perde accesso alla sezione

---

## ⛔ Rollback
**Non eseguire** rollback autonomamente. Solo su ordine esplicito di Florin,
seguendo §7 del masterprompt.

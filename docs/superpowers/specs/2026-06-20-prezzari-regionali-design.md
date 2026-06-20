# Libreria Prezzari Regionali — Design

**Goal:** Una libreria **centrale condivisa**, curata dal super-admin, dei prezzari regionali dei lavori pubblici italiani. Le aziende la **adottano per copia + margine** nel computo metrico della Ristrutturazione.

**Architettura:** tabelle condivise read-only (lettura per tutte le aziende, scrittura solo super-admin) + motore di ingestione Excel/CSV con adapter per regione + flusso di adozione che copia le voci nel listino dell'azienda. Il match AI del computo cerca anche nel prezzario centrale.

**Tech:** React18+TS+Vite, Supabase (Postgres+RLS), edge function Deno, riuso del parser esistente `src/lib/tariffe/prezziarioImport.ts`.

---

## Decisioni approvate
1. **Adozione per copia + margine** (non riferimento live): l'azienda copia le voci in `rst_listino_voci`, le ritocca, applica margine; la versione resta congelata nel preventivo (requisito base d'asta).
2. **v1 = solo Excel/CSV ufficiali**; PDF-only in v2 (riuso pipeline AI `computo_metrico_ai`).
3. **3 regioni pilota** come target (Lombardia, Lazio, Campania) — i **dati** si caricano via UI quando si hanno i file ufficiali.
4. **Manodopera costo-orario** (tabelle Cassa Edile/Min. Lavoro) in v2; in v1 solo l'**incidenza manodopera %** per voce.

## Cosa costruisce la v1
La **macchina**: schema + ingestione (UI super-admin + edge) + adozione nel computo, verificata localmente. Il **caricamento dati** delle regioni è data-ops successivo, per-regione, tramite la UI costruita.

---

## Schema (tabelle condivise nuove, prefisso `prezzario_`)

### `prezzario_fonte`
- `id uuid pk`, `regione text not null`, `anno int not null`, `versione text`, `nome text not null`,
  `url_fonte text`, `licenza text`, `stato text not null default 'bozza'` (bozza|pubblicato|archiviato),
  `note text`, `created_by uuid`, `created_at/updated_at timestamptz`.
- `unique(regione, anno, coalesce(versione,''))`.

### `prezzario_capitolo`
- `id uuid pk`, `fonte_id uuid fk→prezzario_fonte on delete cascade`, `codice text`, `titolo text not null`,
  `parent_id uuid fk→prezzario_capitolo (gerarchia)`, `ordine int default 0`, `livello int default 0`.

### `prezzario_voce`
- `id uuid pk`, `fonte_id uuid fk on delete cascade`, `capitolo_id uuid fk→prezzario_capitolo on delete set null`,
  `codice text`, `descrizione text not null`, `unita_misura text`, `prezzo numeric not null`,
  `incidenza_manodopera_pct numeric` (0..1), `incidenza_sicurezza_pct numeric`, `note text`,
  `search tsvector` (descrizione+codice) con indice GIN.
- Indici: `(fonte_id, codice)`, `(fonte_id, capitolo_id)`.

### `manodopera_tariffa` (tabella creata in v1, popolata in v2)
- `id uuid pk`, `regione text`, `provincia text`, `anno int`, `qualifica text` (comune|qualificato|specializzato|quarto_livello),
  `costo_orario numeric`, `fonte text`, `created_at`.

**RLS:** `SELECT` su `prezzario_*` consentito a tutti gli autenticati **solo per `stato='pubblicato'`** (le bozze solo super-admin); `INSERT/UPDATE/DELETE` solo super-admin (`is_super_admin()`).

---

## Componenti / file

**Backend / dati**
- `supabase/migrations/<ts>_prezzari_regionali.sql` — le 4 tabelle + RLS + FTS (LOCALE, non applicata).
- `supabase/functions/prezzario-import/index.ts` — edge super-admin: riceve righe normalizzate + fonte, fa bulk insert idempotente.

**Lib (frontend, pure + testabili)**
- `src/lib/prezzario/tipi.ts` — tipi `PrezzarioFonte/Capitolo/Voce/ManodoperaTariffa` (hand-written, indipendenti dai tipi generati).
- `src/lib/prezzario/import.ts` — parser matrice → fonte+capitoli+voci, estende `prezziarioImport` con **gerarchia** (da colonna capitolo/codice padre) e **incidenza manodopera**. Puro, vitest.
- `src/lib/prezzario/adapters.ts` — registro preset colonne per regione (mappatura header→campo). Default = autodetect generico.
- `src/lib/prezzario/queries.ts` — react-query: lista fonti pubblicate, ricerca voci (FTS), capitoli di una fonte, adozione (copia in `rst_listino_voci`).

**UI**
- `src/pages/admin/PrezzariRegionali.tsx` — super-admin: upload → mappa colonne (preset regione) → anteprima → pubblica (versione/anno). Route + voce nav admin.
- Ristrutturazione wizard: blocco "Importa da prezzario regionale" → scegli regione/anno/capitoli → copia in `rst_listino_voci` con margine.
- Match computo: `match` cerca anche in `prezzario_voce` (FTS) oltre al listino azienda.

**Legale:** ogni voce adottata conserva il riferimento fonte ("Prezzario Regione X 20YY"); citazione nel PDF.

---

## Fuori scope v1 (→ v2)
- Estrazione AI da PDF per regioni senza Excel.
- Tabelle costo-orario manodopera (popolamento).
- Sync "aggiorna alla versione 20YY+1" delle voci già adottate.
- Caricamento effettivo dei dati delle 20 regioni (data-ops per-regione via UI).

## Guardrail
- Solo prezzari **regionali ufficiali** (pubblici) con attribuzione fonte+anno; **mai** aggregati commerciali (DEI, ecc.). Campo `licenza` + nota in UI super-admin.
- Vincolo di processo: tutto LOCALE finché l'utente non dice "pubblica" (niente push/deploy/apply migrazione).

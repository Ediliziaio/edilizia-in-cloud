# MP-COMP-02 — Aggiornamento normativo continuo (Gazzetta UE)

## 🎯 Obiettivo
Pipeline che monitora fonti normative ufficiali (italiane + UE) e aggiorna
automaticamente la KB del sistema AI quando ci sono cambiamenti di normativa
edilizia, fiscale o sicurezza.

## 📦 Stato finale
- **Stato**: ✅ COMPLETATO
- **Data chiusura**: 2026-05-09
- **Commit reference**:
  - `supabase/migrations/20260508250000_kb_multilang_and_external_sources.sql`
  - `supabase/migrations/20260508260000_kb_seed_external_sources.sql`
  - `supabase/migrations/20260509220000_kb_seed_external_sources_ue.sql`
  - `supabase/functions/kb-sync-external-sources/index.ts` (398 righe)

## ✅ Implementazione effettiva

### 1. Schema (migration 20260508250000)
- `ai_kb_external_sources` table con scrape strategies multiple
  (`http_regex`, `http_selector`, `http_json`, `rss`, `full_text`)
- VIEW `v_kb_external_sources_status` con `drift_severity` calcolata
- 4 RPC helper: `kb_external_sources_due`, `kb_external_source_apply_change`,
  `kb_external_source_mark_unchanged`, `kb_external_source_mark_error`
- pg_cron schedule daily 06:00 UTC chiama edge function

### 2. Seed fonti (migrations 20260508260000 + 20260509220000)
**Coverage finale: 10 fonti normative**

| Fonte | Categoria | Frequency |
|-------|-----------|-----------|
| Agenzia Entrate — Aliquote IVA | fiscale/iva | 168h |
| Agenzia Entrate — Codici Tributo F24 | fiscale/f24 | 168h |
| Inps — Contributi CCNL Edilizia | hr/ccnl_edilizia | 168h |
| Inail — Tariffe Premi Edilizia | sicurezza/inail | 720h |
| Gazzetta Ufficiale — Serie Generale RSS | normativa/gazzetta | 24h |
| **EUR-Lex — Atti UE Costruzioni** | normativa/ue/eur_lex | 72h |
| **Gazzetta UE — Serie L Legislazione** | normativa/ue/oj_l | 24h |
| **ANAC — Atti del Presidente** | normativa/anac | 168h |
| **UNI — News Costruzioni** | tecnica/uni | 168h |
| **ENEA — Detrazioni Ecobonus/Sismabonus** | fiscale/detrazioni | 168h |

### 3. Edge function `kb-sync-external-sources`
- 398 righe, gestisce 5 strategie di scraping
- SHA-256 dedup: se content invariato → mark_unchanged; se diverso → versiona
  doc vecchio (valid_until = now()), crea nuovo doc, triggera embedding async
  via `ai-brain-ingest`
- Auth: service_role via `x-cron-secret` (env `KB_CRON_SECRET`) o JWT super_admin
- Idempotente, supporta `dry_run` e `source_id` singolo

### 4. UI admin
- Tab `/admin/ai-config?tab=knowledge` → sub-tab "External Sources"
  mostra le 10 fonti con stato sync, drift severity, ultima esecuzione,
  bottone "Sync now" manuale per debug.

## 📋 Drift severity colori
- `critical` → 3+ errori consecutivi (probabile cambio layout sito sorgente)
- `warning` → ritardo 2x rispetto a frequency_hours
- `stale` → contenuto invariato da >365gg (sospetto: layout cambiato silently)
- `info` → mai syncato ancora
- `ok` → tutto fluido

Se la severity passa critical il super_admin riceve alert e deve aggiornare
`scrape_config` dalla UI (selettore HTML cambiato).

## 🔗 Riferimenti
Doc fonte: `EiC-Sistema-Masterprompt.md` / `EiC-Verticali-BrainAEDIX-PricingAI.md`

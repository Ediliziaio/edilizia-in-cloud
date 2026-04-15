# Dashboard Builder v1 — Roadmap & Tracker

Costruzione di un dashboard builder custom (tipo GoHighLevel) per l'area
azienda di Edilizia in Cloud. L'utente admin azienda potrà creare, modificare
e condividere dashboard personalizzate con widget configurabili.

## Stato corrente

**Sprint:** 0 — Preparazione
**Branch:** `feat/dashboard-builder-v1`
**Feature flag:** `dashboard_builder_v1` (non ancora creata, OFF per tutti)
**Rischio produzione:** ZERO (nessun cambio su `main`, UI attuale intatta)

## Principi

1. **Side-by-side**: la nuova dashboard nasce accanto alla vecchia. Feature flag per company. Rollout graduale.
2. **Data layer prima della UI**: motore dati + RPC sicure prima del builder visuale.
3. **Widget composabili, non SQL libera**: catalogo di metriche pre-approvate server-side, mai SQL dal frontend.
4. **Versioning dei layout**: ogni save = nuova versione. Rollback 1-click.
5. **Zero breaking**: nessuna riga del vecchio codice cancellata finché il 100% degli utenti non è sul nuovo sistema.

## Roadmap

### Sprint 0 — Preparazione (in corso)
- [x] 00 — Branch `feat/dashboard-builder-v1` creato
- [x] 01 — Spec catalogo metriche (20 metriche base con SQL template)
- [x] 02 — Spec schema DB (5 tabelle + RLS)
- [ ] 03 — Mock UI (dashboard renderer + builder) — opzionale, decidiamo se serve

### Sprint 1 — Data Layer
- [ ] 10 — Migration schema: `metric_catalog`, `dashboards`, `dashboard_versions`, `dashboard_user_prefs`, `company_features`
- [ ] 11 — RLS policies su tutte le tabelle
- [ ] 12 — Seed `company_features` con flag `dashboard_builder_v1 = false` per tutte le aziende
- [ ] 13 — RPC `get_metric(metric_id, filters, breakdown)` con validazione catalogo
- [ ] 14 — Seed 20 metriche base nel catalogo
- [ ] 15 — RPC `save_dashboard(layout)` con versioning automatico
- [ ] 16 — RPC `list_dashboards` + `get_dashboard(id)`
- [ ] 17 — Test sicurezza: cross-company access bloccato
- [ ] 18 — RPC `resolve_dashboard(id)` — risolve tutti i widget in una chiamata (performance)

### Sprint 2 — Renderer
- [ ] 20 — Tipi TypeScript generati da Supabase
- [ ] 21 — Hook `useDashboard(id)` + `useMetric(spec)`
- [ ] 22 — Componente `<DashboardRenderer />` (read-only)
- [ ] 23 — 8 widget base: KPI, Bar, Line, Pie, Table, List, Progress, Gauge
- [ ] 24 — Formula engine con `expr-eval` (parser sicuro)
- [ ] 25 — Global filter bar (periodo, stato, cliente)
- [ ] 26 — Route nascosta `/azienda/dashboard-beta` gated da feature flag
- [ ] 27 — Dashboard "seed" che replica la War Room attuale in JSON

### Sprint 3 — Builder UI
- [ ] 30 — Modalità "Modifica" con `react-grid-layout`
- [ ] 31 — Palette widget (drag & drop)
- [ ] 32 — Pannello config widget (metrica, filtri, color rules, formule)
- [ ] 33 — Autosave draft + salvataggio esplicito versionato
- [ ] 34 — Lista versioni + rollback 1-click
- [ ] 35 — Duplica/elimina dashboard
- [ ] 36 — Undo/redo
- [ ] 37 — Template pre-configurati: CEO, Operativo, Finanza

### Sprint 4 — Rollout
- [ ] 40 — Feature flag ON per Demo Azienda (test interno 1 settimana)
- [ ] 41 — Telemetria uso widget/metriche
- [ ] 42 — Feature flag ON per 5 aziende pilota opt-in
- [ ] 43 — Help inline + video 2 min
- [ ] 44 — Feature flag ON per tutti
- [ ] 45 — Vecchia `/azienda` diventa `/azienda/classic` (link in settings)
- [ ] 46 — Dopo 30gg OK: deprecate old dashboard

## Vincoli invariabili

- ✅ La dashboard attuale su `/azienda` resta funzionante fino a Sprint 4 completo
- ✅ Nessuna modifica a `main` fino a Sprint 2 verde
- ✅ Ogni step: branch commit con build+tsc verdi
- ✅ Ogni SQL: migration versionata in `supabase/migrations/`
- ✅ Feature flag obbligatorio per attivazione nuova dashboard
- ✅ Catalogo metriche = unica sorgente dati, no SQL libera dal client

## Accessi di test

- URL prod: https://app.ediliziaincloud.com
- Demo: `demo@azienda.srl` / `Demo2026Azienda`
- Supabase project: `rsbrguhkodgnqfomrevo`
- Migration application: **manuale via Supabase SQL editor** (MCP non ha permessi su questo progetto)

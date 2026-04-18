# Status — Listini Serramenti Avanzati

Feature modulare per gestire il listino prezzi del vertical serramentista.
**Tutto opt-in** dietro feature flag `listini_serramenti_avanzati`.
**Nessun cambio** a funzionalità esistenti non-serramenti.

## Formula prezzo (fonte di verità)

```
acquisto    = listino × (1 − sconto_fornitore)       // es. 0.55 → ×0.45
vendita     = acquisto × (1 + ricarico_azienda)       // es. 1.00 → ×2.00
             × (1 + Σ maggiorazioni_varianti)         // colore, vetro, telaio
             + Σ maggiorazioni_fisse                  // sovrapprezzi fissi
totale      = vendita + manodopera                    // posa tariffa separata
margine %   = (vendita − acquisto) / vendita × 100    // NO manodopera
```

Tutto in `src/features/serramenti-listini/utils/pricing.ts` — unit tested
in `src/test/logic/serramentiPricing.test.ts`.

## Progress 11 step

| Step | Descrizione | Stato | Commit |
|------|-------------|-------|--------|
| 0 | Setup feature folder + flag + formula prezzo + test | ✅ | 01c88425 |
| 1 | Seed catalogo 20 tipologie + edge fn installa | ✅ | 31009a88 |
| 2 | Modello fornitori + linee prodotto | ✅ | 5648952e |
| 3 | Extension listino_griglia axis_config + supplier | — | — |
| 4 | Editor matrice visuale Excel-like | — | — |
| 5 | Import Excel/CSV bulk | — | — |
| 6 | Sconto + ricarico nel wizard preventivo | — | — |
| 7 | Seed assi colore + vetro | — | — |
| 8 | Multi-fascia per famiglia | — | — |
| 9 | Import PDF via AI Vision | — | — |
| 10 | Escalator temporale | — | — |
| 11 | Smoke test + STATUS final | — | — |

## STEP 1 — dettaglio deliverable

Consegnati:

- `src/features/serramenti-listini/data/tipologie-catalogo.ts`
  — 20 tipologie con slug, categoria, ante, SVG originale (ISO 10077)
- `src/features/serramenti-listini/hooks/useInstallaCatalogoSerramenti.ts`
  — wrapper TanStack Mutation + toast + query invalidation
- `src/features/serramenti-listini/components/InstallaCatalogoButton.tsx`
  — AlertDialog di conferma con conteggio per categoria
- `src/features/serramenti-listini/index.ts`
  — barrel export pubblico
- `supabase/functions/serramenti-installa-catalogo/index.ts`
  — edge function idempotente (skip per company_id+nome) con verifica
    accesso standard (super_admin / profiles / MCA / impersonation)

Comportamento: installa le 20 famiglie in `article_families` con
`vertical='serramentista'` e marcate da `custom_field_values.catalogo_base=true`
+ `slug` per futuri lookup. Prezzi esplicitamente a 0 (li compilerà
l'azienda in STEP 4). Icone SVG NON salvate in DB — lookup via slug
nel catalogo client. Idempotente: ri-chiamate non duplicano.

Integrazione UI: nessuna, ancora. Il bottone è pronto per essere
montato nelle pagine admin/listini in STEP 4.

## STEP 2 — dettaglio deliverable

Consegnati:

- `supabase/migrations/20260917000014_serramenti_14_supplier_catalogs.sql`
  — 2 tabelle (`supplier_catalogs`, `supplier_product_lines`), indici,
    RLS (select/cud/super_admin), trigger updated_at, CHECK materiale,
    UNIQUE(company_id, nome) e UNIQUE(supplier_catalog_id, nome) per dedup,
    FK manodopera_tariffa_id → tariffe_aziendali, tutto idempotente
- `src/integrations/supabase/types.ts`
  — aggiunte manualmente `supplier_catalogs` e `supplier_product_lines`
    con Row/Insert/Update/Relationships (in alphabetical order prima di `suppliers`)
- `src/features/serramenti-listini/hooks/useSupplierCatalogs.ts`
  — TanStack Query: list + create/update/remove (soft-delete via attivo=false)
- `src/features/serramenti-listini/hooks/useSupplierProductLines.ts`
  — TanStack Query: list (by company o by catalog) + create/update/remove
- `src/features/serramenti-listini/components/SupplierCatalogFormDialog.tsx`
  — shadcn Dialog con validazione client (nome ≥ 2, sconto 0–100)
- `src/features/serramenti-listini/components/SupplierProductLineFormDialog.tsx`
  — shadcn Dialog con Select materiale + validazione UUID tariffa opzionale
- `src/features/serramenti-listini/components/FornitoriManager.tsx`
  — UI unificata: lista fornitori selezionabile → linee prodotto del selezionato,
    Empty/Error/Loading state, AlertDialog soft-delete con conferma
- `src/features/serramenti-listini/pages/ListiniFornitori.tsx`
  — pagina container gated dalla feature `listini_serramenti_avanzati`
- `src/routes/companyRoutes.tsx`
  — route `/azienda/impostazioni/listini-serramenti/fornitori` dietro FeatureRoute
- `src/lib/queryKeys.ts`
  — queryKeys.supplierCatalogs e queryKeys.supplierProductLines
- `src/features/serramenti-listini/index.ts`
  — esportati nuovi hook/component/page

Comportamento: la pagina espone CRUD su fornitori + linee. Validazione
percentuali con UI in %, convertite a 0..1 prima del submit.
Nessuna integrazione col wizard preventivo in STEP 2 — wiring in STEP 6.

⚠ Migration NON applicata automaticamente (MCP Supabase punta ad altro
progetto). Da applicare via CLI supabase dell'utente:
`supabase db push` o pipeline di deploy standard.

## Vincoli architettonici

- Codice in `src/features/serramenti-listini/` (isolato, nessun overlap)
- Backend in `supabase/functions/serramenti-*` + migrazioni `20260917000013+`
- Tutte le migrazioni **additive** (ADD COLUMN, CREATE TABLE, mai DROP breaking)
- Ogni step: tsc + vitest + build + eslint verdi prima del push
- Integrazione unica: **wizard preventivo serramentista** (surgical edit)
- Disattivabile con 1 bit: feature flag `listini_serramenti_avanzati=false`

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
| 0 | Setup feature folder + flag + formula prezzo + test | ⏳ | — |
| 1 | Seed catalogo 20 tipologie + edge fn installa | — | — |
| 2 | Modello fornitori + linee prodotto | — | — |
| 3 | Extension listino_griglia axis_config + supplier | — | — |
| 4 | Editor matrice visuale Excel-like | — | — |
| 5 | Import Excel/CSV bulk | — | — |
| 6 | Sconto + ricarico nel wizard preventivo | — | — |
| 7 | Seed assi colore + vetro | — | — |
| 8 | Multi-fascia per famiglia | — | — |
| 9 | Import PDF via AI Vision | — | — |
| 10 | Escalator temporale | — | — |
| 11 | Smoke test + STATUS final | — | — |

## Vincoli architettonici

- Codice in `src/features/serramenti-listini/` (isolato, nessun overlap)
- Backend in `supabase/functions/serramenti-*` + migrazioni `20260917000013+`
- Tutte le migrazioni **additive** (ADD COLUMN, CREATE TABLE, mai DROP breaking)
- Ogni step: tsc + vitest + build + eslint verdi prima del push
- Integrazione unica: **wizard preventivo serramentista** (surgical edit)
- Disattivabile con 1 bit: feature flag `listini_serramenti_avanzati=false`

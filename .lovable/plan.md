

# Fix: Dashboard RPC `row_to_jsonb` Error

## Problema
La funzione `get_dashboard_kpis` usa `row_to_jsonb()` che non esiste in PostgreSQL. La funzione corretta e' `to_jsonb()`.

## Soluzione
Creare una nuova migration che fa `CREATE OR REPLACE FUNCTION` della stessa funzione, sostituendo tutte le occorrenze di `row_to_jsonb(sub)` con `to_jsonb(sub)` alle righe 90, 230, 249, 260 della funzione.

## File da modificare
| File | Modifica |
|------|----------|
| Nuova Migration SQL | `CREATE OR REPLACE` con `to_jsonb()` al posto di `row_to_jsonb()` |


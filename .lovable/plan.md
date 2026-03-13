

## Analisi: Bug Report INT-01→05 vs. Codice Reale

Il bug report analizza i **prompt di specifica** (documenti di design), NON il codice effettivamente implementato. Molti bug citati non esistono nel codebase attuale perche l'implementazione ha gia deviato dalle spec. Ecco l'analisi filtrata.

---

### Bug che NON esistono nel codice attuale (gia risolti o mai introdotti)

| Bug ID | Motivo |
|--------|--------|
| BUG-C1 | `incassi_fattura` e `conti_bancari` non esistono nel codebase. Non sono mai state create. Il sistema usa `movimenti_cassa_native` e `prima_nota_entries`. |
| BUG-C2 | `usePianoConti` non esiste nel codebase. Non c'e nessun hook ricorsivo. |
| BUG-C4 | `prima_nota_scritture` / `numero_scrittura` non esistono. Il sistema usa `prima_nota_entries` con schema semplice (no partita doppia). |
| BUG-H1 | `prima_nota_righe` / CHECK(true) non esistono. Il sistema non implementa la partita doppia. |
| BUG-H2 | `movimenti_cassa_native` esiste gia (confermato da types.ts e hook). Nessun ALTER TABLE necessario. |
| BUG-H3 | `cashflow_previsionale` e `saldo_iniziale` non esistono nel codebase. |
| BUG-H4 | Il codice attuale NON usa Realtime subscriptions nel cruscotto. `useDashboardBillingKPI` usa solo `staleTime + refetchOnWindowFocus`. Nessun `queryClient` mancante. |
| BUG-M1 | `useContiBancari` non e referenziato da nessun componente attuale. |
| BUG-M2 | `BillingKPIWidget` usa `useNavigate()` per navigazione, non `setActiveTab`. Funziona correttamente. |
| BUG-M3 | `formatCurrencyIT` non e usato. Il sistema usa `formatCurrency` e `formatCurrencyCompact` da `src/lib/formatters.ts`. `StatoBadge` esiste gia in `src/components/fatturazione/StatoBadge.tsx`. `EmptyStateGuide` esiste in `src/components/cruscotto/EmptyStateGuide.tsx`. |
| BUG-M4 | Il limit su `useMovimentiCassa` e `.limit(500)`, non 200. Accettabile per ora. |
| BUG-M6 | Le RLS usano `get_my_company_id()` (funzione SECURITY DEFINER), NON query diretta su `user_profiles`. Funzionano correttamente. |
| BUG-M7 | `create_partita_aperta_on_fattura` non esiste. Le partite sono gestite tramite la view `fattura_pagamento_stato`. |
| BUG-M8 | `useBillingMode` esiste ed e funzionante in `src/contexts/BillingModeContext`. |
| BUG-L1 | Non ci sono Realtime subscriptions nel cruscotto. Nessun memory leak. |
| BUG-L3 | `PianoContiSelector` non esiste nel codebase. |
| BUG-L5 | Threshold Jaro-Winkler non presente nel codebase attuale. |

---

### Bug REALI trovati nel codice attuale (3 veri bug)

**BUG REALE 1 — CRITICO: Trigger `fn_prima_nota_on_incasso` referenzia tabella inesistente**
- File: `supabase/migrations/20260313072345_fbb3592b-6780-409d-b788-b33754ea19f4.sql`
- Il trigger INSERT/DELETE scrive su `prima_nota` (righe 18-27, 32-33), ma la tabella si chiama `prima_nota_entries`.
- Colonne nel trigger (`data`, `descrizione`, `importo`, `direction`, `categoria`, `documento_id`, `source_table`, `source_id`) NON corrispondono allo schema reale (`entry_date`, `description`, `amount`, `direction`, `category`, `invoice_id`, `auto_source`, etc.).
- Il trigger fallira silenziosamente ad ogni INSERT su `movimenti_cassa_native`.
- **Fix**: Riscrivere il trigger per usare `prima_nota_entries` con le colonne corrette.

**BUG REALE 2 — MINORE: Duplicato `.neq("stato", "annullata")` su riga 143-144**
- File: `src/hooks/billing/useDashboardBillingKPI.ts`
- Riga 143 e 144 sono identiche. Innocuo ma da pulire.
- **Fix**: Rimuovere la riga duplicata.

**BUG REALE 3 — MINORE: Proforma count include stato non pertinenti**
- File: `src/hooks/billing/useDashboardBillingKPI.ts` riga 82
- `d.tipo === "proforma" && d.stato !== "annullata"` conta anche proforma gia convertiti in fattura (stato `convertito` o `accettata`).
- Dovrebbe contare solo proforma con stato `bozza` o `inviata` (realmente "aperti").
- **Fix**: Filtrare per stati specifici: `["bozza", "inviata"].includes(d.stato)`.

**BUG dal report L4 — gia risolto**: `BillingKPIWidget` ha gia un loading skeleton (righe 32-42).

---

### Piano di fix

**1. Migration: Fix trigger `fn_prima_nota_on_incasso`**

Nuova migration SQL che ricrea la funzione usando la tabella e le colonne corrette:
- Tabella: `prima_nota_entries` (non `prima_nota`)
- Colonne INSERT: `company_id`, `direction`, `category`, `description`, `amount`, `entry_date`, `invoice_id`, `is_auto`, `auto_source`
- DELETE: `WHERE auto_source = 'incasso_fattura' AND invoice_id = OLD.documento_id` (o via un campo di tracking)

**2. Hook: Fix duplicato e proforma count**

File `src/hooks/billing/useDashboardBillingKPI.ts`:
- Rimuovere `.neq("stato", "annullata")` duplicato (riga 144)
- Cambiare riga 82: `d.tipo === "proforma" && ["bozza", "inviata"].includes(d.stato)`

---

### File da modificare

| File | Modifica |
|---|---|
| Nuova migration SQL | Fix trigger `fn_prima_nota_on_incasso` → usa `prima_nota_entries` con schema corretto |
| `src/hooks/billing/useDashboardBillingKPI.ts` | Rimuovere `.neq` duplicato + fix proforma count |


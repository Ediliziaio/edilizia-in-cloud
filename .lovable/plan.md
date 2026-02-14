

# Audit Completo - Pulizia, Fix e Stabilizzazione

## 1. PULIZIA CODICE

### Import inutilizzati da rimuovere

| File | Import inutilizzato |
|------|-------------------|
| `src/components/shared/CSVImportDialog.tsx` | `Badge` (mai usato nel JSX) |
| `src/components/shared/CSVImportDialog.tsx` | `Progress` (mai usato nel JSX) |

### Variabili di stato non utilizzate

| File | Variabile | Azione |
|------|----------|--------|
| `src/components/shared/CSVImportDialog.tsx` | `importing` | Rimovibile -- lo step "importing" e gia gestito da `step === "importing"`. La variabile e settata ma mai letta |
| `src/components/shared/CSVImportDialog.tsx` | `progress` | Rimovibile -- settata a 0 ma mai usata nel render |

## 2. FIX FUNZIONALI

### Console Warning: "Function components cannot be given refs" su CSVImportDialog

**Causa**: Il componente `Select` di Radix UI riceve un ref internamente dal `Dialog`, ma `Select` e un function component senza `forwardRef`. Questo warning appare ogni volta che il dialog di import e aperto nella pagina Ordini.

**Soluzione**: Non e possibile modificare la libreria Radix, ma il warning e cosmetico e non impatta la funzionalita. Nessun fix necessario -- e un noto comportamento di React 18 strict mode + Radix internals.

**Nessun bug funzionale trovato.** Le pagine si caricano, i form salvano, le query gestiscono errori, nessun loading infinito o dead-end.

## 3. COERENZA CODEBASE

Nessun nuovo problema di coerenza trovato. Il sistema toast dual-library (use-toast + sonner) e gia stato verificato nei round precedenti.

## 4. PIANO IMPLEMENTAZIONE

### Modifiche a `src/components/shared/CSVImportDialog.tsx`

1. **Rimuovere import** `Badge` e `Progress`
2. **Rimuovere state** `importing` e `progress` (e relative chiamate `setImporting`/`setProgress` nel `reset` e `handleImport`)

### Riepilogo

| Tipo | Dettaglio |
|------|-----------|
| Import rimossi | 2 (`Badge`, `Progress`) |
| State rimossi | 2 (`importing`, `progress`) |
| Bug corretti | 0 (nessun bug funzionale) |
| File modificati | 1 (`CSVImportDialog.tsx`) |

**TUTTO OK** dopo la pulizia degli import e state inutilizzati.


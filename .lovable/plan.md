

# Audit Completo — Installments Dinamiche: Stabilità e Integrazione

## Risultato dell'analisi

Dopo aver analizzato in dettaglio tutti i file coinvolti (FinancialSummary, CreateOrder, EditOrder, OrderDetail, CustomerOrderDetail, CustomerFinancialSummary, orderUtils, useOrderDraft, useCashFlowData, useCruscottoData), il sistema risulta **stabile e correttamente integrato**.

## Verifiche di integrazione completate

| Modulo | Stato | Note |
|--------|-------|------|
| Dashboard / Cruscotto | OK | `useCruscottoData` legge colonne legacy, sincronizzate dal trigger |
| Previsionale di Cassa | OK | `useCashFlowData` legge colonne legacy, sincronizzate dal trigger |
| Creazione Ordine | OK | Invia installments via `create_order_atomic` RPC |
| Modifica Ordine | OK | Carica da `order_installments` con fallback legacy |
| Dettaglio Ordine | OK | Read-only con toggle pagamento funzionante |
| Vista Cliente | OK | `CustomerOrderDetail` + `CustomerFinancialSummary` usano installments |
| Draft/Bozza | OK | Salva e ripristina array installments correttamente |
| Import CSV Ordini | OK | Usa colonne legacy direttamente (compatibile) |

## Elementi da pulire

### 1. Legacy fields in `useOrderDraft.ts` (righe 33-48)
I campi `depositAmount`, `deposit2Amount`, `financingAmount`, `depositPaid`, ecc. sono dichiarati come opzionali ma **mai scritti** dal nuovo codice. Servono solo per leggere vecchie bozze salvate in localStorage. Possono essere rimossi in sicurezza — eventuali bozze legacy verranno semplicemente ignorate (il fallback `createDefaultInstallments` genera valori di default).

**Fix**: Rimuovere i 16 campi legacy dall'interfaccia `OrderDraftData`.

### 2. Tipo `as any` per queries `order_installments`
In 4 file (`EditOrder`, `OrderDetail`, `CustomerOrderDetail`, `orderUtils`) la tabella `order_installments` è referenziata con `as any` perché i tipi autogenerati non la includono ancora. Questo è un compromesso tecnico accettabile — i tipi si aggiorneranno automaticamente al prossimo sync. Non è un bug ma un debito tecnico minore.

### 3. Nessun bug funzionale trovato
- I fix precedenti (forwardRef, rawAmountInputs, calcolo morto) sono già applicati
- La console è pulita (verificata)
- Le integrazioni con i moduli finanziari sono garantite dal trigger DB
- Il fallback legacy per ordini esistenti funziona correttamente

## Piano di intervento

### File: `src/hooks/useOrderDraft.ts`
- Rimuovere i 16 campi legacy dall'interfaccia `OrderDraftData` (righe 33-48)

### Nessuna altra modifica necessaria
L'implementazione è completa e stabile. I moduli finanziari (Previsionale, Cruscotto, Marginalità) continuano a funzionare senza modifiche grazie al trigger `sync_installments_to_order_columns`.

## Conferma finale

- Smoke test creazione ordine: struttura completa e funzionante
- Integrazione dashboard/previsionale: compatibilità legacy confermata
- Console: pulita, nessun errore
- UX: selettore rate fluido, balance auto-calcolato, draft persistente


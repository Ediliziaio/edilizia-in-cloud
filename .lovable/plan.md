

# Verifica e Pulizia: Codice Morto e Funzionalita

## Stato Attuale

Dopo la precedente fase di refactoring, il codebase e gia in buono stato. Tuttavia restano **2 copie duplicate** dell'interface `OrderWithDetails` che non sono state migrate al file centralizzato.

## Problemi Trovati

### 1. Interface `OrderWithDetails` ancora duplicata in 2 file

| File | Righe | Problema |
|---|---|---|
| `src/components/orders/OrdersPipelineColumn.tsx` | 6-30 | Interface locale identica a `orderUtils.ts` |
| `src/components/orders/OrdersPipelineView.tsx` | 16-40 | Interface locale identica a `orderUtils.ts` |

Entrambi i file definiscono la stessa interface localmente invece di importarla da `@/lib/orderUtils`.

### 2. Interface `OrderStatus` duplicata

Presente sia in `OrdersPipelineColumn.tsx` (righe 32-37) che in `OrdersPipelineView.tsx` (righe 42-47). Identica in entrambi. Puo essere estratta in `orderUtils.ts`.

## Cosa e gia OK (verificato)

- `orderUtils.ts`: funzioni centralizzate, nessuna duplicazione residua
- `OrdersTable.tsx`: importa correttamente da `orderUtils`, nessun codice morto
- `OrdersPipelineCard.tsx`: importa correttamente da `orderUtils`
- `OrdersList.tsx`: importa correttamente, nessuna funzione locale duplicata
- `FinancialSummary.tsx`: `forwardRef` applicato correttamente a `DatePickerField` e `PaymentStatusRow`
- `OrdersStatsCards.tsx`: pulito, nessun codice morto
- Margine con percentuale: funzionante

## Interventi da Fare

### File: `src/lib/orderUtils.ts`
- Aggiungere export dell'interface `OrderStatus` (id, name, color, position)

### File: `src/components/orders/OrdersPipelineColumn.tsx`
- Rimuovere interface locale `OrderWithDetails` (righe 6-30)
- Rimuovere interface locale `OrderStatus` (righe 32-37)
- Importare entrambe da `@/lib/orderUtils`

### File: `src/components/orders/OrdersPipelineView.tsx`
- Rimuovere interface locale `OrderWithDetails` (righe 16-40)
- Rimuovere interface locale `OrderStatus` (righe 42-47)
- Importare entrambe da `@/lib/orderUtils`

## Riepilogo

| Cosa | Azione |
|---|---|
| `OrderWithDetails` duplicata x2 | Rimuovere e importare da orderUtils |
| `OrderStatus` duplicata x2 | Estrarre in orderUtils e importare |
| Codice morto | Nessun altro trovato |
| Bug funzionali | Nessuno rilevato |
| Console warning | Gia risolti nella sessione precedente |

## Vincolo
Nessun cambiamento funzionale. Solo eliminazione duplicazioni residue.

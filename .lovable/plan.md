

# SO2 — Sostituzione completa di useSalesOS.ts

## Situazione attuale
Il file `src/hooks/useSalesOS.ts` esiste gia con una versione precedente. Il prompt SO2 chiede di sovrascriverlo con il contenuto esatto fornito.

## Problema critico: import path
Il contenuto SO2 importa da `@/lib/leadScoring`, ma il file esiste in `@/utils/leadScoring.ts`. Non esiste `src/lib/leadScoring.ts`.

**Due opzioni:**
1. Creare `src/lib/leadScoring.ts` come re-export di `@/utils/leadScoring`
2. Correggere l'import nel file a `@/utils/leadScoring` (devia dal "contenuto esatto")

Procedo con l'opzione 1 (re-export) cosi il contenuto del hook resta esattamente come richiesto e non si rompono gli import esistenti in `MarketingContactDetail.tsx`.

## Modifiche principali rispetto alla versione attuale
- Aggiunto `useAuth` import e hook `useSalesOSCompanyId`
- Tipo `SalesPerformance` rinominato in `SellerPerformance` con campo `total_contacts` aggiunto a `ConversionBySource`
- Nuovo hook `useSalesTargets` per target mensili
- Nuova mutation `useUpsertSalesTargetMutation`
- `useSellerPerformance` aggiornato per usare colonne `assigned_to`/`target_amount` (schema SO1)
- `useTopLeads` usa join `!inner` con `marketing_opportunities`

## Piano
1. Creare `src/lib/leadScoring.ts` — semplice re-export da `@/utils/leadScoring`
2. Sovrascrivere `src/hooks/useSalesOS.ts` con il contenuto esatto del prompt SO2

Nessun altro file viene toccato.


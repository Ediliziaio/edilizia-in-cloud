

# SO5 — leadScoring.ts

## Analisi

Il prompt SO5 chiede di creare `src/lib/leadScoring.ts` con il motore di Lead Scoring. Confrontando il contenuto SO5 con il file esistente `src/utils/leadScoring.ts`, la logica è **identica**: stesse interfacce, stessi punteggi, stesse funzioni `calculateLeadScore` e `getIcpTier`.

Il file `src/lib/leadScoring.ts` esiste già come re-export shim (creato in SO2):
```ts
export { calculateLeadScore, getIcpTier } from '@/utils/leadScoring';
export type { LeadScoringInput } from '@/utils/leadScoring';
```

**Due opzioni:**

1. **Sovrascrivere `src/lib/leadScoring.ts`** con il contenuto completo SO5, duplicando la logica già presente in `src/utils/leadScoring.ts`. Rischio: due copie divergenti dello stesso codice.

2. **Sovrascrivere `src/utils/leadScoring.ts`** con il contenuto SO5 (formattazione aggiornata, commenti migliorati) e mantenere `src/lib/leadScoring.ts` come re-export. Nessuna duplicazione, tutti gli import funzionano.

**Piano scelto: opzione 2** — Sovrascrivere `src/utils/leadScoring.ts` con il contenuto esatto SO5 (righe 10-129 del prompt). Il re-export in `src/lib/leadScoring.ts` continua a funzionare. Nessun altro file toccato.

In pratica la logica è già identica, si tratta solo di allineare la formattazione/commenti al template SO5.




# Pulizia finale — Tipo legacy in CollectedTab

## Stato attuale

Dopo gli interventi precedenti, l'intero sistema è stabile e correttamente migrato. L'unico residuo trovato è:

### BUG: Tipo hardcoded in `CollectedTab.tsx` (riga 17)
L'interfaccia `CollectedPayment` usa ancora `type: "Acconto 1" | "Acconto 2" | "Saldo" | "Finanziamento"` — un tipo union legacy che non corrisponde più alle label dinamiche provenienti da `order_installments`. Le label possono essere qualsiasi stringa (es. "Acconto 3", "Rata 5", ecc.).

Questo non causa un errore runtime perché TypeScript non fa check a runtime, ma il cast implicito a riga 51 (`type: inst.label || inst.type || "Rata"`) assegna una stringa generica a un tipo union, il che è una violazione del contratto di tipo.

**Fix**: Cambiare `type` da union a `string` nell'interfaccia `CollectedPayment`, allineandolo a `ExpectedPayment.type` che è già `string`.

## Verifiche completate

| Area | Risultato |
|------|-----------|
| `useOrderDraft.ts` | Già pulito — nessun campo legacy |
| `useCashFlowData.ts` | Già migrato a `order_installments` |
| `useCruscottoData.ts` | Già migrato a `order_installments` |
| `forecastTypes.ts` | `ExpectedPayment.type` già `string` |
| `CollectedTab.tsx` | **Unico fix necessario** — tipo union legacy |
| Console | Pulita, nessun errore |
| Integrazioni | Dashboard, Previsionale, Cruscotto tutti funzionanti |

## Modifica

### File: `src/components/forecast/CollectedTab.tsx`
- Riga 17: cambiare `type: "Acconto 1" | "Acconto 2" | "Saldo" | "Finanziamento"` → `type: string`

**TUTTO OK** — Questo è l'ultimo residuo legacy. Nessun'altra modifica necessaria.




# Pulizia e Stabilizzazione - Fix Console Warning

## Stato attuale

Il codebase e stato analizzato in dettaglio. Il sistema Task Management (LinkedTasks, TaskDialog, TaskStatCards) e gia completamente integrato e sincronizzato. La pulizia degli import inutilizzati in `LinkedTasks.tsx` e stata gia effettuata nell'ultimo intervento.

## Bug identificato: Warning `forwardRef` in console

La console mostra due warning attivi:

```
Warning: Function components cannot be given refs.
Check the render method of `App` -> TicketsList
Check the render method of `TicketsList` -> Select
```

Questo accade perche React Router internamente tenta di passare un `ref` al componente `TicketsList`, che e una funzione semplice senza `forwardRef`. Il warning si propaga poi al `Select` di Radix all'interno del componente.

### Fix

| File | Modifica |
|------|----------|
| `src/pages/azienda/TicketsList.tsx` | Wrappare il componente con `React.forwardRef` per eliminare i warning |

### Dettaglio tecnico

Trasformare:
```typescript
export default function TicketsList() {
  // ...
}
```

In:
```typescript
const TicketsList = React.forwardRef<HTMLDivElement>((_, ref) => {
  // ... (stesso contenuto, con ref sul div root)
});
TicketsList.displayName = "TicketsList";
export default TicketsList;
```

## Verifica finale

- **LinkedTasks.tsx**: gia pulito (import `toast` e variabile `user` rimossi)
- **TaskDialog.tsx**: nessun import inutilizzato, logica corretta
- **Tasks.tsx**: nessun problema identificato
- **WarehouseStockTab.tsx**: tutti gli import usati (`user` usato in `performed_by`)
- **CompanyCostsManager.tsx**: tutti gli import usati (Link, Building2, Package, TrendingUp, CheckSquare, LinkedTasks)
- **Sincronizzazione task**: query key `["tasks"]` condivisa e funzionante
- **Console**: dopo il fix, zero warning/errori

## Riepilogo intervento

| Categoria | Dettaglio |
|-----------|-----------|
| Bug fix | Warning `forwardRef` su TicketsList (console pulita) |
| Codice rimosso | Nessuno (gia pulito nell'intervento precedente) |
| Miglioramenti UX | Console senza warning = sviluppo piu pulito |
| Test finale | TUTTO OK dopo applicazione fix |




# Fix: Dialog non scrollabile — bottone Crea irraggiungibile

## Problema
Il `DialogContent` usa `fixed` + `translate-y(-50%)` centrato verticalmente, ma senza `max-height` né `overflow-y: auto`. Quando il contenuto del form è più alto del viewport, il bottone "Crea" finisce fuori schermo e non è raggiungibile.

## Soluzione

### File: `src/components/forecast/CostFormDialog.tsx`
Aggiungere `max-h-[85vh] overflow-y-auto` al `DialogContent` per rendere il dialog scrollabile:

```tsx
<DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
```

Questo è un fix di una riga che limita l'altezza del dialog all'85% del viewport e abilita lo scroll interno.


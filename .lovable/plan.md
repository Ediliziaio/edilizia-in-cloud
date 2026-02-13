

# Piano: Stabilizzazione e Pulizia Progetto

## Panoramica

Intervento mirato su bug reali, codice morto e pulizia, senza alterare il comportamento funzionale.

---

## 1. Pulizia Codice

### File da eliminare
| File | Motivo |
|------|--------|
| `src/App.css` | Boilerplate Vite mai importato da nessun file. Codice morto. |

### Import e codice inutile da rimuovere
| File | Elemento | Motivo |
|------|----------|--------|
| `src/pages/azienda/OrdersList.tsx` | Righe vuote residue (righe 346-347, 428-429) | Righe bianche lasciate dalla rimozione del grafico |

---

## 2. Fix Bug e Warning Console

### Bug 1: Warning "Function components cannot be given refs" su DialogFooter

**Causa**: `DialogFooter` in `src/components/ui/dialog.tsx` e una semplice funzione senza `forwardRef`. Quando Radix UI internamente prova a passare un ref (ad esempio dentro form o DialogContent), genera il warning. Visibile su `EmployeeDialog` e potenzialmente su tutti i dialog che usano `DialogFooter`.

**Fix**: Wrappare `DialogFooter` (e `DialogHeader` per coerenza) con `React.forwardRef` in `src/components/ui/dialog.tsx`.

```text
// Da:
const DialogFooter = ({ className, ...props }) => (...)

// A:
const DialogFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn(...)} {...props} />
  )
);
DialogFooter.displayName = "DialogFooter";
```

Stesso trattamento per `DialogHeader`.

---

## 3. Miglioramenti UX

### UX 1: Righe vuote residue nella pagina Ordini
Pulizia delle righe vuote lasciate dalla rimozione del grafico per rendere il codice piu leggibile e mantenibile.

---

## Riepilogo File da Modificare

| File | Tipo | Descrizione |
|------|------|-------------|
| `src/components/ui/dialog.tsx` | Modifica | Wrappare DialogFooter e DialogHeader con forwardRef |
| `src/pages/azienda/OrdersList.tsx` | Modifica | Rimuovere righe vuote residue |
| `src/App.css` | Eliminare | File boilerplate Vite mai usato |

---

## Dettagli Tecnici

### dialog.tsx - DialogHeader e DialogFooter con forwardRef

```text
const DialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props}
  />
));
DialogHeader.displayName = "DialogHeader";

const DialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
));
DialogFooter.displayName = "DialogFooter";
```

### Verifiche Post-Modifica

- Console priva del warning "Function components cannot be given refs" per DialogFooter
- Tutti i dialog funzionanti (EmployeeDialog, OrderItemsList, StaffUserDialog, ecc.)
- Nessuna regressione funzionale
- File App.css rimosso senza impatto (mai importato)




## Analisi Bug Sidebar

Ho analizzato il codice, lo screenshot e la session replay. Ecco i bug identificati:

### Bug 1 — Doppio highlight (item attivo duplicato)
**Problema**: Quando sei su `/azienda/documenti/incassi`, sia "Documenti Fiscali" (`/azienda/documenti`) che "Registro Incassi" (`/azienda/documenti/incassi`) risultano entrambi evidenziati in blu. La funzione `isActive` usa `pathname.startsWith(url + "/")`, quindi `/azienda/documenti` matcha qualsiasi sotto-rotta.

**Fix in `CompanyLayout.tsx`**: Nella funzione `isActive` di `MacroAreaCollapsible`, aggiungere una logica che verifichi se un URL è "prefix" di un altro URL nella stessa area. Se un item è il padre di un altro item attivo, non deve essere evidenziato (solo l'item più specifico deve essere attivo).

```typescript
const isActive = (url: string) => {
  if (url === "/azienda") return pathname === "/azienda";
  if (url === "/azienda/marketing") return pathname === "/azienda/marketing";
  if (pathname === url) return true;
  if (pathname.startsWith(url + "/")) {
    // Check if a more specific item exists in the same area
    const hasMoreSpecific = visibleItems.some(
      other => other.url !== url && other.url.startsWith(url + "/") &&
        (pathname === other.url || pathname.startsWith(other.url + "/"))
    );
    return !hasMoreSpecific;
  }
  return false;
};
```

### Bug 2 — Chevron non ruota
**Problema**: Il `CollapsibleTrigger` ha la classe `group`, e il `ChevronDown` usa `group-data-[state=open]:rotate-180`. Tuttavia Radix Collapsible imposta `data-state` sul trigger element. La classe CSS funziona solo se il selettore del gruppo e il data-attribute sono sullo stesso elemento. Potrebbe non funzionare in tutti i casi a seconda del rendering.

**Fix**: Cambiare approccio, usando direttamente la prop `open` passata al componente per controllare la rotazione:
```tsx
<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
```

### Bug 3 — Sfondo contrasto troppo debole
**Problema**: `bg-sidebar-accent/50` con `sidebar-accent: 0 0% 95%` produce un background quasi invisibile (`hsl(0 0% 95% / 0.5)` = grigio 97.5% su sfondo 98%).

**Fix**: Aumentare l'opacità o usare un colore più distinto:
```tsx
<SidebarGroup className={cn("py-0 rounded-lg mx-1.5 transition-colors duration-200", open && "bg-sidebar-accent")}>
```

### Bug 4 — Stile inconsistente tra Cruscotto e macro-aree
**Problema**: I due item standalone (Cruscotto/Dashboard) usano `activeClassName="bg-primary/10 text-primary font-semibold border-l-2 border-primary"` con bordo sinistro, mentre le macro-aree usano `activeClassName="bg-primary/10 text-primary font-medium"` senza bordo. Inconsistenza visiva.

**Fix**: Uniformare l'activeClassName rimuovendo `border-l-2 border-primary` dagli item standalone e usando lo stesso stile ovunque.

### Riepilogo modifiche

| File | Modifica |
|------|----------|
| `src/components/layouts/CompanyLayout.tsx` | Fix isActive per evitare doppio highlight, fix rotazione chevron con prop `open`, aumentare contrasto sfondo, uniformare activeClassName |


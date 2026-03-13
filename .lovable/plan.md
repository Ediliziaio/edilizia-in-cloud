

## Bug: Doppio highlight nella sidebar — "Documenti Fiscali" resta evidenziato

### Causa root
Il `NavLink` nella sidebar (expanded mode, linea 244-249) usa `activeClassName` di React Router, che applica la classe attiva **automaticamente** quando il pathname inizia con l'URL del link. Senza la prop `end`, React Router considera `/azienda/documenti` come attivo per **qualsiasi** sotto-rotta (`/azienda/documenti/ddt`, `/azienda/documenti/preventivi/pipeline`, etc.).

La prop `end` è impostata solo per `/azienda` e `/azienda/marketing`, ma non per `/azienda/documenti`.

La logica custom `isActive` (linea 150-162) è calcolata ma **non usata** nel rendering expanded — lo styling viene interamente da `activeClassName` di React Router.

### Fix

**File: `src/components/layouts/CompanyLayout.tsx`**

Rimuovere `activeClassName` dal `NavLink` e usare la logica custom `isActive` già esistente per controllare lo styling, applicando la classe condizionalmente tramite `className`:

```tsx
<NavLink
  to={item.url}
  className={cn(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
    active && "bg-primary/10 text-primary font-medium"
  )}
>
```

Questo elimina la dipendenza dalla rilevazione automatica di React Router e usa la logica `isActive` che già gestisce correttamente il match più specifico.

Stesso approccio va applicato anche al `NavLink` nella HoverCard (collapsed mode, linea 198-212) — lì già funziona così, quindi serve solo uniformare l'expanded mode.

### File modificati
| File | Modifica |
|------|----------|
| `src/components/layouts/CompanyLayout.tsx` | Sostituire `activeClassName` con classe condizionale basata su `isActive` nel NavLink expanded |


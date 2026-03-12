

## Piano: Animazione apertura/chiusura + sfondo differenziato per le macro-aree

### 1. Animazione apertura/chiusura del CollapsibleContent
Il `CollapsibleContent` attualmente non ha animazione. Aggiungeremo una transizione smooth di altezza + fade usando le classi CSS già definite in `index.css` per `sidebar-slide-down` / `sidebar-slide-up`, applicandole direttamente al `CollapsibleContent`.

**File: `src/components/layouts/CompanyLayout.tsx`**
- Aggiungere `className` al `<CollapsibleContent>` con classi di animazione:
  ```
  data-[state=open]:animate-sidebar-slide-down
  data-[state=closed]:animate-sidebar-slide-up
  overflow-hidden
  ```

**File: `src/index.css`** — Le keyframes `sidebar-slide-down` / `sidebar-slide-up` esistono già ma targetizzano solo `[data-radix-collapsible-content]`. Aggiorneremo per includere anche una transizione di altezza più fluida.

**File: `tailwind.config.ts`** — Registrare le animazioni `sidebar-slide-down` e `sidebar-slide-up` come utility Tailwind per poterle usare come classi.

### 2. Sfondo differenziato per la macro-area aperta
Quando una macro-area è aperta, il suo blocco (trigger + contenuto) avrà uno sfondo leggermente diverso rispetto alla sidebar per creare contrasto visivo.

**File: `src/components/layouts/CompanyLayout.tsx`**
- Wrappare il `Collapsible` in un contenitore con sfondo condizionale:
  ```tsx
  <Collapsible ...>
    <SidebarGroup className={cn("py-0 rounded-lg mx-1.5 transition-colors", open && "bg-sidebar-accent/50")}>
  ```
  Questo darà un leggero sfondo diverso (usando `sidebar-accent` con opacità ridotta) alla sezione aperta.

### File modificati
| File | Modifica |
|------|----------|
| `src/components/layouts/CompanyLayout.tsx` | Aggiungere animazione al CollapsibleContent + sfondo differenziato quando aperto |
| `src/index.css` | Migliorare le keyframes per smooth height transition |


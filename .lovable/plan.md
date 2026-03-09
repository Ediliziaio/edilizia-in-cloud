

## Piano: Aggiornamento Sidebar — Default chiuso + Nuovo stile visivo

L'infrastruttura accordion è già funzionante. Servono 3 interventi:

### 1. `useSidebarSections.ts` — Default tutte chiuse
Cambiare `DEFAULT_STATE` con tutti i valori a `false`. L'auto-espansione sulla route attiva resta invariata (apre solo la sezione corrente).

### 2. `SidebarSubcategory.tsx` — Nuovo design "blocco con sfondo"
Riscrivere lo stile secondo le specifiche del prompt:
- **Wrapper esterno**: quando aperta → `bg-muted/60 dark:bg-muted/30 rounded-lg mb-1 overflow-hidden`; chiusa → solo `mb-1`
- **Header**: `text-[11px] font-bold` (non uppercase, no tracking), colore `foreground`, padding `px-3 py-2`, hover `hover:bg-muted/40 rounded-lg`, `transition-colors duration-150`
- **Chevron**: `h-3.5 w-3.5`, rotazione 180° (non 90°) quando aperta
- **Voci interne**: wrapper `px-2 pb-1`, indentazione `pl-2`

### 3. `CompanyLayout.tsx` — Active state aggiornato
Nelle NavLink dentro le subcategory, aggiornare:
- `activeClassName` → `"bg-accent text-primary font-semibold"`
- hover → `hover:bg-background/60` (al posto di `hover:bg-muted`)

### File coinvolti
- `src/hooks/useSidebarSections.ts` (default values)
- `src/components/layouts/SidebarSubcategory.tsx` (stile completo)
- `src/components/layouts/CompanyLayout.tsx` (className NavLink, righe ~517-518 e ~568-569)




## Bug Analysis: Subcategorie che non si aprono/chiudono correttamente

### Causa principale

Il componente `SidebarSubcategory` usa il trucco CSS `grid-template-rows: 0fr` per l'animazione di chiusura, ma mancano due cose critiche:

1. **`min-height: 0`** sul div figlio — senza questo, il browser non collassa realmente a 0px l'area, lasciando spazio vuoto visibile
2. **Padding/margin/border sempre presenti** — `mt-1`, `pb-1` e `border-b` restano anche quando il contenuto è chiuso, creando spazio vuoto tra le subcategorie chiuse

### Fix

**File: `src/components/layouts/SidebarSubcategory.tsx`**

1. Aggiungere `min-h-0` al div con `overflow-hidden` (necessario perché `grid-template-rows: 0fr` funzioni)
2. Rimuovere `mt-1`, `pb-1` e `border-b` fissi dal wrapper — renderli condizionali in base a `isOpen`, oppure spostare il border sotto il contenuto collassabile in modo che scompaia quando chiuso
3. Versione corretta:

```tsx
<div>
  <button onClick={onToggle} className="flex w-full items-center justify-between px-3 py-1.5 ...">
    ...
  </button>
  <div className="grid transition-all duration-200" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
    <div className="overflow-hidden min-h-0">  {/* ← aggiunto min-h-0 */}
      <div className="pl-2">
        {children}
      </div>
    </div>
  </div>
</div>
```

Il fix è minimo: aggiungere `min-h-0` e rendere condizionale il border/padding del wrapper.


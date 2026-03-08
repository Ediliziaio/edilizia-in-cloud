

## Piano: Tooltip su celle troncate nella tabella costi

### Cosa si fa
Aggiungere un `title` attribute (tooltip nativo del browser) su tutte le celle di testo che possono essere troncate (con `truncate` / `text-ellipsis`) nella tabella costi, così passandoci sopra con il mouse si vede il testo completo.

### File: `src/components/forecast/CostsTable.tsx`

Individuare tutte le celle con classe `truncate` o `max-w-*` e aggiungere l'attributo `title={valore}` sullo `<span>` o `<div>` contenitore. Le celle coinvolte sono tipicamente:
- **Nome** (description)
- **Fornitore** (supplier)
- **Categoria** (category)
- **Ordine** (linked order)
- Qualsiasi altra cella con overflow nascosto

Esempio:
```tsx
// Prima
<span className="truncate max-w-[150px]">{cost.description}</span>

// Dopo
<span className="truncate max-w-[150px]" title={cost.description}>{cost.description}</span>
```

Nessun componente aggiuntivo necessario — il `title` HTML nativo mostra il tooltip al passaggio del mouse.


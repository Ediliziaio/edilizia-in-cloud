

## Fix: SelectItem con value vuoto in Prima Nota

**Problema**: Radix UI `<Select.Item>` non accetta `value=""`. L'errore crashante è alla riga 143 di `PrimaNota.tsx`:
```tsx
<SelectItem value="">Tutte</SelectItem>
```

**Soluzione**: Cambiare il value da `""` a `"all"` e convertire nel handler:

1. **`src/pages/azienda/PrimaNota.tsx`**:
   - `<SelectItem value="">Tutte</SelectItem>` → `<SelectItem value="all">Tutte</SelectItem>`
   - Nel `onValueChange`: convertire `"all"` → `""` per il filtro: `setDirection(v === "all" ? "" : v as any)`
   - Nel `value` del Select: convertire `""` → `"all"`: `value={direction || "all"}`

Una modifica di 3 righe, nessun altro file toccato.


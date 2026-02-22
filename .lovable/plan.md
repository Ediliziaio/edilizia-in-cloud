

# Fix Console Warning: TagSelector forwardRef

## Problema Identificato

**Console Error**: "Function components cannot be given refs. Check the render method of TagSelector."

**Causa**: `TagSelector` e un function component usato dentro `PopoverContent` nella pagina di dettaglio contatto (riga 492). Radix Popover tenta di attaccare una ref al contenuto, ma `TagSelector` non la accetta perche non usa `React.forwardRef`.

## Fix

### File: `src/components/marketing/TagSelector.tsx`
- Wrappare il componente con `React.forwardRef` per accettare la ref passata da Radix Popover
- Aggiungere `ref` al `div` root del componente

## Cosa NON cambia
- Nessuna modifica funzionale
- Nessuna modifica al database
- Nessuna modifica ad altri file
- Solo eliminazione del warning in console


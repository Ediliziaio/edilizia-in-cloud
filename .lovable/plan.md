

# Fix Drag & Drop Pipeline — Card non trascinabile

## Problema

Il drag funziona solo se l'utente afferra la piccola icona `GripVertical` (6 dot handle). Ma nella pratica gli utenti cercano di trascinare l'intera card, che invece naviga al dettaglio ordine tramite il `Link`.

## Fix

### OrdersPipelineCard.tsx

1. Spostare `{...attributes} {...listeners}` sull'intero wrapper `div` esterno (non solo sull'icona grip)
2. Sostituire il `Link` con un `div` + `onClick` che naviga solo se NON si sta trascinando (controllando `isDragging`)
3. Mantenere l'icona grip come indicatore visivo ma senza listeners dedicati

```typescript
// Prima: listeners solo sul grip handle + Link che intercetta il click
// Dopo: listeners sull'intera card, navigazione solo su click (non drag)

const navigate = useNavigate();

<div
  ref={setNodeRef}
  style={style}
  {...attributes}
  {...listeners}
  onClick={() => {
    if (!isDragging) navigate(`/azienda/ordini/${order.id}`);
  }}
  className={cn("touch-none cursor-grab active:cursor-grabbing", ...)}
>
  <Card>
    {/* contenuto senza Link wrapper */}
  </Card>
</div>
```

Un solo file da modificare: `OrdersPipelineCard.tsx`.


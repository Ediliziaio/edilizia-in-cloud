

# Piano: Miglioramento Vista Kanban - Maggiore Leggibilità

## Problema Attuale

Le card Kanban sono troppo compatte e difficili da leggere:
- Testo troppo piccolo
- Padding insufficiente
- Informazioni troncate
- Spaziatura minima tra gli elementi

---

## Miglioramenti Proposti

### 1. Card più Leggibili

**Attuale (troppo compatto)**:
```text
┌────────────────────────────┐
│⋮ 4x Tapparelle PVC    [5g]│
│ORD-001 • G. Bianchi       │
└────────────────────────────┘
```

**Nuovo (più leggibile)**:
```text
┌─────────────────────────────────┐
│ ⋮⋮  Tapparelle PVC Bianco      │
│     120x160                     │
│                                 │
│     🛒 ABC Serramenti           │
│     📦 ORD-001 · Giuseppe B.    │
│     📅 12 Feb                [5g]│
└─────────────────────────────────┘
```

### 2. Modifiche Specifiche alle Card

| Elemento | Attuale | Nuovo |
|----------|---------|-------|
| Padding | `p-2` | `p-3` |
| Nome articolo | `text-sm truncate` | `text-base font-medium` (su più righe se necessario) |
| Quantità | Inline con nome | Badge separato in alto |
| Fornitore | Non visibile | Mostrato con icona |
| Cliente | Abbreviato (G. B.) | Nome completo troncato |
| Data posa | Non visibile | Sempre visibile |
| Grip icon | `h-3.5` | `h-4` |
| Spaziatura | `space-y-1.5` | `space-y-2` |

### 3. Layout Card Ripensato

```text
┌─────────────────────────────────────┐
│ ⋮⋮  [4x]                      [5g] │  <- Grip + Quantità badge + Urgenza
│                                     │
│ Tapparelle PVC Bianco 120x160       │  <- Nome articolo (wrap se lungo)
│                                     │
│ 🏭 ABC Serramenti                   │  <- Fornitore (se presente)
│ 📋 ORD-001                          │  <- Codice ordine
│ 👤 Giuseppe Bianchi                 │  <- Cliente
│ 📅 12 Feb 2026                      │  <- Data posa prevista
└─────────────────────────────────────┘
```

### 4. Colonne Più Spaziose

- Aumentare gap tra le card da `space-y-1.5` a `space-y-3`
- Aumentare padding colonna da `p-2` a `p-3`
- Header colonna leggermente più grande

---

## Dettagli Tecnici

### File da Modificare

| File | Modifica |
|------|----------|
| `WarehouseKanbanCard.tsx` | Layout espanso con più info visibili |
| `WarehouseKanbanColumn.tsx` | Maggiore spaziatura |

### WarehouseKanbanCard.tsx - Nuovo Layout

```typescript
<Card className={cn(
  "cursor-grab active:cursor-grabbing transition-all",
  isDragging && "opacity-50 shadow-lg rotate-1",
  isCritical && "border-destructive border-2",
  isUrgent && !isCritical && "border-amber-500 border-2"
)}>
  <CardContent className="p-3">
    {/* Header: Grip + Quantità + Urgenza */}
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <div {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <Badge variant="secondary" className="text-xs">
          {item.quantity || 1}x
        </Badge>
      </div>
      {(isUrgent || isCritical) && (
        <Badge variant={isCritical ? "destructive" : "default"} 
               className={cn(!isCritical && "bg-amber-500")}>
          {daysUntil === 0 ? "OGGI" : daysUntil === 1 ? "Domani" : `${daysUntil}g`}
        </Badge>
      )}
    </div>
    
    {/* Nome Articolo - più prominente */}
    <h4 className="font-medium text-sm leading-snug mb-2">
      {item.name}
    </h4>
    
    {/* Dettagli - icone + testo */}
    <div className="space-y-1 text-xs text-muted-foreground">
      {supplierName && (
        <div className="flex items-center gap-1.5">
          <Building2 className="h-3 w-3" />
          <span className="truncate">{supplierName}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <FileText className="h-3 w-3" />
        <span>{item.order.order_code}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <User className="h-3 w-3" />
        <span className="truncate">
          {item.order.customer.first_name} {item.order.customer.last_name}
        </span>
      </div>
      {expectedDate && (
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3 w-3" />
          <span>{format(new Date(expectedDate), "d MMM yyyy", { locale: it })}</span>
        </div>
      )}
    </div>
  </CardContent>
</Card>
```

### WarehouseKanbanColumn.tsx - Maggiore Spaziatura

```typescript
{/* Content con più spazio */}
<div ref={setNodeRef} className="flex-1 p-3 overflow-hidden">
  <ScrollArea className="h-full">
    <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
      <div className="space-y-3 pr-2">  {/* Da 1.5 a 3 */}
        {items.map((item) => (
          <WarehouseKanbanCard key={item.id} item={item} ... />
        ))}
      </div>
    </SortableContext>
  </ScrollArea>
</div>
```

---

## Confronto Visivo

### Prima (compatto, difficile da leggere)
```text
┌──────────────────┐ ┌──────────────────┐
│⋮ 4x Tapp...  [5g]│ │⋮ 6x Zanz...      │
│ORD-001 • G.B.    │ │ORD-002 • M.V.    │
├──────────────────┤ ├──────────────────┤
│⋮ 2x Moto...      │ │⋮ 3x Tapp...  [3g]│
│ORD-001 • G.B.    │ │ORD-003 • L.F.    │
└──────────────────┘ └──────────────────┘
```

### Dopo (leggibile, informativo)
```text
┌──────────────────────┐ ┌──────────────────────┐
│ ⋮⋮ [4x]         [5g] │ │ ⋮⋮ [6x]              │
│                      │ │                      │
│ Tapparelle PVC       │ │ Zanzariere plissé    │
│ Bianco 120x160       │ │ 100x140              │
│                      │ │                      │
│ 🏭 ABC Serramenti    │ │ 🏭 ZanzarTech        │
│ 📋 ORD-001           │ │ 📋 ORD-002           │
│ 👤 Giuseppe Bianchi  │ │ 👤 Maria Verdi       │
│ 📅 12 Feb 2026       │ │ 📅 19 Feb 2026       │
└──────────────────────┘ └──────────────────────┘
```

---

## Riepilogo Modifiche

1. **Padding aumentato**: Da `p-2` a `p-3` nelle card
2. **Nome articolo più grande**: `text-sm` con `font-medium`, senza troncamento forzato
3. **Quantità in badge separato**: Più visibile in alto
4. **Fornitore visibile**: Mostrato con icona se presente
5. **Cliente nome completo**: Non più abbreviato
6. **Data posa sempre visibile**: Formattata chiaramente
7. **Spaziatura tra card**: Da `space-y-1.5` a `space-y-3`
8. **Icone per ogni info**: Migliore scansione visiva
9. **Urgenza più evidente**: Badge più grande con testo descrittivo ("OGGI", "Domani")


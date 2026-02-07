
# Piano: Card Kanban Ultra-Minimal con Menu a Tendina

## Problema Attuale

Le card mostrano troppi dettagli sempre visibili:
- Fornitore, ordine, cliente, data - tutto esposto
- Troppe righe per ogni card
- Vista troppo "affollata"

---

## Soluzione Proposta

Card compatte con solo l'essenziale visibile e un **DropdownMenu** per i dettagli.

### Design Nuovo

**Card Chiusa (default)**:
```text
┌─────────────────────────────────────┐
│ ⋮⋮  4x Tapparelle PVC Bianco  [5g] │
└─────────────────────────────────────┘
```

**Dropdown Aperto (click sui tre puntini)**:
```text
┌─────────────────────────────────────┐
│ ⋮⋮  4x Tapparelle PVC Bianco  [⋮]  │
│ ┌─────────────────────────────────┐ │
│ │ 🏭 ABC Serramenti              │ │
│ │ 📋 ORD-001                     │ │
│ │ 👤 Giuseppe Bianchi            │ │
│ │ 📅 12 Feb 2026                 │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## Layout Card Minimal

```text
┌───────────────────────────────────────┐
│ ⋮⋮  4x  Nome Articolo       [5g] [⋮] │
└───────────────────────────────────────┘

Dove:
- ⋮⋮ = Grip per drag & drop
- 4x = Quantità (badge compatto)
- Nome Articolo = Titolo principale
- [5g] = Badge urgenza (solo se urgente)
- [⋮] = Pulsante menu dettagli
```

---

## Dettagli Tecnici

### Componenti Utilizzati

- `DropdownMenu` da Radix UI (già presente nel progetto)
- Icona `MoreVertical` per il pulsante menu

### Struttura del Dropdown

```typescript
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" className="h-6 w-6">
      <MoreVertical className="h-3.5 w-3.5" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="w-56">
    <DropdownMenuLabel>Dettagli Articolo</DropdownMenuLabel>
    <DropdownMenuSeparator />
    {supplierName && (
      <DropdownMenuItem>
        <Building2 className="h-4 w-4 mr-2" />
        {supplierName}
      </DropdownMenuItem>
    )}
    <DropdownMenuItem>
      <FileText className="h-4 w-4 mr-2" />
      {item.order.order_code}
    </DropdownMenuItem>
    <DropdownMenuItem>
      <User className="h-4 w-4 mr-2" />
      {customerName}
    </DropdownMenuItem>
    <DropdownMenuItem>
      <Calendar className="h-4 w-4 mr-2" />
      {formattedDate}
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Card Semplificata

```typescript
<Card className={cn("cursor-grab", urgencyClasses)}>
  <CardContent className="p-2">
    <div className="flex items-center gap-2">
      {/* Grip per drag */}
      <GripVertical className="h-4 w-4 text-muted-foreground/50" />
      
      {/* Quantità */}
      <span className="text-xs text-muted-foreground font-mono">
        {item.quantity || 1}x
      </span>
      
      {/* Nome articolo - occupa tutto lo spazio */}
      <span className="flex-1 font-medium text-sm truncate">
        {item.name}
      </span>
      
      {/* Badge urgenza (solo se urgente) */}
      {isUrgent && <Badge>{urgencyLabel}</Badge>}
      
      {/* Menu dettagli */}
      <DropdownMenu>...</DropdownMenu>
    </div>
  </CardContent>
</Card>
```

---

## File da Modificare

| File | Modifica |
|------|----------|
| `WarehouseKanbanCard.tsx` | Sostituire layout espanso con riga singola + dropdown |

---

## Confronto Visivo

### Prima (troppo verboso)
```text
┌──────────────────────────┐
│ ⋮⋮  [4x]            [5g] │
│                          │
│ Tapparelle PVC Bianco    │
│                          │
│ 🏭 ABC Serramenti        │
│ 📋 ORD-001               │
│ 👤 Giuseppe Bianchi      │
│ 📅 12 Feb 2026           │
└──────────────────────────┘
```

### Dopo (minimal)
```text
┌──────────────────────────────────────────┐
│ ⋮⋮  4x  Tapparelle PVC Bianco  [5g] [⋮] │
└──────────────────────────────────────────┘
```

---

## Vantaggi

1. **Card su una riga sola**: Massima compattezza
2. **Più articoli visibili**: Meno scroll necessario
3. **Info a richiesta**: Dettagli visibili solo quando servono
4. **Meno rumore visivo**: Focus sul nome articolo
5. **Urgenza sempre visibile**: Badge colorato se critico
6. **Interazione intuitiva**: Click sui tre puntini per espandere

---

## Riepilogo Modifiche

1. **Layout su singola riga**: Grip + Quantità + Nome + Urgenza + Menu
2. **Padding ridotto**: Da `p-3` a `p-2`
3. **Dettagli in DropdownMenu**: Fornitore, ordine, cliente, data
4. **Nome articolo troncato**: Con `truncate` per nomi lunghi
5. **Bordo colorato mantenuto**: Per urgenza visiva immediata

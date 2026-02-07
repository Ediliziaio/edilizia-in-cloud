
# Piano: Miglioramento Sezione Magazzino - Design Minimal

## Panoramica

Rendere la sezione Magazzino piu pulita e minimal con:
1. **Alert collassabili** - Possibilita di mostrare/nascondere gli avvisi
2. **Lista ordini compatta** - Vista con ordini chiusi che si espandono al click
3. **Indicatori di stato rapidi** - Pallini colorati per capire a colpo d'occhio se manca qualcosa
4. **Kanban semplificato** - Card piu compatte e pulite

---

## 1. Alert Collassabili

Trasformare gli alert in una sezione che si puo aprire/chiudere con un contatore visivo.

### Design Attuale vs Nuovo

**Attuale**: Tutti gli alert sempre visibili, occupano molto spazio

**Nuovo**: Barra compatta con contatore, espandibile al click

```text
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ 2 avvisi urgenti                               [Mostra ▼]   │
└─────────────────────────────────────────────────────────────────┘

Quando espanso:
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ 2 avvisi urgenti                              [Nascondi ▲]  │
├─────────────────────────────────────────────────────────────────┤
│ Alert 1...                                                      │
│ Alert 2...                                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Lista Ordini Compatta con Accordion

Ogni ordine mostra una riga riassuntiva con indicatori di stato. Cliccando si espande per vedere gli articoli.

### Design Nuovo

```text
┌─────────────────────────────────────────────────────────────────────┐
│ ORD-001 - Giuseppe Bianchi    📅 12 Feb    🟢🟠🔴    12 art.   [▼] │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ ORD-002 - Maria Verdi         📅 19 Feb    🟢🟢🟢    6 art.    [▲] │
├─────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 4x Tapparelle PVC     ABC Serramenti     [In Magazzino ▼]     │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 2x Zanzariere         ZanzarTech         [In Magazzino ▼]     │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Indicatori di Stato (Pallini)

- 🟢 **Verde**: In Magazzino / Installato (tutto ok)
- 🟠 **Arancione**: Ordinato (in arrivo)  
- 🔴 **Rosso**: Da Ordinare (azione richiesta)

Il numero di pallini indica quanti articoli sono in ogni stato, raggruppati. Esempio:
- `🟢🟢🟠🔴` = 2 in magazzino, 1 ordinato, 1 da ordinare

Oppure versione piu compatta con numeri:
- `🟢4 🟠2 🔴1` = 4 pronti, 2 in arrivo, 1 da ordinare

---

## 3. Kanban Semplificato

Card piu compatte senza troppi dettagli, focus sul nome articolo e ordine.

### Card Attuale (troppo verbosa)

```text
┌──────────────────────────────┐
│ ⋮⋮  [4x]           [5g]     │
│                              │
│ Tapparelle PVC Bianco        │
│                              │
│ 🔗 ORD-001                   │
│ Giuseppe Bianchi             │
│ 📦 ABC Serramenti            │
│ 📅 12 Feb                    │
└──────────────────────────────┘
```

### Card Nuova (minimal)

```text
┌──────────────────────────────┐
│ 4x Tapparelle PVC       [5g] │
│ ORD-001 • Giuseppe B.        │
└──────────────────────────────┘
```

- Solo le info essenziali
- Bordo colorato per urgenza (rosso/arancione)
- Hover per dettagli aggiuntivi

---

## Dettagli Tecnici

### File da Modificare

| File | Modifica |
|------|----------|
| `src/components/warehouse/WarehouseAlerts.tsx` | Aggiungere stato `isOpen` e wrap con `Collapsible` |
| `src/components/warehouse/WarehouseListView.tsx` | Sostituire card espanse con accordion compatti |
| `src/components/warehouse/WarehouseKanbanCard.tsx` | Semplificare layout card |
| `src/components/warehouse/WarehouseKanbanColumn.tsx` | Ottimizzare header colonne |

---

### WarehouseAlerts.tsx - Versione Collassabile

```typescript
// Aggiungere stato per apertura/chiusura
const [isAlertsOpen, setIsAlertsOpen] = useState(false);

// Wrap con Collapsible
<Collapsible open={isAlertsOpen} onOpenChange={setIsAlertsOpen}>
  <div className="flex items-center justify-between p-3 bg-destructive/10 rounded-lg">
    <span className="flex items-center gap-2">
      <AlertTriangle className="h-4 w-4" />
      {alerts.length} avvisi urgenti
    </span>
    <CollapsibleTrigger asChild>
      <Button variant="ghost" size="sm">
        {isAlertsOpen ? "Nascondi" : "Mostra"}
        <ChevronDown className={cn("h-4 w-4", isAlertsOpen && "rotate-180")} />
      </Button>
    </CollapsibleTrigger>
  </div>
  <CollapsibleContent>
    {/* Lista alert esistente */}
  </CollapsibleContent>
</Collapsible>
```

---

### WarehouseListView.tsx - Accordion Ordini

```typescript
// Calcolo indicatori stato per ordine
function getStatusIndicators(items: WarehouseItem[]) {
  return {
    inMagazzino: items.filter(i => i.status === 'in_magazzino' || i.status === 'installato').length,
    ordinato: items.filter(i => i.status === 'ordinato').length,
    daOrdinare: items.filter(i => i.status === 'da_ordinare').length,
  };
}

// Riga ordine compatta
<Collapsible>
  <div className="flex items-center justify-between p-4 border rounded-lg">
    <div className="flex items-center gap-4">
      <div>
        <span className="font-medium">{orderCode} - {customerName}</span>
        <span className="text-muted-foreground ml-2">{formatDate(expectedDate)}</span>
      </div>
      {/* Indicatori pallini */}
      <div className="flex gap-1">
        {indicators.inMagazzino > 0 && (
          <Badge variant="outline" className="bg-green-100 text-green-700">
            {indicators.inMagazzino}
          </Badge>
        )}
        {indicators.ordinato > 0 && (
          <Badge variant="outline" className="bg-blue-100 text-blue-700">
            {indicators.ordinato}
          </Badge>
        )}
        {indicators.daOrdinare > 0 && (
          <Badge variant="outline" className="bg-amber-100 text-amber-700">
            {indicators.daOrdinare}
          </Badge>
        )}
      </div>
    </div>
    <CollapsibleTrigger>
      <ChevronDown className="h-4 w-4" />
    </CollapsibleTrigger>
  </div>
  <CollapsibleContent>
    {/* Lista articoli */}
  </CollapsibleContent>
</Collapsible>
```

---

### WarehouseKanbanCard.tsx - Versione Minimal

```typescript
// Card semplificata
<Card className={cn(
  "cursor-grab transition-all",
  isCritical && "border-destructive",
  isUrgent && !isCritical && "border-amber-500"
)}>
  <CardContent className="p-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-mono text-muted-foreground">
          {item.quantity || 1}x
        </span>
        <span className="font-medium text-sm truncate">{item.name}</span>
      </div>
      {(isUrgent || isCritical) && (
        <Badge variant="destructive" className="text-xs ml-2">
          {daysUntil === 0 ? "!" : `${daysUntil}g`}
        </Badge>
      )}
    </div>
    <div className="text-xs text-muted-foreground mt-1 truncate">
      {item.order.order_code} • {item.order.customer.first_name.charAt(0)}. {item.order.customer.last_name}
    </div>
  </CardContent>
</Card>
```

---

## Riepilogo Modifiche

1. **Alert Collassabili**: Barra compatta con contatore, espandibile al click per vedere i dettagli
2. **Lista Ordini con Accordion**: Ogni ordine e una riga con indicatori colorati (pallini verde/arancione/rosso) che mostra a colpo d'occhio lo stato. Click sulla freccia per espandere e vedere gli articoli
3. **Indicatori di Stato Visivi**: Pallini o badge colorati per ogni stato (pronto/in arrivo/da ordinare)
4. **Kanban Minimal**: Card compatte con solo nome articolo, quantita e codice ordine. Info extra visibili in hover

---

## Vantaggi del Nuovo Design

- **Meno rumore visivo**: Alert nascondibili, card compatte
- **Panoramica rapida**: Indicatori colorati mostrano subito se manca qualcosa
- **Focus sull'essenziale**: Info dettagliate solo quando servono (espandendo)
- **Piu spazio**: Piu ordini visibili contemporaneamente

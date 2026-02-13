

# Piano: Filtro Squadra Esterna + Miglioramenti Visivi Calendario

## 1. Filtro per Squadra Esterna

### Dati e Tipo

La tabella `order_external_teams` collega ordini a squadre esterne. Bisogna:

- **`types/calendar.ts`**: Aggiungere campo `assigned_external_teams` all'interfaccia `CalendarOrder`
- **`Calendar.tsx`**: 
  - Estendere la query ordini con: `order_external_teams(external_team:external_teams(id, name))`
  - Aggiungere stato `externalTeamFilter`
  - Aggiungere query per recuperare le squadre esterne attive
  - Aggiungere un `Select` con label "Tutte le squadre"
  - Filtrare `scheduledOrders` per squadra esterna selezionata
  - Aggiornare `hasActiveFilters` e `resetFilters`

```text
// types/calendar.ts
assigned_external_teams?: Array<{
  external_team: {
    id: string;
    name: string;
  };
}>;
```

```text
// Calendar.tsx - query
order_external_teams(external_team:external_teams(id, name))

// Filter logic
if (externalTeamFilter !== "all") {
  const hasTeam = order.assigned_external_teams?.some(
    aet => aet.external_team.id === externalTeamFilter
  );
  if (!hasTeam) return false;
}
```

---

## 2. Miglioramenti Visivi - Gantt

### 2a. Barre piu ricche e leggibili

- Aggiungere bordo arrotondato (`rounded-md`) e ombra leggera alle barre
- Mostrare icone milestone sulla timeline: un pallino blu per `expected_date` e un pallino ambra per `warehouse_arrival_date` sovrapposti alla riga
- Aggiungere righe alternate (sfondo grigio chiaro su righe pari) per migliorare la leggibilita
- Aggiungere hover highlight sulla riga intera

**File**: `CalendarGanttView.tsx`

```text
// Righe alternate
className={cn(
  "border-b relative",
  idx % 2 === 0 && "bg-muted/20"
)}

// Milestone markers nella riga
{order.expected_date && (() => {
  const pos = differenceInDays(parseISO(order.expected_date), startDate) * dayWidth;
  if (pos >= 0 && pos <= days.length * dayWidth) {
    return <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-500 border-2 border-white z-10" style={{ left: pos + dayWidth/2 - 6 }} />;
  }
})()}
```

### 2b. Sidebar migliorata

- Aggiungere un indicatore colorato dello stato (pallino) accanto al nome cliente
- Mostrare le iniziali degli operai assegnati sotto il codice ordine
- Mostrare il nome della squadra esterna se presente

**File**: `CalendarGanttView.tsx`

```text
// Status dot + employee initials nella sidebar
<div className="flex items-center gap-1.5">
  {order.status && (
    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: order.status.color }} />
  )}
  <span className="text-sm font-medium truncate">
    {order.customer.last_name}
  </span>
</div>
<div className="flex items-center gap-1 text-[10px] text-muted-foreground">
  <span>{order.order_code || "N/A"}</span>
  {initials && <span>| {initials}</span>}
</div>
```

### 2c. Barre DraggableOrderBar migliorate

- Aggiungere bordo sinistro colorato piu scuro (3px) come indicatore visivo
- Mostrare il nome del cliente dentro la barra quando c'e spazio sufficiente (width > 120px)
- Aggiungere un pattern tratteggiato sulla barra se l'ordine ha rischio logistico

**File**: `DraggableOrderBar.tsx`

```text
// Bordo sinistro + contenuto esteso
className="absolute top-2 bottom-2 rounded-md shadow-sm hover:shadow-lg transition-all flex items-center px-2 overflow-hidden touch-none border-l-[3px]"
style={{
  ...style,
  borderLeftColor: darkenColor(color),
}}

// Contenuto barra
{bar.width > 120 ? (
  <div className="flex items-center gap-1 text-xs text-white truncate">
    <span className="font-semibold">{order.order_code || "N/A"}</span>
    <span className="opacity-75">- {order.customer.last_name}</span>
  </div>
) : bar.width > 60 ? (
  <span className="text-xs text-white font-medium truncate">
    {order.order_code || order.description.slice(0, 20)}
  </span>
) : null}
```

---

## 3. Miglioramenti Visivi - Carico (Heatmap)

### 3a. Celle piu informative

- Dentro ogni cella con ordini, mostrare mini-icone dei tipi di evento (Hammer, Package, Wrench) come indicatori sotto il numero
- Aggiungere un bordo colorato sulla cella nei weekend per distinguerli visivamente

**File**: `CalendarHeatmapView.tsx`

```text
// Mini icone tipo evento
{isCurrentMonth && count > 0 && (
  <div className="flex flex-col items-center gap-0.5">
    <span className={cn("text-xl font-bold", getHeatTextColor(count))}>{count}</span>
    <div className="flex gap-0.5">
      {hasPosa && <Hammer className="h-2.5 w-2.5 text-blue-500" />}
      {hasMerce && <Package className="h-2.5 w-2.5 text-amber-500" />}
      {hasLavoro && <Wrench className="h-2.5 w-2.5 text-green-500" />}
    </div>
  </div>
)}

// Weekend styling
isWeekend(day) && "opacity-60 bg-muted/50"
```

### 3b. Popover migliorato

- Aggiungere le iniziali degli operai e il nome della squadra esterna nel popover di ogni ordine
- Aggiungere indicatore di rischio logistico nel popover

---

## 4. Miglioramenti Visivi - Settimana

### 4a. Card evento migliorate

- Aggiungere un bordo sinistro colorato con il colore dello stato dell'ordine
- Mostrare la descrizione troncata sotto il nome cliente
- Mostrare il badge della squadra esterna se presente

**File**: `CalendarWeekView.tsx`

```text
// Card con bordo stato
<button className={cn(
  "w-full text-left p-2 rounded text-xs transition-colors hover:opacity-80 border-l-[3px]",
  style.bg, style.text
)}
style={{ borderLeftColor: event.order.status?.color || 'transparent' }}
>
  ...
  {event.order.description && (
    <div className="truncate mt-0.5 opacity-60 text-[10px]">{event.order.description}</div>
  )}
  {externalTeamName && (
    <div className="flex items-center gap-0.5 mt-0.5 opacity-70">
      <UsersRound className="h-2.5 w-2.5" />
      <span className="text-[10px]">{externalTeamName}</span>
    </div>
  )}
</button>
```

### 4b. Header giorno migliorato

- Aggiungere una barra di capacita visiva (progress bar sottile) sotto il badge lavori per dare un senso immediato del carico

---

## 5. Miglioramenti Visivi - Mese

### 5a. Event pill migliorate

- Aggiungere il pallino dello stato dell'ordine accanto all'icona tipo
- Mostrare le iniziali della squadra esterna nel tooltip
- Aggiungere un sottile bordo inferiore colorato per distinguere meglio gli eventi

**File**: `CalendarMonthView.tsx`

```text
// Status dot nell'event pill
<button className="..." style={{ backgroundColor: event.color }}>
  <div className="w-1.5 h-1.5 rounded-full bg-white/50 flex-shrink-0" 
       style={{ backgroundColor: event.order.status?.color }} />
  {icon}
  <span>...</span>
</button>

// Tooltip: squadra esterna
{externalTeamNames && (
  <div className="flex items-center gap-1 text-xs">
    <UsersRound className="h-3 w-3" />
    <span>{externalTeamNames}</span>
  </div>
)}
```

---

## Riepilogo file da modificare

| File | Modifica |
|------|----------|
| `src/types/calendar.ts` | Aggiungere `assigned_external_teams` |
| `src/pages/azienda/Calendar.tsx` | Filtro squadra esterna + query estesa |
| `src/components/calendar/CalendarGanttView.tsx` | Righe alternate, milestone markers, sidebar arricchita |
| `src/components/calendar/DraggableOrderBar.tsx` | Bordo sinistro, contenuto esteso, pattern rischio |
| `src/components/calendar/CalendarHeatmapView.tsx` | Mini-icone tipo, weekend styling, popover arricchito |
| `src/components/calendar/CalendarWeekView.tsx` | Bordo stato, descrizione, squadra esterna, progress bar |
| `src/components/calendar/CalendarMonthView.tsx` | Status dot, squadra esterna nel tooltip |

Nessuna migrazione DB necessaria: `order_external_teams` e `external_teams` esistono gia.


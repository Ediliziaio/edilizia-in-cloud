

# Piano: Nuova Sezione Calendario con Vista Gantt

## Panoramica

Aggiungere una nuova sezione "Calendario" nel menu laterale aziendale che permette di:

1. **Visualizzare il lavoro programmato** - Ordini con date di posa (`work_start_date` / `work_end_date`)
2. **Lavori multi-giorno** - Supporto per ordini che durano diversi giorni
3. **Vista Calendario mensile** - Vista tradizionale a griglia mensile
4. **Vista Gantt annuale** - Timeline orizzontale 365 giorni con righe per cliente/ordine

---

## Dati Disponibili nel Database

Gli ordini hanno questi campi data utilizzabili:

| Campo | Descrizione |
|-------|-------------|
| `work_start_date` | Data inizio lavori |
| `work_end_date` | Data fine lavori |
| `expected_date` | Data posa prevista (singolo giorno) |
| `warehouse_arrival_date` | Data arrivo merce |

Per i lavori multi-giorno useremo `work_start_date` e `work_end_date`.

---

## Struttura dei File

### Nuovi File

| File | Descrizione |
|------|-------------|
| `src/pages/azienda/Calendar.tsx` | Pagina principale Calendario |
| `src/components/calendar/CalendarMonthView.tsx` | Vista calendario mensile |
| `src/components/calendar/CalendarGanttView.tsx` | Vista Gantt annuale |

### File da Modificare

| File | Modifica |
|------|----------|
| `src/App.tsx` | Aggiungere route `/azienda/calendario` |
| `src/components/layouts/CompanyLayout.tsx` | Aggiungere link "Calendario" nel menu |

---

## Dettagli Implementazione

### 1. Route e Menu

Aggiungere nel menu laterale:
- Icona: `CalendarDays` da Lucide
- Posizione: Dopo "Magazzino", prima di "Clienti"

```typescript
// CompanyLayout.tsx - navItems
{ title: "Calendario", url: "/azienda/calendario", icon: CalendarDays },
```

---

### 2. Pagina Calendario (`Calendar.tsx`)

Struttura principale con toggle tra le due viste:

```text
+--------------------------------------------+
| Calendario Lavori                          |
| Pianifica e visualizza i lavori programmati|
+--------------------------------------------+
| [Vista Mese] [Vista Gantt]    [Oggi]       |
+--------------------------------------------+
|                                            |
|  [Vista attiva - Mese o Gantt]             |
|                                            |
+--------------------------------------------+
```

**Query dati**:
```typescript
const { data: orders } = useQuery({
  queryKey: ["calendar-orders"],
  queryFn: async () => {
    const { data } = await supabase
      .from("orders")
      .select(`
        id,
        order_code,
        description,
        expected_date,
        work_start_date,
        work_end_date,
        current_status_id,
        customer:profiles!orders_customer_id_fkey(first_name, last_name),
        status:order_statuses!orders_current_status_id_fkey(name, color)
      `)
      .order("work_start_date", { ascending: true });
    return data;
  },
});
```

---

### 3. Vista Calendario Mensile (`CalendarMonthView.tsx`)

Basata sul pattern di `WarehouseCalendarView.tsx`:

**Caratteristiche**:
- Griglia 7 colonne (Lun-Dom)
- Navigazione mese precedente/successivo
- Ogni giorno mostra gli ordini con lavoro programmato
- Lavori multi-giorno: barra colorata che si estende su piu giorni
- Click su ordine apre dettaglio

**Layout cella**:
```text
+------------------+
| 15               |
| [ORD-001 ▓▓▓▓]   | <- Inizio lavoro
| [ORD-002 ░░░░]   | <- Lavoro in corso
+------------------+
```

**Colori**:
- Verde: lavoro completato (status "installato")
- Blu: lavoro in corso
- Arancione: lavoro futuro

---

### 4. Vista Gantt Annuale (`CalendarGanttView.tsx`)

Vista orizzontale con 365 giorni:

```text
+-----------+--------------------------------------------------+
| Cliente   | Gen  Feb  Mar  Apr  Mag  Giu  Lug  Ago ...       |
+-----------+--------------------------------------------------+
| G. Bianchi| [ORD-001 ▓▓▓▓]                                   |
| ORD-001   |                                                   |
+-----------+--------------------------------------------------+
| M. Verdi  |      [ORD-002 ▓▓▓▓▓▓]                            |
| ORD-002   |                                                   |
+-----------+--------------------------------------------------+
| L. Ferrari|           [ORD-003 ▓▓]                           |
| ORD-003   |                                                   |
+-----------+--------------------------------------------------+
```

**Caratteristiche**:
- Colonna fissa sinistra: Nome Cliente + Codice Ordine
- Scroll orizzontale: Timeline 365 giorni
- Barre colorate che mostrano la durata del lavoro
- Oggi evidenziato con linea verticale rossa
- Zoom: toggle tra vista annuale / trimestrale / mensile
- Tooltip al hover: dettagli ordine

**Dimensioni**:
- Larghezza colonna giorno: 3px (annuale) / 8px (trimestrale) / 25px (mensile)
- Altezza riga: 50px

**Scroll sincronizzato**:
- Header mesi fisso in alto
- Colonna clienti fissa a sinistra
- Area centrale scrollabile

---

### 5. Tipi TypeScript

```typescript
// types/calendar.ts
export interface CalendarOrder {
  id: string;
  order_code: string | null;
  description: string;
  expected_date: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  customer: {
    first_name: string;
    last_name: string;
  };
  status: {
    name: string;
    color: string;
  } | null;
}

export type GanttZoom = "year" | "quarter" | "month";
```

---

## Layout Vista Gantt (dettaglio)

### Header Mesi

```text
| Gen          | Feb          | Mar          | ...
| 1  5  10  15 | 1  5  10  15 | 1  5  10  15 | ...
```

### Barra Lavoro

La barra si estende da `work_start_date` a `work_end_date`:
- Se `work_end_date` e NULL, usa `expected_date` come singolo giorno
- Se anche `expected_date` e NULL, ordine non mostrato nel Gantt

### Legenda

```text
[▓▓] Completato (installato)
[▒▒] In corso (altri stati)  
[░░] Futuro (work_start > oggi)
```

---

## Tecnologie Utilizzate

- **date-fns**: Per calcoli date e formattazione
- **ScrollArea**: Per scroll orizzontale Gantt
- **Tooltip**: Per dettagli ordine al hover
- **ToggleGroup**: Per switch vista Mese/Gantt
- **Button**: Navigazione e zoom

---

## Riepilogo Modifiche

| N. | File | Azione |
|----|------|--------|
| 1 | `src/types/calendar.ts` | Creare tipi condivisi |
| 2 | `src/pages/azienda/Calendar.tsx` | Pagina principale |
| 3 | `src/components/calendar/CalendarMonthView.tsx` | Vista mensile |
| 4 | `src/components/calendar/CalendarGanttView.tsx` | Vista Gantt |
| 5 | `src/App.tsx` | Aggiungere route |
| 6 | `src/components/layouts/CompanyLayout.tsx` | Aggiungere menu |

---

## UX/UI

- **Responsive**: Vista Gantt solo desktop (min 1024px), su mobile solo vista Mese
- **Performance**: Virtualizzazione righe se ordini > 50
- **Accessibilita**: Keyboard navigation, ARIA labels
- **Link rapidi**: Click su ordine apre `/azienda/ordini/:id`


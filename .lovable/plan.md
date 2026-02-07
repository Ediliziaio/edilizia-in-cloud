

# Piano: Miglioramento Sezione Magazzino

## Panoramica

Trasformare la sezione Magazzino da una semplice lista di articoli a un vero e proprio centro di gestione materiali con viste multiple, timeline visiva, indicatori di urgenza e funzionalita avanzate.

---

## Miglioramenti Proposti

### 1. Vista Kanban per Stato Articoli

Aggiungere una vista Kanban (simile alla Pipeline ordini) con 4 colonne drag-and-drop:

```text
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  DA ORDINARE    │ │    ORDINATO     │ │  IN MAGAZZINO   │ │   INSTALLATO    │
│     (5)         │ │      (8)        │ │      (12)       │ │      (3)        │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │
│ │ Finestra    │ │ │ │ Porta       │ │ │ │ Persiane    │ │ │ │ Maniglia    │ │
│ │ ORD-001     │ │ │ │ ORD-002     │ │ │ │ ORD-001     │ │ │ │ ORD-003     │ │
│ │ Mario R.    │ │ │ │ Luigi V.    │ │ │ │ Mario R.    │ │ │ │ Anna B.     │ │
│ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

**Funzionalita:**
- Drag-and-drop tra colonne per cambiare stato
- Card con nome articolo, ordine e cliente
- Indicatore visivo urgenza (bordo rosso se posa imminente)

---

### 2. Indicatori di Urgenza e Alert

Aggiungere alert visivi in cima alla pagina per situazioni critiche:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⚠️ ATTENZIONE: 3 articoli con posa entro 7 giorni non sono ancora pronti    │
│    ORD-001 (Mario Rossi) - Posa il 14/02: Finestra Sala, Porta Ingresso     │
│    [Vai all'ordine]                                                          │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ 🚚 MERCE IN RITARDO: 2 articoli dovevano arrivare entro il 05/02            │
│    ORD-002 (Luigi Verdi): Persiane Camera (ordinato il 20/01)               │
│    [Contatta fornitore]                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### 3. Vista Timeline/Calendario

Nuova vista che mostra gli articoli organizzati per data di posa prevista:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  FEBBRAIO 2026                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Lun 10   Mar 11   Mer 12   Gio 13   Ven 14   Sab 15   Dom 16              │
│                                                                              │
│                              ┌─────────────────────┐                        │
│                              │ ORD-001 Mario R.    │                        │
│                              │ 🟢 3 pronti         │                        │
│                              │ 🟠 1 da ordinare    │                        │
│                              └─────────────────────┘                        │
│                                                                              │
│  ┌─────────────────────┐                                                    │
│  │ ORD-003 Anna B.     │                                                    │
│  │ 🔵 2 ordinati       │                                                    │
│  └─────────────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 4. Statistiche Migliorate con Progress Ring

Sostituire le card numeriche con progress ring visuali:

```text
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│     Completamento  │  │     In Magazzino   │  │     In Transito    │  │     Da Ordinare    │
│                    │  │                    │  │                    │  │                    │
│      ╭─────╮       │  │        12          │  │         8          │  │         5          │
│     │  68% │       │  │      articoli      │  │      articoli      │  │      articoli      │
│      ╰─────╯       │  │      4 ordini      │  │      3 ordini      │  │      2 ordini      │
│                    │  │                    │  │                    │  │                    │
│  17/25 installati  │  │  €12.450 valore    │  │  €8.200 in arrivo  │  │  €3.100 da spendere│
└────────────────────┘  └────────────────────┘  └────────────────────┘  └────────────────────┘
```

---

### 5. Toggle Vista Lista/Kanban/Calendario

Aggiungere switch per passare tra le viste:

```text
Vista: [Lista ✓] [Kanban] [Calendario]
```

---

### 6. Ordinamento e Raggruppamento Avanzato

Nuove opzioni di raggruppamento:
- Per ordine (attuale)
- Per fornitore (raggruppa tutti gli articoli dello stesso fornitore)
- Per data posa (ordini con posa piu imminente in cima)
- Per stato (tutti i "da ordinare" prima, poi "ordinati", ecc.)

---

### 7. Azioni di Massa Migliorate

Aggiungere checkbox per selezione multipla e azioni batch:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [✓] Seleziona tutto    5 articoli selezionati                              │
│                                                                              │
│ Azioni: [Segna come Ordinato] [Segna In Magazzino] [Segna Installato]      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 8. Indicatore Tempo in Stato

Mostrare da quanto tempo un articolo e in un certo stato:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ 🟠 Finestra Sala (x2)                                                      │
│ Fornitore: ABC Serramenti                                                  │
│ Ordinato il: 20/01/2026 (18 giorni fa) ⚠️ Attesa prolungata               │
└────────────────────────────────────────────────────────────────────────────┘
```

---

### 9. Quick Actions su Hover

Azioni rapide quando si passa sopra un articolo:
- Cambia stato veloce (icone per ogni stato)
- Vai all'ordine
- Contatta fornitore (se presente email/telefono)

---

### 10. Esportazione e Stampa

Bottoni per:
- Esporta CSV della lista filtrata
- Stampa lista materiali da ordinare
- Genera report per fornitore (tutti gli articoli di un fornitore)

---

## Struttura Tecnica

### Nuovi Componenti

| File | Descrizione |
|------|-------------|
| `src/components/warehouse/WarehouseKanbanView.tsx` | Vista Kanban con DnD |
| `src/components/warehouse/WarehouseKanbanColumn.tsx` | Colonna Kanban singola |
| `src/components/warehouse/WarehouseKanbanCard.tsx` | Card articolo draggable |
| `src/components/warehouse/WarehouseCalendarView.tsx` | Vista calendario |
| `src/components/warehouse/WarehouseAlerts.tsx` | Componente alert urgenze |
| `src/components/warehouse/WarehouseStats.tsx` | Statistiche con progress ring |

### Modifiche a File Esistenti

| File | Modifica |
|------|----------|
| `src/pages/azienda/Warehouse.tsx` | Aggiunta toggle viste, alert, nuove stats |

---

## Logica Alert Urgenza

```typescript
interface WarehouseAlert {
  type: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  items: WarehouseItem[];
  orderId: string;
  daysUntilPosa?: number;
}

function calculateAlerts(items: WarehouseItem[]): WarehouseAlert[] {
  const alerts: WarehouseAlert[] = [];
  const today = new Date();
  
  // Raggruppa per ordine
  const orderGroups = groupByOrder(items);
  
  orderGroups.forEach(group => {
    const notReadyItems = group.items.filter(i => 
      i.status === 'da_ordinare' || i.status === 'ordinato'
    );
    
    if (group.expectedDate && notReadyItems.length > 0) {
      const daysUntil = differenceInDays(group.expectedDate, today);
      
      if (daysUntil <= 7) {
        alerts.push({
          type: daysUntil <= 3 ? 'critical' : 'warning',
          title: `Posa tra ${daysUntil} giorni`,
          description: `${notReadyItems.length} articoli non pronti`,
          items: notReadyItems,
          orderId: group.orderId,
          daysUntilPosa: daysUntil,
        });
      }
    }
  });
  
  return alerts.sort((a, b) => (a.daysUntilPosa || 999) - (b.daysUntilPosa || 999));
}
```

---

## Ordine di Implementazione

1. **Fase 1**: Alert urgenze + statistiche migliorate
2. **Fase 2**: Toggle viste + vista Kanban con DnD
3. **Fase 3**: Vista Calendario
4. **Fase 4**: Selezione multipla e azioni batch
5. **Fase 5**: Esportazione CSV/stampa

---

## Riepilogo Funzionalita

1. **Vista Kanban**: Drag-and-drop tra stati con visual card
2. **Alert Urgenze**: Notifiche per articoli critici (posa imminente, merce in ritardo)
3. **Vista Calendario**: Timeline articoli per data posa
4. **Statistiche Avanzate**: Progress ring completamento + valori economici
5. **Toggle Viste**: Lista/Kanban/Calendario
6. **Raggruppamento Flessibile**: Per ordine/fornitore/data/stato
7. **Selezione Multipla**: Checkbox + azioni batch
8. **Indicatore Tempo**: "Ordinato da X giorni"
9. **Quick Actions**: Azioni rapide su hover
10. **Esportazione**: CSV, stampa, report fornitore


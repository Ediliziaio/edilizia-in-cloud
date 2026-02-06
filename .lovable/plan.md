
# Piano: Alert Visivo per Articoli e Scadenze nella Scheda Ordine

## Obiettivo

Aggiungere un sistema di alert visivo prominente nella scheda ordine che mostri:
1. Se ci sono articoli ancora "Da Ordinare"
2. Se la data di posa si sta avvicinando ma la merce non è ancora arrivata in magazzino

---

## Logica degli Alert

### Alert 1: Articoli Da Ordinare
Mostra un alert arancione se esistono articoli con stato `da_ordinare`.

**Condizione**: `items.some(item => item.status === 'da_ordinare')`

### Alert 2: Data Posa in Avvicinamento (Urgente)
Mostra un alert rosso se:
- C'è una data di posa (`expected_date`) 
- La data è entro i prossimi 7 giorni (o passata)
- Ci sono ancora articoli NON in magazzino o NON installati

**Condizione**: 
```
expected_date <= oggi + 7 giorni 
AND items.some(status === 'da_ordinare' OR status === 'ordinato')
```

### Alert 3: Merce Non Arrivata (Attenzione)
Mostra un alert giallo se:
- C'è una data arrivo merce (`warehouse_arrival_date`)
- La data è passata
- Ci sono ancora articoli con stato `ordinato` (non ancora arrivati)

**Condizione**:
```
warehouse_arrival_date < oggi
AND items.some(status === 'ordinato')
```

---

## Design Visivo degli Alert

Gli alert appariranno in cima alla scheda ordine, subito dopo l'header:

```
+-------------------------------------------------------------+
| ⚠️ ATTENZIONE: Posa prevista tra 5 giorni!                   |
|    2 articoli non sono ancora in magazzino.                  |
+-------------------------------------------------------------+

+-------------------------------------------------------------+
| 🔶 3 articoli da ordinare                                    |
|    Finestre PVC, Porte interne, Maniglie                     |
+-------------------------------------------------------------+
```

### Stili degli Alert

| Tipo | Colore | Icona | Priorità |
|------|--------|-------|----------|
| Urgente (posa imminente) | Rosso/Destructive | AlertTriangle | Alta |
| Attenzione (merce in ritardo) | Arancione | AlertCircle | Media |
| Info (articoli da ordinare) | Ambra/Giallo | Package | Bassa |

---

## Modifiche Tecniche

### File: `src/pages/azienda/OrderDetail.tsx`

#### 1. Nuovi Import
```typescript
import { AlertTriangle, AlertCircle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { differenceInDays, parseISO, isAfter, isBefore } from "date-fns";
```

#### 2. Funzione per calcolare gli alert
```typescript
interface OrderAlert {
  type: 'urgent' | 'warning' | 'info';
  title: string;
  description: string;
  icon: React.ReactNode;
}

function getOrderAlerts(
  order: OrderDetail, 
  items: OrderItem[]
): OrderAlert[] {
  const alerts: OrderAlert[] = [];
  const today = new Date();
  
  // Articoli per stato
  const itemsDaOrdinare = items.filter(i => i.status === 'da_ordinare');
  const itemsOrdinati = items.filter(i => i.status === 'ordinato');
  const itemsNonPronti = items.filter(i => 
    i.status === 'da_ordinare' || i.status === 'ordinato'
  );
  
  // Alert 1: Posa imminente con articoli non pronti
  if (order.expected_date && itemsNonPronti.length > 0) {
    const expectedDate = parseISO(order.expected_date);
    const daysUntilPosa = differenceInDays(expectedDate, today);
    
    if (daysUntilPosa <= 7) {
      alerts.push({
        type: 'urgent',
        title: daysUntilPosa <= 0 
          ? 'Posa scaduta!' 
          : `Posa prevista tra ${daysUntilPosa} giorni`,
        description: `${itemsNonPronti.length} articol${itemsNonPronti.length > 1 ? 'i' : 'o'} non ancora pront${itemsNonPronti.length > 1 ? 'i' : 'o'}: ${itemsNonPronti.map(i => i.name).join(', ')}`,
        icon: <AlertTriangle className="h-4 w-4" />,
      });
    }
  }
  
  // Alert 2: Arrivo merce in ritardo
  if (order.warehouse_arrival_date && itemsOrdinati.length > 0) {
    const arrivalDate = parseISO(order.warehouse_arrival_date);
    if (isBefore(arrivalDate, today)) {
      alerts.push({
        type: 'warning',
        title: 'Merce in ritardo',
        description: `${itemsOrdinati.length} articol${itemsOrdinati.length > 1 ? 'i' : 'o'} dovrebbero essere già arrivat${itemsOrdinati.length > 1 ? 'i' : 'o'} in magazzino`,
        icon: <AlertCircle className="h-4 w-4" />,
      });
    }
  }
  
  // Alert 3: Articoli da ordinare (solo se non ci sono alert più urgenti)
  if (itemsDaOrdinare.length > 0 && alerts.length === 0) {
    alerts.push({
      type: 'info',
      title: `${itemsDaOrdinare.length} articol${itemsDaOrdinare.length > 1 ? 'i' : 'o'} da ordinare`,
      description: itemsDaOrdinare.map(i => i.name).join(', '),
      icon: <Package className="h-4 w-4" />,
    });
  }
  
  return alerts;
}
```

#### 3. Rendering degli Alert nel JSX
Dopo l'header e prima del grid principale:

```tsx
{/* Order Alerts */}
{orderAlerts.length > 0 && (
  <div className="space-y-3">
    {orderAlerts.map((alert, index) => (
      <Alert 
        key={index}
        variant={alert.type === 'urgent' ? 'destructive' : 'default'}
        className={cn(
          alert.type === 'warning' && 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
          alert.type === 'info' && 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100'
        )}
      >
        {alert.icon}
        <AlertTitle>{alert.title}</AlertTitle>
        <AlertDescription>{alert.description}</AlertDescription>
      </Alert>
    ))}
  </div>
)}
```

---

## Risultato Atteso

1. **Alert Urgente (Rosso)**: Appare quando la data di posa è entro 7 giorni e ci sono articoli non pronti
2. **Alert Attenzione (Arancione)**: Appare quando la data arrivo merce è passata ma ci sono ancora articoli "Ordinato"
3. **Alert Info (Blu)**: Appare quando ci sono articoli da ordinare (se non ci sono alert più urgenti)
4. **Priorità Visiva**: Gli alert urgenti appaiono sempre per primi
5. **Dettaglio Articoli**: Ogni alert elenca gli articoli coinvolti per azione immediata

---

## Esempio Visivo

Quando apri la scheda ordine con problemi:

```
╔═══════════════════════════════════════════════════════════════╗
║ ← Dettaglio Ordine (ORD-2026-001)                             ║
║   Creato il 05 Feb 2026                                       ║
╠═══════════════════════════════════════════════════════════════╣
║ ⚠️ POSA PREVISTA TRA 3 GIORNI!                                ║
║    2 articoli non ancora pronti: Finestre PVC, Porte interne  ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║ [Descrizione Lavoro]     [Cliente]                            ║
║ [Articoli]               [Riepilogo Finanziario]              ║
╚═══════════════════════════════════════════════════════════════╝
```

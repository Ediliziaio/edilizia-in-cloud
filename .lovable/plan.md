
# Piano: Documenti Ordine in Creazione e Modifica

## Panoramica

Aggiungere la possibilita di caricare documenti quando si crea un nuovo ordine o si modifica uno esistente.

---

## Strategia per i Due Casi

### 1. Modifica Ordine (EditOrder.tsx)
L'ordine esiste gia con un ID, quindi posso aggiungere direttamente il componente `OrderAttachments` nel form.

### 2. Creazione Ordine (CreateOrder.tsx)
L'ordine non esiste ancora fino al submit del form. Due opzioni:

**Opzione A - Salva prima, poi carica documenti:**
- Dopo il submit, invece di tornare alla lista, si va al dettaglio ordine dove si possono caricare i documenti
- Oppure si mostra una sezione documenti che diventa attiva solo dopo il salvataggio

**Opzione B - Upload differito (consigliata):**
- Mostrare una sezione documenti con un messaggio "I documenti potranno essere caricati dopo aver salvato l'ordine"
- Dopo il submit, se l'utente ha provato a caricare file, redirect al dettaglio ordine

Implemento l'**Opzione B** che e piu user-friendly: l'utente vede la sezione documenti ma con un messaggio che indica che il caricamento sara disponibile dopo il salvataggio. Cosi l'esperienza e coerente tra creazione e modifica.

---

## Modifiche Tecniche

### File 1: `src/pages/azienda/EditOrder.tsx`

**Aggiungere import:**
```typescript
import { OrderAttachments } from "@/components/orders/OrderAttachments";
```

**Aggiungere sezione dopo Order Items (linea 620):**
```tsx
{/* Order Items */}
<OrderItemsList ... />

{/* Order Attachments */}
<OrderAttachments orderId={id!} editable={true} />

{/* Actions */}
```

---

### File 2: `src/pages/azienda/CreateOrder.tsx`

**Aggiungere import:**
```typescript
import { OrderAttachments } from "@/components/orders/OrderAttachments";
```

**Aggiungere nuovo state per tracciare l'ordine creato:**
```typescript
const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
```

**Modificare onSuccess per salvare l'ID e restare sulla pagina:**
```typescript
onSuccess: (order) => {
  queryClient.invalidateQueries({ queryKey: ["orders"] });
  toast({
    title: "Ordine creato",
    description: "L'ordine è stato creato. Ora puoi caricare i documenti.",
  });
  setCreatedOrderId(order.id);
  // Non navigare subito - permetti all'utente di caricare documenti
}
```

**Aggiungere sezione documenti dopo Order Items:**
```tsx
{/* Order Items */}
<OrderItemsList ... />

{/* Order Attachments */}
{createdOrderId ? (
  <OrderAttachments orderId={createdOrderId} editable={true} />
) : (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Paperclip className="h-5 w-5" />
        Documenti Ordine
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-center py-4 text-muted-foreground">
        <p>I documenti potranno essere caricati dopo aver salvato l'ordine.</p>
      </div>
    </CardContent>
  </Card>
)}

{/* Actions - modificare per mostrare pulsante "Vai all'ordine" se creato */}
<div className="flex justify-end gap-4">
  {createdOrderId ? (
    <Button onClick={() => navigate(`/azienda/ordini/${createdOrderId}`)}>
      Vai all'Ordine
    </Button>
  ) : (
    <>
      <Button type="button" variant="outline" onClick={...}>
        Annulla
      </Button>
      <Button type="submit" disabled={...}>
        Crea Ordine
      </Button>
    </>
  )}
</div>
```

---

## Layout Visivo

### Durante la Creazione (prima del salvataggio)
```
+-------------------------------------------------------------+
| ← Nuovo Ordine                                               |
+-------------------------------------------------------------+
| [Dettagli Ordine]     [Riepilogo Finanziario]               |
| [Tempistiche Cliente]                                        |
| [Articoli dell'Ordine]                                       |
+-------------------------------------------------------------+
| 📎 Documenti Ordine                                          |
|   I documenti potranno essere caricati dopo aver salvato     |
|   l'ordine.                                                  |
+-------------------------------------------------------------+
|                              [Annulla]  [Crea Ordine]        |
+-------------------------------------------------------------+
```

### Dopo il Salvataggio (ordine creato)
```
+-------------------------------------------------------------+
| ← Nuovo Ordine                                               |
+-------------------------------------------------------------+
| [Dettagli Ordine - disabilitato]                            |
| [Articoli dell'Ordine - disabilitato]                       |
+-------------------------------------------------------------+
| 📎 Documenti Ordine                         [+ Carica File]  |
|   Nessun documento caricato                                  |
+-------------------------------------------------------------+
|                                        [Vai all'Ordine]     |
+-------------------------------------------------------------+
```

---

## Riepilogo Modifiche

| File | Modifica |
|------|----------|
| `EditOrder.tsx` | Aggiungere `<OrderAttachments orderId={id} />` dopo OrderItemsList |
| `CreateOrder.tsx` | Aggiungere state `createdOrderId`, mostrare placeholder o componente, modificare azioni post-salvataggio |

---

## Risultato Atteso

1. **Modifica Ordine**: Sezione documenti sempre visibile e funzionante
2. **Creazione Ordine**: Sezione documenti con placeholder informativo, diventa attiva dopo il salvataggio
3. **UX coerente**: L'utente vede sempre la sezione documenti in entrambi i contesti
4. **Flusso fluido**: Dopo la creazione, l'utente puo caricare documenti prima di tornare alla lista

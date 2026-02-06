

# Piano: Allegati per Articoli dell'Ordine

## Obiettivo
Permettere di allegare documenti e foto a ogni singolo articolo dell'ordine (es: schede tecniche, foto di installazione, preventivi fornitori).

---

## Modifiche Database

### 1. Nuovo Bucket Storage: `order-attachments`
Bucket pubblico per memorizzare i file allegati agli articoli.

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-attachments', 'order-attachments', true);
```

### 2. Nuova Tabella: `order_item_attachments`
Traccia i file allegati a ogni articolo.

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| id | UUID | Primary key |
| order_item_id | UUID | FK verso order_items |
| file_name | TEXT | Nome originale del file |
| file_url | TEXT | URL pubblico del file |
| file_type | TEXT | MIME type (image/jpeg, application/pdf, ecc.) |
| file_size | INTEGER | Dimensione in bytes |
| uploaded_by | UUID | Chi ha caricato il file |
| created_at | TIMESTAMPTZ | Data upload |

### 3. RLS Policies
- Company admin puo gestire allegati dei propri ordini
- Clienti possono vedere (ma non modificare) i propri allegati
- Super admin accesso completo

---

## Modifiche UI

### Componente `OrderItemsList`

**Vista articolo con allegati:**
```
+----------------------------------------------------+
| Finestre soggiorno (x4)                [Ordinato]  |
| Dettagli aggiuntivi...                             |
|                                                    |
| Allegati: [foto1.jpg] [scheda.pdf] [+ Aggiungi]    |
+----------------------------------------------------+
```

**Funzionalita:**
- Pulsante "Allega" per ogni articolo (solo se editable=true)
- Preview miniatura per immagini
- Icona documento per PDF/altri file
- Click per aprire/scaricare
- Pulsante elimina per ogni allegato

### Dialog Allegati
Quando si clicca su "Allega" o sull'icona allegati:
- Lista file esistenti con anteprima
- Pulsante per caricare nuovi file
- Drag & drop supportato
- Formati: JPG, PNG, PDF, DOCX
- Max 5MB per file

---

## File da Creare/Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| Migrazione SQL | Creare | Bucket storage + tabella attachments |
| `src/components/orders/OrderItemAttachments.tsx` | Creare | Componente per gestire allegati singolo articolo |
| `src/components/orders/OrderItemsList.tsx` | Modificare | Aggiungere sezione allegati a ogni articolo |
| `src/pages/azienda/OrderDetail.tsx` | Modificare | Passare dati allegati e gestire refresh |
| `src/pages/cliente/CustomerOrderDetail.tsx` | Modificare | Mostrare allegati (sola lettura) |

---

## Dettagli Tecnici

### Struttura File Storage
```
order-attachments/
  └── {order_item_id}/
      ├── foto-installazione.jpg
      ├── scheda-tecnica.pdf
      └── preventivo.docx
```

### Flusso Upload
1. Utente seleziona file
2. Validazione tipo e dimensione
3. Upload su storage `order-attachments/{item_id}/{filename}`
4. Ottieni URL pubblico
5. Salva record in `order_item_attachments`
6. Refresh lista allegati

### Query per Caricare Allegati
```typescript
const { data: attachments } = await supabase
  .from("order_item_attachments")
  .select("*")
  .in("order_item_id", itemIds)
  .order("created_at");
```

### Interfaccia OrderItem Aggiornata
```typescript
interface OrderItem {
  id?: string;
  name: string;
  description?: string;
  quantity: number;
  status: OrderItemStatus;
  position: number;
  attachments?: OrderItemAttachment[];  // NUOVO
}

interface OrderItemAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
}
```

---

## Comportamento per Ruolo

| Ruolo | Visualizza | Carica | Elimina |
|-------|-----------|--------|---------|
| Company Admin | Si | Si | Si |
| Cliente | Si | No | No |
| Super Admin | Si | Si | Si |

---

## Risultato Atteso

1. Ogni articolo dell'ordine puo avere allegati multipli
2. L'azienda puo caricare schede tecniche, foto, documenti
3. Il cliente vede gli allegati relativi ai propri articoli
4. I file sono organizzati per articolo in modo chiaro
5. Supporto per immagini e documenti comuni


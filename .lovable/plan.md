
# Piano: Documenti Ordine con Controllo Visibilita Cliente

## Panoramica

Aggiungere la possibilita di caricare documenti a livello di ordine (non di singolo articolo) con un flag per controllare se il documento e visibile al cliente o meno.

---

## Modifiche Database

### Nuova Tabella: `order_attachments`

```sql
CREATE TABLE public.order_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by UUID NOT NULL,
  visible_to_customer BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Colonne

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `order_id` | UUID | Riferimento all'ordine |
| `file_name` | TEXT | Nome originale del file |
| `file_url` | TEXT | URL pubblico nel bucket storage |
| `file_type` | TEXT | MIME type (es. `application/pdf`) |
| `file_size` | INTEGER | Dimensione in bytes |
| `uploaded_by` | UUID | Chi ha caricato il file |
| `visible_to_customer` | BOOLEAN | Se `true`, il cliente puo vederlo |
| `created_at` | TIMESTAMPTZ | Data caricamento |

### RLS Policies

```sql
-- Company admins: accesso completo ai documenti dei propri ordini
CREATE POLICY "Company admins can manage their order attachments"
  ON public.order_attachments FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin') AND
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_attachments.order_id
      AND o.company_id = get_user_company_id(auth.uid())
    )
  );

-- Clienti: possono vedere SOLO i documenti marcati come visibili
CREATE POLICY "Customers can view visible order attachments"
  ON public.order_attachments FOR SELECT
  USING (
    visible_to_customer = true AND
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_attachments.order_id
      AND o.customer_id = auth.uid()
    )
  );

-- Super admins: accesso completo
CREATE POLICY "Super admins can manage all order attachments"
  ON public.order_attachments FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));
```

---

## UI Lato Azienda

### Nuovo Componente: `OrderAttachments`

Una card dedicata nella pagina di creazione/modifica ordine e nel dettaglio ordine:

```
+-------------------------------------------------------------+
| 📎 Documenti Ordine                          [+ Carica File] |
+-------------------------------------------------------------+
| VISIBILI AL CLIENTE (2)                                     |
| +----------------------------------------------------------+|
| | 📄 Contratto_firmato.pdf       2.3MB  [👁️ Visibile] [🗑️] ||
| | 📄 Preventivo.pdf              1.1MB  [👁️ Visibile] [🗑️] ||
| +----------------------------------------------------------+|
|                                                              |
| SOLO USO INTERNO (1)                                         |
| +----------------------------------------------------------+|
| | 📄 Nota_interna_fornitore.pdf  800KB [🔒 Privato]   [🗑️] ||
| +----------------------------------------------------------+|
+-------------------------------------------------------------+
```

### Funzionalita

1. **Caricamento file** con dialog modale
2. **Toggle visibilita** - switch per cambiare `visible_to_customer`
3. **Due sezioni** - documenti visibili vs documenti interni
4. **Preview/Download** - click sul nome apre il file
5. **Eliminazione** con conferma

### Toggle Visibilita

Ogni documento avra un badge/switch:
- 🟢 **Visibile al cliente** - colore verde, icona occhio
- 🔴 **Solo uso interno** - colore rosso/grigio, icona lucchetto

L'admin puo cliccare per cambiare lo stato.

---

## UI Lato Cliente

### Sezione in CustomerOrderDetail

Aggiungere una card "Documenti" che mostra solo i file con `visible_to_customer = true`:

```
+-------------------------------------------------------------+
| 📄 Documenti                                                 |
+-------------------------------------------------------------+
| 📄 Contratto_firmato.pdf                2.3MB    [Scarica]   |
| 📄 Preventivo.pdf                       1.1MB    [Scarica]   |
+-------------------------------------------------------------+
```

Se non ci sono documenti visibili, la sezione non appare.

---

## File da Modificare/Creare

| File | Azione |
|------|--------|
| **Migrazione SQL** | Creare tabella `order_attachments` con RLS |
| **`src/components/orders/OrderAttachments.tsx`** | Nuovo componente per gestione documenti |
| **`src/pages/azienda/OrderDetail.tsx`** | Aggiungere sezione documenti |
| **`src/pages/azienda/CreateOrder.tsx`** | Aggiungere sezione documenti (dopo salvataggio) |
| **`src/pages/azienda/EditOrder.tsx`** | Aggiungere sezione documenti |
| **`src/pages/cliente/CustomerOrderDetail.tsx`** | Mostrare documenti visibili |

---

## Dettagli Tecnici

### Componente OrderAttachments (Admin)

```typescript
interface OrderAttachment {
  id: string;
  order_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  visible_to_customer: boolean;
  created_at: string;
}

interface OrderAttachmentsProps {
  orderId: string;
  editable?: boolean;
}
```

### Logica di Toggle Visibilita

```typescript
const toggleVisibility = async (attachment: OrderAttachment) => {
  await supabase
    .from("order_attachments")
    .update({ visible_to_customer: !attachment.visible_to_customer })
    .eq("id", attachment.id);
  
  refetch();
};
```

### Upload Flow

```typescript
// 1. Upload al bucket storage
const filePath = `orders/${orderId}/${timestamp}-${filename}`;
await supabase.storage.from("order-attachments").upload(filePath, file);

// 2. Ottieni URL pubblico
const { publicUrl } = supabase.storage.from("order-attachments").getPublicUrl(filePath);

// 3. Salva record in database
await supabase.from("order_attachments").insert({
  order_id: orderId,
  file_name: file.name,
  file_url: publicUrl,
  file_type: file.type,
  file_size: file.size,
  uploaded_by: user.id,
  visible_to_customer: false, // Default: privato
});
```

---

## UX - Workflow di Esempio

### Scenario: Admin carica un contratto

1. Admin apre la scheda ordine
2. Nella sezione "Documenti Ordine" clicca "Carica File"
3. Seleziona il PDF del contratto
4. Il file appare con badge rosso "Solo uso interno"
5. Admin clicca il toggle per renderlo visibile al cliente
6. Il badge diventa verde "Visibile al cliente"
7. Il cliente, accedendo al suo portale, vede il documento nella sezione "Documenti"

---

## Risultato Atteso

1. **Documenti a livello ordine** - Separati dagli allegati degli articoli
2. **Controllo visibilita** - L'admin decide cosa mostrare al cliente
3. **Default sicuro** - I nuovi documenti sono privati per default
4. **Sezione cliente** - Il cliente vede solo i documenti marcati come visibili
5. **Riutilizzo bucket** - Usa lo stesso bucket storage `order-attachments`

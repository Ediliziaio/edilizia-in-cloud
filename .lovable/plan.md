

# Azioni Rapide: Eliminazione Clienti e Ordini

## Cosa viene aggiunto

### 1. Lista Clienti (`CustomersList.tsx`)
- Aggiungere un pulsante **Elimina** (icona cestino) nella colonna Azioni, accanto a Modifica e Reset Password
- L'eliminazione e protetta da un AlertDialog di conferma
- Se il cliente ha ordini associati (`order_count > 0`), l'eliminazione viene bloccata con messaggio esplicativo
- Dopo l'eliminazione, la lista si aggiorna automaticamente tramite `invalidateQueries`

### 2. Lista Ordini (`OrdersList.tsx`)
- Sostituire il singolo pulsante "Visualizza" con un gruppo di 3 azioni:
  - **Visualizza** (icona occhio) - link al dettaglio ordine (gia esistente)
  - **Modifica** (icona matita) - link alla pagina di modifica ordine (`/azienda/ordini/${id}/modifica`)
  - **Elimina** (icona cestino) - con AlertDialog di conferma
- L'eliminazione dell'ordine cancella prima i dati collegati (order_items, order_status_history, order_employees, order_external_teams, order_salespeople, order_attachments) e poi l'ordine stesso
- Dopo l'eliminazione, la lista si aggiorna automaticamente

## Dettaglio Tecnico

### CustomersList.tsx
- Aggiungere `useMutation` e `useQueryClient` per la delete
- Aggiungere icona `Trash2` da lucide-react
- Prima di eliminare: verificare `order_count === 0`
- Query: `supabase.from("profiles").delete().eq("id", customerId)`
- Invalidare `["customers-list"]`

### OrdersList.tsx
- Aggiungere `Pencil, Trash2` da lucide-react
- Aggiungere `useMutation` per la delete
- Aggiungere `AlertDialog` imports
- Eliminazione cascata manuale (le FK non hanno ON DELETE CASCADE):
  1. Eliminare `order_item_attachments` per ogni item dell'ordine
  2. Eliminare `order_items`
  3. Eliminare `order_status_history`
  4. Eliminare `order_employees`
  5. Eliminare `order_external_teams`
  6. Eliminare `order_salespeople`
  7. Eliminare `order_attachments`
  8. Eliminare l'ordine da `orders`
- Invalidare `["orders"]`

### File da modificare
1. `src/pages/azienda/CustomersList.tsx` - aggiungere pulsante elimina con protezione ordini
2. `src/pages/azienda/OrdersList.tsx` - aggiungere pulsanti modifica e elimina con cascata


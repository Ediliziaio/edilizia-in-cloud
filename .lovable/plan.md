

# Prompt 2 — Ordini (senza PDF Preventivo)

Due fix da implementare: **FIX 2A** (Unifica pagamenti) e **FIX 2B** (Duplica ordine).

---

## FIX 2A — Unificare sistema pagamenti

### Database Migration
- Creare VIEW `order_payment_summary` che aggrega da `order_installments`:
  ```sql
  CREATE VIEW order_payment_summary AS
  SELECT order_id,
    SUM(amount) as total_invoiced,
    SUM(CASE WHEN is_paid THEN amount ELSE 0 END) as total_collected,
    SUM(CASE WHEN NOT is_paid THEN amount ELSE 0 END) as total_pending,
    COUNT(*) as installment_count
  FROM order_installments GROUP BY order_id;
  ```

### Frontend — `OrderDetail.tsx`
- Semplificare `updatePaymentMutation` (righe 320-369): rimuovere il ramo legacy (righe 336-359) che gestisce `fieldMap.key`
- Per ordini legacy senza installments in DB: al primo toggle pagamento, inserire le installments da `buildInstallmentsFromLegacy()` nella tabella `order_installments`, poi aggiornare la riga appena creata
- Marcare codice legacy con `@deprecated`

---

## FIX 2B — Duplica Ordine

### Edge Function: `supabase/functions/duplicate-order/index.ts`
- Auth: `requireAuth` + verifica che l'utente appartenga alla stessa company dell'ordine
- Input: `{ source_order_id: string }`
- Logica:
  1. Carica ordine sorgente + articoli + installments
  2. Crea nuovo ordine con: campi copiati, `current_status_id` = primo status (per position), date resettate, `order_code` = `"DUP-" + timestamp`
  3. Copia articoli (senza `stock_item_id`, status = `da_ordinare`)
  4. Copia installments con `is_paid = false`, `paid_date = null`
  5. NON copia: allegati, history, assegnazioni, task, appuntamenti
  6. Restituisce `{ id: newOrderId }`

### Frontend — `OrderDetail.tsx`
- Aggiungere pulsante "Duplica" con icona `Copy` accanto a "Modifica" (riga 522)
- Dialog di conferma prima della duplicazione
- Al successo: navigare al nuovo ordine + toast

---

## File da modificare/creare

| File | Azione |
|------|--------|
| Migration SQL | CREATE VIEW `order_payment_summary` |
| `src/pages/azienda/OrderDetail.tsx` | Pulsante Duplica + semplificazione pagamenti |
| `supabase/functions/duplicate-order/index.ts` | Nuova edge function |


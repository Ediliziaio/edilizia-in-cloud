

# Prompt 2 — FIX 2C: Refactoring CreateOrder con react-hook-form + Zod

FIX 2A e 2B sono già implementati. FIX 2D (PDF) escluso. Rimane solo FIX 2C.

---

## Cosa cambia

Il file `CreateOrder.tsx` (767 righe) usa 17 `useState` separati per i campi del form. Il refactoring li sostituisce con `useForm` + schema Zod per validazione automatica.

### Nuovo file: `src/lib/orderSchema.ts`

Schema Zod con:
- `customer_id`: string uuid required
- `description`: string min 3 chars
- `total_amount`: number positive
- `payment_type`: enum standard/financing
- `vat_rate`: string (default "22")
- `order_code`, `internal_notes`: string optional
- `status_id`: string uuid optional
- `financing_cost`: string optional
- `has_building_bonus`: boolean
- Date opzionali: `expected_date`, `warehouse_arrival_date`, `work_start_date`, `work_end_date` (Date | undefined)
- `salesperson_id`, `assigned_to`: string optional

### Modifica: `src/pages/azienda/CreateOrder.tsx`

- Rimuovere i 17 `useState` per i campi base (customerId, orderCode, description, internalNotes, statusId, expectedDate, warehouseArrivalDate, workStartDate, workEndDate, paymentType, totalAmount, vatRate, financingCost, hasBuildingBonus, salespersonId, salespersonData, assignedTo)
- Sostituire con `useForm({ resolver: zodResolver(orderSchema), defaultValues: {...} })`
- Usare `Controller` per Select, Calendar, Switch
- La validazione nel `handleSubmit` diventa automatica (rimuovere i toast manuali per campi obbligatori)
- I campi complessi (orderItems, installments, numInstallments, pendingFiles, showCreateCustomer, createdOrderId) restano `useState` separati perché sono array dinamici/UI state
- Adattare `useOrderDraft` per leggere da `form.getValues()` e scrivere con `form.reset(draftData)`
- `handleClearDraft` usa `form.reset(defaultValues)`

---

## File da creare/modificare

| File | Azione |
|------|--------|
| `src/lib/orderSchema.ts` | Nuovo — schema Zod |
| `src/pages/azienda/CreateOrder.tsx` | Refactoring useState → useForm |


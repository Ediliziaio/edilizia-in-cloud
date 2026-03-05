
# Audit, Fix & UX Stabilization — COMPLETATO

## Bug Corretti

1. **QueryKey mismatch** (`CreateCustomerDialog.tsx`): invalidazione cambiata da `["customers", user?.id]` a `["customers", effectiveCompany?.id]` — ora la dropdown clienti si aggiorna dopo la creazione inline.
2. **`expectedDate` senza UI**: aggiunto date picker "Data Prevista" nella card Tempistiche (griglia 4 colonne su desktop).
3. **Toast inconsistente**: `CreateCustomerDialog` migrato da `useToast` (Radix) a `toast` di `sonner`.

## Miglioramenti UX

1. `maxLength` aggiunto a: orderCode (50), description (1000), internalNotes (1000)
2. Card Tempistiche ora include 4 date picker (Data Prevista + Arrivo Merce + Inizio/Fine Lavori)

## Codice Rimosso

- Import `useToast` e `user` rimossi da `CreateCustomerDialog` (non più necessari dopo migrazione a sonner e fix queryKey)

## Nessuna Modifica A

- Database, edge functions, logica drag-and-drop, Gantt, calendario

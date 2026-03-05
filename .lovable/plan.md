

# Aggiungere tutti i campi cliente al dialog di creazione ordine

## Problema
Il dialog "Nuovo Cliente" dentro la creazione ordine (`CreateCustomerDialog.tsx`) ha solo 5 campi (nome, cognome, email, telefono, indirizzo), mentre la pagina dedicata (`CreateCustomer.tsx`) ne ha 8 (aggiunge CF/P.IVA, indirizzo cantiere, note).

## Soluzione
Aggiungere i 3 campi mancanti al dialog, inviandoli all'edge function `create-customer` che già li supporta.

### Modifiche a `src/components/orders/CreateCustomerDialog.tsx`

1. **Nuovi state**: `fiscalCode`, `siteAddress`, `notes` (+ reset in `resetForm`)
2. **Nuovi campi nel form** (dopo telefono, prima del footer):
   - CF / P.IVA — `Input` con `maxLength={16}`
   - Indirizzo Cantiere — `Textarea` rows=2
   - Note — `Textarea` rows=2
3. **Body della fetch**: aggiungere `fiscal_code`, `site_address`, `notes` alla chiamata `create-customer`
4. **Rendere il dialog scrollabile**: aggiungere `max-h-[80vh] overflow-y-auto` al contenuto del form per gestire l'altezza su schermi piccoli

Nessuna modifica all'edge function (già accetta questi campi). Nessuna modifica al DB.


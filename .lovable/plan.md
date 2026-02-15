

# Rimuovere sezione "Decurtazioni dall'ordine" dal componente Provvigioni

## Cosa viene rimosso

Nel file `src/components/orders/OrderCommissions.tsx`, la sezione "Decurtazioni dall'ordine" (righe 429-448) che mostra:
- Titolo "DECURTAZIONI DALL'ORDINE"
- Imponibile vendita (netto IVA)
- Totale provvigioni (negativo)
- Netto dopo provvigioni

Questa informazione e ridondante perche il margine e gia calcolato nel Conto Economico (`OrderEconomics`).

## Dettaglio tecnico

### File: `src/components/orders/OrderCommissions.tsx`

Rimuovere le righe 429-448 (dal commento `{/* Decurtazioni dall'ordine */}` fino alla chiusura del `</div>`), incluso il `<Separator />` iniziale.

Il componente terminera dopo il riepilogo provvigioni e prima di `</CardContent>`.


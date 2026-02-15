
# Duplica Costo + Rimozione Tab Fornitori

## Panoramica

Due interventi principali:

1. **Duplica costo con un click**: aggiungere un'azione "Duplica" nel DropdownMenu di ogni costo. Pre-compila il dialog con gli stessi dati ma avanza la data di scadenza di un mese.
2. **Rimozione tab "Fornitori"**: eliminare la tab dedicata ai pagamenti fornitori dalla sezione Costi. I pagamenti ai fornitori (acconti e saldi derivati dagli articoli d'ordine con `payment_method` 50/50 o 30/70) sono gia' visibili come costi variabili nella tab "Variabili" e nel Previsionale. La tab separata e' ridondante e crea confusione.

---

## Dettaglio Tecnico

### File modificato: `src/components/forecast/CompanyCostsManager.tsx`

### 1. Funzione "Duplica Costo"

Aggiungere una nuova funzione `openDuplicate(cost)` che:
- Copia tutti i dati del costo (`name`, `cost_type`, `amount`, `category`, `recurrence`, `notes`, `supplier_id`, `vat_rate`)
- Avanza la `due_date` di 1 mese usando `addMonths`
- Imposta `periods` a `"1"` e `is_gross` a `false`
- NON imposta `editingCost` (cosi' salva come nuovo)
- Apre il dialog

Nel `DropdownMenu` di ogni riga (non proveniente da ordine), aggiungere una voce:
- Icona `Copy` da lucide-react
- Testo: "Duplica (+1 mese)"

### 2. Rimozione Tab Fornitori

Eliminare dal JSX:
- Il `TabsTrigger` con `value="suppliers"` (riga ~1383-1386)
- L'intero `TabsContent value="suppliers"` (righe ~1391-1474)

Eliminare il codice morto associato:
- La query `supplierPaymentItems` (righe ~252-269) -- usata SOLO per la tab fornitori
- Il `useMemo` `supplierPaymentsData` (righe ~375-395) -- dipende da `supplierPaymentItems`
- Il `useMemo` `supplierGroupedData` (righe ~398-407) -- dipende da `supplierPaymentsData`
- La stat card "Fornitori da pagare" (righe ~1294-1301) che usa `vatStats.supplierUnpaid` -- opzionale, ma la logica sottostante (`vatStats.supplierUnpaid`) puo' restare perche' calcola dai `company_costs` con `supplier_id`

Nota: i pagamenti ai fornitori derivati dagli ordini (acconti/saldi) sono gia' gestiti nel Previsionale tramite `ForecastSupplierPayments` e `useCashFlowData`. Non si perde nessuna informazione rimuovendo la tab.

### 3. Pulizia import

Rimuovere `isLoadingSupplierPayments` dal destructuring della query rimossa. Verificare che `Progress` non sia piu' usato altrove nel file (era usato solo nelle progress bar fornitori) e rimuoverlo dagli import se necessario.

---

## Riepilogo modifiche

| Azione | Dettaglio |
|--------|-----------|
| Nuova funzione | `openDuplicate(cost)` con data +1 mese |
| Nuova voce menu | "Duplica (+1 mese)" nel DropdownMenu |
| Nuovo import | `Copy` da lucide-react |
| Rimosso | Tab "Fornitori" (TabsTrigger + TabsContent) |
| Rimosso | Query `supplierPaymentItems` |
| Rimosso | `useMemo` `supplierPaymentsData` e `supplierGroupedData` |
| Rimosso | Import `Progress` (se non usato altrove) |

Nessuna modifica al database.

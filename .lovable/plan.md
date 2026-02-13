

# Miglioramento Provvigioni Venditori

## Cosa cambia

### 1. Data di pagamento prevista ("Da pagare")
Quando la provvigione non e ancora pagata, viene mostrato un campo data per impostare la **data prevista di pagamento**. Questo permette di pianificare le uscite nel previsionale.

### 2. Popup selezione data pagamento effettivo ("Pagata")
Quando si attiva lo switch "Pagata", invece di salvare automaticamente la data odierna, si apre un **Dialog** con un calendario per selezionare la data effettiva di pagamento. L'utente conferma la data e solo allora il sistema salva.

### 3. Riepilogo decurtazioni dall'ordine
In fondo alla card delle provvigioni, viene aggiunta una riga che mostra l'impatto delle provvigioni sul margine dell'ordine, ad esempio:
- Imponibile vendita: 10.000 euro
- Totale provvigioni: -500 euro
- Netto dopo provvigioni: 9.500 euro

## Dettaglio tecnico

### File da modificare
`src/components/orders/OrderCommissions.tsx`

### Modifiche principali

1. **Stato locale per il dialog**: aggiungere `paidDialogOpen` e `paidDialogSp` per gestire quale venditore sta per essere segnato come pagato, e `selectedPaidDate` per la data scelta nel popup.

2. **Switch "Pagata"**: quando si attiva (da non pagato a pagato), invece di chiamare direttamente la mutation, aprire il Dialog con il calendario. Se si disattiva (da pagato a non pagato), rimuovere direttamente la data.

3. **Dialog con calendario**: un componente Dialog che contiene un Calendar per scegliere la data di pagamento effettivo e un pulsante "Conferma".

4. **Campo data prevista**: per ogni provvigione non pagata, mostrare un date picker per `payment_expected_date` (campo gia presente nel database).

5. **Sezione decurtazioni**: in fondo alla card, mostrare il riepilogo dell'impatto delle provvigioni sull'ordine (imponibile - provvigioni = netto).


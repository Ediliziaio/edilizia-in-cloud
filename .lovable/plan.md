
# Salvataggio Automatico Bozza Ordine

## Problema
Se l'utente chiude accidentalmente la pagina di creazione ordine, perde tutti i dati inseriti.

## Soluzione
Salvare automaticamente i dati del form in `localStorage` mentre l'utente compila, e ripristinarli al riapertura della pagina. La bozza viene cancellata solo dopo il salvataggio effettivo dell'ordine.

## Come funziona
- Ogni modifica al form viene salvata in `localStorage` con un debounce di 500ms (per non rallentare la digitazione)
- Alla riapertura della pagina, se esiste una bozza, i campi vengono precompilati automaticamente
- Un banner giallo in alto avvisa: "Bozza recuperata - i dati precedenti sono stati ripristinati"
- Un pulsante "Cancella bozza" permette di svuotare tutto e ripartire da zero
- Dopo il salvataggio dell'ordine, la bozza viene eliminata automaticamente

## Dati salvati in bozza
- Cliente selezionato, codice ordine, descrizione, note interne
- Stato iniziale, date (consegna, arrivo magazzino, inizio/fine lavori)
- Importi (totale, acconti, finanziamento, IVA, tipo pagamento)
- Stati pagamento e date pagamento
- Articoli dell'ordine (nome, quantita, prezzi, fornitore, ecc.)
- Venditore selezionato

## Dettaglio tecnico

### File da modificare
`src/pages/azienda/CreateOrder.tsx`

### Implementazione
1. Definire una chiave localStorage: `order-draft-{companyId}`
2. Creare un oggetto `draftData` che raccoglie tutti gli state del form
3. Usare un `useEffect` con debounce per salvare in localStorage ad ogni modifica
4. Usare un `useEffect` iniziale per caricare la bozza al mount del componente
5. Aggiungere uno state `draftRestored` per mostrare il banner informativo
6. Nella `onSuccess` della mutation, rimuovere la bozza da localStorage
7. Aggiungere un pulsante "Cancella bozza" che resetta tutti i campi e rimuove dal localStorage

### Struttura bozza in localStorage
```json
{
  "customerId": "...",
  "orderCode": "...",
  "description": "...",
  "totalAmount": "1000",
  "orderItems": [...],
  "savedAt": "2026-02-13T..."
}
```

### Note
- Le date vengono serializzate come stringhe ISO e riconvertite al caricamento
- La bozza e separata per azienda (chiave con companyId) per evitare conflitti
- Nessuna modifica al database necessaria

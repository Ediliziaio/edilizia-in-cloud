# Modifiche in blocco su fatture ricevute ed emesse

Obiettivo: selezionare tante fatture e cambiarle insieme, invece di aprirle una per una.
Stesse regole della modifica singola: nessuna funzione nuova nel database, nessuna migrazione.

## Fatture ricevute

Oggi non c'è selezione. Si aggiungono le caselle su ogni riga (anche da telefono), «seleziona tutte»
sulle fatture filtrate e una barra con:

| Azione | Funzione usata | Si può annullare |
|---|---|---|
| Segna pagate, con una data o con la scadenza di ogni fattura | `segna_fattura_ricevuta_pagata` | Sì |
| Di nuovo da pagare | `segna_fattura_ricevuta_pagata` | Sì, torna la data di prima |
| Verificate / Da verificare | `fattura_segna_verifica` | Sì |
| Contabilizza | `contabilizza_fattura_ricevuta` | No: crea i costi |
| Metti su una commessa | `commessa_collega_fattura_ricevuta` | No |

## Fatture emesse

La selezione c'è già. Chi fattura col gestionale interno ha già «Segna pagati»; manca a chi ha un
gestionale esterno, con le fatture importate. Si aggiunge «Segna incassate» con data e metodo, per il
residuo di ogni fattura. Da Fatture in Cloud il pagamento si registra anche lì, come nella modifica
singola: la finestra di conferma lo dice prima.

## Regole

- Si salta chi non c'entra (note di credito, autofatture, fatture già in quello stato): la conferma
  dice quante e perché, prima di partire.
- Una fattura che non riesce non ferma le altre: alla fine c'è l'elenco col motivo.
- Chi ha la sola lettura non vede le caselle.

## Fuori da questo giro

- Annullare in blocco gli incassi delle emesse: si annullano dalla singola fattura.
- La selezione delle emesse resta sulla pagina corrente e non è disponibile da telefono.

# Verifica della pubblicazione fotovoltaico

Rilascio isolato dalle modifiche degli altri lavori, preparato sulla versione aggiornata di main.

## Simulazioni del renderer effettivo

| Campione | Potenza | Formula | Pagine |
|---|---:|---|---:|
| Casa senza accumulo, senza mappa | 3 kWp | Acquisto diretto | 16 |
| Casa con accumulo | 6 kWp | Finanziamento dimostrativo | 18 |
| Casa senza accumulo, senza mappa | 10 kWp | Finanziamento dimostrativo | 18 |
| Casa con testi e immagine personalizzati | 6 kWp | Acquisto diretto | 17 |
| Azienda | 20 kWp | Acquisto diretto | 20 |
| Azienda | 60 kWp | Noleggio dimostrativo, 70.000 euro IVA inclusa | 19 |
| Azienda | 100 kWp | Leasing dimostrativo | 20 |
| Azienda | 200 kWp | Finanziamento dimostrativo | 20 |

Controlli: numero di pagine e piè di pagina coerenti, produzione = autoconsumo + immissione, consumo = autoconsumo + prelievo, confronto mensile coerente con rata/canone, assenza di numeri non validi. Verifica di impaginazione in Chrome isolato, rete bloccata: 148 pagine, zero elementi fuori bordo, zero immagini mancanti. Illustrazioni della casa e del capannone conservate.

Non sono offerte commerciali né calcoli di progettazione elettrica. I coefficienti del campione di noleggio senza validità confermata restano utilizzabili solo in simulazione.

## Salvataggio e accessi

La migrazione del rilascio aggiunge l'archivio delle condizioni di noleggio e il JSON economico del preventivo, ed estende i modelli ammessi ai due modelli aziendali. Nessun preventivo dimostrativo è inserito nelle aziende reali.

Test PostgreSQL locale: isolamento fra due aziende; lettore senza scrittura; rifiuto di anon, cliente esterno e utente bloccato; attivazione/disattivazione consentita; condizioni e originali immutabili; accettazione dei modelli aziendali solo per la propria azienda; migrazione idempotente. Il PDF rifiuta una tabella disattivata anche se il preventivo conserva una copia precedente.

## Ambito

Include preventivatore, posa commerciale e quantità/prezzi, modelli aziendali, finanza, monitoraggio opzionale e personalizzazione dei testi/media del PDF. Conserva i prototipi locali per ortofoto, modelli drone, tracciamento perimetro e confronti di posa. La progettazione elettrica e gli studi tecnici dell'altro lavoro restano esclusi. Le pagine di prova locali non diventano percorsi pubblici senza autenticazione.

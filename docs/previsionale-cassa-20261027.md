# Previsionale di cassa — verifica locale 27 ottobre 2026

## Interfaccia e lettura

- Quattro schede principali: Panoramica, Scenari, Movimenti e Da sistemare.
- Settimane, Incassato e Fonti restano nei dettagli, con gli URL precedenti compatibili.
- Orizzonte, scenario e soglia rimangono visibili; i filtri secondari si aprono su richiesta o quando presenti nell'URL.
- La qualità dei dati è esposta in ogni scheda: movimenti senza data, possibili duplicati, stime incluse e scaduti esclusi. Le entrate e le uscite senza data non vengono compensate fra loro.
- Il riepilogo distingue fabbisogno intermedio e saldo finale, conta i giorni con chiusura sotto soglia e mostra il primo rientro. Le principali uscite fino al minimo sono consultabili senza applicare modifiche.
- Il grafico conserva il segno dei saldi negativi, visualizza la zona sotto soglia e confronta il piano con lo stesso piano senza stime. Il dettaglio del giorno/settimana si apre lateralmente, con collegamento all'elenco completo.

## Scenari

Incassi puntuali, ritardo medio storico, +15 e +30 giorni usano lo stesso saldo, gli stessi filtri, le stesse uscite e la stessa soglia. Le date spostate manualmente restano fisse. Se lo storico non è sufficiente, il confronto storico è indisponibile, non sostituito da uno zero misurato.

Gli incassi spostati oltre l'orizzonte sono esposti separatamente: non sono persi, ma non contribuiscono al saldo finale del periodo. I calcoli sono locali e memorizzati in React; cambiare scenario non aggiunge richieste al database né aggiorna le scadenze originali.

## Salvaguardie sugli importi

- L'IVA preliminare richiede una scelta separata, inizialmente disattivata. Non è una liquidazione o un F24 compilato.
- Una lettura fiscale parziale non genera una stima IVA apparentemente completa.
- F24 annullati non sopprimono una stima; registrazioni trimestrali o codice/mese incoerenti sospendono la proiezione mensile e producono un avviso.
- Le ipotesi di netto su commesse con bonus sono dichiarate nella nota del movimento con lordo e trattenuta prevista. Non attestano una ritenuta effettivamente subita. Il collegamento commessa della fattura viene usato anche se manca sulla scadenza.
- Gli incassi già registrati non ricevono una seconda riduzione per ritenuta.
- Un saldo iniziale mancante resta indisponibile, mai zero. Le soglie non finite o fuori intervallo vengono ignorate.

## Verifiche

Suite dedicata: `forecastLedger`, `forecastDataset`, `forecastInsights`, `forecastWorkspace` (79 test). Copertura di segno del saldo, confronto a ipotesi uguali, assenza di storico, recupero dopo il minimo, IVA opt-in/fonti incomplete, F24 annullati/trimestrali/incoerenti, ritenuta applicata una sola volta, filtri e URL, esportazione, pannello laterale e immutabilità dei dati origine.

Verifica browser in Demo Azienda 2: caricamento, confronto dei quattro scenari, applicazione di +30 giorni, apertura/chiusura del dettaglio dal grafico e filtri avanzati. Screenshot in `output/previsionale-miglioramenti-20261027/`.

Nessuna migrazione, registrazione fiscale, modifica di scadenze, pagamento, pubblicazione o invio ai clienti è incluso in questo intervento. Le anomalie nei dati reali restano da correggere nelle rispettive fonti dopo verifica umana; il previsionale le evidenzia, non le sana automaticamente.

## Seconda revisione: design del grafico

Componente di presentazione separato `ForecastCashChart`: area blu sfumata, saldo finale in evidenza, scala con valori arrotondati e segni preservati, minimo arancione senza etichette sovrapposte alla curva. La linea mantiene i salti delle scadenze, senza inventare movimenti intermedi.

Il confronto senza stime e il pannello blu/arancione dei flussi sono facoltativi. Il tooltip mostra data, saldo e flussi del periodo selezionato; minimo e tabella hanno comandi accessibili da tastiera. Le animazioni del grafico non interpolano i dati durante gli aggiornamenti; le transizioni dei controlli restano leggere.

Suite estesa a 84 test, inclusi scala negativa/zero, tooltip reale, controlli progressivi, callback del periodo e assenza di saldo iniziale. Non sono cambiati calcoli finanziari, sorgenti, chiamate di rete o registrazioni.

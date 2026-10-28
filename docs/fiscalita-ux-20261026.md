# Fiscalità: uniformità UI e chiarezza dei riepiloghi

## Ambito

Correzione locale richiesta a partire dagli screenshot del 26 ottobre 2026. Nessuna pubblicazione, modifica di schema, registrazione fiscale, trasmissione o pagamento effettuato in questa verifica. Le modifiche già presenti di altri moduli sono state conservate.

## Interventi

- Sostituiti i tre select nativi di anno, tipo periodo e mese/trimestre con il componente condiviso dell’app: menu arrotondato, altezza contenuta, scorrimento, selezione evidenziata e tastiera. Nessuna modifica globale ai dropdown.
- Sincronizzati mese e trimestre nella navigazione: il cambio di vista mantiene un intervallo coerente e conserva anno, sezione, ricerca e contesto delegato. Le quattro sezioni rimangono nel workspace, caricando solo il contenuto attivo. Aggiunta navigazione delle schede con frecce, Home ed End.
- Registro IVA: il riepilogo resta relativo all’intero periodo; la ricerca filtra la tabella e mostra un totale esplicitamente riferito ai risultati. Rimosso il totale ripetuto nel piè di tabella senza ricerca. I conteggi distinguono documenti, righe IVA e proiezioni reverse charge.
- Raggruppati i controlli ripetuti sullo stesso documento, mantenendo tutte le aliquote e tutti i record originali. Le proiezioni RC non diventano documenti aggiuntivi nel conteggio dei controlli. Non si deduplicano documenti per numero o importo.
- F24: le registrazioni annuali prive di mese valido sono mostrate separatamente, non più sommate a ogni periodo. Somme calcolate in centesimi; importi incompleti restano da verificare, non zero. Eliminato il doppio avviso con il medesimo conteggio delle scadenze.
- Nel trimestre, il modulo F24 propone solo i tre mesi pertinenti; nel mese, mantiene il mese selezionato. Restano obbligatorie anteprima e conferma distinta. Nessuna delega viene trasmessa.
- La gestione amministrativa del mese è raccolta in un pannello richiudibile; motivo, controllo autorizzazioni e storico restano presenti.

## Verifiche

- Suite fiscale: 11 file, 93 test superati, 3 test live non eseguiti. Inclusi database isolato, permessi/feature gate, cambio azienda, errori di lettura, multi-aliquota, RC, precisione monetaria, periodi, conferme F24 e caricamento paginato.
- Nuovi test: uso reale dei menu condivisi, selezione anno/trimestre, conservazione filtri, tastiera sulle schede, F24 annuali non assegnati, filtro mensile/trimestrale, importi ignoti e assenza di scritture durante la navigazione.
- Typecheck mirato: zero diagnostiche in 14 file selezionati; lint dedicato senza errori. Il typecheck generale del repository non viene dichiarato risolto da questa correzione locale.
- Build di produzione locale completata con successo. Log di test, lint, typecheck e build in `output/fiscalita-ux-20261026/`.
- Verifica browser in Demo Azienda 2: Registro IVA, Contabilità fiscale, Ritenute e Archivio, anno 2025/2026, periodo mensile/trimestrale, apertura/chiusura del solo pannello amministrativo. Nessun pulsante di registrazione, svincolo o chiusura mese è stato confermato.
- Screenshot: `output/fiscalita-ux-20261026/menu-contabilita.png`.

## Limiti dichiarati

L’interfaccia non certifica liquidazioni, detraibilità, conservazione o assenza di obblighi. I documenti con dati da verificare restano segnalati; non sono stati corretti tramite valori presunti. Non è una verifica fiscale professionale delle singole fatture.

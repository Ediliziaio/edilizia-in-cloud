# Seconda revisione «Crea con Silvio» — 2/11/2026 (ramo `claude/scm-completo`)

Tre revisori nuovi, sola lettura più simulazioni con le funzioni vere e dati inventati. Le sigle dicono chi corregge:
D = database ed edge, G = logica, P = popup. Stato in fondo, a lavoro finito.

## Database ed edge (D)
- **D1 ALTA «Annulla» si rifiuta quasi sempre.** `20281106100000:1076`: il confronto esclude solo `updated_at`; `version` (trigger `versione_riga`), `work_lat`, `work_lng`, `work_geocoded_at` (cron `geocodifica-cantieri`), `distanza_sede_*` (`salva_distanza_cantiere`) lo bloccano senza che nessuno abbia lavorato.
- **D2 ALTA annullare una commessa da preventivo lascia il preventivo `convertita`.** `:898, :933, :1157`. Va registrato `quotes.status` e ripristinato; poi il flusso normale deve poterlo riusare.
- **D3 MEDIA «Completa» non scrive mai l'importo.** `:643`: `total_amount` default 0, lo 0 conta come valore. Va trattato come vuoto per questa colonna.
- **D4 MEDIA contratti di subappalto senza i permessi della policy.** `20281106130000:163-197`, `_silvio_scrittura_permessa`: chiedere `can_view_costs` e `can_view_subappaltatori_amministrazione`, stesso controllo per le altre risorse.
- **D5 MEDIA `silvio_correzioni` legge oltre la visibilità.** `20281106090000:62-63`: serve `can_see_order`, area `economia` solo con `can_view_order_amounts`.
- **D6 MEDIA il vincolo blocca la cancellazione della commessa.** `20281106100000:72,81`: con `ON DELETE SET NULL` viola `commessa_bozze_completa_con_commessa`.
- **D7 ALTA piano di volo: una conferma fallita chiude la proposta.** `20281106141000:247-250, 297-300`: resta `aperta` se ci sono azioni saltate o non scelte; le saltate si restituiscono.
- **D8 ALTA SAL con importo sbagliato.** `silvio-piano-volo/index.ts:120-126,180`: `propostaSal` riceve solo le fasi della finestra (10 fasi, finita la terza: 50 % invece di 30 %).
- **D9 MEDIA «Crea» ripetuto dopo una risposta persa.** `20281106100000:804-805`: restituire l'`order_id` già nato, così il popup riprende `allegaFonti`.
- **D10 MEDIA errori di lettura presi per dati vuoti.** `contestoRisorse.ts:41-47`: il cron deve saltare la commessa e registrarlo; il popup deve dirlo.
- **D11 BASSA** `assigned_to`/`capomastro_user_id` solo staff (`:347-351`); `attivita` ricontrolla `promemoria` vietata (`20281106141000:210`); rotazione delle aziende nel cron (`silvio-piano-volo/index.ts:77`); niente campanella per «Tutto pronto» (`:164-170,202`); OCR non pagato due volte a «Riprova» (`silvio-commessa/index.ts:182`).
- **D12 da verificare:** una `scrittura` con `stock_item_id` scala la giacenza: «Annulla» la ripristina?
- **D13 MEDIA piano di volo:** ditta in regola segnalata «Nessuno è assegnato» (`pianoVolo.ts:107`); dipendente non attivo «Tutto pronto» (`:103`); contratto della ditta non controllato.

## Logica (G)
- **G1 ALTA «togli Mario».** `chat.ts:363` legge `fase` prima di `nome`: «non trovo Mario», «togli Demolizioni» toglie Mario. Prima `nome`, tutte le righe.
- **G2 ALTA «inizia il 12/1» dalla chat con fasi a soli giorni.** `useBozzaSilvio.ts:668` salta la datazione di `modifica` (606-620). Spostarla in `conConseguenze`.
- **G3 ALTA inizio spostato su un giorno chiuso.** `useBozzaSilvio.ts:81`: la prima fase parte prima dell'inizio. `primoGiornoUtile`, scarto dalla prima fase, avviso.
- **G4 ALTA fase aggiunta in mezzo.** `chat.ts:268`: slitta solo la successiva. Catena.
- **G5 ALTA togliere un elemento conferma il resto.** `fondi.ts:273`: lo stato originale resta.
- **G6 ALTA date spostate dopo aver accettato le risorse.** `risorse.ts:274`: il mezzo resta sulle date vecchie, chi è occupato entra senza ⚠. Ricontrollare e riallineare.
- **G7 ALTA costo ditta che conta i materiali già ordinati.** `risorse.ts:324`: escludere le voci ordinate anche da `costo_previsto`.
- **G8 ALTA «Completa» tace.** `fondi.ts:160`: importo diverso senza avviso; telefono presente ed email nel documento: l'email si perde e la chat la rifiuta. Avviso, e proposta delle sole colonne mancanti.
- **G9 ALTA rate senza IVA entrano da sole.** `scrittura.ts:188`: fuori finché non confermate; ricalcolo dalla percentuale quando arriva l'IVA; avviso sotto il 100 %.
- **G10 MEDIA numeri.** `letturaAI.ts:242`: «1,250» → 1,25; «125,000» → 125; «1,250.50» rifiutato; `numeriNelTesto`.
- **G11 MEDIA date dalla chat.** `chat.ts:225`: «2027-02-31» e fine prima dell'inizio passano.
- **G12 MEDIA offerta contro proposta di Silvio** dà un conflitto (`fondi.ts:167`), `risorse.ts:658` dice che vince; stessa voce ordinata a due fornitori (`risorse.ts:693`).
- **G13 MEDIA conflitti finti.** `fondi.ts:51`, `contratto.ts:31`: maiuscole, `client_name` contro `client_company`, indirizzo, contatto parziale, modello contro preventivo sulle fasi.
- **G14 MEDIA** fase proposta dentro una fase reale (`commessa.ts:115`); computo su commessa con fasi: costi persi senza riga in `escluse` (`scrittura.ts:355`); fase con la sola data d'inizio la perde (`scrittura.ts:229`).
- **G15 MEDIA contatti dalla chat.** `chat.ts:222`: cambiare il telefono cancella l'email; telefono come testo non si scrive, ma dice «ora è».
- **G16 MEDIA** ditta tolta da una fase: sparisce il contratto anche dell'altra (`useBozzaSilvio.ts:90`); mezzo con prenotazione tra due fasi (`risorse.ts:379`).
- **G17 MEDIA scadenze già passate senza avviso.** `partenza.ts:153`.
- **G18 MEDIA testo malevolo.** `chat.ts:222`: `cambia_valore` scrive ditta inventata e importo come «fatto»; dalla chat solo proposta per i campi di quel tipo.
- **G19 BASSA** avviso meteo che resta dopo lo spostamento (`risorse.ts:585`); meteo su «Impermeabilizzazione doccia», «Copertura mobili» (`partenza.ts:42`); «Impianti» ambiguo prende il primo (`chat.ts:366`); due documenti dello stesso tipo in chat (`chat.ts:378`); ordine a prezzo 0 «da solo» (`autonomia.ts:131`); azione vietata risponde «ora è» (`chat.ts:302`); chiavi tecniche negli avvisi (`letturaAI.ts:544`).
- **G20 lacune utili:** rate in percentuale con il totale in un'altra fonte; conflitto che è l'imponibile contro l'ivato; durate parziali senza modello: una domanda; spostamento nel passato: avviso. Nel prompt della chat: l'anno di una data senza anno è il prossimo futuro.

## Popup (P)
- **P1 ALTA «Crea» scrive una bozza vecchia.** `useBozzaSilvio.ts:707-711`, `bozze.ts:234-237,137`: `subito()` inghiotte l'errore; fermarsi se `inAttesa()`.
- **P2 ALTA importi senza permesso.** `CreaConSilvioDialog.tsx:358-363`, `ColonnaCommessa.tsx:391`, `lettori/daDatabase.ts:122`: «Importi di vendita» decide anche nel popup, e la RPC non deve sovrascrivere importi di chi non li vede.
- **P3 ALTA esito del piano di volo.** `PianoDiVoloCommessa.tsx:31-35`: mostrare l'esito fuori dalla riga.
- **P4 MEDIA «Crea» non aspetta tutto.** `CreaConSilvioDialog.tsx:168`: `motivi` ignora `scrivendo` e le fonti `da_confermare`; elencare i documenti non letti.
- **P5 MEDIA errori in inglese.** `useBozzaSilvio.ts:515,671`, `readInvokeError.ts:11-15`, `leggiDocumento.ts`, `bozze.ts:362`.
- **P6 MEDIA offerte da collegare senza uscita.** `riconoscitore.ts:49-50,98`, `ColonnaFonti.tsx:64`: «Leggilo come documento normale».
- **P7 MEDIA contratti saltati in silenzio.** `CreaConSilvioDialog.tsx:242,415`: mostrare `risorse.saltati`.
- **P8 BASSA** tap sotto i 44 px (`ColonnaFonti.tsx:71,78,106,116,234`, `CreaConSilvioDialog.tsx:344`); ripresa che tace sulle fonti perse (`useBozzaSilvio.ts:300-304`).
- **P9 UX:** salvataggio visibile sul telefono; «Togli questa fonte» con i suoi valori; «Ricomincia» che scarta davvero la bozza.

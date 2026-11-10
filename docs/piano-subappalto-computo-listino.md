# Contratti di subappalto dal computo e dal listino della ditta — analisi e piano

10/11/2026. **È un piano: niente codice e niente migrazioni finché Florin non dà il via.**

## La richiesta

Florin, 10/11/2026: quando faccio un contratto con un subappaltatore, deve uscire la tabella
delle fasi e sottofasi che deve fare lui, presa dal computo metrico, con mq, quantità e il resto.
Esempio: un computo di 7 fasi con 5 voci ciascuna, e tre ditte che fanno 3 fasi ognuna. Ho
venduto il lavoro a 100.000 €; ogni ditta lo fa a meno, partendo dal **suo** listino prezzi.

Il punto difficile è il listino del subappaltatore. La manodopera e i servizi si possono
collegare a un subappaltatore: come lo impostiamo?

---

## 1. Era già stato chiesto? Sì, in parte, da Dimora Torino (29–31/10/2026)

| Data | Cosa era stato chiesto | Cosa è stato costruito (commit) |
|---|---|---|
| 29/10 | Il costo previsto delle fasi deve venire dalle voci del preventivo o del computo | `order_work_phase_voci` (voci della fase con quantità, unità, costo e venduto). Ditta sulla fase con tariffa, quantità e origine del costo (migrazione 20281029296000) |
| 30/10 | Ditte e contratti dalla commessa | Pannello **«Ditte e contratti»** (`DitteContrattiCommessa.tsx`): voci dal listino sulle fasi, ditta proposta dalle commesse passate, contratto con **Allegato A** in PDF (8c077c793) |
| 31/10 | Il contratto deve trovare la ditta, e il costo previsto deve seguire le voci | f44e71fb3 |
| 31/10 | L'elenco dei lavori e i prezzi si rivedono prima di salvare | Righe da togliere, da aggiungere, prezzi modificabili. Prezzo proposto: quello **concordato con la ditta** (variante di listino), altrimenti il costo del listino (bb7db1e54) |
| 31/10 | Misure, SAL e varianti del subappalto | Quadro lavori da Allegato A, misure, SAL contestati, variante tracciata dell'importo (6bc94db8e, fc80d8300, 388304d7e) |
| 31/10 | Commessa da un computo | Capitolo del computo = fase, voce = sottofase, con le sue voci (4242fe27b) |
| 01/09 | Ogni squadra o subappaltatore ha il suo listino posa | `tariffe_aziendali.external_team_id` (20280901100000) e prezzo della ditta su una voce aziendale, `tariffa_costi_varianti.external_team_id` (20280901120000) |

**Cosa manca rispetto alla richiesta di oggi:**

1. **Si affida solo la fase intera.** Non si può dare una sottofase o una voce a una ditta. Non
   c'è nessun controllo che impedisca di affidare due volte la stessa voce, e non c'è un elenco
   di ciò che resta senza ditta.
2. **Il listino del subappaltatore c'è solo sulla carta.** Due meccanismi esistono, ma:
   - li usa una sola azienda, la Demo 2 (58 voci proprie e 8 prezzi per ditta);
   - si compila dalla voce di listino, una alla volta. Non c'è una pagina «listino di questa
     ditta» e non c'è un modo di caricarlo da Excel o da PDF;
   - dipende dalla «squadra» (`external_teams`), mentre il contratto dipende dalla scheda
     sicurezza. Bonarrigo, per esempio, ha 71 subappaltatori e **0 squadre**.
3. **Le voci del computo non sono legate al listino.** Delle 1.977 voci di fase in produzione,
   solo le 186 di Dimora hanno la voce di listino. Bonarrigo ha 1.109 voci con 8,4 milioni di
   venduto e **costo del lavoro a 0**. Un contratto fatto oggi da quelle fasi uscirebbe a 0 €
   su ogni riga.
4. **Il corrispettivo non è la somma della tabella.** `importo_contrattuale` vive per conto suo.
   Il PDF scrive «a listino X» quando i due numeri non coincidono.
5. **Venduto e margine non si vedono** mentre si prepara il contratto.
6. **Le righe del contratto non sanno da quale voce vengono.** Delle 171 righe dei 18 contratti
   di Dimora, nessuna ha la fase scritta. Quindi:
   - il quadro misure si imposta a mano;
   - se il computo cambia, il contratto non se ne accorge.

---

## 2. Com'è fatto oggi

### Tabelle e collegamenti

```
computo_uploads ─┬─ computo_voci_estratte (657)        il computo letto o scritto
                 └─ order_id (5 computi collegati a una commessa)
                        │  crea_commessa_preventivo_atomic («modulo:computo:…»)
                        ▼
orders ── order_work_phases (fase = capitolo) ── order_work_subphases (sottofase = voce)
              └── order_work_phase_voci (1.977): descrizione, unita, quantita, importo (VENDUTO),
                  costo_manodopera, costo_materiali, tariffa_id → tariffe_aziendali,
                  origine (computo | computo_rst | listino | variante), origine_codice, subphase_id
              └── order_external_teams (175): la ditta sulla fase (phase_id), cost_preventivo,
                  tariffa_id, quantita, costo_unitario, costo_origine (listino | preventivo | manuale)

tariffe_aziendali (1.361, 12 aziende): listino manodopera e servizi
   tipo: posa 894, manodopera 258, nolo 37, smaltimento 34, ponteggio 28, …
   unita: tutte presenti; prezzo_costo > 0 in 553; codice in 1.036
   external_team_id: voce PROPRIA di una squadra (58, solo Demo 2)
tariffa_costi_varianti (8, solo Demo 2): costo di una voce aziendale per una squadra
   (external_team_id, costo, valid_from/valid_to, is_default, modalita_contabile)

LA DITTA HA QUATTRO SCHEDE:
external_teams (37: 25 esterne)    la «squadra» della commessa, del calendario e dell'app cantiere
   └ subappaltatore_id → subappaltatori (269)      l'anagrafica principale
subappaltatori_sicurezza ── campo_subappaltatore_id → subappaltatori   (DURC, PEC: la scheda del contratto)
suppliers (tipo='subappalto') ── subappaltatore_id → subappaltatori    (le fatture)

contratti_subappalto (181) ── subappaltatore_id → subappaltatori_sicurezza
   importo_contrattuale, oneri_sicurezza, elenco_lavori jsonb (Allegato A: 18 contratti, tutti di Dimora)
   └ subappalto_quadri_lavori (5): voci con fase_id, revisione
       └ subappalto_misure (2): misura per voce → sal_subappaltatori (109)
   └ subappalto_varianti_contratto: variante di importo e oneri, con lo storico
appalto_tariffe (14): prezzi verso il COMMITTENTE (lavori in economia), non verso la ditta
listini_fornitore (41): listini dei fornitori di MATERIALI (39 di Ke Bei), non dei subappaltatori
```

### Dati veri per azienda

| Azienda | Voci di fase | Costo del lavoro sulle voci | Contratti | Allegato A | Ditte (squadre) |
|---|---|---|---|---|---|
| Bonarrigo | 1.109 su 4 commesse (Villa Ida: 643 voci, 4,48 M€ venduto) | **0** | 21 (19 a 0 €) | 0 | 0 squadre, 71 subappaltatori |
| Dimora Torino | 186 su 3 commesse (dal computo RST) | 156 k€ (dal listino aziendale) | 18 bozze | 18, 171 righe | 11 |
| Demo 2 | 657 + 14 | 1,76 M€ | 129 | 0 | 7 |
| Scavolo | 25 (Elisii-Scarfoglio, 620 k€) | 0 | 0 | — | 0 |

Bonarrigo è il caso che Florin descrive, e oggi ci si ferma subito. Le sue 561 voci di listino
hanno solo il prezzo di vendita: sono i prezzi dei suoi computi. Il codice della voce si ritrova
nel listino in 265 casi su 1.109.

### Chi scrive cosa

| Schermata | Scrive |
|---|---|
| Computo → «Crea commessa» | fasi, sottofasi, `order_work_phase_voci` (venduto, codice; costo dal listino se il codice combacia) |
| Commessa → Fasi → «Ditte e contratti» | `order_external_teams` (ditta sulla fase), voci aggiunte dal listino, contratto in bozza con `elenco_lavori` |
| Impostazioni → Listino manodopera (`SettingsTariffe`) | `tariffe_aziendali`, compresa la squadra della voce. «Varianti di costo» (`TariffaVariantiEditor`) scrive `tariffa_costi_varianti` |
| Scheda subappaltatore → Contratti (`ContrattiSubappalto`) | condizioni, firma, variante, «Imposta elenco lavori» → `subappalto_quadri_lavori`, misure, SAL |
| PDF (`ContrattoSubappaltoPDF.tsx`, `contrattoSubappaltoHtml.ts`) | contratto con lo stile unico. Riquadro economico da `importo_contrattuale`, Allegato A raggruppato per fase con il totale. C'è anche una copia per il cantiere senza cifre |

---

## 3. Il disegno proposto

### Il principio

**Il listino aziendale della manodopera e dei servizi è l'elenco di ciò che si fa. Il listino
della ditta è il prezzo che quella ditta chiede per ciascuna voce.** Le voci del computo si
abbinano una volta sola a una voce di listino, e l'abbinamento resta. Da lì in poi:

> voce del computo → voce di listino → prezzo della ditta X (valido alla data del contratto)

Con lo stesso abbinamento si confrontano più ditte sulla stessa voce, si sa il costo previsto
prima di scegliere la ditta, e il prezzo cambia una volta sola per tutte le commesse future.

### (a) Il listino del subappaltatore

**Dove vive.** Non serve una tabella nuova: si usano le due che ci sono già.

- **Prezzo della ditta su una voce aziendale** → `tariffa_costi_varianti`. È il caso normale:
  «intonaco civile al mq», la ditta Rossi lo fa a 14 €, la ditta Bianchi a 15,50 €.
- **Voce che ha solo quella ditta** → `tariffe_aziendali` con la ditta scritta sopra. È il caso
  dell'elettricista con il suo listino punti luce.

**La ditta si identifica con l'anagrafica `subappaltatori`, non con la squadra.** Bonarrigo non
ha squadre, e il contratto, il fornitore e la squadra puntano tutti all'anagrafica. Quindi:

- si aggiunge `subappaltatore_id` alle due tabelle e lo si ricava dalle 66 righe di oggi
  attraverso la squadra;
- chi legge accetta per qualche settimana sia la squadra sia l'anagrafica;
- quando una ditta viene affidata in una commessa e non ha ancora la squadra, la squadra si crea
  da sola, perché servono il calendario e l'app cantiere.

**Il legame con le voci del computo.** Si scrive `order_work_phase_voci.tariffa_id`: la colonna
c'è già, e il prezzo per ditta (`prezzoVoceDitta`) la sa già usare. Per trovare la voce di
listino, nell'ordine:

1. la voce ha già la voce di listino (Dimora, dal computo RST);
2. lo stesso **codice**: codice del prezzario o codice della voce;
3. un **abbinamento ricordato**: una tabella nuova, `abbinamenti_voce_listino`, con azienda,
   chiave (codice oppure descrizione normalizzata) e voce di listino. Si scrive la prima volta
   che qualcuno abbina a mano, e alla commessa dopo l'abbinamento è automatico;
4. una **proposta dell'AI**: la ricerca per significato c'è già (`tariffe_aziendali.embedding`),
   con conferma a un clic e mai in automatico;
5. a mano.

Una voce del computo che non esiste nel listino si può aggiungere al listino con un clic, con la
sua unità, e diventa abbinata.

**Come si carica il listino della ditta.** Si apre la scheda del subappaltatore, linguetta
**«Listino»**. Ci sono tre modi:

- **A mano.** È la tabella delle voci di manodopera e servizi dell'azienda, con la colonna
  «Prezzo della ditta». Si scrive solo dove la ditta ha un prezzo, e c'è il filtro «solo quelle
  con prezzo».
- **Da Excel.** Si incolla o si carica il file, riusando `parseVociIncollate`, che è già
  collaudato per i listini fornitore.
- **Da PDF.** Il PDF lo legge l'AI, riusando il lettore unico della commessa di Silvio.

Excel e PDF finiscono nella stessa finestra di abbinamento: ogni riga del file con la voce
aziendale proposta, sicura o da confermare. Le righe senza abbinamento diventano «voce propria
della ditta» oppure si scartano. Si salva tutto insieme.

**Validità e revisioni.** Le colonne `valid_from` e `valid_to` ci sono già. Un listino nuovo
della ditta chiude le righe vecchie (`valid_to` = ieri) e apre le nuove: la storia resta. Il
contratto usa il prezzo valido alla sua data e lo fotografa nell'Allegato A. **Un listino nuovo
non cambia mai un contratto già fatto**: solo una variante lo cambia.

### (b) L'affidamento

Nel pannello «Ditte e contratti» della commessa si apre la vista **«Chi fa cosa»**:

- un albero **fase → sottofase → voce**, con quantità, unità e venduto;
- si seleziona una fase intera, una sottofase o singole voci, si sceglie la ditta, e si preme
  «Affida»;
- ogni voce mostra la sua ditta con un colore;
- il filtro **«Senza ditta»** mostra cosa resta da affidare, con il venduto residuo;
- in testa c'è un riepilogo per ditta: voci, venduto affidato, costo dal suo listino.

**Una tabella nuova: `subappalto_affidamenti`.** Ogni riga ha:

- la voce (`voce_id`) e la ditta (`subappaltatore_id`);
- il contratto, vuoto finché il contratto non c'è;
- la quantità, il prezzo e da dove viene il prezzo;
- lo stato: proposto, a contratto o revocato.

Un indice unico su `voce_id`, valido per le righe non revocate, garantisce che **una voce non
si affidi due volte**, anche con due persone che lavorano insieme.

**Una voce su due ditte: si divide la voce.** È la proposta da far decidere a Florin.
«Dividi» crea due voci con la stessa origine: 120 mq diventano 80 mq + 40 mq, e il venduto si
divide in proporzione. Ogni voce poi ha la sua ditta. La regola «una voce, una ditta» resta
semplice. Le misure e i SAL non devono contare da quale ditta viene ogni metro quadro.

La ditta sulla fase (`order_external_teams`) **si tiene allineata da sola**. Una ditta con
almeno una voce della fase ha la sua riga, con costo previsto = somma degli affidamenti e
origine nuova `contratto`. Il calendario, l'app cantiere ed `economiaFasi` continuano a leggere
lì. Le fasi senza voci, quelle create a mano, restano affidabili a corpo come oggi.

### (c) I prezzi del contratto

Il prezzo di ogni riga si cerca in quest'ordine:

1. il prezzo della ditta valido alla data del contratto;
2. la voce propria della ditta;
3. il costo del listino aziendale, con l'etichetta «costo aziendale, non della ditta»;
4. scritto a mano, con l'etichetta «a mano».

Il pallino accanto al prezzo dice da dove viene. Un prezzo cambiato a mano si può **salvare nel
listino della ditta** («ricorda per le prossime volte»): così il listino si costruisce
lavorando, senza doverlo caricare tutto prima.

**Solo nella finestra interna, e solo con il permesso sui costi:**

- venduto unitario e venduto della riga;
- margine in euro e in percentuale, per riga, per fase e in totale;
- in rosso le righe dove la ditta costa più del venduto, e le righe a 0 €.

Il riepilogo dice per esempio: «Venduto 100.000 € · affidato a 3 ditte 72.400 € · margine
27.600 € (27,6%) · senza ditta 0 €».

### (d) Il PDF del contratto

Buona parte c'è già: stile unico, Allegato A raggruppato per fase con il totale, copia per il
cantiere senza cifre. Le modifiche:

- **Il corrispettivo è la somma della tabella.** Con l'Allegato A, `importo_contrattuale` lo
  calcola il database (trigger finché il contratto è in bozza). Spariscono «a listino X» e il
  numero scritto a parte. Gli oneri della sicurezza restano una riga a sé, non soggetta a
  ribasso. Il totale è lavori + oneri.
- **La tabella «Lavori affidati»**, per fase:
  - intestazione della fase;
  - righe con N., descrizione, U.M., quantità, prezzo unitario, importo;
  - sottotitolo della sottofase quando una fase ne ha più di una;
  - «Totale fase»;
  - in fondo, «Totale lavori».

  Il codice va nella colonna solo se ogni riga ha il suo. Intestazione grigia, filetti e
  accento vengono da `stileDocumenti.ts`, con la veste propria per Vulcano.
- Mai il venduto, il margine o il prezzo al committente. Lo garantisce già il fatto che la
  riga dell'elenco non ha quei campi; un test lo rende esplicito.

### (e) Collegamento a misure, SAL, costi della commessa e controllo di gestione

- **Alla firma** nasce da solo il quadro lavori, revisione 1, con le righe dell'Allegato A. Ogni
  riga del quadro porta `voce_id` e `fase_id`. «Imposta elenco lavori» resta solo per i
  contratti vecchi.
- **Misure e SAL** restano quelli di oggi (`subappalto_misure` → `sal_subappaltatori`); in più
  ogni misura sa la sua voce, quindi la sua fase.
- **Costo previsto della commessa per fase** = la somma degli affidamenti a contratto. La
  funzione `contrattoPerFase` esiste già. **Consuntivo per fase** = i SAL approvati, ripartiti
  con le misure.
- **Controllo di gestione e Margini**: per ogni fase, venduto, costo da contratto e costo
  maturato dai SAL. Lo scostamento si vede per voce, non solo per commessa.
- Un'idea, non in questo piano: le misure riconosciute alla ditta come proposta di avanzamento
  per il SAL al committente, sulla stessa voce.

### (f) Varianti quando il computo cambia

Il computo ha già le sue varianti (`computo_uploads.variante_di`). Quando le voci della
commessa cambiano, il pannello confronta affidamenti e voci attuali e mostra tre casi:

- **quantità cambiata** (120 → 135 mq) su una voce a contratto → «Proponi variante alla ditta»;
- **voce nuova** → finisce in «Senza ditta»;
- **voce tolta** ma a contratto → avviso. Con misure registrate non si può togliere, solo ridurre.

Per la variante si **estende la funzione che c'è già** (`subappalto_variante_registra`). Oggi
cambia solo importo e oneri con una voce a corpo; in futuro accetterà righe (voce, quantità
nuova, prezzo) e creerà una nuova revisione del quadro. Lo storico resta in
`subappalto_varianti_contratto`. Il PDF della variante usa il modello «Variante in opera»,
già esistente.

### (g) Permessi

| Chi | Cosa vede |
|---|---|
| Con permesso sui costi | prezzi delle ditte, venduto, margine, listino della ditta |
| Chi modifica il listino (`can_edit_settings_pricing`) | modifica i prezzi delle ditte e l'import. Oggi le varianti chiedono l'amministratore: si allinea |
| Chi modifica le commesse senza permesso sui costi | vede chi fa cosa (le voci e la ditta), senza nessuna cifra |
| Il subappaltatore nell'app | solo il suo contratto e il suo Allegato A con i suoi prezzi; mai il venduto né il listino di altre ditte |
| Operai e capisquadra | la copia per il cantiere senza cifre |

Le tabelle nuove nascono con la sicurezza per riga, a immagine di `order_work_phase_voci`
(commesse + costi). Le funzioni nascono chiuse (`REVOKE … FROM PUBLIC, anon`).

---

## 4. Piano a lotti

Ogni lotto si pubblica e si verifica da solo. Le migrazioni si fanno con `apply_migration` più
il riallineamento della versione, controllando prima che la versione sia libera.

| Lotto | Cosa | Come si verifica |
|---|---|---|
| **0** | Florin risponde alle domande sotto | — |
| **1** | **Ditta = anagrafica.** `subappaltatore_id` su `tariffa_costi_varianti` e `tariffe_aziendali`, ricavato dalla squadra; i lettori accettano entrambi; la squadra si crea da sola quando serve | Le 66 righe della Demo 2 hanno l'anagrafica; i test di `costoDitta` e `ditteLavori` sono verdi |
| **2** | **Listino della ditta, a mano.** Linguetta «Listino» nella scheda subappaltatore: voci aziendali con il prezzo della ditta, voci proprie, validità, «solo con prezzo» | Su Demo 2 si scrivono 3 prezzi e il pannello della commessa li propone |
| **3** | **Listino della ditta da Excel e da PDF.** Finestra di abbinamento (sicuro / da confermare / voce propria / scarta) | Un listino vero di una ditta di Bonarrigo o di Dimora, riga per riga |
| **4** | **Voci del computo abbinate al listino.** `tariffa_id` per codice, abbinamenti ricordati (tabella nuova), proposta AI, «aggiungi al listino»; pannello «Abbina al listino» nella commessa | Villa Ida (Bonarrigo): quante voci su 643 si abbinano da sole per codice. Una seconda commessa usa gli abbinamenti ricordati |
| **5** | **Affidamento per voce.** Tabella `subappalto_affidamenti` con l'indice unico, vista «Chi fa cosa», «Senza ditta», «Dividi voce», allineamento della ditta sulla fase | Due affidamenti della stessa voce in parallelo: uno fallisce. L'esempio 7×5 con 3 ditte torna al centesimo |
| **6** | **Contratto dagli affidamenti.** Prezzi dal listino della ditta alla data, pallino d'origine, «ricorda nel listino», venduto e margine solo con il permesso, corrispettivo = somma (trigger), PDF «Lavori affidati» con i totali per fase | PDF di Dimora O-0001 e di Villa Ida. Test: niente venduto nel PDF; il corrispettivo è uguale al totale della tabella |
| **7** | **Firma → quadro, misure, SAL, costi.** Quadro automatico con `voce_id`; previsto per fase dal contratto; consuntivo per fase dai SAL; Margini e controllo di gestione per fase | Su un contratto Demo 2 firmato in una transazione annullata: quadro, misura, SAL e consuntivo della fase |
| **8** | **Varianti dal computo.** Confronto, avvisi, «Proponi variante» per voce, revisione del quadro | Variante di quantità su una voce con misure: le misure restano valide, l'importo segue |
| **9** | **Contratti esistenti e collaudo.** Cosa fare dei 18 contratti di Dimora e dei 21 di Bonarrigo (domanda 7); verifica a schermo con un utente senza permesso sui costi | Visto a schermo, non solo nei test |

I lotti 1–2 e 4 sono indipendenti dal 3 (l'import). Il 5 serve a 6, 7 e 8.

---

## 5. Domande per Florin

1. **Una voce su due ditte.** Va bene «Dividi la voce per quantità» (80 mq alla ditta A,
   40 mq alla B)? L'alternativa è vietarlo del tutto.
2. **La ditta non ha un prezzo per una voce.** Cosa propongo?
   - **(a)** il costo del listino aziendale;
   - **(b)** una percentuale del venduto uguale per tutta l'azienda (per esempio il 70%);
   - **(c)** casella vuota da compilare, e il contratto non si salva finché non è compilata.

   La mia proposta è (a) se il costo c'è, altrimenti (c).
3. **Il listino della ditta ha una scadenza** (dal… al…)? Un listino nuovo a metà commessa
   lascia i contratti firmati col prezzo vecchio: confermi?
4. **Si parte da Bonarrigo?** È il caso più vicino all'esempio: computi grandi e tante ditte.
   Le sue ditte hanno un listino da caricare (Excel o PDF), o i prezzi si scrivono man mano
   nei contratti?
5. **Oneri della sicurezza della ditta:** un importo scritto a mano (come oggi) o una
   percentuale sui lavori affidati?
6. **Le fasi create a mano, senza voci,** restano affidabili «a corpo» con un prezzo unico?
7. **I contratti che ci sono già** (18 bozze di Dimora con l'Allegato A, 21 di Bonarrigo, 19
   dei quali a 0 €): si rifanno dagli affidamenti quando sono ancora bozze, o si lasciano come sono?
8. **Il subappaltatore con l'accesso all'app** vede il suo contratto con i prezzi, o solo la
   copia per il cantiere?

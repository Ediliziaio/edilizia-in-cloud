# Punti aperti dopo il 15/11: un piano per ognuno (16/11/2026)

Seguito di `docs/piano-ai-addebiti-e-automazioni-20261115.md`. Per ogni punto: cosa succede
oggi, cosa propongo, cosa serve dal titolare, quanto lavoro è (S = mezza giornata, M = una
giornata, L = più giornate). Le regole comuni restano quelle del 15/11: cinque esiti
(automatico / proposta / più candidati / conflitto / nessuno), interruttore comune per azienda,
nessuna scrittura massiva su aziende vere senza un sì.

---

## 1. Acconto pagato a un fornitore prima della fattura

**Oggi.** Il bonifico esce dalla banca, ma non c'è niente a cui collegarlo: non c'è ancora una
fattura, e né il costo né l'ordine hanno un posto per l'anticipo. Il movimento resta «da
gestire» per sempre, oppure qualcuno lo registra come spesa e poi, quando arriva la fattura, il
costo si conta due volte.

**Come funziona per il titolare** (così lo usa l'impresa): l'acconto è un'uscita di tesoreria
che resta in attesa e si chiude quando arriva la fattura.

**Proposta.**
1. Nel popup del movimento c'è «Acconto a fornitore»: fornitore (proposto dall'IBAN o dalla
   causale) e, se si vuole, ordine d'acquisto e commessa. Il movimento diventa un **acconto
   aperto** del fornitore: un credito verso di lui, non un costo.
2. Conta subito **in cassa** (i soldi sono usciti). **Non** conta nei costi della commessa e nel
   CdG: il costo arriva con la fattura, così non si raddoppia.
3. Quando arriva una fattura dello stesso fornitore (e dello stesso ordine o commessa, se
   indicati) il motore propone «scala l'acconto»: la fattura risulta pagata per l'acconto, il
   resto va nello scadenzario. Un solo acconto aperto che sta nella fattura → automatico con
   l'interruttore acceso, altrimenti un clic. Più acconti o più fatture → «più candidati».
4. Acconto più grande della fattura → la fattura è pagata e la differenza resta come acconto
   aperto. Un acconto mai fatturato dopo N giorni (90?) compare tra le cose da sistemare.
5. Nella scheda del fornitore e nell'ordine: «Acconti aperti».

**Ti chiedo:** va bene che l'acconto non sia un costo finché non arriva la fattura? Dopo quanti
giorni un acconto senza fattura diventa un avviso?
**Lavoro:** M (tabella degli acconti, regola nel motore, popup, scheda fornitore, test).

---

## 2. Subappalti: cosa è stato fatto e cosa resta

**In parole semplici.** Quando un subappaltatore lavora per noi c'è un **contratto di
subappalto** (quanto vale, se c'è un acconto, la ritenuta a garanzia). Ogni tanto fa un **SAL**
(«ho fatto lavori per X fino al giorno Y») e poi manda la **fattura**. Prima la fattura
arrivava e restava scollegata: nessuno controllava se era giusta.

Dal 15/11 il sistema, senza AI:
- **collega la fattura** al contratto e al SAL giusti (partita IVA del subappaltatore, numero
  del SAL o del contratto nel testo, importo); con l'interruttore acceso da solo, altrimenti
  come proposta;
- **blocca** la fattura che supera il valore del contratto, e **avvisa** se supera i SAL
  approvati;
- **avvisa** se il periodo dei lavori si sovrappone a un'altra fattura o cade dopo il SAL citato;
- gestisce l'**acconto**: la fattura d'acconto si collega al contratto, ogni SAL dopo ne
  recupera una quota, e la fattura del SAL che non scala l'acconto si blocca (altrimenti
  l'acconto si pagherebbe due volte);
- mostra nel riepilogo del contratto: valore, fatturato, pagato, ritenute, acconto da
  recuperare.

Un cron lo fa ogni 15 minuti sulle fatture nuove.

**Cosa resta:**

**2a. Le 241 fatture vecchie dei subappaltatori.** **Rimandato** (titolare, 16/11: per ora
non si tocca niente). Sono arrivate prima di queste regole e non
sono collegate a nessun contratto. Nessuna si collega da sola, perché per le vecchie molti
contratti non sono nemmeno caricati. Proposta: un'anteprima per azienda («queste N si
collegherebbero a questo contratto, queste M non hanno un contratto») e si conferma a lotti,
azienda per azienda. **Ti chiedo:** da quale azienda partiamo? **Lavoro:** S per l'anteprima,
poi un lotto per azienda col tuo sì.

**2b. Migrazione `costi_orari_completamento`.** Non riguarda i subappaltatori ma i
**rapportini** (operai e mezzi), e sistema due cose rimaste dal costo «alla data del lavoro»:
- se a un rapportino mancava il costo dell'operaio e il costo si inserisce dopo, oggi si usa il
  costo di adesso; con la migrazione si usa quello valido il giorno del lavoro;
- il costo **calcolato** dei mezzi (spese di 12 mesi diviso le ore) cambia ogni mese senza
  lasciare traccia; con la migrazione si fotografa il 1° di ogni mese, così un rapportino di
  marzo approvato a giugno prende il costo di marzo.

Non cambia nessun dato esistente. È ferma solo perché il controllo dei permessi l'ha bloccata
nella sessione. **Ti chiedo:** il via per applicarla. **Lavoro:** S.

**2c. Altro rimasto lì:** acqua e telefono non si riconoscono ancora tra le bollette (il codice
cliente non ha un formato fisso); manca un test che si ripete per le regole nuove delle bollette.
**Lavoro:** S ciascuno, nessuna decisione.

---

## 3. Annullare il costo di una bolletta scartata (o doppia)

**Oggi.** Se una bolletta è scartata o doppione, il database impedisce di contabilizzarla. Ma se
il costo era già stato registrato prima, resta: il costo non ha una cancellazione «logica», e
ha scadenze, prima nota e rate collegate, quindi cancellarlo è rischioso.

**Proposta.** Un costo si **annulla**, non si cancella:
- stato «annullato» con data, persona e motivo; sparisce da CdG, commesse e cassa prevista;
- le scadenze **non pagate** si annullano con lui;
- se una scadenza è **già pagata** l'annullamento si ferma e dice perché: prima si annulla
  l'incasso o il pagamento (c'è già «Annulla incasso»);
- la prima nota non si cancella: si scrive la riga di storno;
- si può ripristinare.

Lo stesso «Annulla costo» serve poi ovunque, non solo per le bollette.
**Ti chiedo:** va bene questa regola (si annulla solo se niente è stato pagato)?
**Lavoro:** M.

**Fatto il 16/11** (migrazioni `20290417100000`, `…100400`). `costo_annulla(costo, motivo)` /
`costo_ripristina(costo)`, anteprima `costo_annullo_anteprima`. Il costo resta nella tabella con
`annullato_il/_da/_motivo`; l'importo va a 0 e quello vero resta in `annullato_dati` (così esce da
ogni somma: CdG, commesse, cassa, senza toccare le ottanta letture di `company_costs`); scadenze
non pagate «annullata», rate aperte «stornata»; tutto torna com'era col ripristino. Un pagamento
già registrato ferma l'annullamento e dice perché: se è solo in prima nota, «Storna il pagamento»
(dalla stessa finestra) scrive la riga di storno, poi si annulla; con un bonifico collegato si
scollega prima dalla Tesoreria. Mentre è annullato il costo non cambia importo e non si paga
(trigger). Pulsante nella scheda del costo (tutti i costi) e in Costi → Utenze, accanto a ogni
bolletta scartata o doppia che ha ancora il costo nei conti; l'avviso della bolletta lo dice.

---

## 4. Codici di cantiere nelle causali della banca

**Oggi.** Alcuni committenti pagano scrivendo nella causale il **loro** codice del cantiere
(«rif MM123»). Nel gestionale quel codice non esiste da nessuna parte, quindi il motore non può
usarlo: 157 movimenti di un'azienda restano da gestire, anche per questo.

**Proposta.** Sulla commessa, il campo «Codici del committente» (uno o più: codice cantiere,
numero d'ordine del cliente, CIG/CUP ci sono già). Il motore cerca quei codici nella causale:
codice trovato + cliente giusto + importo che torna → automatico; solo il codice → proposta.
Una proposta confermata a mano può aggiungere il codice alla commessa («ricorda questo
codice»), così la volta dopo è automatico.
**Ti chiedo:** va bene un campo libero sulla commessa? **Lavoro:** S.

**Fatto il 16/11** (`20290417100100`, correzione `…100150`). `orders.codici_committente` (anche in
`orders_visibili`), riquadro «Codici del committente» nella Panoramica della commessa
(`commessa_codici_committente_salva`). Il motore (`tes_classifica`) cerca negli incassi i codici
scritti (più `riferimento_committente`); se il campo è vuoto, quelli nella descrizione del lavoro
(sigla maiuscola + almeno tre cifre: «MM 311»). Codice + cliente + importo esatto → candidato
forte, esito automatico (si conferma da solo solo con l'interruttore comune acceso); solo il
codice → proposta (anche parziale). Dopo una proposta confermata a mano su una commessa, un
messaggio offre «Ricorda» per il codice della causale (`commessa_ricorda_codice`). L'acconto su
rata (R-ACCONTO) resta proposta anche col codice: la conferma automatica vale per le fatture.

---

## 5. Soglie e tolleranze

Valori di oggi, da confermare o cambiare. Propongo che siano tutti **per azienda**, in
Impostazioni → Automazioni, con questi default:

| Dove | Oggi | Proposta |
|---|---|---|
| Banca: differenza ammessa (commissioni, arrotondamenti) | 1 € | 1 € |
| Acquisti: quantità fattura vs ordine/bolla | 0% | 0% |
| Acquisti: prezzo | 0,5% + 2 cent | 0,5% + 2 cent |
| Acquisti: collegamento per indirizzo del cantiere | mai automatico | resta solo proposta |

**Ti chiedo:** vanno bene? Per fornitore serve davvero (per esempio il calcestruzzo, che si
fattura sul peso)? **Lavoro:** S.

**Fatto il 16/11** (`20290417100200`), per azienda e non per fornitore. Colonne
`banca_differenza_max`, `acquisti_quantita_toll_perc`, `acquisti_prezzo_toll_perc`,
`acquisti_prezzo_toll_cent` in `company_governance_settings` (limiti nel database), riquadro
«Soglie dei collegamenti» in Impostazioni → Automazioni (scrive l'amministratore). Le leggono:
`tes_classifica` (R-DIFF e finestra dei conflitti) e `bank_register_difference` (arrotondamento);
`riconcilia-fattura-ai` via `azienda_soglie_automazioni` (la quantità entro tolleranza chiude la
riga; uno scarto di prezzo oltre tolleranza si scrive nel motivo, senza cambiare l'abbinamento).
L'indirizzo del cantiere resta solo proposta e non ha una colonna.

---

## 6. Decisioni commerciali sull'AI

Il costo di ogni chiamata ora finisce all'azienda giusta; restano le scelte di prezzo:

| # | Domanda | Proposta |
|---|---|---|
| 1 | Ricarico: oggi va da +80% a oltre +2.000% a seconda del compito | Un ricarico per compito in una tabella, con un minimo unico (3× il costo vero) |
| 2 | Il provider ha lavorato ma poi il nostro salvataggio fallisce: si addebita? | No, si rimborsa: l'errore è nostro |
| 3 | Consumo incluso nel piano | Un numero di letture incluse (bolle, fatture) per piano; oltre, si scala dal credito |
| 4 | Chiamata fatta quando il credito era appena finito | Si scala alla ricarica successiva |
| 5 | Prezzo dei video | Da decidere quando i video tornano a funzionare (punto 7) |
| 6 | Embedding (millesimi al mese) | Si regalano |
| 7 | Silvio dei super admin | Costo nostro, dichiarato |
| 8 | Analisi della foto dei render | Resta inclusa nel credito render |

**Ti chiedo:** una risposta per riga, anche solo «ok».
**Lavoro:** S–M a seconda delle risposte.

---

## 7. Video degli annunci rotti

**Oggi.** La funzione dei video scrive in una tabella (`ad_video_jobs`) che nel database non
esiste: la funzione fallisce sempre. **Proposta:** due strade:
- se i video servono, si crea la tabella (con permessi e addebito, controllando prima che non
  esista con un altro nome) e si prova un video su Demo 2;
- se non servono, si nasconde il pulsante.

**Ti chiedo:** i video si usano? **Lavoro:** S (nascondere) o M (riparare).

---

## 8. Demo Azienda 2 senza titolare

**Oggi.** I giri automatici confermano a nome del titolare. Demo 2 non ne ha uno, quindi lì il
cron si ferma e non conferma niente: proprio l'azienda di prova non mostra l'automatico.
**Proposta:** indicare come titolare l'amministratore di Demo 2. **Ti chiedo:** chi.
**Lavoro:** minuti.

---

## 9. Commessa generale dai documenti

**9a. Prova dal vivo su Demo 2.** Il contratto d'esempio si carica, si legge e la commessa si
crea davvero, poi si guarda tutto a schermo e si cancella se serve. Senza decisioni: la faccio
appena dici. **Lavoro:** S.

**9b. Scelte provvisorie da confermare.** Il codice le segue già:

| # | Domanda | Scelta di oggi |
|---|---|---|
| 1 | Accordo quadro | La generale è l'accordo; ogni contratto applicativo è una figlia col suo CIG |
| 2 | Capitolato | Facoltativo: si legge solo se lo carichi |
| 3 | Costo della lettura | Prima si mostra la stima, poi parte con «Leggi» |
| 4 | RTI (più imprese) | La commessa vale per la nostra quota; il totale resta nel contratto |
| 5 | Stesso dato con due valori (es. penale) | Si fa sempre scegliere, mostrando da dove viene ciascuno |
| 6 | Conti dedicati, delegati, documenti d'identità | Non si leggono e non si salvano |
| 7 | Fasi ed elenco prezzi dal computo | Proposti con due spunte accese, si scrivono alla conferma |
| 8 | «Completa dai documenti» su una generale già creata | Da fare |

**Ti chiedo:** ok o correzioni riga per riga.

---

## 10. Rilievi sui dati veri (da sistemare a mano)

Il controllo dei doppi di CdG ha trovato tre cose che nessuna regola corregge da sola:
- una fattura incassata per il lordo invece che per il netto;
- un costo con due calendari di pagamento;
- nove ripartizioni parziali su una commessa.

**Proposta:** una lista in Contabilità → «Da verificare», ognuna con il pulsante che la apre.
Le guardo io con te, una per una. **Lavoro:** S.

**Fatto il 16/11** (`20290417100300`). Contabilità → Prima nota, in testa: «Da verificare» con le
anomalie di `cdg_controllo_doppi` lette da `cdg_da_verificare` (una riga per anomalia, un pulsante
per documento: fattura emessa o importata, costo, movimento, fattura ricevuta, scadenza). Nessuna
correzione automatica. I costi annullati non sono più anomalie. Il 16/11 la lista trova: la fattura
incassata per il lordo (7.333,37 €), il costo con due calendari (335,40 €, su Demo Azienda 2) e
dieci ripartizioni sotto il 100% (277.124,08 €).

---

## Ordine proposto

1. **Subito, senza decisioni:** 2b (col tuo via), 8, 9a, 2c.
2. **Con un tuo sì sulla regola:** 1 (acconti), 3 (annulla costo), 4 (codici del committente).
3. **Con le tue risposte:** 5, 6, 7, 9b.
4. **A lotti, azienda per azienda:** 2a, 10.

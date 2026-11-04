# Piano: bolle a mucchio, e pagamenti della commessa come sono davvero

Scritto il 04/11/2026, prima di toccare il codice. Due richieste del titolare che non si
assomigliano, ma hanno in comune una cosa: **quasi tutto il materiale c'è già, ed è
irraggiungibile da dove serve**.

Da leggere prima: `docs/piano-ddt-bolle-fatture.md` (fasi 1-3 fatte, 4 e 5 no),
`docs/flussi-merce-bolle.md` (le sei porte d'ingresso della merce).

---

# Parte A — Caricare tante bolle insieme

**La richiesta.** Nelle bolle, sia nell'elenco generale sia dentro una commessa sia in
magazzino, poter caricare più bolle in un colpo: tanti file insieme, oppure un PDF solo
con dentro tante bolle, che il sistema deve saper separare e smistare.

## Cosa c'è già (e non va rifatto)

| Pezzo | Dove | Stato |
|---|---|---|
| La bolla con le sue righe | `ddt_ricezione` + `ddt_righe` | c'è |
| Lettura automatica di una bolla | `supabase/functions/ddt-ai-extract` (Gemini Flash 2.5, legge il PDF così com'è) | c'è |
| Riconoscere che tipo di documento è | `supabase/functions/document-ai-router` | c'è |
| Bolla legata alla commessa | colonna `ddt_ricezione.order_id` | c'è |
| Destinazione magazzino o cantiere | colonna `destinazione`, con i vincoli | c'è |
| Caricare N file insieme e dirne l'esito uno per uno | `src/lib/fatturazione/bulkXmlImport.ts`, `importMassivo.ts`, l'import delle fatture | c'è, per le fatture |
| Far rivedere all'utente riga per riga prima di salvare | `BulkDocumentiUploadDialog.tsx` | c'è, per i subappaltatori |
| Tagliare pagine da un PDF | `pdf-lib` già installato, `PdfToolkitDialog` usa già `copyPages` | c'è |

**Quello che manca davvero sono tre cose**: caricare N bolle insieme (oggi è un file per
bolla), dividere un PDF che ne contiene tante, e — a valle — far diventare le righe di
una bolla senza ordine una giacenza o un costo di cantiere.

## Come lo farei, per farlo funzionare davvero

Il rischio di una cosa così non è tecnico, è di fiducia: **se sbaglia a smistare anche
una bolla su venti, l'utente non si fida più e torna a caricarle a mano**. Quindi la
regola è una sola: *il sistema propone, la persona conferma, e lo fa in fretta*. Niente
scritture cieche. È la stessa regola che gli allegati delle email seguono già.

### A1 — Tante bolle insieme (più file)

Si sceglie una cartella di file, o si trascinano dentro, o si fanno più foto. Per ognuno
parte la lettura automatica già esistente, al massimo quattro alla volta, con la barra di
avanzamento e il «circa N minuti» che l'import delle fatture ha già.

Poi arriva **la schermata di revisione**: una riga per bolla, con numero, data,
fornitore, quante righe merce e dove andrà a finire. Chi ha un dubbio è segnato in
giallo e sta in cima. Si correggono le cose storte sulla riga stessa e si conferma tutto
insieme. Una bolla che non riesce non ferma le altre: finisce nel resoconto col suo
motivo.

Sullo smistamento la macchina deve fare la sua parte: il **fornitore** si riconosce dalla
partita IVA, mai dal nome; la **commessa** si eredita dall'ordine d'acquisto quando c'è,
altrimenti la propone e la persona sceglie; la **destinazione** parte da dove hai aperto
il caricamento (dalla commessa → cantiere, dal magazzino → magazzino).

I **doppioni** vanno fermati prima di scrivere: stesso fornitore, stesso numero, stessa
data è la stessa bolla, e va segnata «già presente» senza nemmeno chiamare il server,
come fanno già le fatture. Vale sia dentro il mucchio caricato sia contro quelle che ci
sono già.

### A2 — Un PDF solo con tante bolle dentro

Questo è il pezzo nuovo. Si fa in tre passi, tutti nel browser.

1. **Si guardano le pagine una per una** e si cerca dove finisce una bolla e comincia
   la successiva. Il segnale buono è il numero di bolla: quando cambia, è un'altra.
   Appoggi utili: «pagina 1 di 3» scritta sul documento, e il salto di fornitore.
2. **Si taglia** il PDF nei pezzi trovati, con `copyPages` che già usiamo altrove.
3. **Ogni pezzo entra in A1** come se fosse stato caricato da solo.

Il punto delicato è dove si taglia, e lì non mi fido di un taglio automatico muto:
prima di leggere i pezzi si mostra **dove il sistema ha deciso di tagliare**, con le
miniature delle pagine e la possibilità di spostare un taglio, toglierlo o aggiungerne
uno. Trenta secondi di controllo valgono più di venti bolle smistate male.

Tetti di sicurezza, come già fa `riduciPdf.ts`: un numero massimo di pagine, un peso
massimo e un tempo massimo, oltre i quali si dice chiaramente di dividere il file.

### A3 — Il pezzo a valle che manca da prima

Oggi le righe di una bolla **senza ordine d'acquisto** non diventano né giacenza né
costo. Le due colonne che servono a non farlo due volte esistono già
(`caricata_a_magazzino_at`, `company_cost_id`), ma nessuno le scrive. Senza questo,
caricare cento bolle in blocco riempie un elenco e non muove il magazzino: metà del
valore della richiesta andrebbe persa.

Va quindi chiuso insieme: bolla «magazzino» → carico della giacenza dalle sue righe;
bolla «cantiere» → costo sulla commessa. Una volta sola, con la prova scritta in quelle
due colonne.

### Da decidere prima di partire

1. **Quanto può sbagliare prima di chiedere.** Propongo: sotto una certa sicurezza la
   riga è gialla e va guardata; il resto si conferma in blocco.
2. **Tre lettori diversi, tre risposte diverse.** Oggi le bolle hanno tre estrattori con
   tre formati (`ddt-ai-extract`, `ai-ddt-analyzer`, `ddtLetto`). Per l'import in blocco
   ne uso **uno solo**, il più ricco. Gli altri due restano dove sono finché qualcuno non
   li unisce: è un debito già scritto nel piano precedente.
3. **I tipi del database sono vecchi.** `ddt_righe` e otto colonne di `ddt_ricezione` non
   sono in `src/integrations/supabase/types.ts`, e il codice le aggira. Vanno rigenerati
   prima, o il lavoro nuovo nasce già storto.

---

# Parte B — I pagamenti della commessa come sono davvero

**La richiesta.** Quando si crea una commessa per un cliente privato, poter descrivere
come si incassa davvero: acconto, merce pronta, saldo; oppure acconto e poi i SAL
mensili; oppure a fasi, con un pagamento a ogni fase finita, come i passaggi dal notaio.
«Basta non mettere il vincolo».

## La cosa importante: il vincolo non è dove sembra

Il sistema **sa già** fare quasi tutto quello che chiedi. Esistono già i modelli di
pagamento, e ogni rata può già essere legata a un evento invece che a una data: alla
firma, **a merce in magazzino**, all'inizio lavori, alla posa, **al SAL numero N**, a
fine lavori. I SAL verso il cliente sono completi: verbale, avanzamento preso dalle fasi,
firma, e da lì nasce la fattura.

Il vincolo è **la schermata che crea la commessa**. Lì c'è solo un menu «Numero Rate» da
1 a 10, i nomi delle rate li scrive il programma (`Acconto 1`, `Rata 2`, `Saldo`) e non
si possono cambiare, e se cambi il numero di rate **il piano si rifà da capo** perdendo
quello che avevi scritto. Il selettore dei modelli esiste, ma è montato solo nella scheda
della commessa già creata — cioè dopo.

Quindi i tuoi tre casi stanno così:

| Il tuo caso | Stato |
|---|---|
| Acconto, merce pronta, saldo | **Esiste già**, c'è perfino il modello pronto per i serramenti. Non lo raggiungi in creazione |
| Acconto e poi i SAL | **Esiste già tutto**, dal verbale alla fattura. Non lo raggiungi in creazione |
| A fasi, pagamento a fase finita | **Manca davvero**: la rata non sa cos'è una fase |

## Come lo farei

### B1 — Sbloccare la creazione

Al posto del menu «Numero Rate», la stessa cosa che c'è già nella scheda della commessa:
si sceglie **come si paga** («acconto e saldo», «a SAL», «serramenti: ordine, merce,
posa», o uno tuo), e il piano si compila da solo. Poi si aggiusta a mano:

- **il nome di ogni rata si scrive**, così «merce pronta», «al rogito», «SAL di marzo»
  diventano possibili;
- **si aggiunge e si toglie una rata singola**, senza rifare il piano da capo e senza
  perdere quello che hai scritto;
- **il quando** di ogni rata si sceglie fra gli eventi che esistono già.

Tolgo il tetto delle 10 rate, che è scritto solo nel menu. Il saldo finale resta
calcolato da solo: è l'unico automatismo che conviene tenere, perché è quello che fa
quadrare i conti.

Questo è lavoro di schermata, senza toccare il database: è la parte che rende subito
possibili due dei tre casi.

### B2 — Il pagamento a fasi (il pezzo nuovo)

Le fasi di lavorazione esistono già, con il loro stato e la data di completamento. Manca
il filo fra una fase e una rata. Serve:

- un **evento nuovo**, «quando la fase è finita», accanto a quelli che ci sono;
- un **riferimento alla fase** sulla rata;
- quando segni la fase completata, la rata **matura da sola** e prende quella data,
  esattamente come succede già quando si approva un SAL.

Con questo il cantiere diviso in sei fasi ha sei rate, e ogni fase chiusa fa scattare la
sua. Richiede una migrazione, ed è l'unica parte della Parte B che la richiede.

### B3 — I SAL quando non sai quanti saranno

Oggi un piano «a SAL» vuole sapere in anticipo quanti SAL ci saranno: una rata per SAL.
Ma in un cantiere che dura un anno non lo sai. Propongo che si possa dire «a SAL, numero
aperto»: ogni SAL approvato crea la sua rata, e quello che resta da incassare è sempre il
totale meno i SAL già fatti.

Lo metto per ultimo perché cambia il modo in cui si contano i soldi ancora da prendere, e
voglio prima vedere B1 e B2 in uso.

### Due cose che ho trovato per strada

1. **Il preventivo perde il «quando».** Le fasi di pagamento del preventivo non portano
   l'evento: diventano rate a 30, 60 e 90 giorni inventati. Chi parte da un preventivo si
   ritrova date finte da correggere a mano. Si sistema insieme a B1.
2. **Le rate della commessa non sono nello scadenzario.** Le scadenze in entrata nascono
   solo dalle fatture; le rate vivono in un binario parallelo letto da altre viste. Oggi
   funziona, ma è il genere di cosa che prima o poi fa litigare due numeri. Non lo tocco
   in questo giro: lo segnalo e basta.

---

# In che ordine

| | Cosa | Perché prima | Migrazione |
|---|---|---|---|
| 1 | **B1**, sbloccare la creazione | Poco lavoro, nessun rischio, rende possibili due casi su tre | no |
| 2 | **A1**, tante bolle insieme | Il grosso del valore; riusa ciò che esiste | no |
| 3 | **A3**, righe della bolla → giacenza e costo | Senza, caricare in blocco riempie un elenco e basta | forse |
| 4 | **B2**, pagamento a fase finita | Il caso che manca davvero | sì |
| 5 | **A2**, dividere il PDF con più bolle | La parte più nuova e più delicata; meglio dopo che A1 sia in uso | no |
| 6 | **B3**, SAL a numero aperto | Cambia come si contano i soldi da incassare: per ultimo | sì |

Si può fermarsi a ogni riga: ognuna sta in piedi da sola.

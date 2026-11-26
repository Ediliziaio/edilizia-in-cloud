# Manutenzioni e Assistenza — piano di sviluppo

**Data:** 26/11/2026 · **Stato:** APPROVATO dal founder il 26/11/2026 · **Sezione:** `/azienda/assistenza` (schede «Assistenza» e «Manutenzioni»)

> Questo documento si legge in italiano semplice. Non si scrive una riga di codice prima del sì del founder.

---

## 1. Da dove si parte

### 1.1 Che cosa c'è oggi

La sezione è una porta sola con due schede in cima:

| | Assistenza | Manutenzioni |
|---|---|---|
| Elenco | richieste e interventi, con pillole per stato e vista a colonne | elenco di «impianti» con pillole Tutti · Scadenza imminente · In regola · Senza piano · Contratti |
| Popup di creazione | «Nuovo ticket» (una pagina sola, tanti campi) | «Nuovo Impianto» (3 passi) |
| Scheda | ricca: stato, priorità, assegnato, squadra, cliente, pagamento, merce, costi e margine, richiami, chat, allegati, rapportini, fattura | povera: scheda tecnica, contratto, piano, interventi, rapportini. Una colonna stretta a sinistra e una larga a destra, tutto in un'unica pagina che si scorre |

Chi può vedere cosa è già separato: **Assistenza** ha il suo permesso, **Manutenzioni** il suo. Chi ne ha solo uno non vede nemmeno le due schede, va dritto alla sua.

### 1.2 Che cosa ha una commessa e qui manca

Confronto fatto riga per riga con la scheda commessa (5 schede: Panoramica · Cantiere · Articoli e Materiali · Costi e Fatture Fornitori · Economia, Pagamenti e SAL).

| Cosa | Commessa | Manutenzione oggi |
|---|---|---|
| **Codice** (ORD-0001) | sì, progressivo per azienda, modificabile a mano | **no, niente codice** |
| Schede invece di un rotolo unico | sì, 5 schede, su telefono anche | no, pagina unica che si scorre |
| Fasi e lavorazioni con avanzamento | sì | **no** (c'è solo la data della prossima visita) |
| Cronoprogramma | sì | no |
| Assegnazione a persona | sì, chiara | solo «tecnico preferito» nascosto dentro il piano |
| Assegnazione a squadra | sì | no sulla manutenzione (c'è sul singolo intervento) |
| Fatture emesse collegate | sì | **no**: la fattura del canone si crea e poi si perde, non torna indietro |
| Fatture ricevute / costi | sì | no |
| Rate e incassi | sì | no, solo l'importo del canone scritto sul contratto |
| Costi e margine | sì | no sulla manutenzione (c'è sul singolo intervento) |
| DDT e bolle | sì | no |
| Materiali usati | sì | solo dentro il singolo rapportino, non sommati |
| Note interne con menzioni | sì | no |
| Mezzi e attrezzature | sì | no |
| Documenti e allegati | sì | solo le foto |
| Indirizzo del lavoro | sì | no (sta sul singolo intervento) |

### 1.3 Che cosa invece c'è già e si può riusare subito

Buone notizie, molto è già in casa e non va costruito:

- **Costi e margine del singolo intervento** esistono già (ore, costo orario, trasferta, materiale, importo finale).
- **Pagamento dell'intervento** esiste già (pagato, metodo, data, perché è gratuito).
- **Merce** esiste già, con ordine al fornitore.
- **Rapportini** esistono già, con foto, ore, firma del cliente e materiali usati scritti dentro.
- **Fattura da intervento o da canone** esiste già (manca solo il filo che la riporta indietro).
- **Checklist di quello che si fa ogni volta** esiste già come campo sul piano, ma oggi non si vede e non si compila da nessuna schermata.
- **Interventi brevi dal telefono** sono già online da fine novembre e scrivono nei rapportini.
- Il **codice progressivo per azienda** esiste già per le commesse: la stessa ricetta si copia, non si inventa.

---

## 2. Le parole: glossario nuovo

Il founder ha ragione: in quella sezione non si vende un impianto, si vende **manutenzione**. Chi apre la scheda vuole sapere *che manutenzione è, su che cosa, per chi, quando torniamo*.

**La regola:** l'oggetto che si apre si chiama **Manutenzione**. L'oggetto fisico (la caldaia, il cappotto, le tapparelle) resta descritto dentro, nel riquadro «Che cosa manuteniamo».

| Oggi a schermo | Da domani |
|---|---|
| Nuovo Impianto | **Nuova manutenzione** |
| Impianti (pillola, riepilogo, colonna) | **Manutenzioni** |
| Impianti e scadenze | **Manutenzioni e scadenze** |
| Impianti, contratti e piani di manutenzione dei clienti | **Le manutenzioni dei tuoi clienti: contratti, scadenze e interventi** |
| Scheda tecnica | **Che cosa manuteniamo** |
| Tipo impianto | **Che cosa** |
| Passo 1 di 3: Cliente e impianto | **Passo 1 di 3: Cliente e lavoro** |
| Piano di manutenzione | **Ogni quanto si torna** |
| Senza piano | **Senza ricorrenza** |
| Registra esecuzione | **Segna la visita fatta** |
| Nessun piano configurato per questo impianto | **Non è ancora stabilito ogni quanto si torna** |
| Nessun impianto registrato | **Nessuna manutenzione registrata** |
| Nessun impianto con questi filtri | **Nessuna manutenzione con questi filtri** |
| Modifica impianto | **Modifica manutenzione** |
| Archivia / Ripristina impianto | **Archivia / Ripristina manutenzione** |
| Torna agli impianti | **Torna alle manutenzioni** |
| Cerca per cliente o impianto… | **Cerca per cliente, tipo o codice…** |
| Seleziona tutti gli impianti | **Seleziona tutte le manutenzioni** |
| {n} impianti selezionati | **{n} manutenzioni selezionate** |
| Impianto collegato (nel popup del ticket) | **Manutenzione collegata** |
| Nessun contratto collegato a questo impianto | **Nessun contratto collegato a questa manutenzione** |
| Nessun intervento registrato per questo impianto | **Nessun intervento registrato** |
| Foto impianto | **Foto** |

**Restano come sono** (sono già le parole giuste e la gente le usa): Assistenza, Intervento, Contratto, Canone, Cliente, Rapportino, Garanzia, Marca, Modello, Matricola, Scadenza imminente, In regola.

**Non si tocca la parola «impianto» dove vuol dire davvero un impianto**: planimetrie, preventivi, computo, il mestiere «Impianti» dell'area operai, i tipi caldaia/fotovoltaico/impianto elettrico. Lì «impianto» è corretto e cambiarlo farebbe danni.

### 2.1 Quanto lavoro è, e il nodo della traduzione

*(corretto il 26/11 dopo la verifica con la sessione della lingua: l'app d'ufficio è tradotta in **tutte e dieci** le lingue, non solo in rumeno e albanese. Il nome della cartella `campo` è solo storico e copre tutta l'app: 69.000 voci per lingua.)*

Nella sezione ci sono **188 frasi** scritte per essere tradotte; di queste **36 contengono la parola «impianto»** ed è quelle che si toccano.

Come funziona la traduzione: **la chiave è la frase italiana stessa**, non c'è un file italiano. Se cambio la frase nel codice, nasce una chiave nuova e tutte le lingue perdono quella riga: l'utente straniero rivedrebbe l'italiano e il controllo automatico diventerebbe rosso. Quindi ogni frase cambiata va riscritta negli **otto dizionari pieni** (ro, sq, de, fr, en, es, ar-MA, ar-EG); lo spagnolo d'Argentina e del Perù contengono solo le differenze rispetto allo spagnolo, quindi si toccano solo se avevano una loro versione di quella frase.

**Conto vero del lavoro: 36 frasi × 8 lingue ≈ 290 righe**, più le 36 righe italiane nel codice. È una voce di lavoro a sé, non una rifinitura finale: vale circa i due terzi della fase 1.

Due cose rendono questo giro meno rischioso di quanto sembri:

1. **La parola nuova è già tradotta ovunque.** «Manutenzione» esiste già nei dizionari e in modo coerente: *Întreținere* (ro), *Mirëmbajtje* (sq), *Wartung* (de), *Entretien* (fr), *Maintenance* (en), *Mantenimiento* (es), الصيانة (ar-MA), صيانة (ar-EG). Non si inventa un termine nuovo, si estende uno già in uso. Il rischio tedesco segnalato dalla sessione della lingua (*Anlage* = impianto, *Gerät* = apparecchio) non ci tocca proprio perché smettiamo di dire «impianto».
2. **Si cambiano solo le 36 frasi di questa sezione.** Nei dizionari ci sono in tutto 215 chiavi con «impianto», ma le altre ~180 stanno in planimetrie, preventivi e computo, dove «impianto» è la parola giusta e **non si tocca**.

**Come si fa, in pratica** (metodo della sessione della lingua, da rispettare alla lettera):
- le righe nuove si aggiungono **in coda** a ogni dizionario, prima della chiusura del file, mai in mezzo: così due sessioni che lavorano insieme non si pestano i piedi;
- il controllo da lanciare dopo ogni modifica e dopo ogni riallineamento con la versione online è `bun run vitest run src/test/logic/ufficioLingua.test.ts src/test/logic/campoLingua.test.ts`;
- se nascono file nuovi con testi dentro, vanno aggiunti all'elenco del controllo, altrimenti restano scoperti senza che nessuno se ne accorga;
- cercare le frasi con `/\bimpiant/i`, perché il filtro `/impianto/` si perde il plurale «impianti»; per l'albanese non si può usare `\b` dopo «ë».

**La parola si decide una volta sola.** Ogni ripensamento dopo il giro delle lingue costa un secondo giro intero. Per questo il glossario qui sopra è la cosa che il founder approva per prima.

**Chi fa il giro delle lingue:** la sessione della lingua si è offerta e ha già gli strumenti rodati. Proposta: io cambio le 36 frasi italiane nel codice e passo l'elenco esatto a quella sessione, che fa le otto lingue. Da concordare con il founder se preferisce che faccia tutto una sessione sola.


---

## 3. Il codice della manutenzione

**Formato:** `MAN-0001`, progressivo per azienda, con prefisso personalizzabile come per le commesse (un'azienda può volere `M`, `MAN`, `ASS`).

**Come funziona**, copiando quello che già funziona per le commesse:
- una colonna nuova sull'azienda per il prefisso (default `MAN`);
- una colonna nuova `codice` sulla manutenzione, **modificabile a mano**: se l'ufficio scrive il suo codice vince il suo, se lo lascia vuoto si usa il progressivo;
- un indice che impedisce due codici uguali nella stessa azienda;
- una funzione che calcola il prossimo numero senza consumarlo (così il popup può mostrare «sarà MAN-0014» prima di salvare).

**Dove si vede:** in cima alla scheda accanto al titolo, nella colonna nuova «Codice» dell'elenco, nella ricerca, nell'esportazione, nella fattura del canone e nel rapportino.

**Serve una migrazione del database?** Sì, una sola, piccola: il prefisso sull'azienda, la colonna `codice` sulla manutenzione, l'indice, la funzione del prossimo numero. Si applica con `apply_migration` e **subito dopo** si riallinea la versione nel registro, come impone `CLAUDE.md`; mai `supabase db push`. Le manutenzioni già esistenti ricevono il codice al momento, in ordine di creazione, dentro la stessa migrazione.

**Anche gli interventi?** Sì, ma dopo: `INT-0001` con la stessa ricetta. È la fase 6, non blocca niente.

---

## 4. Come diventa la scheda

Oggi è un rotolo unico. Diventa **a schede, come la commessa**, con lo stesso disegno già collaudato (su computer le schede in alto, su telefono la stessa barra ma stretta, e l'indirizzo si ricorda la scheda aperta, così le notifiche e i link salvati aprono quella giusta).

### Testata (sempre visibile)
`MAN-0014 · Cappotto Termico — Weber Saint-Gobain` · nome del cliente · stato (In regola / Scadenza imminente / Scaduta / Senza ricorrenza) · chi è l'incaricato · prossima visita.
Pulsanti: WhatsApp al cliente, Email, Storico, Archivia, Modifica. (Sono già tutti lì: cambia solo che sopra compare il codice.)

### Scheda 1 — Panoramica
- **Che cosa manuteniamo**: tipo, marca, modello, matricola, data di installazione, garanzia con il semaforo dei giorni, note, foto. *(c'è già)*
- **Cliente**: nome, telefono, email, indirizzo del posto dove si va. *(l'indirizzo è nuovo: oggi sta solo sul singolo intervento e va riscritto ogni volta)*
- **Ogni quanto si torna**: ricorrenza, prossima scadenza, ultima visita, incaricato. *(c'è già, cambia solo nome e posto)*
- **Chi se ne occupa**: persona **e** squadra, con il pulsante per cambiarle da qui. *(la persona c'è ma nascosta nel piano; la squadra è nuova)*
- **Contratto**: nome, canone, periodicità, inizio, scadenza, rinnovo automatico. *(c'è già)*
- **Note interne**: come in commessa, discussione con le menzioni che aprono un gruppo in chat. *(nuovo, si riusa il pezzo della commessa)*

### Scheda 2 — Lavoro
- **Che cosa si fa ogni volta**: la lista delle lavorazioni della visita (controllo, pulizia, prova, ritocco…), con la spunta e chi l'ha fatta. Si definisce una volta sul contratto e si ripropone ad ogni visita. *(il contenitore esiste già sul piano, non si vede da nessuna parte: qui diventa visibile e compilabile)*
- **Avanzamento della visita in corso**: quante lavorazioni su quante sono fatte, come il semaforo delle fasi in commessa.
- **Interventi**: l'elenco di oggi, con stato, data, chi, e il pulsante «Nuovo intervento». *(c'è già)*
- **Visite fatte**: lo storico delle esecuzioni con esito e note. *(c'è già)*
- **Rapportini**: ore, foto, firma del cliente. *(c'è già)*

### Scheda 3 — Materiali
- **Materiali usati**, sommati su tutti gli interventi di questa manutenzione: che cosa, quanto, quando, su quale intervento. *(i dati ci sono già dentro i rapportini e negli ordini della merce: qui si mettono insieme, non si crea niente di nuovo)*
- **Merce ordinata** per gli interventi aperti, con il suo stato. *(c'è già sul ticket)*
- **Bolle e DDT** collegati. *(nuovo collegamento)*

### Scheda 4 — Soldi
- **Canone**: quanto, ogni quanto, quanto è già stato fatturato quest'anno, quanto manca.
- **Fatture emesse** collegate: canone e interventi a pagamento, con il loro stato di incasso. *(oggi la fattura del canone si crea e poi non torna più indietro: va messo il filo)*
- **Fatture ricevute e altri costi** collegati alla manutenzione.
- **Costi e margine** della manutenzione nel suo insieme: somma di ore, trasferte, materiali degli interventi, contro quello che si è incassato. Con il conto separato di **quanto costa la garanzia**, che è costo puro. *(il calcolo per il singolo intervento esiste già: qui si somma)*
- **Incassi** e ritardi.

Chi non può vedere i prezzi non vede questa scheda, esattamente come in commessa.

### Su telefono
Stessa struttura, stesse quattro schede nella barra stretta in alto. Prima si vede sempre **Panoramica** (che cosa, chi, quando) e poi **Lavoro**. Niente tabelle larghe: righe che si possono toccare. La scheda **Soldi** su telefono mostra i numeri grandi e nasconde il dettaglio dietro un tocco.

---

## 5. Come diventano i popup

Regola valida per tutti e due: **si chiede il minimo per partire, il resto si aggiunge dopo dalla scheda.** Quello che si rimanda non sparisce: la scheda mostra in chiaro «manca il contratto», «manca la ricorrenza» con il pulsante per aggiungerli.

### «Nuova manutenzione» (oggi «Nuovo Impianto», 3 passi)

**Passo 1 — Per chi e su che cosa** *(gli unici due obbligatori)*
- Cliente (con «Nuovo» accanto, già c'è)
- Che cosa manuteniamo (tipo)
- *Facoltativi, sulla stessa schermata:* marca, modello, matricola, indirizzo, foto, note
- In alto a destra si vede già il codice che prenderà: `sarà MAN-0014`

**Passo 2 — Ogni quanto si torna** *(si può saltare)*
- Ogni quanto (mensile/trimestrale/semestrale/annuale, oppure «ogni N giorni»)
- Prima visita
- Chi se ne occupa: persona **o** squadra
- Che cosa si fa ogni volta: la checklist, che si può prendere da un modello del mestiere
- *Il primo appuntamento in calendario resta qui, com'è oggi*

**Passo 3 — Contratto** *(si può saltare)*
- Nome, canone, periodicità, inizio, scadenza, rinnovo automatico
- Il canone si può prendere dal listino manutenzione, com'è oggi

**Che cosa cambia davvero:** oggi i campi sono tutti in fila e i passi 2 e 3 hanno una casella da spuntare per «attivare» la sezione; domani i passi 2 e 3 si saltano con un pulsante **«Lo faccio dopo»** chiaro, le date e i soldi sono raggruppati, e il salvataggio parziale (che già c'è e funziona) viene detto all'utente: «Manutenzione creata. Ricorrenza e contratto li aggiungi quando vuoi dalla scheda».

### «Nuovo ticket» (assistenza)

Il popup di oggi non è povero: è **troppo pieno tutto insieme**. Si riorganizza, non si taglia.

**Sempre aperto (il minimo):** Cliente · Oggetto · Tipo · Priorità
**Richiuso, con il riassunto sulla riga:** «Chi ci va e quando» (operaio o squadra, data, durata, indirizzo, note) · «Soldi» (a pagamento sì/no, importo, perché è gratuito) · «Merce» (serve, a che punto è, che cosa manca) · «Collegamenti» (commessa, manutenzione) · «Allegati e primo messaggio»

Migliorie concrete:
- quando si sceglie il cliente, l'indirizzo si propone da solo dall'anagrafica e dalla manutenzione collegata, invece di riscriverlo;
- se il ticket nasce da una manutenzione, cliente, indirizzo e manutenzione arrivano già compilati;
- **la data si sceglie dove c'è posto**: accanto al campo, gli slot liberi dell'operaio scelto;
- su telefono il popup diventa a tutta pagina, con i pulsanti in basso sempre raggiungibili.

---

## 6. Fasi, assegnazione, fatture, DDT, materiali, costi e margine

| Cosa | Si riusa | Si costruisce |
|---|---|---|
| **Fasi / lavorazioni** | il contenitore della checklist esiste già sul piano | la schermata per definirle e spuntarle, l'avanzamento, i modelli per mestiere |
| **Assegnazione a persona** | esiste come «tecnico preferito» | si porta in testata e si rende cambiabile da lì |
| **Assegnazione a squadra** | le squadre esistono già e si usano sui ticket | il collegamento con la manutenzione |
| **Fatture emesse** | il popup «crea fattura» esiste e funziona | **il filo che torna indietro**: una colonna nuova sul documento, così la fattura si vede nella scheda. È la cosa che manca di più |
| **Fatture ricevute e costi** | tutto l'impianto costi esiste in commessa | il collegamento alla manutenzione |
| **DDT e bolle** | esistono e sono già legati alla commessa | il collegamento alla manutenzione |
| **Materiali usati** | sono già scritti dentro ogni rapportino e negli ordini merce | la vista che li somma |
| **Costi e margine** | il calcolo del singolo intervento esiste già | la somma sulla manutenzione, e il conto di quanto costa la garanzia |
| **Note interne** | esistono in commessa con le menzioni | il collegamento alla manutenzione |
| **Mezzi** | esistono | collegamento (bassa priorità: su una manutenzione servono di rado) |

**Perché non si aggancia tutto alla commessa invece di rifarlo.** La manutenzione ha già il posto per dire a quale commessa appartiene, e molte nascono proprio da un lavoro fatto. Ma la maggior parte delle manutenzioni **non ha una commessa** (il cliente storico, il contratto annuale), e creare una finta commessa per ognuna riempirebbe l'elenco commesse di roba che non è un cantiere. Quindi: la manutenzione resta una cosa sua, con i suoi collegamenti, e dove c'è una commessa i due si vedono a vicenda.

---

## 7. Che cosa resta esattamente come oggi

Il software si cuce sull'azienda, e il comportamento predefinito è «come oggi». Quindi:

- **Niente cambia da solo per chi già usa la sezione.** Le due schede in cima, i permessi separati, le pillole, l'elenco e la vista a colonne restano com'erano.
- **I vecchi indirizzi continuano a funzionare.** Chi ha un link salvato a una scheda, o una notifica vecchia, arriva dove arrivava prima — sulla Panoramica.
- **Le manutenzioni senza contratto e senza ricorrenza restano valide.** Non diventa obbligatorio niente che oggi non lo è.
- **Gli interventi dal telefono non si toccano.** L'area operai resta esattamente com'è: le parole cambiano solo nell'ufficio.
- **Il codice non rompe niente.** Chi non lo guarda non lo vede, chi vuole il suo lo scrive a mano.
- **Le schede nuove compaiono solo se hanno qualcosa da dire.** Niente scheda «Soldi» vuota a chi non può vedere i prezzi, niente «Materiali» vuoto se non c'è mai stato un materiale.
- **La checklist non obbliga nessuno.** Chi non la compila lavora come prima.

---

## 8. Fasi di consegna, dalla più utile

| # | Fase | Che cosa dà | Quanto lavoro | Serve il database |
|---|---|---|---|---|
| **1** | **Le parole** | la sezione parla di manutenzione, non di impianti. È quello che il founder ha chiesto per primo ed è la cosa che si vede subito | **mezza giornata** + le righe in rumeno e albanese | no |
| **2** | **Il codice MAN-0001** | ogni manutenzione ha un nome che si può dire al telefono, cercare, scrivere in fattura | **mezza giornata** | sì, una migrazione piccola |
| **3** | **La scheda a quattro schede** | la scheda smette di essere un rotolo; su telefono diventa usabile | **2 giorni** | no |
| **4** | **Fatture collegate e soldi** | si vede che cosa si è fatturato e che cosa manca: è il buco più grosso di oggi | **1,5 giorni** | sì, una colonna sul documento |
| **5** | **Lavorazioni e avanzamento** | si sa che cosa si fa ad ogni visita e a che punto si è | **1,5 giorni** | no (il contenitore esiste) |
| **6** | **I popup rifatti** | si crea una manutenzione in dieci secondi, un ticket senza perdersi | **1,5 giorni** | no |
| **7** | **Materiali e DDT** | si sa che cosa è stato consumato e quanto è costato | **1 giorno** | sì, collegamenti |
| **8** | **Note interne, squadra, mezzi, codice intervento** | le rifiniture che avvicinano la scheda alla commessa | **1 giorno** | sì, collegamenti |

**In tutto: circa 9-10 giorni di lavoro**, consegnati uno alla volta, ognuno utile da solo. Le fasi 1 e 2 si possono vedere online **domani stesso**.

Nota pratica: questo Mac ha 8 GB e ci lavorano altre sessioni insieme, quindi una verifica alla volta, col turno preso. Le fasi vanno in produzione una per volta, con il controllo a schermo fatto prima.

---

## 9. Come si verifica

Per ogni fase, prima di dire che è fatta:

1. **Prove automatiche.** La sezione ha già le sue (elenco, creazione parziale, sola lettura, schede accessibili, manodopera): vanno estese alle novità, non riscritte. Si aggiunge una prova per il codice (progressivo, prefisso, codice scritto a mano, nessun doppione) e una per i collegamenti delle fatture.
2. **Il controllo della lingua**: `bun run vitest run src/test/logic/ufficioLingua.test.ts src/test/logic/campoLingua.test.ts` deve restare verde, cioè nessuna frase senza traduzione in nessuna delle dieci lingue.
3. **Il cricchetto dei tipi** sui file toccati — su questo Mac si fa solo sui file toccati, non su tutto.
4. **Prova a schermo su Demo Azienda 2**, da computer e da telefono: creare una manutenzione saltando i passi 2 e 3, aggiungerli dopo, aprire ogni scheda, fare un intervento, segnare la visita, fare la fattura del canone e verificare che torni nella scheda.
5. **Controllo che niente si sia rotto** per chi già usa la sezione: le due manutenzioni di Demo Azienda 2 devono aprirsi e comportarsi come prima, con in più il codice.
6. Dopo la messa online, **apertura della pagina vera** per essere sicuri che il deploy sia quello giusto.

---

## 10. Decisioni del founder (26/11/2026)

1. **Il nome dell'oggetto: «Manutenzione».** Approvato. L'elenco si chiama Manutenzioni, il pulsante «Nuova manutenzione», e dentro la scheda il riquadro «Che cosa manuteniamo» con tipo, marca, modello, matricola.
2. **Il prefisso del codice:** `MAN-0001`, personalizzabile per azienda.
3. **Da dove si parte:** fase 1 (le parole), poi fase 2 (il codice `MAN-`). Le altre fasi restano nell'ordine del piano.

**Unica cosa ancora aperta prima della fase 1:** chi scrive le righe in rumeno e albanese delle 36 frasi che cambiano. La domanda è stata mandata alla sessione della lingua il 26/11 per non tradurre due volte le stesse frasi, come era già successo quella mattina. La risposta va scritta qui.

# Planimetrie: aperture, materiali e fascicolo

Aggiornamento del 6 novembre 2026.

Il flusso è disegno o importazione, controllo della pianta, materiali comuni,
vista 3D, render delle stanze ed esportazione del fascicolo completo.

## Aperture importate

Il prompt p4 aggiunge una revisione separata sul documento originale. Il revisore
riceve i segmenti candidati e il file, senza la precedente risposta dell'AI.
Può soltanto confermare o escludere aperture: non aggiungerne, spostarle o
ridimensionarle. Gli id omessi o duplicati, i simboli senza evidenza e i casi
incerti non producono fori. Se manca il controllo o finisce il tempo, le stanze
rimangono modificabili e un avviso spiega quali aperture non sono state inserite.
Un segmento che supera un angolo non viene accorciato per farlo entrare nel muro.

La revisione è comunque un controllo visivo AI, non una certificazione del
rilievo. Il confronto umano con l'originale rimane necessario. Il banco oracolo
misura la costruzione geometrica con risposte note: non misura l'accuratezza
visiva. Il 6 novembre la nuova prova con il provider reale è bloccata dall'allarme
OpenRouter per credito esaurito; non sono stati effettuati nuovi tentativi a pagamento.

## Render e materiali

Una sessione su una versione superata si ferma prima del credito: occorre
riaprire la stanza con pianta e materiali correnti. Gli infissi comuni prevalgono
anche sulle vecchie eccezioni di configurazione. Resta disponibile l'eccezione
esplicita al pavimento per il singolo render.

Il render da pianta richiede un QA esplicito e positivo sul candidato finale.
Aperture cambiate, campioni sostituiti o un controllo assente non vengono
consegnati come successi; resta attivo il rimborso. Un retry non verificato non
cancella una precedente bocciatura. I render storici restano immutabili.

Su un piano senza la variante richiesta, il 3D usa lo stato di fatto e i materiali
comuni della variante selezionata. Non prende la geometria di un'altra proposta.

## Fascicolo completo PDF

È l'opzione predefinita in Esporta. Include copertina e indice, tutti i piani
dello stato selezionato, piante vettoriali in scala, casa e piani in 3D, schede
ambiente con misure, finiture, arredi e impianti, muri, serramenti e aree esterne,
prospetti, sezioni e punti da verificare. Ogni render completato della versione
corrente conserva le scelte effettive, i campioni e tutte le immagini risultato.
Le stanze senza render sono indicate. Le versioni e varianti differenti non si
mescolano. La lettura dei render è paginata e non si ferma alle 60 miniature
della galleria. Le immagini duplicate sono incorporate una sola volta.

L'esportazione non chiama l'AI. Un'immagine richiesta non disponibile ferma
l'esportazione con un messaggio, invece di produrre un fascicolo incompleto.
Il fascicolo può anche essere allegato al preventivo; la singola tavola in scala,
il DXF, l'SVG e il PNG restano disponibili come formati distinti.

Verifiche iniziali: 633 test planimetrie e 168 test render passati, controlli Deno delle due
funzioni passati, banco oracolo 16/16. Fascicolo scaricato dall'interfaccia sulla
pianta demo con soggiorno e bagno, due render Alta già presenti, controllato con
Poppler e revisione visiva delle pagine. L'allegato a un preventivo reale non è
stato creato durante la verifica.

## Revisione del flusso e della presentazione

La scheda collega esplicitamente disegno, materiali, render e fascicolo. Dal
risultato della stanza si può aprire il fascicolo conservando piano e variante;
l'URL conserva queste scelte. Il PDF non torna allo stato di fatto quando la
variante selezionata non ha opere su quel piano. La qualità iniziale dei render
da planimetria, singoli e in serie, è Alta; Standard resta selezionabile.

Il fascicolo ha una copertina fotografica, schede più compatte e il confronto
con la vera sorgente privata usata per ciascun render, nella stessa inquadratura.
I prodotti aziendali vengono documentati con le tavole fotografiche salvate con
quel render, evitando di sostituirle con foto di un catalogo modificato dopo.
Le scelte sono descritte per campo in italiano, compresi accento, colori cucina,
travi, luci, battiscopa e disposizione. Le tavole tecniche rimangono vettoriali e
in scala dichiarata; una scala 1:100 viene usata quando evita almeno due fogli
quasi vuoti rispetto all'impaginazione normale.

Inserire un esadecimale nel nome della pittura, dell'accento o delle tende
aggiorna il selettore. Cambiare il selettore elimina i nomi rimasti dal vecchio
colore, o sincronizza un nome esadecimale. Client e server fermano due codici
contraddittori prima di campioni, credito e provider; le modalità inattive sono
ignorate. Nel vecchio test del soggiorno il nome verde e il selettore bianco
erano incongruenti: la configurazione storica è segnalata, non riscritta.

Verifiche della revisione: 639 test planimetrie e 179 test render passati,
compresi ambito del fascicolo su un altro piano, colore e foto effettiva,
qualità Alta in serie e isolamento delle sorgenti e dei campioni privati.
Nessuna nuova chiamata AI sul provider ancora privo di credito.

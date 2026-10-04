# Disegno automatico dei serramenti nel preventivatore

Data: 03/10/2026 · Ambiente di prova: **Demo Azienda 2** (`d2000000-0000-4000-a000-000000000002`)

## Obiettivo

Nel preventivatore serramenti ogni serramento ha un **disegno generato** dai suoi dati
(tipologia, larghezza, altezza, aperture, colori, maniglia, soglia). Il disegno appare
nella riga del preventivo e nel PDF, al posto della foto fissa dell'articolo. Si sceglie
una volta nel listino che cosa è un articolo; le misure e le scelte del cliente fanno il
resto.

Perché: la foto è una sola per articolo, quindi non può mostrare il senso di apertura, le
misure vere o il colore scelto; 53 disegni a mano non coprirebbero comunque le combinazioni.

## Dove siamo (verificato il 03/10)

- **Prototipo funzionante in locale**, non collegato al sistema:
  `src/lib/serramenti/disegnoSerramento.ts` (geometria), `finituraSerramento.ts` (colori,
  legni, finiture maniglia), `ralColori.ts` (216 RAL con colore), componente
  `src/components/serramenti/DisegnoSerramentoSvg.tsx`, pagina di prova
  `/dev/disegno-serramenti`, 16 test in `src/test/logic/disegnoSerramento.test.ts`.
  Convenzioni decise: destra/sinistra viste dall'interno; simbolo con la punta dal lato
  maniglia (una costante lo inverte); profili standard sottili, **uguali per ogni modello**
  (`PROFILI_STANDARD`); vista esterna specchiata, tratteggiata, senza maniglie.
  **Sagome (04/10):** oltre al rettangolo disegna **arco** (a tutto sesto o ribassato, con la
  quota della freccia) e **trapezio** (lato alto/basso a scelta, con le quote dei due lati).
  Hanno un solo campo (una anta o un fisso), senza sopraluce.
  **Monoblocco, vetro e telaio (04/10):** il monoblocco disegna il cassonetto sopra (l'altezza totale
  lo comprende: 1000 con cassonetto da 200 = 200 + 800), con pannello d'ispezione, colore proprio,
  tapparella a stecche (abbassata a piacere), motore o cintino, zanzariera a trama; il vetro cambia
  per tipo (satinato, fumé, serigrafato, acustico, antisfondamento) e lastre (un distanziatore per
  il doppio, due per il triplo); il telaio a Z mostra l'aletta come cornice dall'interno, il telaio a
  L no.
  **Ante, divisori, scorrevoli (05/10):** ante di **larghezza diversa** (misura per anta, quote una
  per una sotto il totale); **traversi** orizzontali e **inglesine** (colonne × righe); **scorrevoli**
  con ante sovrapposte su due binari (fissi dietro); **controlli sulle misure** con i limiti del
  produttore (`controllaMisure`: anta larga/alta/pesante, cassonetto, ante massime, sagome);
  **catalogo degli assi** con le aperture del listino che diventano ante (`anteDaApertura`).
  **Persiane (05/10):** veneziana a lamelle **fisse** o **orientabili** (con l'asta e l'apertura delle
  lamelle), gelosia, scuro pieno, scuro a cornice; 1–4 ante, asimmetriche; aperte a 45°, a 90°, una
  sola anta; aletta del telaio; colore; cerniere nel metallo scelto. Pagina `/dev/disegno-persiane`.
  **Regole standard del preventivo (05/10):** maniglia **una sola** con due ante a battente che si
  incontrano (sull'anta principale; sull'anta-ribalta se c'è; una per anta se sono due ante-ribalta);
  **traverso misurato dal basso** (porte finestre, a volte finestre), più largo del profilo dell'anta e
  con la quota. 88 test.
- **Infissi e Living** (`2f7ebdf7-218e-4847-9d48-ac3c2218f0ff`): listino già riorganizzato.
  Le linee sono cartelle (`listino_categorie`) con articoli propri: Salamander proEvolution 72
  e bluEvolution 82 (23 articoli ciascuna), Euroall CX 600 e CX 700 in alluminio (23
  ciascuna, colore con tutti i RAL), persiane «Lamelle fisse» e «Lamelle orientabili»
  (36 ciascuna). Asse Soglia sulle 9 porte finestre. I 23 serramenti e le 36 persiane
  originali, con l'asse Linea, sono ancora attivi.
- **Demo Azienda 2** ha già un listino serramenti simile ma **vecchio**: macro «Serramenti»
  (23 articoli) e «Persiane e scuri» (36) con l'asse Linea, «SERRAMENTI STANDARD» (47),
  tapparelle, cassonetti, zanzariere, porte. 5 progetti serramenti, 9 righe che puntano
  agli articoli vecchi: **non vanno rotte**.
- Il preventivo serramenti oggi legge solo `article_families.immagine_url`. La riga di
  progetto (`sr_serramenti_progetto`) ha già tipologia, larghezza_mm, altezza_mm, apertura
  (testo libero, quasi sempre vuoto), colore_interno/esterno, `scelte_assi`, `family_id`.
  Il PDF serramenti è `@react-pdf` lato client (`SerramentoPDF.tsx`), quindi sa disegnare in
  SVG: nessun secondo motore.

## Decisioni già prese

1. Un solo standard per tutti i modelli (profili, simboli, maniglia). Nessuna variazione per linea.
2. Soluzione B per le aperture: asse **Apertura** dentro ogni articolo, senza duplicare gli articoli.
3. Il disegno si genera, non si disegna a mano: i 53 disegni dell'elenco non servono più.
4. Lavorare in locale; nessun push senza autorizzazione ([[eic-push-policy]]). Scritture
   sul database solo su Demo Azienda 2.

## Decisioni prese il 04/10

- **Sagome:** arco e trapezio si disegnano, niente fallback alla foto per quelli. Si
  aggiungeranno altre sagome (tonda, triangolo, arco con sopraluce) quando serviranno.
- **PDF:** sempre **vista interna e vista esterna**, entrambe con le **quote** (larghezza e
  altezza; per l'arco anche la freccia, per il trapezio le altezze dei due lati).

## Decisioni ancora da prendere con te

- **D1 · Demo 2: aggiungere o sostituire?** Consiglio: **aggiungere** le nuove linee di
  Infissi e Living dentro le macro esistenti di Demo 2, poi **disattivare** (non cancellare)
  gli articoli vecchi con l'asse Linea. Le 9 righe già salvate restano valide.
- **D2 · Elenco delle aperture** per forma (file `docs/serramenti-disegni/elenco-aperture-da-disegnare.md`,
  ora una proposta): confermare o correggere prima della Fase 3.
- **D3 · Fallback.** Per ciò che il disegno non rappresenta (cassonetti, tapparelle,
  zanzariere, porte blindate) si usa la foto dell'articolo come oggi. Confermi?
- **D4 · Come si sceglie la sagoma** nel preventivatore: serve un asse **Forma** (rettangolare,
  arco, trapezio) sull'articolo, più le misure in più (altezza arco, altezza del lato basso e
  quale lato). Le misure in più si chiedono nella riga, accanto a larghezza e altezza. Va bene?

## Monoblocco, vetro, telaio e scheda tecnica della linea (04/10)

### Che cos'è il monoblocco (verificato)
Un corpo solo, già assemblato, con controtelaio, sottobancale termico, cassonetto e spallette
(fonti: [Arredamento.it](https://www.arredamento.it/cassonetti-tapparelle-coibentati), schede dei produttori).
Si sceglie dalla scheda del produttore l'altezza del cassonetto; nel disegno il default è 200 mm
come hai indicato, con 150/200/250/300 come valori da confermare per ogni produttore.
**Misura:** l'altezza totale comprende il cassonetto. Zanzariera integrata e tapparella (cintino o motore) sono varianti.

### Come entra nel listino
- Un articolo per forma, ad esempio **Monoblocco 1 anta / 2 ante**, con assi:
  **Altezza cassonetto** (200/250/300…), **Avvolgimento** (cintino, motore, motore radio: stessi
  codici della tapparella di oggi), **Colore tapparella**, **Colore cassonetto** (di serie come il serramento),
  **Zanzariera** (no / sì), più gli assi del serramento (apertura, vetro, telaio, soglia).
- Prezzo: maggiorazioni sugli assi (€/pz o %), come il resto del listino.
- Oggi cassonetto, tapparella e zanzariera si vendono come **complementi** della finestra: il disegno
  può leggere anche quelli (altezza del cassonetto, colore tapparella, motore, zanzariera) senza
  articoli nuovi. Il monoblocco come articolo serve quando lo si vende e lo si prezza come un pezzo solo.

### Maggiorazioni (punto 8): la struttura c'è, i prezzi li decidi tu
Il catalogo degli assi (`assiDisegno.ts`) elenca gli assi e i valori che fanno il disegno, **tutti con
maggiorazione 0 e segnati «da compilare»**: **Forma** (arco, trapezio), **Altezza cassonetto**,
**Avvolgimento** (cintino, motore, motore radio), **Zanzariera**, **Finitura maniglia**; per le persiane
**Apertura**, **Lamelle** (fisse/orientabili) e **Aletta** (28, 30, 35, 40, 60, 65 mm). Quando mi dai i
prezzi (percentuale o importo per ogni valore) li metto nel listino con la migrazione della Fase 2.

### Limiti di misura (punto 9)
`controllaMisure(disegno, limiti)` segnala errori (non si può fare) e avvisi (si può, controlla):
misura minima, cassonetto che lascia meno di 300 mm alla finestra, traverso fuori dal vetro, ante
troppo larghe/alte/pesanti, cassonetto non offerto, troppe ante, arco troppo alto o ribassato,
trapezio con i lati uguali, sagome con più campi. I **limiti veri** (larghezza e altezza massime
dell'anta, superficie massima, altezze di cassonetto) arrivano dalla scheda tecnica della linea:
è per questo che nella scheda servono, oltre alle opzioni, anche i limiti.

### Persiane
Stessi principi dei serramenti: una linea-cartella con gli articoli, assi **Colore** (RAL e legni già nel
listino), **Configurazione di apertura**, **Lamelle** (fisse/orientabili, e la fessura 0/10/16 mm delle fisse),
**Aletta**, **Forma**. Si disegnano **sempre chiuse**, da fuori, **nello stile delle schede del listino** (le
immagini che l'azienda ha già caricato): disegno tecnico piatto, grigi chiari, lamelle a coppie di fili, piccola
cappa in alto, simboli di apertura rossi; il colore scelto tinge tutto il disegno. Pagina `/dev/disegno-persiane`.
- **Configurazioni di apertura (27, in `CONFIGURAZIONI_PERSIANA`)**: a battente 1 anta dx/sx, 2 ante, 2 ante
  asimmetriche (principale dx/sx), 3 ante, 3 ante 1+2 e 2+1, 4 ante, 4 ante 2+2; a libro 2/3/4 ante; a pacchetto
  3/4 ante dx/sx; scorrevole 1 anta dx/sx, 2 ante, 2 ante sovrapposte; ad angolo 2/3 ante; con sopraluce, con
  pannello fisso superiore, con pannello fisso laterale dx/sx. Cercate online e confrontate con le schede: le
  aperture sono battente (a ventola, alla genovese), a libro, scorrevole, a pacchetto; le lamelle fisse hanno la
  fessura di 10 o 16 mm oppure sono accostate.
- **Tipi:** veneziana (fisse o orientabili con l'asta), gelosia, scuro pieno, scuro a cornice, avvolgibile
  (cassonetto, guide, stecche), griglia di sicurezza, brise-soleil.
- **Forme (7):** rettangolare, arco (tutto sesto/ribassato), trapezio, lunetta (semicerchio), tonda/ovale,
  triangolo, ogiva (arco a punta), con 1 o 2 ante, per veneziana, gelosia e scuri. Sui serramenti le forme nuove
  si disegnano come fissi.
- **Altro:** aletta come cornice, colori RAL e legno, quote per anta, stile realistico (con volume, parete e
  davanzale) a richiesta. Le ante aperte a 45°/90° esistono nel codice ma non servono al preventivo.
- **Non ancora:** fermapersiana, persiane sulla finestra (disegno unico), forme con più di due ante,
  «scuro a libro/pacchetto» (le strutture a libro/pacchetto/scorrevole/angolo usano le lamelle).

### Il vetro cambia nel disegno
Dalle scelte «Tipologia vetro» e «Vetrocamera»: **satinato** (opaco, riflessi quasi spenti),
**fumé** (scuro), **serigrafato** (puntini), **acustico/antisonoro** e **antisfondamento**
(vetro tinto con il filo della stratificazione), **doppio** o **triplo vetro** (uno o due distanziatori
lungo il bordo). Nel listino mancano ancora i valori Satinato, Fumé e Serigrafato nell'asse
Tipologia vetro dei serramenti: vanno aggiunti dove l'azienda li offre.

### Telaio a L e a Z (verificato)
La **Z** ha un'aletta che dall'interno si vede come cornice attorno al serramento; la **L** no
(posa nella nicchia, a filo, a centro muro o a filo cappotto). La larghezza dell'aletta
**cambia per produttore** (28, 30, 35, 40, 60, 65 mm): ogni linea ha le sue. Nel disegno l'aletta si
vede solo dall'interno e solo sul serramento rettangolare senza cassonetto; l'etichetta della
scelta («Telaio a Z 35») dà la misura. Da confermare: il monoblocco ha spalletta, non aletta.

### Scheda tecnica della linea: così non si sbaglia
Caricando un prodotto nuovo (per esempio una linea Aluplast) si inseriscono i **dati tecnici e
le opzioni disponibili per quel produttore**, e gli articoli della linea offrono **solo quelle**:
- Esiste già la **libreria di piattaforma** `serramenti_marche` / `serramenti_serie` (profondità,
  camere, guarnizioni, Uw, fascia, tipologie incluse) e la **scheda per linea**
  `listino_schede_linea` (profondità, camere, guarnizioni, Uw, PDF della scheda).
- Manca l'elenco delle **opzioni**: telai (L, Z 30, Z 60…), altezze cassonetto, vetri, aperture.
  Proposta: una colonna `opzioni jsonb` su `serramenti_serie` (valori di piattaforma, uno per serie) e
  su `listino_schede_linea` (la scelta dell'azienda, che parte dalla serie e si può restringere).
- Creando la linea («+ Linea» → dalla libreria) il sistema genera i valori degli assi **solo da
  quelle opzioni**: Aluplast con Z 30 e Z 60, Salamander con Z 35 e Z 65, senza scelte sbagliate.
- Ogni opzione si imposta una volta sulla scheda e vale per tutti gli articoli della linea.
- Da fare con te: l'elenco delle opzioni per le serie che usi (Salamander 72/82, Aluplast,
  Euroall CX 600/700, Schüco, Rehau), ricavato dai loro cataloghi.

## Fasi

### Fase 1 — Listino di Infissi e Living dentro Demo Azienda 2 (solo dati) — FATTA il 04/10
Copia da Infissi e Living a Demo 2 di: macro **Serramenti**, **Persiane e scuri**,
**Tapparelle** (con RAL e legni), le cartelle-linea, articoli, assi e valori.
- Metodo come per Renova → Ser Style ([[eic-fv-clona-catalogo-azienda]]): id deterministico
  `md5(id_vecchio || 'demo2-iel-2026')`, `jsonb_populate_record`, padri prima dei figli.
  Le macro esistenti di Demo 2 si **riusano per nome** (non se ne creano di doppie).
- L'istanza è piccola ([[eic-db-istanza-micro-incidente]]): un passo per chiamata, con
  `lock_timeout='3s'` e `statement_timeout='60s'`, niente blocco unico su più tabelle.
- Dopo la verifica (conteggi uguali alla sorgente, nessun orfano, un solo predefinito per
  asse obbligatorio): `attivo=false` sugli articoli vecchi con asse Linea delle due macro.
- Prezzi a zero come in Infissi e Living; si può copiare anche un prezzo di prova.
- **Verifica:** nel preventivatore di Demo 2 compaiono le quattro linee serramenti e le due
  di persiane, senza doppioni; i 5 progetti esistenti si aprono come prima.

### Fase 2 — Modello dati del disegno (migrazione)
Il minimo per far sapere al sistema che cosa disegnare:
- colonna `article_families.disegno_tipologia text` (id di `TIPOLOGIE_DISEGNO`, ad esempio
  `finestra_2_ante`); riempita una volta per nome articolo, per i 23 serramenti;
- asse **Apertura** per articolo: valori con il codice del file elenco (`battente_dx`,
  `anta_ribalta_sx`, `ribalta_su_anta_dx`…); il codice si traduce in ante nel codice,
  non nel database;
- asse **Maniglia** (Argento, Inox, Bianco, Nero, Ottone, Bronzo): dà la finitura al disegno;
- asse **Forma** (Rettangolare, Arco, Trapezio) dove l'articolo la ammette, con le misure
  extra nella riga (altezza arco; altezza e lato del trapezio);
- **Monoblocco**: articoli «Monoblocco N ante» con gli assi Altezza cassonetto, Avvolgimento,
  Colore tapparella, Colore cassonetto, Zanzariera;
- **Vetro**: valori Satinato, Fumé, Serigrafato nell'asse Tipologia vetro (dove l'azienda li offre);
- **Telaio**: valori «Telaio a L» e «Telaio a Z <mm>» **per linea**, dalla scheda tecnica;
- **Scheda tecnica della linea** con le opzioni (vedi sopra): `opzioni jsonb` su
  `serramenti_serie` e `listino_schede_linea`, e la generazione dei valori degli assi dalla scheda.
- Procedura di `CLAUDE.md`: SQL idempotente, `apply_migration`, riallineare la versione al
  file, file `2028…` in `supabase/migrations/`.
- Dove manca l'asse o la tipologia, il disegno non compare e resta la foto.

### Fase 3 — Dal dato al disegno (libreria, con test)
- Le funzioni per leggere le etichette sono già scritte e testate: `finituraDaEtichetta`
  (colori e legni), `vetroDaEtichette` (tipo e lastre), `telaioDaEtichetta` (L/Z e aletta).
- `anteDaApertura(tipologiaId, codiceApertura)` → ante.
- `disegnoDaRigaPreventivo(riga, famiglia)` → `SerramentoDisegno` + finiture: legge
  larghezza e altezza, Apertura, Soglia, Maniglia, colore interno ed esterno (via
  `finituraDaEtichetta`), applica il fallback.
- Test su ogni tipologia dell'elenco e su ogni valore dell'asse Apertura.
- La sagoma (asse **Forma**) e le sue misure extra entrano nella riga di progetto.

### Fase 4 — Nella schermata del preventivo
- Miniatura del disegno accanto alla riga serramento (StepBom) e nel selettore.
- Si aggiorna da sola quando cambiano misure, apertura o colore.
- Fallback alla foto dell'articolo; mai una riga senza immagine.

### Fase 5 — Nel PDF e nel preventivo congelato — PDF FATTO il 04/10 (resta il congelamento)
- Disegno del PDF dalla stessa scena, con `Svg`/`Path` di `@react-pdf/renderer` (modulo
  `DisegnoSerramentoPdf`); stesse forme, niente seconda definizione.
- **Due viste affiancate** (interna ed esterna) per ogni serramento, sempre con le quote.
  Il disegno a schermo è già così nella pagina di prova.
- Il preventivo congela `modello_snapshot`: salvare lì la **configurazione** del disegno
  (non l'immagine), così il PDF di un preventivo vecchio si rifà uguale anche se il listino cambia.
- Quote come nella scena: larghezza, altezza; arco: freccia; trapezio: i due lati.

### Fase 6 — Rifiniture
- Altre sagome (tonda, triangolo, arco con sopraluce, più campi dentro un arco) e sopraluce dal listino.
- Aspetto: profili più rifiniti (gola guarnizione, gocciolatoio), eventuale sfondo da parete.
- Se serve, il disegno come guida per il render AI del cliente (modulo Render).

### Fase 7 — Collaudo in Demo Azienda 2
Preventivo di prova con sei tipologie e aperture diverse (1 anta DX, 2 ante con ribalta, 3
ante, porta finestra con soglia e sopraluce, traslante, alzante), colori RAL e legno:
schermata, PDF, riapertura dopo aver cambiato il listino. Controllo con screenshot e PDF.

## Come si capisce che funziona

- In Demo 2 un preventivo con 6 serramenti mostra 6 disegni giusti per misura, apertura e colore.
- Il PDF contiene gli stessi disegni, nitidi.
- Cambiare l'apertura o il colore cambia il disegno e non cambia il prezzo (salvo maggiorazioni).
- I 5 progetti già in Demo 2 e i preventivi congelati non cambiano.
- Test verdi; controllo dei tipi senza nuovi errori; `npm run build` riuscito.

## Rischi e attenzioni

- **Righe già salvate** puntano agli articoli vecchi: mai cancellare, solo disattivare.
- **Etichette colore non riconosciute** danno un grigio neutro: va verificata ogni etichetta
  nuova dei listini reali (oggi il riconoscimento copre RAL, legni e le tinte con nome).
- **Sagome e articoli:** arco e trapezio hanno un solo campo; un'arco a due ante o con sopraluce
  non c'è ancora (Fase 6).
- **Due mondi PDF** ([[eic-preventivo-pdf-architettura]]): questo vale solo per il preventivo
  serramenti `@react-pdf`; i modelli lato server (pdf-lib) non disegnano SVG.
- Infissi e Living non va toccata oltre quanto già fatto: il lavoro nuovo si prova in Demo 2.

## Prossimo passo

Rispondere alle decisioni D1–D4. Poi parto dalla **Fase 1** (solo dati, reversibile), mentre
si decide l'elenco delle aperture per la Fase 2.

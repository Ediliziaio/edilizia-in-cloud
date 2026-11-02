# Planimetrie — dove siamo e cosa resta (1 novembre 2026)

Documento di lavoro: raccoglie tutto quello che è stato chiesto sulle planimetrie, cosa è già
online e cosa resta da fare, in ordine. Va aggiornato a ogni rilascio.

## Già fatto

**Disegno e catalogo**
- Editor: stanze rettangolari e libere, pareti dritte e curve, porte e finestre, quote, testi,
  selezione multipla, proposte alternative (A, B, C…), piani.
- Simboli ridisegnati (sanitari, cucina, arredi), uguali in editor, PDF, DXF e PNG.
- Catalogo: bagno, cucina (lineare, ad angolo, isola), camere, soggiorno (divano dritto e angolare,
  poltrona, mobile TV, libreria), garage (auto, scaffali, banco), struttura (pilastri, scala,
  ascensore), impianti, **energia** (pompa di calore, caldaia, bollitore, inverter, batteria,
  wallbox, VMC, termostato), **giardino e piscina** (piscina, minipiscina, pergola, albero, siepe,
  aiuola, ombrellone, lettini, tavolo da esterno, barbecue).
- **Lotto e aree esterne**: confine del lotto (recintato o no), prato, pavimentazione, vialetti,
  ghiaia, parcheggio, aiuole, orto. Si disegnano come una stanza libera, si spostano, nel progetto
  si tolgono o si aggiungono come il resto.
- **Ricalca**: un'immagine (mappa catastale, foto aerea, rilievo) sotto il disegno, in scala con la
  sua larghezza reale, semitrasparente.

**Con un clic**: arredo della stanza, impianto elettrico minimo (CEI 64-8), clima con BTU,
riscaldamento (termosifoni sotto le finestre con i watt), maglia di pilastri.

**Più piani**: interrato, piano terra, piani, sottotetto, ognuno alla sua quota.
- «Piano identico» copia tutto (stanze, arredi, impianti): il piano tipo dei condomini.
- Scorciatoie: Primo piano, Interrato, Sottotetto, Piano tipo uguale.
- 3D «Tutto l'edificio»: i piani uno sopra l'altro, «piani staccati» (esploso), «fino a» un piano.
- PDF «Tutti i piani»: un foglio per piano nello stesso file.
- AI: legge più piani sullo stesso foglio; la quota viene dal nome (interrato sotto zero, secondo
  piano a 6 m, mansarda in cima); per i condomini disegna un piano tipo da duplicare.

**3D e render**
- Vista dall'alto, gira intorno, dentro la stanza; stato di fatto, progetto, «demolizioni e nuovo».
- Prato, lastre, ghiaia, asfalto, recinzione; piscina, pergola, alberi.
- Render AI delle stanze (singolo e in serie, più stili) dalla vista 3D dentro la stanza.
- **Render esterni**: una vista 3D da fuori (dal giardino sui quattro lati o dall'alto, con tutti i
  piani) diventa la foto di partenza dei render di piscine, pergole, giardini, facciate e
  pavimenti esterni.

**Computo e prezzi**
- Quantità: superfici, perimetri, pareti, demolizioni, costruzioni, elementi per tipo, linee
  impianti stimate (elettrico, acqua, scarichi, clima, riscaldamento), mq per appartamento, mq per
  area esterna e metri di recinzione.
- Voci con prezzo di partenza dal listino (impianti, energia, esterni), legate alla pianta:
  «La pianta è cambiata» ed «Effetto sul prezzo» seguono ogni modifica; il preventivo sa quando il
  computo è cambiato.

**Esportazioni**: PDF in scala con cartiglio, tavola completa (prospetti, sezione, impianti),
tutti i piani, DXF a layer (anche ESTERNI), SVG, PNG, GLB e OBJ; allegato al preventivo.

**Demo in «Demo azienda 2»**: capannone con uffici, trilocale (oggi e progetto), villa con
interrato, giardino, piscina e lotto, condominio con interrato box, negozi e tre piani tipo,
attico duplex con mansarda.

## Fatti il 1° novembre 2026 (punti 1–6)

1. **Prima e dopo**: nella scheda della pianta confronto a cursore o affiancato; lavori stanza
   per stanza (demolizioni, murature, porte e finestre, impianti, arredi, esterni, cambi d'uso,
   metri di linee in più) con costi di massima; PDF «Prima e dopo» (A3, piante affiancate e
   lavori); render AI della stessa stanza oggi e col progetto (2 crediti).
2. **Terreno**: immagine da ricalcare salvata col piano (bucket «planimetrie») e messa in scala
   con due punti; aree con quota (terrazzamenti, rialzi); cancelli pedonali e carrabili,
   lampioni, faretti, irrigatori, pozzetti; l'AI legge il confine del lotto da planimetrie
   generali e mappe e, dalla descrizione, disegna giardino, piscina, pergola e posto auto.
3. **Edificio nel 3D**: tetto per piano (due falde con timpani, padiglione, piano) con pendenza
   e sporto; parapetti da 1,10 m attorno a balconi e terrazzi; foro della scala ai piani sopra;
   edificio grigio sotto un attico o un duplex ai piani alti.
4. **Condomini e vendite**: unità con superficie netta e commerciale, millesimi proposti, listino
   (€/m², libera/prenotata/venduta) salvato come versione, scheda PDF per appartamento.
5. **Render AI**: render di tutte le stanze di tutti i piani; per gli esterni luce e stagione
   (tramonto, sera con luci, inverno, primavera).
6. **Disegno**: miniature del catalogo da immagini (`IMMAGINI_SIMBOLI`, oggi vuoto: si riempie
   quando arrivano le immagini); locali numerati nei PDF, continui su tutti i piani.

## Fatti il 2 novembre 2026

- **Tetti e campi sportivi**: tetto a una falda e a shed, fotovoltaico sulle falde (pannelli,
  kWp, a listino); campi da tennis, padel, calcio a 5/7/11, basket, pallavolo e beach volley.
- **Verifiche per CILA e SCIA**: rapporto aeroilluminante 1/8, altezze, superfici minime di
  camere e soggiorno, bagni ciechi con VMC, alloggi 28/38 m² e bagno completo; relazione PDF.
- **Dalla pianta al preventivo**: i lavori del prima e dopo diventano un preventivo in bozza
  (prezzi correggibili, IVA 10/22/4, cliente e pianta collegati).
- **Avanzamento lavori**: nel prima e dopo ogni lavoro si spunta come fatto; percentuale per
  stanza e totale, salvata come versione della pianta (`lavoriFatti`).
- **Vendite delle unità**: acquirente, prezzo pattuito, caparra, incassato, preliminare e rogito;
  riepilogo listino / venduto / prenotato / incassato / da incassare.
- **3D**: la scala sale fino al pavimento del piano sopra; tour 3D da inviare (un file HTML con
  il modello dentro, si apre col doppio clic anche dal telefono; serve internet per il visore).
- **Prospetti e sezioni con il tetto**: falde e timpani in alzato, tetto tagliato in sezione,
  anche nelle tavole PDF e nel DXF (layer TETTO).
- **Render dalla pianta**: le finiture della stanza (pavimento, pareti, soffitto, rivestimento)
  entrano nel prompt e valgono più dello stile generico.
- **Correzione guidata** delle misure stimate dall'AI: una alla volta, dalla stanza più grande;
  confermata una, l'editor passa alla prossima.
- **Telefono**: l'editor si apre in sola lettura, «Modifica» per disegnare.
- **Primo uso**: archivio vuoto con guida in tre passi e una pianta d'esempio da aprire.
- **Permessi**: chi è in sola lettura non vede «Salva», non spunta lavori e non cambia il
  listino (il database lo rifiutava già); prezzi, costi, trattative e «Crea il preventivo»
  seguono i permessi dei preventivi.
- **Velocità**: controllata; pagine, 3D, PDF e tour si caricano solo quando servono.
- **Dal sopralluogo alla pianta**: misure dettate (microfono del browser) o scritte stanza per
  stanza, fino a 6 foto delle stanze e lo schizzo se c'è; le stanze misurate nascono rilevate,
  il resto stimato (ingresso «rilievo» di `planimetria-genera`, 1 credito).
- **Sottotetto ad altezza variabile**: sul tetto si spunta «Mansarda» con l'altezza d'imposta;
  per ogni stanza altezza minima, massima e media, superficie utile (sopra 1,50 m) e volume
  (`shared/planimetrie/sottotetto.ts`); le verifiche usano l'altezza media (2,40 abitabili,
  2,20 servizi) e la superficie utile; nel 3D niente soffitto piano e muri fin sotto le falde;
  nei prospetti la falda parte dall'imposta.

## Ancora aperto

- **Prove sul campo**: render AI veri con crediti, un cliente vero dall'inizio alla fine,
  l'editor su un telefono vero. Non si fanno da qui (serve un utente collegato).
- **Benchmark dell'AI sulle piante vere**: servono le immagini (caricarle nella pianta nuova).
- **Immagini dei simboli**: aspettano le immagini (prompt qui sotto).
- **Terreno in pendenza continua** (curve di livello): oggi solo superfici a quote diverse.
- **Lucernari** (finestre sulla falda) per il rapporto aeroilluminante dei sottotetti: non
  si disegnano ancora; oggi contano solo le finestre nei muri.
- **Unità e listino nei sottotetti**: la superficie commerciale non scala ancora le parti
  sotto 1,50 m.
- **Fotovoltaico → pratiche e preventivo energetico**: lasciato fuori su richiesta.

## Immagini per i simboli: come generarle

Stesso prompt per tutti, cambia solo il soggetto. Formato PNG trasparente, quadrato 1024 px.

> Top-down orthographic architectural floor plan symbol of **[SOGGETTO]**, viewed exactly from
> above, flat 2D, clean thin dark grey outlines, soft neutral fills, subtle inner details, no
> perspective, no shadow, no text, centered, transparent background, consistent line weight, style
> of a premium interior design presentation plan.

Soggetti (in inglese funzionano meglio):
- Bagno: toilet with cistern, bidet, washbasin on vanity cabinet, shower tray 80×80 with drain,
  bathtub with tap, washing machine.
- Cucina: straight kitchen with hob and sink, L-shaped kitchen, kitchen island with stools,
  fridge, dishwasher.
- Camere: double bed with two pillows and folded duvet, single bed, bedside table, wardrobe with
  sliding doors, desk with chair.
- Soggiorno: three-seater sofa with cushions, L-shaped corner sofa, armchair, TV cabinet,
  bookcase, rectangular dining table with six chairs, round table with four chairs.
- Garage: car seen from above, shelving unit, workbench.
- Giardino: rectangular swimming pool with stone coping and ladder, round hot tub, wooden pergola
  with slats, tree crown, hedge, flower bed, sun lounger, patio umbrella, outdoor dining table,
  masonry barbecue.
- Energia e impianti: heat pump outdoor unit with two fans, wall-mounted boiler, hot water tank,
  solar inverter, home battery, EV wallbox, split air conditioner indoor unit, radiator.
- Struttura: straight staircase with arrow, elevator shaft with cross.

Le immagini vanno messe in `public/planimetrie/simboli/<tipo>.png` (il nome del tipo è quello del
catalogo, es. `divano_angolare.png`): il collegamento alle miniature del catalogo è il primo
passo del punto 6, da fare quando le immagini ci sono.

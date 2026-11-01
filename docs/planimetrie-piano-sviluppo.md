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

## Da fare, in ordine

### 1. Prima e dopo (priorità alta)
- Scheda della pianta: confronto affiancato «com'è oggi / progetto» con cursore, in pianta e in 3D.
- Elenco dei lavori per stanza, letto dalla pianta (demolizioni, nuove pareti, impianti, finiture)
  con il costo dalle voci collegate: è il riassunto da mostrare al cliente.
- Render AI prima/dopo con la stessa inquadratura (stesso fotogramma 3D, due render).
- PDF «Prima e dopo»: le due piante sullo stesso foglio più l'elenco dei lavori.

### 2. Lotto e terreno
- Salvare l'immagine da ricalcare con la pianta (storage) e calibrarla con due punti a distanza nota.
- AI: leggere il confine del lotto da un estratto di mappa o da un rilievo.
- AI: «giardino con piscina 8×4, vialetto e posto auto» → aree ed elementi già posati.
- Terreno in pendenza (quote altimetriche), muri di contenimento, rampe.
- Cancelli pedonali e carrabili nella recinzione; illuminazione esterna; irrigazione.

### 3. Edificio più vero nel 3D
- Tetto: falde con pendenza e gronde; sottotetto con altezza variabile (misure in mansarda).
- Parapetti di balconi e terrazzi al posto delle pareti piene.
- Solaio con il foro della scala; scala che collega davvero due piani.
- Facciata: cappotto, colori, davanzali, persiane (oggi solo nei render AI).

### 4. Condomini e vendite
- Tabelle millesimali dalle superfici delle unità (con coefficienti per balconi e cantine).
- Scheda PDF per appartamento (pianta dell'unità, superfici, 3D), per agenzie e cantieri in vendita.
- Listino delle unità (prezzo al mq, stato venduto/libero) collegato alla pianta.
- Computo per unità e per piano.

### 5. Render AI
- Render in serie per piano (tutte le stanze di un piano) e per edificio.
- Render esterni partendo dalla vista dal giardino con l'edificio intero (fatto), più preset
  «sera», «inverno», «estate».
- Prova reale con crediti su Demo azienda 2 per confrontare 3D e render: finora verificato solo
  con test e anteprime, non con un render vero.

### 6. Disegno
- Simboli da immagini (vedi sotto): miniature nel catalogo e stile «presentazione» più ricco.
- Quote automatiche esterne su tutti i piani; numerazione dei locali.

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

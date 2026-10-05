# Render bagno — foto di riferimento da generare

> **Stato al 05/10/2026.** Il titolare ha consegnato 11 foto di forma di questo documento e **sono già nel motore**: `Applique-Ai-Lati-Dello-Specchio-BN`, `Faretti-A-Incasso-Soffitto-Bagno-BN`, `Nicchia-Doccia-Orizzontale-Lunga-BN`, `Nicchia-Doccia-Verticale-Con-Ripiano-BN`, `Parete-Vasca-Fissa-In-Vetro-BN`, `Piletta-Doccia-Quadrata-A-Filo-BN`, `Plafoniera-Tonda-A-Soffitto-Bagno-BN`, `Profilo-LED-Lineare-A-Soffitto-Bagno-BN`, `Termoarredo-A-Piastra-Design-BN`, `Termoarredo-A-Scaletta-BN`, `Termoarredo-A-Tubi-Verticali-BN`. Le loro voci qui sotto restano come promemoria dei prompt, per rigenerarle se serve.
> **Da rigenerare**: `Canalina-Doccia-Lineare-A-Filo-Parete-BN`, `Parete-Vasca-Girevole-In-Vetro-BN` — il file consegnato era vuoto (0 byte). Quando arriva si collega come le altre (vedi `README.md`).
> Il resto delle voci di questo documento (le foto di materia, le «facoltative») è ancora da generare.

Elementi aggiunti al render bagno il 04/10/2026 che **non hanno ancora una foto** nel set: oggi il
render li riceve solo a parole. Con la foto della forma giusta il modello la copia invece di inventarla.

Come entrano nel motore, una volta generate:

1. PNG quadrato ≥ 1024 px nella cartella sorgente del set, convertito con
   `scripts/render-references/converti-nuova-foto.py` (forma → `-BN.webp` 900 px in scala di grigi; materia → `.webp`
   800 px a colori; sempre la miniatura a colori 320 px in `thumbs/bathroom/`).
2. Una voce nella tabella giusta di `shared/render-references/bathroomReferences.ts` (testo inglese
   ≤ 160 caratteri che descrive la costruzione, mai il colore per le foto B/N) e il candidato nel
   collector `collectBathroomReferenceImages`, con la priorità dei dettagli (40-59).
3. Mai sovrascrivere o rinominare un file già pubblicato: le edge function tengono una cache che non scade.

Stile del set (vedi `python3 scripts/render-references/foglio.py bagno`): fotografia realistica, luce
naturale morbida, nessun testo, marchio o persona, formato quadrato. **FORMA** = l'elemento intero a 3/4
in un ambiente neutro e pulito (parete chiara liscia o fondo da studio), descrivendo la costruzione e non
il colore (la foto diventa in bianco e nero). **MATERIA** = primo piano della superficie a luce radente,
che riempie il quadro, con la scala reale visibile, senza oggetti estranei.

## Termoarredo (`termoarredo.tipo`, tabella da creare `TOWEL_WARMER_PHOTOS`)

### Termoarredo-A-Scaletta-BN.webp — FORMA
- **Mostra**: un termoarredo a scaletta appeso a una parete liscia, intero, visto a 3/4: due collettori
  verticali ai lati, tanti tubi orizzontali tondi, valvole piccole in basso, staffe a muro.
- **Prompt**: «Fotografia realistica di un termoarredo da bagno a scaletta montato su una parete liscia e
  chiara: due collettori verticali laterali uniti da numerosi tubi orizzontali tondi e sottili, valvole
  piccole agli attacchi in basso, staffe a muro discrete. Inquadratura a tre quarti, elemento intero al
  centro, alto circa 120 cm, pavimento appena visibile. Luce naturale morbida laterale, nessun asciugamano,
  nessun oggetto, nessun testo né marchio. Formato quadrato 1024×1024.»

### Termoarredo-A-Piastra-Design-BN.webp — FORMA
- **Mostra**: un termoarredo a piastra piana verticale con una barra portasalviette sottile davanti.
- **Prompt**: «Fotografia realistica di un termoarredo di design a piastra: una lastra radiante piana e
  liscia, verticale, fissata a una parete chiara, con una sola barra portasalviette sottile staccata
  davanti alla piastra. Vista a tre quarti che mostra lo spessore della piastra e il distacco dal muro,
  valvole piccole in basso. Ambiente neutro e pulito, luce naturale morbida, nessun asciugamano, nessun
  testo né marchio. Formato quadrato 1024×1024.»

### Termoarredo-A-Tubi-Verticali-BN.webp — FORMA
- **Mostra**: una fila di tubi verticali sottili uniti in alto e in basso, con barra portasalviette.
- **Prompt**: «Fotografia realistica di un termoarredo a tubi verticali: una fila di tubi verticali sottili
  e ravvicinati, uniti da un collettore in alto e uno in basso, con una barra portasalviette orizzontale
  davanti, montato su una parete chiara liscia. Vista a tre quarti, elemento intero, valvole in basso.
  Luce naturale morbida, nessun oggetto, nessun testo né marchio. Formato quadrato 1024×1024.»

Le cinque finiture (bianco, nero opaco, antracite, cromo, acciaio spazzolato) non servono: sono colori
che il testo dice bene, e la foto di forma è comunque in bianco e nero.

## Nicchia nella parete doccia (`doccia.nicchia`, tabella da creare `SHOWER_NICHE_PHOTOS`)

### Nicchia-Doccia-Verticale-Con-Ripiano-BN.webp — FORMA
- **Mostra**: una nicchia incassata verticale (circa 30×60 cm) nella parete piastrellata di una doccia,
  con un ripiano a metà, spigoli rifiniti.
- **Prompt**: «Fotografia realistica di una parete di doccia rivestita con piastrelle grandi lisce e una
  nicchia incassata verticale di circa 30 cm di larghezza e 60 cm di altezza ad altezza petto, con un
  ripiano a metà; l'interno della nicchia è rivestito con le stesse piastrelle e gli spigoli sono tagliati
  a 45 gradi, puliti. Vista frontale leggermente angolata, la nicchia al centro del quadro, vuota, senza
  flaconi. Luce naturale morbida, nessun testo né marchio. Formato quadrato 1024×1024.»

### Nicchia-Doccia-Orizzontale-Lunga-BN.webp — FORMA
- **Mostra**: una nicchia lunga orizzontale (60-90 × 30 cm) nella parete principale della doccia.
- **Prompt**: «Fotografia realistica di una doccia con una nicchia incassata lunga e bassa nella parete
  principale: circa 80 cm di larghezza e 30 cm di altezza, ad altezza petto, rivestita all'interno con le
  stesse piastrelle della parete, spigoli puliti a 45 gradi. Vista frontale leggermente angolata che mostra
  la profondità della nicchia, vuota, senza flaconi. Luce naturale morbida, nessun testo né marchio.
  Formato quadrato 1024×1024.»

## Scarico della doccia (`doccia.scarico`, tabella da creare `SHOWER_DRAIN_PHOTOS`)

La sola foto del set con una canalina (`Doccia-Walk-In-Moderna-Con-Canalina-Lineare-BN.webp`) è una stanza
intera: mostra doccia, mobile e finestra, non lo scarico. Servono due primi piani.

### Canalina-Doccia-Lineare-A-Filo-Parete-BN.webp — FORMA
- **Mostra**: il pavimento di una doccia a filo con una canalina lineare lungo la parete di fondo.
- **Prompt**: «Fotografia realistica ravvicinata del pavimento di una doccia a filo pavimento: una canalina
  di scarico lineare stretta corre lungo tutta la base della parete di fondo, con la griglia sottile a filo
  delle piastrelle e la leggera pendenza del pavimento verso la canalina. Vista dall'alto a 45 gradi,
  angolo tra pavimento e parete al centro. Luce naturale morbida, niente acqua, nessun oggetto, nessun
  testo né marchio. Formato quadrato 1024×1024.»

### Piletta-Doccia-Quadrata-A-Filo-BN.webp — FORMA
- **Mostra**: una piletta quadrata piccola con griglia piatta, centrata nel piatto o nel pavimento.
- **Prompt**: «Fotografia realistica ravvicinata di uno scarico doccia puntuale: una piletta quadrata di
  circa 10×10 cm con griglia piatta, a filo, al centro di un piatto doccia liscio, con le leggere pendenze
  del piatto verso lo scarico. Vista dall'alto a 45 gradi. Luce naturale morbida, niente acqua, nessun
  oggetto, nessun testo né marchio. Formato quadrato 1024×1024.»

## Illuminazione (`illuminazione_tipo`, tabella da creare `LIGHTING_PHOTOS`)

### Faretti-A-Incasso-Soffitto-Bagno-BN.webp — FORMA
- **Mostra**: un soffitto di bagno con 4-6 faretti tondi piccoli incassati a filo, in file regolari.
- **Prompt**: «Fotografia realistica di un bagno visto dal basso verso il soffitto: quattro-sei faretti a
  incasso tondi e piccoli, a filo del soffitto liscio, disposti in file regolari, accesi con luce calda
  morbida; si vede l'attacco delle pareti piastrellate. Nessun lampadario, nessun controsoffitto a gradini,
  nessun testo né marchio. Formato quadrato 1024×1024.»

### Profilo-LED-Lineare-A-Soffitto-Bagno-BN.webp — FORMA
- **Mostra**: una linea LED continua in un profilo sottile incassato nel soffitto lungo la parete.
- **Prompt**: «Fotografia realistica di un bagno con una striscia LED continua incassata in un profilo
  sottile nel soffitto, parallela alla parete, che dà una luce indiretta morbida e uniforme; soffitto liscio
  alla stessa quota, senza ribassi a gradino. Vista a tre quarti dall'angolo della stanza. Nessun testo né
  marchio. Formato quadrato 1024×1024.»

### Applique-Ai-Lati-Dello-Specchio-BN.webp — FORMA
- **Mostra**: due applique sottili ai lati di uno specchio sopra il lavabo.
- **Prompt**: «Fotografia realistica di una parete di bagno con uno specchio rettangolare semplice sopra il
  lavabo e due applique verticali sottili, una per lato, accese con luce calda. Vista frontale leggermente
  angolata, mobile appena visibile in basso. Nessun oggetto sul piano, nessun testo né marchio. Formato
  quadrato 1024×1024.»

### Plafoniera-Tonda-A-Soffitto-Bagno-BN.webp — FORMA
- **Mostra**: una plafoniera tonda sottile al centro del soffitto di un bagno.
- **Prompt**: «Fotografia realistica del soffitto di un bagno con una sola plafoniera tonda, sottile, a filo
  del soffitto liscio, accesa con luce neutra. Vista dal basso a 45 gradi con l'attacco delle pareti. Nessun
  testo né marchio. Formato quadrato 1024×1024.»

## Parete doccia sulla vasca (`vasca.parete_doccia`, tabella da creare `BATH_SCREEN_PHOTOS`)

### Parete-Vasca-Fissa-In-Vetro-BN.webp — FORMA
- **Mostra**: una vasca incassata con una parete fissa in vetro trasparente sul bordo, lato rubinetto, e la
  doccetta su asta a muro.
- **Prompt**: «Fotografia realistica di una vasca da bagno incassata tra due pareti piastrellate, con una
  parete fissa in vetro trasparente di circa 75 cm di larghezza e 140 cm di altezza appoggiata sul bordo
  della vasca dal lato del rubinetto, profilo sottile a muro, e una doccetta su asta saliscendi fissata alla
  parete sopra la vasca. Vista a tre quarti, vasca intera, ambiente pulito, nessun asciugamano, nessun testo
  né marchio. Formato quadrato 1024×1024.»

### Parete-Vasca-Girevole-In-Vetro-BN.webp — FORMA
- **Mostra**: la stessa composizione con un pannello in vetro incernierato che ruota verso l'interno.
- **Prompt**: «Fotografia realistica di una vasca da bagno incassata con una parete in vetro trasparente
  girevole sul bordo dal lato del rubinetto, fissata al muro con cerniere sottili e ruotata di circa 30
  gradi verso l'interno della vasca, e una doccetta su asta a parete. Vista a tre quarti, vasca intera,
  nessun asciugamano, nessun testo né marchio. Formato quadrato 1024×1024.»

## Opzioni che esistevano già e non hanno foto (facoltative)

Stanno in `SENZA_FOTO` col motivo; una foto le migliorerebbe, ma oggi le parole bastano.

- **Vasca in acrilico** — `Superficie-Acrilica-Bianca-Lucida-Per-Vasca.webp`, MATERIA: «Primo piano a luce
  radente del bordo e dell'interno di una vasca in acrilico: superficie liscia e lucida con riflessi morbidi,
  che riempie il quadro. Nessun oggetto, nessun testo né marchio. Quadrato 1024×1024.»
- **Vasca in pietra** — `Vasca-In-Pietra-Superficie-Levigata.webp`, MATERIA: «Primo piano a luce radente di
  una vasca ricavata da un blocco di pietra levigata: superficie opaca con venature naturali leggere, bordo
  spesso, senza giunti. Quadrato 1024×1024.»
- **Piani del mobile** (marmo bianco, marmo nero, legno, ceramica) — `Piano-Mobile-Bagno-In-Marmo-Bianco.webp`,
  `Piano-Mobile-Bagno-In-Marmo-Nero.webp`, `Piano-Mobile-Bagno-In-Legno.webp`, `Piano-Mobile-Bagno-In-Ceramica.webp`,
  MATERIA: «Primo piano a luce radente di un piano lavabo in un pezzo unico di <materiale>, senza giunti né
  fughe, con il bordo frontale visibile per lo spessore, che riempie il quadro. Nessun oggetto, nessun testo
  né marchio. Quadrato 1024×1024.» (Le foto di marmo del set sono piastrelle con le fughe: su un top in un
  pezzo solo porterebbero i giunti.)

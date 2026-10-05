# Foto da generare — moduli tecnici (porte interne, porte blindate, pavimenti esterni, giardini)

> **Stato al 05/10/2026.** Il titolare ha consegnato 14 foto di forma di questo documento e **sono già nel motore**: `Camminamento-Stepping-Stones-Nel-Prato-BN`, `Cordolo-In-Pietra-Pavimento-Esterno-BN`, `Fascia-Perimetrale-Pavimento-Esterno-BN`, `Gradini-Esterni-Rivestiti-Stesso-Materiale-BN`, `Gradino-Esterno-Bordo-Toro-BN`, `Gradoni-Esterni-Monolitici-BN`, `Porta-Interna-A-Libro-Due-Ante-BN`, `Porta-Interna-Battente-Classica-Pantografata-BN`, `Porta-Interna-Doppia-Anta-BN`, `Porta-Interna-Tutta-Altezza-BN`, `Porta-Interna-Vetro-Trasparente-Telaio-Sottile-BN`, `Profilo-Alluminio-Bordo-Ghiaia-BN`, `Segnapasso-Lungo-Vialetto-BN`, `Siepe-Schermante-Sempreverde-BN`. Le loro voci qui sotto restano come promemoria dei prompt, per rigenerarle se serve.
> Il resto delle voci di questo documento (le foto di materia, le «facoltative») è ancora da generare.

Foto di riferimento che oggi **mancano** al motore dei moduli tecnici (`generate-technical-render`).
Le scelte esistono già nel form e arrivano al prompt; senza la foto il modello le riceve solo a
parole. Ogni voce dice il nome del file, la classe, a quale chiave del motore va agganciata, il
prompt di generazione e cosa deve mostrare.

## Regole del set (uguali alle 310 foto esistenti)

- Fotografia realistica, luce naturale morbida, nessun testo, marchio o persona, formato quadrato
  ≥ 1024 px.
- **FORMA** (nome che finisce per `-BN`): l'elemento intero, a tre quarti, in un ambiente neutro e
  pulito. Si genera a colori e si converte in bianco e nero con `scripts/render-references/converti-nuova-foto.py`
  (la miniatura per il form resta a colori). Nel prompt si descrive la costruzione, mai il colore.
- **MATERIA** (a colori): primo piano della superficie a luce radente che riempie il quadro, con la
  scala reale leggibile (fughe, venature, giunti), senza oggetti estranei. Il colore lo decide il
  cliente nel testo: scegliere un tono medio e neutro per il materiale.
- Mai riusare un nome già presente in `public/render-references/` (le edge tengono una cache che non
  scade): file nuovi, nomi nuovi.

## Come agganciarle quando arrivano

1. File in `public/render-references/<cartella>/` (`doors/` per le porte, `exterior/` per esterni e
   giardini) e miniatura in `thumbs/<cartella>/` (stesso nome senza `-BN`).
2. Voce nella tabella indicata sotto (`shared/render-references/doorReferences.ts` o
   `exteriorReferences.ts`), con un testo inglese ≤ 160 caratteri scritto guardando la foto; togliere
   la chiave dal rispettivo elenco `…_SENZA_FOTO` (il test pretende o la foto o il motivo, non tutti e
   due).
3. Per le opzioni oggi senza foto (finiture, gradini, bordi, giardino) serve anche la candidata nel
   collector, con la priorità scritta nel commento del file (forma 10, superficie 20, dettagli 30).

---

## Porte interne — `doors/`

In ordine di utilità: le tipologie nuove del form non hanno nessuna immagine guida.

### 1. `Porta-Interna-Battente-Classica-Pantografata-BN.webp` — FORMA
- **Motore**: `INTERIOR_DOOR_TYPE_REFERENCES.battente_classica` (preset «Battente classica»).
- **Prompt**: «Fotografia realistica di una porta interna a battente in stile classico: anta singola con
  due pannelli rettangolari pantografati con cornici in rilievo, coprifili classici sagomati sui tre
  lati, maniglia classica e due cerniere a vista. Montata in una parete liscia di un corridoio neutro e
  luminoso, inquadratura a tre quarti leggermente frontale, porta intera dal pavimento al coprifilo
  superiore, luce naturale morbida laterale, nessun oggetto davanti, nessun testo, nessun marchio,
  nessuna persona, formato quadrato 1024x1024.»
- **Deve mostrare**: le pannellature leggibili e il coprifilo sagomato; la porta chiusa.

### 2. `Porta-Interna-A-Libro-Due-Ante-BN.webp` — FORMA
- **Motore**: `INTERIOR_DOOR_TYPE_REFERENCES.a_libro` (preset «A libro»).
- **Prompt**: «Fotografia realistica di una porta interna a libro con due ante lisce incernierate tra loro,
  ripresa semiaperta con le ante ripiegate a circa 90 gradi dentro un vano interno con telaio minimale,
  guida superiore nascosta nel telaio. Parete liscia, stanza neutra e luminosa, inquadratura a tre
  quarti, porta intera nell'inquadratura, luce naturale morbida, nessun testo, marchio o persona,
  formato quadrato 1024x1024.»
- **Deve mostrare**: la linea di piega tra le due ante e il pacchetto compatto a lato del vano.

### 3. `Porta-Interna-Doppia-Anta-BN.webp` — FORMA
- **Motore**: `INTERIOR_DOOR_TYPE_REFERENCES.doppia_anta` (preset «Doppia anta»).
- **Prompt**: «Fotografia realistica di una porta interna a due ante battenti simmetriche in un vano largo
  circa 140 cm tra soggiorno e corridoio: ante lisce, linea di battuta centrale, due maniglie allineate,
  coprifili semplici sui tre lati. Inquadratura frontale a tre quarti, porta chiusa e intera, stanza
  neutra e luminosa, luce naturale morbida, nessun testo, marchio o persona, formato quadrato
  1024x1024.»
- **Deve mostrare**: le due ante di uguale larghezza e la battuta centrale.

### 4. `Porta-Interna-Tutta-Altezza-BN.webp` — FORMA
- **Motore**: `INTERIOR_DOOR_TYPE_REFERENCES.tutta_altezza` (preset «Tutta altezza»).
- **Prompt**: «Fotografia realistica di una porta interna a tutta altezza: un'unica anta liscia che va dal
  pavimento al soffitto (circa 270 cm), senza sopraluce, telaio minimale sottilissimo, cerniere a
  scomparsa, maniglia minimale. Parete liscia, stanza neutra, inquadratura a tre quarti che comprenda
  pavimento e soffitto, luce naturale morbida, nessun testo, marchio o persona, formato quadrato
  1024x1024.»
- **Deve mostrare**: l'anta che tocca il soffitto senza traverso superiore.

### 5. `Porta-Interna-Vetro-Trasparente-Telaio-Sottile-BN.webp` — FORMA
- **Motore**: oggi la foto della vetrata (vetro satinato) si allega solo con vetro satinato; con
  `vetro = trasparente` non entra nessuna foto. Questa diventa la foto di `vetrata` quando il vetro è
  trasparente (gating in `interiorDoorShapeKey`).
- **Prompt**: «Fotografia realistica di una porta interna battente con un'unica lastra di vetro
  trasparente a tutta altezza in un telaio metallico sottile, maniglia corta; attraverso il vetro si
  vede nitida la stanza accanto. Inquadratura a tre quarti, porta intera e chiusa, luce naturale
  morbida, nessun testo, marchio o persona, formato quadrato 1024x1024.»
- **Deve mostrare**: la trasparenza piena del vetro (riflessi leggeri, nessuna satinatura).

### 6. `Porta-Interna-Vetro-Fume.webp` — MATERIA
- **Motore**: opzione `vetro = fume` (oggi senza foto).
- **Prompt**: «Primo piano di un'anta di porta interna in vetro fumé grigio con un tratto del telaio
  metallico sottile sul bordo, a luce radente: si intravede in trasparenza attenuata la stanza dietro,
  riflessi controllati. Il vetro riempie il quadro, nessun oggetto estraneo, nessun testo, formato
  quadrato 1024x1024.»
- **Deve mostrare**: il grado di trasparenza del fumé, non la porta intera.

### 7. `Anta-Porta-Interna-Effetto-Legno-Chiaro.webp` e `Anta-Porta-Interna-Effetto-Legno-Scuro.webp` — MATERIA
- **Motore**: opzione `finitura_anta = effetto_legno_chiaro / effetto_legno_scuro` (oggi senza foto;
  laccato bianco, laccato colorato, laminato e materico restano a parole: tinte unite).
- **Prompt** (chiaro; per lo scuro «noce scuro» al posto di «rovere chiaro»): «Primo piano frontale di
  un'anta di porta interna in finitura effetto legno rovere chiaro, venatura verticale continua,
  superficie opaca, a luce radente; si vede il bordo dell'anta con lo spessore. La superficie riempie il
  quadro, nessun oggetto, nessun testo, formato quadrato 1024x1024.»
- **Deve mostrare**: direzione e scala della venatura su un'anta di porta.

## Porte blindate — `doors/`

### 8. `Porta-Blindata-Effetto-Legno.webp` — MATERIA
- **Motore**: opzione `finitura_pannello = effetto_legno`. È la **versione a colori** dello scatto già nel
  set (oggi esiste solo `Porta-Blindata-Effetto-Legno-BN.webp`, dichiarata orfana in
  `DOOR_FOTO_ORFANE`: in bianco e nero non può guidare una finitura). Se l'originale a colori c'è, basta
  convertirlo con `converti-nuova-foto.py`; altrimenti va rigenerata.
- **Prompt**: «Fotografia realistica di una porta blindata d'ingresso con pannello esterno in effetto legno
  rovere a venatura orizzontale, maniglia e defender in acciaio satinato, spioncino; ripresa frontale a
  tre quarti da un portico, luce naturale morbida, nessun testo, marchio o persona, formato quadrato
  1024x1024.»
- **Deve mostrare**: la venatura del pannello leggibile su tutta l'anta.

### 9. `Pannello-Porta-Blindata-Pantografato.webp` — MATERIA
- **Motore**: opzione `finitura_pannello = pantografato` (la foto di forma «classica» resta per il tipo).
- **Prompt**: «Primo piano di un pannello di rivestimento per porta blindata in legno noce con disegno
  pantografato classico (riquadri fresati con cornici in rilievo), a luce radente che fa leggere la
  profondità della fresatura. Il pannello riempie il quadro, nessun oggetto, nessun testo, formato
  quadrato 1024x1024.»
- **Deve mostrare**: profondità e sezione della fresatura.

### 10. `Pannello-Porta-Blindata-Effetto-Metallico.webp` — MATERIA
- **Motore**: opzione `finitura_pannello = effetto_metallico` (liscio opaco, laccato e microtexture
  restano a parole: tinte unite).
- **Prompt**: «Primo piano di un pannello per porta blindata in finitura effetto metallico bronzo
  spazzolato, riflessi trattenuti, a luce radente; si vede una porzione di bordo dell'anta. Il pannello
  riempie il quadro, nessun oggetto, nessun testo, formato quadrato 1024x1024.»

## Pavimenti esterni — `exterior/`

### 11. `Deck-WPC-Doghe-Sfalsate.webp` — MATERIA
- **Motore**: `EXTERIOR_PAVING_REFERENCES.deck_wpc` con posa `doga_sfalsata`, che è la posa del preset «Deck
  WPC»: oggi la foto del deck mostra doghe continue e se ne prende solo la superficie.
- **Prompt**: «Primo piano a luce radente di un deck in WPC a doghe posate sfalsate, testate delle doghe
  visibili e sfalsate tra file vicine, giunti aperti di 5 mm, superficie rigata effetto legno. Il deck
  riempie il quadro, nessun mobile, nessuna piscina, nessun testo, formato quadrato 1024x1024.»

### 12. `Pavimento-Esterno-Pietra-Opus-Romano.webp` — MATERIA
- **Motore**: `EXTERIOR_PAVING_REFERENCES.pietra_naturale` (preset «Pietra naturale», posa opus). Oggi è in
  `EXTERIOR_PAVING_SENZA_FOTO`: l'unica pietra del set è a opus incertum e si allega solo con quella posa.
- **Prompt**: «Primo piano a luce radente di una pavimentazione esterna in pietra naturale posata a opus
  romano: moduli rettangolari e quadrati di quattro misure diverse, fughe regolari di 5 mm, superficie
  spazzolata con lievi variazioni di tono. La pavimentazione riempie il quadro, nessun oggetto, nessun
  testo, formato quadrato 1024x1024.»

### 13. `Pavimento-Esterno-Gres-60x60.webp` — MATERIA
- **Motore**: `EXTERIOR_PAVING_REFERENCES.gres_outdoor` (preset «Gres outdoor 60x60»): oggi usa la foto delle
  lastre grandi e ne prende solo la superficie.
- **Prompt**: «Primo piano a luce radente di un pavimento esterno in gres porcellanato 2 cm formato 60x60
  effetto pietra, posa dritta a fughe allineate di 3 mm, superficie antiscivolo. Le piastrelle riempiono
  il quadro (almeno 4x4 moduli visibili), nessun oggetto, nessun testo, formato quadrato 1024x1024.»

### 14. `Pavimento-Esterno-Cotto-A-Correre.webp` — MATERIA
- **Motore**: `EXTERIOR_PAVING_REFERENCES.cotto_esterno` (preset «Cotto da esterno»).
- **Prompt**: «Primo piano a luce radente di un pavimento esterno in cotto antigelivo 15x30 posato a correre,
  variazioni naturali di tono, bordi leggermente irregolari, fughe di 8 mm. Il pavimento riempie il quadro,
  nessun oggetto, nessun testo, formato quadrato 1024x1024.»

### 15. `Pavimento-Esterno-Cemento-Spazzolato.webp` — MATERIA
- **Motore**: `EXTERIOR_PAVING_REFERENCES.cemento_architettonico` (preset «Cemento spazzolato»). La foto del
  bordo piscina in cemento spazzolato non va bene qui: porterebbe la vasca nella scena.
- **Prompt**: «Primo piano a luce radente di una pavimentazione esterna in calcestruzzo spazzolato a getto
  continuo, segni di spazzola paralleli e fini, un giunto di controllo tagliato che attraversa il quadro.
  Il pavimento riempie il quadro, nessun oggetto, nessun testo, formato quadrato 1024x1024.»

### 16. `Pavimento-Esterno-Cemento-Drenante.webp` — MATERIA
- **Motore**: `EXTERIOR_PAVING_REFERENCES.cemento_drenante` (preset «Cemento drenante»).
- **Prompt**: «Primo piano a luce radente di una pavimentazione in calcestruzzo drenante: inerti tondi di
  piccola pezzatura legati in superficie, pori aperti visibili, nessuna fuga. La superficie riempie il
  quadro, nessun oggetto, nessun testo, formato quadrato 1024x1024.»

### 17. `Deck-Legno-Naturale-Doghe.webp` — MATERIA
- **Motore**: `EXTERIOR_PAVING_REFERENCES.deck_legno` (preset «Deck legno naturale»): le foto deck del set
  sono WPC, con venatura e invecchiamento diversi.
- **Prompt**: «Primo piano a luce radente di un deck in legno massello naturale oliato (essenza tipo ipè)
  a doghe parallele con giunti aperti, venatura e lievi variazioni di tono tra doga e doga, viti a vista
  allineate. Il deck riempie il quadro, nessun oggetto, nessuna piscina, nessun testo, formato quadrato
  1024x1024.»

### 18. `Masselli-Autobloccanti-A-Correre.webp` — MATERIA
- **Motore**: posa `massello_classico` per il preset «Autobloccanti carrabili» (la foto del set è a spina di
  pesce: con la posa a correre se ne prende solo il modulo).
- **Prompt**: «Primo piano a luce radente di masselli autobloccanti in calcestruzzo 20x10 posati a correre,
  fughe strette intasate di sabbia. I masselli riempiono il quadro, nessun oggetto, nessun testo, formato
  quadrato 1024x1024.»

### 19. Gradini — FORMA
- **Motore**: opzione `gradini` (oggi senza foto); candidata a priorità 20, dopo la pavimentazione.
- `Gradini-Esterni-Rivestiti-Stesso-Materiale-BN.webp` — «Fotografia realistica di tre gradini esterni
  davanti a una porta d'ingresso rivestiti con le stesse lastre del pavimento del pianerottolo: pedate e
  alzate allineate alle fughe, spigolo dritto. Inquadratura a tre quarti, luce naturale morbida, nessun
  testo, marchio o persona, formato quadrato 1024x1024.»
- `Gradino-Esterno-Bordo-Toro-BN.webp` — «… gradini esterni in lastre con il bordo della pedata arrotondato
  a toro, sporgente sull'alzata …» (stesse indicazioni di inquadratura).
- `Gradoni-Esterni-Monolitici-BN.webp` — «… gradoni esterni a blocco unico pieno, spessore di 15 cm in vista,
  appoggiati sul terreno del giardino …» (stesse indicazioni).
- **Devono mostrare**: la costruzione del gradino (spigolo, sporgenza, spessore), non il materiale.

### 20. Bordi e cordoli — FORMA
- **Motore**: opzione `bordo` (oggi senza foto), priorità 30.
- `Cordolo-In-Pietra-Pavimento-Esterno-BN.webp` — «Fotografia realistica di una pavimentazione esterna
  chiusa da un cordolo in pietra a vista di 8 cm di spessore verso il prato, ripresa a tre quarti dall'alto,
  luce naturale morbida, nessun testo, marchio o persona, formato quadrato 1024x1024.»
- `Profilo-Alluminio-Bordo-Ghiaia-BN.webp` — «… un camminamento in ghiaia separato dal prato da un profilo
  metallico sottile di contenimento, filo a terra …» (stesse indicazioni).
- `Fascia-Perimetrale-Pavimento-Esterno-BN.webp` — «… una pavimentazione esterna incorniciata da una fascia
  perimetrale di lastre posate in senso opposto al campo …» (stesse indicazioni).

## Giardini — `exterior/`

Il set non ha foto di giardino: quelle vicine (prato, pietra, deck) sono scattate a bordo piscina, e
allegate a un giardino spingerebbero il modello a inventare una vasca, che il prompt vieta. Per questo
oggi il giardino non riceve foto (`GARDEN_SENZA_FOTO`). Le più utili, in ordine:

### 21. `Camminamento-Stepping-Stones-Nel-Prato-BN.webp` — FORMA
- **Motore**: camminamento `stepping_stones` (anche il preset «Moderno minimale»).
- **Prompt**: «Fotografia realistica di un camminamento a lastre a passo (stepping stones) rettangolari
  posate nel prato di un giardino privato, passo regolare di circa 60 cm, lastre a filo del manto erboso;
  ripresa a tre quarti dall'alto, luce naturale morbida, nessun oggetto, nessuna piscina, nessun testo,
  marchio o persona, formato quadrato 1024x1024.»
- **Deve mostrare**: il ritmo e la distanza tra le lastre, non la loro tinta.

### 22. `Siepe-Schermante-Sempreverde-BN.webp` — FORMA
- **Motore**: preset «Siepe schermante».
- **Prompt**: «Fotografia realistica di una siepe sempreverde schermante alta circa 2 metri lungo il confine
  di un giardino privato, fitta ma con la tessitura delle foglie leggibile, base pulita sul prato; ripresa
  a tre quarti, luce naturale morbida, nessuna piscina, nessun testo, marchio o persona, formato quadrato
  1024x1024.»
- **Deve mostrare**: densità e altezza di una siepe vera (non un muro verde piatto).

### 23. `Camminamento-In-Ghiaia-Con-Bordo.webp` — MATERIA
- **Motore**: camminamento `ghiaia`.
- **Prompt**: «Primo piano a luce radente di un camminamento in ghiaia compattata di pezzatura 8-12 mm,
  delimitato da un bordo metallico sottile verso il prato. La ghiaia riempie quasi tutto il quadro,
  nessun oggetto, nessun testo, formato quadrato 1024x1024.»

### 24. `Camminamento-In-Pietra-Naturale-Giardino.webp` — MATERIA
- **Motore**: camminamento `pietra_naturale` (anche il preset «Premium relax»).
- **Prompt**: «Primo piano a luce radente di un camminamento da giardino in lastre di pietra naturale
  irregolari posate nel prato, fughe erbose. Le lastre riempiono il quadro, nessun oggetto, nessuna
  piscina, nessun testo, formato quadrato 1024x1024.»

### 25. `Prato-Sintetico-Primo-Piano.webp` — MATERIA
- **Motore**: tipo di prato `sintetico_premium` (il prato naturale il modello lo rende bene a parole).
- **Prompt**: «Primo piano a luce radente di un prato sintetico di qualità con fili di due toni e feltro
  di base appena visibile, direzione del filo leggibile. Il prato riempie il quadro, nessun oggetto,
  nessun testo, formato quadrato 1024x1024.»

### 26. `Segnapasso-Lungo-Vialetto-BN.webp` — FORMA
- **Motore**: illuminazione `segnapasso`.
- **Prompt**: «Fotografia realistica al crepuscolo di un vialetto da giardino con segnapasso bassi a paletto
  ogni 2 metri sul bordo, luce rivolta verso terra; ripresa a tre quarti, nessuna piscina, nessun testo,
  marchio o persona, formato quadrato 1024x1024.»

## Ristrutturazioni

Nessuna foto: il preset abbraccia più domini nella stessa scena (bagno, involucro, outdoor) e l'edge
usa la tabella generica a sette campi, senza una configurazione strutturata a cui legare una foto.
Prima delle foto servirebbe portare la libreria `src/modules/render-ristrutturazioni` in `shared/`.

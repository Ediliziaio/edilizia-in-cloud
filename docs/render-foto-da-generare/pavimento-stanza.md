# Foto da generare — render pavimento e render stanza

> **Stato al 05/10/2026.** Il titolare ha consegnato 1 foto di forma di questo documento e **sono già nel motore**: `Binario-Con-Faretti-Orientabili-BN`. Le loro voci qui sotto restano come promemoria dei prompt, per rigenerarle se serve.
> Il resto delle voci di questo documento (le foto di materia, le «facoltative») è ancora da generare.

Le scelte del form che oggi non hanno una foto di riferimento. Il motore funziona anche
senza (il testo del prompt le descrive), ma con la foto giusta il modello copia invece di
inventare. Stile del set esistente (`public/render-references/floors/`, `facades/`):
fotografia realistica, luce naturale morbida, nessun testo, marchio o persona, formato
quadrato da almeno 1024 px.

- **FORMA** (file `…-BN.webp`, convertito in bianco e nero): descrivere la costruzione, mai
  il colore. Per le pose del pavimento il set usa una **vista dall'alto, perpendicolare**,
  con piastrelle di un solo tono neutro e uniforme: si imita quella.
- **MATERIA** (file a colori): primo piano della superficie a luce radente, che riempie il
  quadro, con la scala reale visibile (fughe, venature, giunti), senza oggetti estranei.

Quando una foto è pronta: convertirla come il resto del set (parametri in
`scripts/render-references/converti-nuova-foto.py`: motore WebP B/N a 900 px per la forma, a colori a
800 px per la materia, miniatura a colori da 320 px in `thumbs/<cartella>/` con lo stesso
nome senza «-BN»), con un nome nuovo (mai sovrascrivere un file esistente: le edge function
tengono una cache che non scade), aggiungerla alla tabella indicata e togliere la voce da
`FLOOR_SENZA_FOTO` / `ROOM_SENZA_FOTO`; i test `referenceImages.floor|room.test.ts`
controllano esistenza, miniatura, bianco e nero ed etichetta.

## Elementi nuovi (B)

### Illuminazione a binario (render stanza, `illuminazione.tipo = "binario"`)

- **File**: `Binario-Con-Faretti-Orientabili-BN.webp` — FORMA
- **Dove va**: cartella nuova `public/render-references/lighting/`; nel codice serve una
  tabella `ROOM_LIGHTING_PHOTOS` in `shared/render-references/roomReferences.ts` con una
  candidata attiva solo se `illuminazione.attivo` e `tipo === "binario"` (priorità dopo il
  rivestimento: è un oggetto piccolo nella scena).
- **Prompt (IT)**: «Fotografia realistica di un binario elettrificato a soffitto in una
  stanza vuota dalle pareti lisce: profilo lineare sottile montato a vista sul soffitto,
  parallelo alla parete, con quattro faretti cilindrici orientabili agganciati al binario e
  puntati in direzioni diverse. Inquadratura a tre quarti dal basso, luce naturale morbida
  da una finestra fuori campo, nessun cavo a vista, nessun testo, nessun marchio, nessuna
  persona, formato quadrato 1024×1024.»
- **Cosa deve mostrare**: il binario intero con l'attacco al soffitto e 3–4 teste
  orientabili; si devono capire profilo, distanza dei faretti e montaggio.

### Tappeti tolti (render pavimento, `tappeti = "rimuovi"`) — nessuna foto

È una rimozione: non c'è un aspetto da mostrare al modello. Nessuna foto da generare.

### Pareti specifiche (render stanza, `verniciatura.pareti_specifiche`) — nessuna foto

È un'indicazione di bersaglio (quali pareti), non un materiale. Nessuna foto da generare.

### Essenza, battiscopa e posa modulare nel pavimento della stanza — foto già presenti

Usano le foto del render pavimento (`floors/`): essenze, battiscopa bianco/legno/alluminio,
posa modulare. Il battiscopa «coordinato al pavimento» resta senza foto di proposito
(la foto della superficie del pavimento basta).

## Opzioni già presenti senza foto (facoltative)

### Posa a doppia fila (`pattern_posa = "doppia_fila"`)

- **File**: `Listoni-In-Posa-A-Doppia-Fila-BN.webp` — FORMA
- **Dove va**: `floors/`, tabella `FLOOR_LAYOUT_PHOTOS.doppia_fila`
- **Prompt (IT)**: «Fotografia dall'alto, perpendicolare al pavimento, di un parquet a
  listoni posati a doppia fila: due listoni stretti affiancati formano un modulo, i moduli
  sono sfalsati tra una fila e l'altra. Tavole di un solo tono neutro e uniforme, fughe
  sottili e ben leggibili, luce naturale morbida e uniforme, nessun oggetto, nessun testo,
  nessun marchio, formato quadrato 1024×1024.»
- **Cosa deve mostrare**: almeno 6 file intere, con le coppie di listoni e lo sfalsamento
  tra le coppie chiaramente leggibili.

### Posa esagonale (`pattern_posa = "esagonale"`)

- **File**: `Piastrelle-Esagonali-In-Posa-A-Nido-Ape-BN.webp` — FORMA
- **Dove va**: `floors/`, tabella `FLOOR_LAYOUT_PHOTOS.esagonale`
- **Prompt (IT)**: «Fotografia dall'alto, perpendicolare al pavimento, di piastrelle
  esagonali posate a nido d'ape: esagoni regolari tutti uguali, fughe sottili e continue,
  bordi del pavimento con tagli puliti. Piastrelle di un solo tono neutro e uniforme, luce
  naturale morbida e uniforme, nessun oggetto, nessun testo, nessun marchio, formato quadrato
  1024×1024.»
- **Cosa deve mostrare**: almeno 5 file di esagoni interi, con l'orientamento delle punte
  ben visibile.

### Boiserie in legno (render stanza, `rivestimento_pareti.tipo = "boiserie_legno"`)

- **File**: `Boiserie-In-Legno-A-Pannelli-Con-Cornici.webp` — MATERIA
- **Dove va**: `facades/` come gli altri rivestimenti di parete (o una cartella `walls/`
  nuova), tabella `ROOM_CLADDING_PHOTOS.boiserie_legno`
- **Prompt (IT)**: «Primo piano frontale di una parete rivestita in boiserie di legno:
  pannelli rettangolari con cornici in rilievo, giunti tra i pannelli e spessore reale
  visibili, luce naturale radente da sinistra che fa leggere le modanature. La parete riempie
  tutto il quadro, nessun mobile, nessun oggetto, nessun testo, nessun marchio, formato
  quadrato 1024×1024.»
- **Cosa deve mostrare**: due o tre pannelli interi con le cornici, per dare la scala.

### Pannelli 3D (render stanza, `rivestimento_pareti.tipo = "pannelli_3d"`)

- **File**: `Pannelli-3D-Decorativi-A-Parete.webp` — MATERIA
- **Dove va**: come la boiserie, tabella `ROOM_CLADDING_PHOTOS.pannelli_3d`
- **Prompt (IT)**: «Primo piano frontale di una parete rivestita con pannelli decorativi 3D
  a rilievo geometrico ripetuto, giunti tra i pannelli appena visibili, luce naturale radente
  che crea ombre nette sul rilievo. La parete riempie tutto il quadro, nessun mobile, nessun
  oggetto, nessun testo, nessun marchio, formato quadrato 1024×1024.»
- **Cosa deve mostrare**: almeno quattro moduli interi del rilievo, per leggere la
  ripetizione e la profondità.

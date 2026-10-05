# Foto da generare — render persiane e pergole

> **Stato al 05/10/2026.** Il titolare ha consegnato 5 foto di forma di questo documento e **sono già nel motore**: `Finestra-Con-Tapparella-Cassonetto-Nascosto-BN`, `Persiana-Ad-Una-Anta-Chiusa-BN`, `Piede-Di-Montante-Su-Deck-BN`, `Piede-Di-Montante-Su-Plinto-Nel-Prato-BN`, `Veneziana-Esterna-A-Lamelle-Orientabili-Su-Guide-BN`. Le loro voci qui sotto restano come promemoria dei prompt, per rigenerarle se serve.
> **Da rigenerare**: `Persiana-Con-Lamelle-Orientabili-E-Asta-BN` — il file consegnato era vuoto (0 byte). Quando arriva si collega come le altre (vedi `README.md`).
> Il resto delle voci di questo documento (le foto di materia, le «facoltative») è ancora da generare.

Foto che servirebbero agli elementi aggiunti il 04/10/2026 (o a opzioni rimaste senza foto) e
che il set da 310 non ha. Stile del set: fotografia realistica, luce naturale morbida, nessun
testo, marchio o persona, formato quadrato di almeno 1024 px.

- **FORMA** (nome con `-BN`): l'elemento intero di tre quarti, in un ambiente neutro e pulito; si
  descrive la costruzione, non il colore. La conversione in bianco e nero la fa
  `scripts/render-references/converti-nuova-foto.py` (motore B/N + miniatura a colori).
- **MATERIA**: primo piano della superficie a luce radente, che riempie il quadro, con la scala
  reale leggibile (giunti, venature, bordi), senza oggetti estranei.

Quando una foto arriva: file nuovo in `public/render-references/<cartella>/` (mai sovrascrivere),
voce nella tabella di `shared/render-references/shutterReferences.ts` o `pergolaReferences.ts`,
tolta la riga da `SENZA_FOTO_*`, test `referenceImages.<verticale>.test.ts`.

## Persiane (`shutters/`)

### Veneziana-Esterna-A-Lamelle-Orientabili-Su-Guide-BN.webp — FORMA
Per il tipo `veneziana_esterna`, oggi senza foto: quella del set mostra un'anta a battente
aperta sul muro, mentre nel codice la veneziana esterna è un frangisole a lamelle su guide.

> Fotografia realistica di una finestra moderna su una facciata intonacata liscia, vista di tre
> quarti, con una veneziana esterna abbassata: lamelle orizzontali larghe circa 8 cm, inclinate
> a metà, tenute da due guide laterali verticali fissate agli stipiti, cassonetto compatto sopra
> l'apertura. Nessuna anta, nessun cardine. Luce naturale morbida di giorno, nessuna persona,
> nessun testo, nessun marchio, formato quadrato 1024×1024.

### Persiana-Ad-Una-Anta-Chiusa-BN.webp — FORMA
Per «Ante per finestra = 1 anta» (`numero_ante: 1`): tutte le foto dei tipi a battente
mostrano due ante.

> Fotografia realistica di una finestra stretta in una facciata intonacata, vista di tre quarti,
> chiusa da una sola anta di persiana a lamelle fisse incernierata su uno stipite, che copre
> tutta l'apertura; cardini a muro visibili, davanzale in pietra. Luce naturale morbida, nessuna
> persona, nessun testo, formato quadrato 1024×1024.

### Persiana-Con-Lamelle-Orientabili-E-Asta-BN.webp — FORMA
Per «Lamelle = orientabili (con asta)» (`lamelle.movimento: "orientabili"`).

> Fotografia realistica, dettaglio di tre quarti di un'anta di persiana a lamelle orientabili
> vista dal lato interno: lamelle socchiuse tutte con la stessa inclinazione, collegate da una
> sottile asta verticale di comando (bacchetta) agganciata a ogni lamella. Sfondo neutro e
> sfocato, luce naturale morbida, nessuna persona, nessun testo, formato quadrato 1024×1024.

### Finestra-Con-Tapparella-Cassonetto-Nascosto-BN.webp — FORMA
Per «Cassonetto = nascosto nel muro» (`cassonetto: "a_scomparsa"`): oggi resta il primo piano
della serranda, che non mostra la finestra intera.

> Fotografia realistica di una finestra su una facciata intonacata, vista di tre quarti, con una
> tapparella esterna abbassata a metà: il telo esce da una fessura sottile sotto l'architrave,
> nessun cassonetto visibile sulla facciata, due guide laterali negli stipiti. Luce naturale
> morbida, nessuna persona, nessun testo, formato quadrato 1024×1024.

### Lamella-Effetto-Rovere-Chiaro.webp — MATERIA
Per l'effetto legno `rovere_chiaro` (il default del motore), oggi senza foto a colori.

> Primo piano di una lamella di persiana con finitura effetto rovere chiaro: tono miele
> chiaro, venatura dritta e fine con qualche fiammatura, superficie satinata. La lamella riempie
> il quadro, luce radente che mostra la venatura, scala reale leggibile (larghezza della lamella
> circa 5 cm), nessun oggetto estraneo, formato quadrato 1024×1024.

## Pergole (`pergolas/`)

### Copertura-In-Vetro-Satinato-Vista-Dal-Basso.webp — MATERIA
### Copertura-In-Vetro-Fume-Vista-Dal-Basso.webp — MATERIA
Per «Vetro = satinato / fumé» (`copertura.trasparenza`); il trasparente ha già la sua foto
(`Pergolato-In-Vetro-Sotto-Il-Cielo-Azzurro-BN`). Due foto, stessa inquadratura.

> Primo piano dal basso del tetto di una pergola in vetro: lastre di vetro [satinato, che
> diffonde la luce e non lascia vedere il cielo | fumé, scuro e semitrasparente, il cielo appena
> visibile] posate tra travetti sottili in alluminio, guarnizioni e profili di bordo leggibili.
> Il vetro riempie quasi tutto il quadro, luce di giorno, nessun oggetto estraneo, formato
> quadrato 1024×1024.

### Piede-Di-Montante-Su-Plinto-Nel-Prato-BN.webp — FORMA
Per «Ancoraggio a terra = plinti nel prato» (`installazione.ancoraggio_a_terra`), il default
della zona giardino.

> Fotografia realistica, dettaglio di tre quarti del piede di un montante quadrato di pergola
> fissato con una piastra e quattro tasselli su un plinto di cemento a filo del prato; erba
> curata intorno, nessun arredo. Luce naturale morbida, nessuna persona, nessun testo, formato
> quadrato 1024×1024.

### Piede-Di-Montante-Su-Deck-BN.webp — FORMA
Per «Ancoraggio a terra = deck in legno».

> Fotografia realistica, dettaglio di tre quarti del piede di un montante quadrato di pergola
> fissato con una piastra a vista su un pavimento in doghe di legno da esterno; viti della
> piastra leggibili, nessun arredo. Luce naturale morbida, nessuna persona, nessun testo,
> formato quadrato 1024×1024.

## Elementi nuovi che non chiedono foto

- Colore del telo, colore delle chiusure laterali: tinte, bastano le parole.
- «Rimuovi chiusure»: una rimozione non si mostra con una foto.
- Lamelle fisse: le foto dei tipi (veneziana classica, gelosia, brise-soleil) mostrano già
  lamelle fisse.
- Cassonetto esterno a vista: usa `Finestra-Con-Tapparella-Abbassata-BN`, già nel set.

# Render piscine — foto di riferimento da generare

> **Stato al 05/10/2026.** Il titolare ha consegnato 8 foto di forma di questo documento e **sono già nel motore**: `Bordo-A-Sfioro-Con-Canale-Nascosto-BN`, `Minipiscina-Su-Terrazzo-BN`, `Piscina-Compatta-Su-Tetto-Terrazza-BN`, `Piscina-Fuori-Terra-Premium-Rivestita-BN`, `Piscina-Lap-Pool-Lunga-E-Stretta-BN`, `Piscina-Plunge-Compatta-Da-Patio-BN`, `Piscina-Semi-Interrata-Con-Muretto-BN`, `Recinzione-Di-Sicurezza-In-Vetro-Per-Piscina-BN`. Le loro voci qui sotto restano come promemoria dei prompt, per rigenerarle se serve.
> Il resto delle voci di questo documento (le foto di materia, le «facoltative») è ancora da generare.

Le opzioni qui sotto oggi vanno al modello solo a parole (stanno in `SENZA_FOTO`,
`shared/render-references/poolReferences.ts`). Quando una foto è pronta:

1. passarla da `scripts/render-references/converti-nuova-foto.py` (motore `-BN` per la FORMA, a colori
   per la MATERIA, miniatura in `thumbs/pools/`), con un nome nuovo: mai sovrascrivere un file;
2. aggiungere la voce nella tabella giusta di `poolReferences.ts` e togliere la riga da
   `SENZA_FOTO` (il test `referenceImages.pools.test.ts` controlla che non stia in tutti e due).

Stile del set esistente (vedi `python3 scripts/render-references/foglio.py piscina`):
fotografia realistica, luce naturale morbida di giorno, nessun testo, marchio o persona,
formato quadrato da almeno 1024 px.
- **FORMA**: l'elemento intero, di tre quarti, in un ambiente neutro e pulito; il prompt
  descrive la costruzione, non i colori (il colore arriva dal testo del render).
- **MATERIA**: primo piano della superficie a luce radente che riempie il quadro, con la
  scala reale leggibile (fughe, venature, giunti), senza oggetti estranei.

## Elementi nuovi del form (04/10/2026)

### Recinzione in vetro (`comfort.accessori` = `recinzione_vetro`)

- **File**: `Recinzione-Di-Sicurezza-In-Vetro-Per-Piscina-BN.webp` — **FORMA**
- **Deve mostrare**: come è fatta la recinzione: lastre di vetro senza telaio alte circa
  1,2 m, piedini a pavimento, cancelletto a chiusura automatica, distanza dal bordo vasca.
- **Prompt**: «Fotografia realistica di una recinzione di sicurezza per piscina in lastre di
  vetro trasparente senza telaio, alte circa un metro e venti, fissate al pavimento con
  piedini sottili, con un cancelletto in vetro a chiusura automatica. La recinzione corre
  sul solarium a un metro dal bordo di una piscina interrata. Vista di tre quarti, tutta la
  recinzione e il cancelletto nel quadro, giardino semplice e ordinato sullo sfondo, luce
  naturale morbida, nessuna persona, nessun testo, formato quadrato.»

### Rivestimento esterno della vasca rialzata (`finiture.rivestimento_esterno`)

Si vede solo su vasche fuori terra, semi-incassate o con la quota «rialzata».
Una foto per valore, tutte **MATERIA**: la parete esterna della vasca, con il bordo in alto
per dare la scala.

| File | Valore | Deve mostrare |
|---|---|---|
| `Parete-Piscina-Rialzata-Doghe-WPC.webp` | `doghe_legno_wpc` | doghe orizzontali effetto legno, giunti e viti a scomparsa |
| `Parete-Piscina-Rialzata-Pietra-Naturale.webp` | `pietra_naturale` | pietre a spacco con fughe strette, fino al bordo |
| `Parete-Piscina-Rialzata-Gres-Effetto-Pietra.webp` | `gres_effetto_pietra` | lastre grandi effetto pietra, fughe sottili allineate |
| `Parete-Piscina-Rialzata-Intonaco-Liscio.webp` | `intonaco_liscio` | intonaco liscio continuo senza giunti, spigolo netto sotto il bordo |

**Prompt** (cambia solo il materiale): «Fotografia realistica in primo piano della parete
esterna di una piscina rialzata da terra di circa un metro, rivestita in [doghe orizzontali
in WPC effetto legno / pietra naturale a spacco / grandi lastre in gres effetto pietra /
intonaco liscio], con il bordo in pietra sottile visibile in alto. Luce radente naturale che
fa leggere la superficie, i giunti e la scala reale; la parete riempie quasi tutto il quadro,
nessun oggetto davanti, nessuna persona, nessun testo, formato quadrato.»

### Superficie al posto della piscina tolta (`finiture.superficie_ripristino`)

Solo per «Rimuovi piscina». Le foto dell'area che ci sono già mostrano tutte una piscina
accanto, e in una rimozione spingerebbero il modello a lasciarla: servono superfici
**senza nessuna piscina**. Tutte **MATERIA**. La ghiaia una foto adatta ce l'ha già
(`Ghiaia-Drenante-Grigio-Chiaro.webp`).

| File | Valore | Deve mostrare |
|---|---|---|
| `Prato-Rasato-Continuo-Giardino.webp` | `prato_raccordato` | prato fitto e rasato, uniforme, senza bordi né avvallamenti |
| `Decking-WPC-Pavimentazione-Continua.webp` | `deck_wpc` | doghe WPC effetto legno affiancate, fughe regolari |
| `Pavimentazione-Esterna-Gres-Effetto-Pietra.webp` | `solarium_gres` | lastre grandi in gres effetto pietra, fughe sottili |
| `Pavimentazione-Esterna-Pietra-Naturale.webp` | `pietra_naturale` | lastre di pietra naturale con fughe, posa regolare |

**Prompt**: «Fotografia realistica dall'alto, leggermente inclinata, di una superficie
continua di [prato rasato / decking in WPC effetto legno / pavimentazione in gres effetto
pietra / pavimentazione in pietra naturale] in un giardino, che riempie tutto il quadro.
Nessuna piscina, nessun bordo vasca, nessun mobile, nessuna persona, nessun testo. Luce
naturale radente che mostra la tessitura e la scala reale, formato quadrato.»

## Opzioni che c'erano già senza foto

Non sono elementi nuovi, ma oggi vanno al modello solo a parole. Le vecchie foto erano
sbagliate (una vasca a fagiolo come «rettangolare», un infinity sul mare come «lap pool»)
e sono state tolte. Tutte **FORMA**: la vasca intera, la costruzione e non i colori.

| File | Opzione | Deve mostrare |
|---|---|---|
| `Piscina-Lap-Pool-Lunga-E-Stretta-BN.webp` | tipo `lap_pool` | vasca lunga e stretta (circa 15 × 2,5 m) da nuoto, bordi dritti |
| `Piscina-Plunge-Compatta-Da-Patio-BN.webp` | tipo `plunge_pool` | vasca piccola e profonda (circa 3 × 2 m) inserita in un patio |
| `Piscina-Semi-Interrata-Con-Muretto-BN.webp` | tipo `semi_incassata` | vasca metà interrata, muretto a vista di 50-70 cm con bordo |
| `Piscina-Fuori-Terra-Premium-Rivestita-BN.webp` | tipo `fuori_terra_premium` | vasca fuori terra architettonica con pareti rivestite e scaletta |
| `Minipiscina-Su-Terrazzo-BN.webp` | tipo `minipiscina` | mini piscina tipo spa su un terrazzo, bordo netto, sedute interne |
| `Piscina-Compatta-Su-Tetto-Terrazza-BN.webp` | tipo `terrazzo_compatta` | vasca compatta su terrazza con parapetto, appoggiata sul solaio |
| `Bordo-A-Sfioro-Con-Canale-Nascosto-BN.webp` | bordo `sfioro_nascosto` | acqua a filo del bordo, fessura sottile al posto della griglia |

**Prompt** (cambia la descrizione della vasca): «Fotografia realistica di [descrizione dalla
tabella] in un giardino o terrazzo semplice e ordinato. Vista di tre quarti dall'altezza di
una persona, tutta la vasca nel quadro, si leggono bordo, livello dell'acqua e come la vasca
sta nel terreno. Luce naturale morbida di giorno, nessuna persona, nessun testo, nessun
marchio, formato quadrato.»

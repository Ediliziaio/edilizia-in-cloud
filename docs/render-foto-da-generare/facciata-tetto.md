# Foto da generare — render facciata e render tetto

> **Stato al 05/10/2026.** Il titolare ha consegnato 5 foto di forma di questo documento e **sono già nel motore**: `Davanzale-In-Alluminio-Piegato-BN`, `Fermaneve-A-Barra-Continua-BN`, `Fermaneve-A-Ganci-Su-Tegole-BN`, `Pannelli-Fotovoltaici-Su-Binari-BN`, `Scossalina-Di-Bordo-Falda-E-Colmo-BN`. Le loro voci qui sotto restano come promemoria dei prompt, per rigenerarle se serve.
> **Da rigenerare**: `Linea-Vita-Sul-Colmo-BN` — il file consegnato era vuoto (0 byte). Quando arriva si collega come le altre (vedi `README.md`).
> Il resto delle voci di questo documento (le foto di materia, le «facoltative») è ancora da generare.

Foto che mancano agli elementi del render facciata e del render tetto. Oggi queste opzioni
stanno in `FACADE_SENZA_FOTO` (`shared/render-references/facadeReferences.ts`) o in
`ROOF_SENZA_FOTO` (`shared/render-references/roofReferences.ts`), ciascuna col motivo:
il render funziona lo stesso, con le sole parole.

Stile, uguale al set di ottobre 2026: fotografia realistica, luce naturale morbida, nessun
testo, marchio o persona, formato quadrato di almeno 1024 px.
- **FORMA** (nome che finisce per `-BN`): l'elemento intero, di tre quarti, in un ambiente
  neutro e pulito. Il prompt descrive la costruzione, non il colore: il file per il motore
  viene convertito in bianco e nero, la miniatura dell'interfaccia resta a colori.
- **MATERIA**: primo piano della superficie a luce radente, che riempie il quadro, con la
  scala reale visibile (fughe, giunti, venature), senza oggetti estranei.

Quando una foto arriva: si converte come le altre (`scripts/render-references/`), si aggiunge
alla tabella giusta e si toglie la riga da `*_SENZA_FOTO`. Mai sovrascrivere un file già
pubblicato: nome nuovo.

## Facciata

### Zoccolatura (`elementi.zoccolatura.tipo`)

| File | Classe | Opzione |
|---|---|---|
| `Zoccolatura-In-Lastre-Di-Pietra.webp` | MATERIA | `pietra` |
| `Zoccolatura-In-Gres-Porcellanato.webp` | MATERIA | `ceramica` |
| `Zoccolatura-In-Intonaco-Resistente.webp` | MATERIA | `intonaco` |

- **Lastre di pietra** — prompt: «Primo piano frontale della parte bassa di una facciata
  intonacata: una fascia di zoccolatura alta circa 60 cm in lastre rettangolari di pietra
  naturale a spacco leggero, fughe sottili e regolari, bordo superiore dritto con una
  piccola copertina in pietra che sporge di un paio di centimetri, attacco a terra su un
  marciapiede pulito. Luce radente laterale che mostra lo spessore delle lastre. Nessuna
  pianta, nessun tubo, nessun oggetto.» Deve mostrare: modulo delle lastre, fuga, linea
  superiore netta e il salto di spessore rispetto all'intonaco.
- **Gres porcellanato** — prompt: «Primo piano della base di una facciata con zoccolatura
  in piastrelle di gres porcellanato effetto pietra, formato 30×60 posato orizzontale,
  fughe sottili, profilo di chiusura in alluminio sul bordo superiore, altezza circa 50 cm,
  marciapiede pulito. Luce radente. Nessun oggetto.» Deve mostrare: formato e fuga delle
  piastrelle, profilo di chiusura.
- **Intonaco resistente** — prompt: «Primo piano della base di una facciata: fascia di
  zoccolatura in intonaco a grana più grossa e più scura del resto della parete, alta circa
  40 cm, leggermente in rilievo, con un bordo superiore dritto e un gocciolatoio sottile.
  Luce radente che mostra la differenza di grana tra fascia e parete. Nessun oggetto.»
  Deve mostrare: la fascia come cambio di grana e di piano, non come materiale diverso.

### Davanzali (`elementi.davanzali.materiale`)

| File | Classe | Opzione |
|---|---|---|
| `Davanzale-In-Pietra-Con-Gocciolatoio.webp` | MATERIA | `pietra` |
| `Davanzale-In-Marmo.webp` | MATERIA | `marmo` |
| `Davanzale-In-Alluminio-Piegato-BN.webp` | FORMA | `alluminio` |

- **Pietra** — prompt: «Davanzale esterno in pietra naturale sotto una finestra di una
  facciata intonacata, visto di tre quarti dal basso: lastra spessa 3 cm che sporge di 4 cm
  dal filo del muro, gocciolatoio inciso sotto il bordo, testate che entrano nella spalletta.
  Luce morbida. Nessun vaso, nessuna tenda.» Deve mostrare: spessore, sporgenza, gocciolatoio.
- **Marmo** — prompt: stesso del precedente con «lastra di marmo levigato con venatura
  fine». Deve mostrare: venatura e bordo arrotondato.
- **Alluminio piegato** — prompt: «Davanzale esterno in lamiera di alluminio piegata sotto
  una finestra, visto di tre quarti: profilo sottile con risvolto verticale davanti e testate
  di chiusura laterali, pendenza verso l'esterno. Luce morbida, parete pulita.» Deve mostrare:
  il profilo sottile piegato, le testate, la pendenza.

## Tetto

### Manti che oggi non hanno una foto valida

| File | Classe | Opzione | Perché |
|---|---|---|---|
| `Tegole-Piane-Moderne-A-Incastro.webp` | MATERIA | `manto.tegole_piane` | le due foto vecchie sono coda di castoro tradizionale |
| `Guaina-Bituminosa-Ardesiata.webp` | MATERIA | `manto.guaina_bituminosa` | la foto vecchia è ghiaia di zavorra |

- **Tegole piane moderne** — prompt: «Primo piano di una falda coperta di tegole piane
  moderne a incastro in cotto, superficie liscia, bordo inferiore dritto, giunti laterali a
  incastro allineati in file regolari, posa a giunti sfalsati di mezza tegola. Luce radente
  che mostra il piccolo risalto dei giunti. La falda riempie il quadro, niente cielo.»
- **Guaina ardesiata** — prompt: «Primo piano di una copertura piana in guaina bituminosa
  con finitura ardesiata (scaglie minerali), sormonti saldati a fiamma visibili come strisce
  dritte e leggermente in rilievo ogni metro circa, un risvolto verticale contro un muretto
  sul bordo. Luce radente. Nessun attrezzo, nessuno sfiato, nessuna ghiaia.»

### Fotovoltaico con cornice (`pannelli_solari.tipo` = `fotovoltaico_nero` / `fotovoltaico_blu`)

| File | Classe |
|---|---|
| `Pannelli-Fotovoltaici-Su-Binari-BN.webp` | FORMA |

Prompt: «Impianto fotovoltaico di 12 moduli rettangolari con cornice, in due file, montati
su binari e staffe sopra una falda di tegole, complanari alla falda, paralleli a gronda e
colmo, con il bordo dei moduli staccato di pochi centimetri dalle tegole. Vista di tre quarti
dalla strada, cielo neutro.» Una sola foto per i due tipi: nero e blu arrivano dal testo.

### Scossaline, colmi e converse (`scossaline.materiale`)

| File | Classe |
|---|---|
| `Scossalina-Di-Bordo-Falda-E-Colmo-BN.webp` | FORMA |

Prompt: «Angolo di un tetto a falde con le lattonerie nuove in vista: scossalina di bordo
falda piegata che chiude il fianco delle tegole, colmo in lamiera sagomata, converse attorno a
un comignolo. Vista di tre quarti dall'alto, cielo neutro.» Deve mostrare: i profili piegati
e dove stanno; il materiale (rame, zinco-titanio, alluminio) lo dice il testo.

### Comignoli (`comignoli.finitura`)

| File | Classe | Opzione |
|---|---|---|
| `Comignolo-Intonacato.webp` | MATERIA | `intonaco` |
| `Comignolo-In-Mattoni-A-Vista.webp` | MATERIA | `mattoni` |
| `Comignolo-Rivestito-In-Rame.webp` | MATERIA | `rame` |

Prompt comune: «Comignolo su un tetto di tegole, visto di tre quarti da vicino, con cappello
a due falde e converse alla base; [finitura]. Luce morbida, cielo neutro.» con [finitura] =
«canna intonacata e tinteggiata con spigoli netti» / «canna in mattoni faccia vista con fughe
regolari» / «canna rivestita in lastre di rame aggraffate». Deve mostrare: la finitura della
canna e l'attacco al manto.

### Fermaneve (`fermaneve.tipo`)

| File | Classe | Opzione |
|---|---|---|
| `Fermaneve-A-Ganci-Su-Tegole-BN.webp` | FORMA | `ganci` |
| `Fermaneve-A-Barra-Continua-BN.webp` | FORMA | `griglia` |

- **Ganci** — prompt: «Parte bassa di una falda di tegole con file di piccoli ganci
  fermaneve metallici sfalsati, uno ogni due o tre tegole, fissati sotto le tegole. Vista di
  tre quarti, luce morbida.»
- **Barra** — prompt: «Falda di tegole con una barra fermaneve continua a griglia, parallela
  alla gronda e una trentina di centimetri sopra, su staffe fissate alla struttura. Vista di
  tre quarti, luce morbida.»

### Linea vita (`linea_vita.attivo`)

| File | Classe |
|---|---|
| `Linea-Vita-Sul-Colmo-BN.webp` | FORMA |

Prompt: «Colmo di un tetto a falde con una linea vita: due paletti bassi in acciaio alle
estremità e uno intermedio, collegati da un cavo teso sottile che segue il colmo. Vista di tre
quarti dalla strada, cielo neutro.» Deve mostrare quanto è piccola e discreta.

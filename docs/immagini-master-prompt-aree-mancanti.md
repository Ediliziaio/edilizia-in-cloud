# Master prompt — le 4 aree senza catalogo foto

Elenco **una riga = una foto** per le quattro aree che oggi non hanno nessuna immagine di
listino: **pareti-soffitti** (dov'è la carta da parati), **pergole**, **giardini**, **facciate**.
Stesso metodo del fotovoltaico: generi ogni file col suo prompt e me lo passi, io lo aggancio.

## Come funziona

Per ogni area servono due tipi di immagine, con lo **stesso slug**:
- **Scena di tipologia** — 1600×900 JPG → `public/templates/<area>/tipologie/tipologia-<slug>.jpg`
- **Packshot prodotto** — 800×800 WebP, sfondo neutro → `public/templates/<area>/products/<slug>.webp`

Il **prompt completo** = wrapper + soggetto della riga. Wrapper:

> **Scena tipologia (1600×900):** `Fotografia editoriale realistica, [SOGGETTO], contesto residenziale italiano, luce naturale morbida, composizione pulita ed elegante, alta qualità, palette naturale e sobria. Senza testo, senza logo, senza marchi, senza watermark, senza volti riconoscibili.`
>
> **Packshot prodotto (800×800):** `Foto prodotto professionale su sfondo bianco/grigio neutro, [SOGGETTO], luce da studio morbida e uniforme, prodotto isolato e centrato, alta qualità, catalogo tecnico. Senza testo, senza logo, senza marchi, senza watermark, senza mani.`

**Negative prompt (per tutti):** `testo, scritte, lettere, logo, marchio, watermark, firma, volti riconoscibili, persone in posa, cartelli, insegne, targhe, resa cartoon, deformazioni, mani deformi, colori innaturali, HDR esagerato.`

Regola: se una scena e il suo packshot devono avere lo stesso slug, il file `.jpg` (scena) e
`.webp` (packshot) si chiamano uguali (`tipologia-<slug>` per le scene, `<slug>` per i prodotti).

---

## AREA `pareti-soffitti`

### Scene di tipologia (→ `templates/pareti-soffitti/tipologie/`)
| file | soggetto (scena) |
|---|---|
| `tipologia-carta-da-parati.jpg` | Parete di camera rivestita con carta da parati dal disegno delicato, arredo essenziale |
| `tipologia-cartongesso.jpg` | Parete divisoria in cartongesso finita, con nicchia e faretti a incasso |
| `tipologia-controsoffitti.jpg` | Controsoffitto ribassato con illuminazione perimetrale in un ambiente moderno |
| `tipologia-tinteggiature-interne.jpg` | Soggiorno luminoso appena tinteggiato, parete a tinta unita calda, luce radente |
| `tipologia-finiture-decorative.jpg` | Parete con finitura decorativa materica (spatolato/veneziano), luce laterale |
| `tipologia-risanamento-umidita.jpg` | Parete al piano terra risanata, intonaco chiaro sano dopo trattamento dell'umidità |
| `tipologia-pannelli-acustici.jpg` | Studio con pannelli fonoassorbenti a parete, atmosfera raccolta |

### Packshot prodotto (→ `templates/pareti-soffitti/products/`)
| file | soggetto (packshot) |
|---|---|
| `carta-da-parati.webp` | Rotolo di carta da parati parzialmente srotolato, disegno delicato |
| `lastra-cartongesso.webp` | Lastra in cartongesso standard, spigolo in vista |
| `lastra-cartongesso-idrofuga.webp` | Lastra in cartongesso idrofuga di colore verde |
| `profilo-cartongesso.webp` | Profilo metallico a C per orditura di cartongesso |
| `orditura-metallica-cartongesso.webp` | Guida e montante metallici assemblati a squadra |
| `idropittura-interni.webp` | Secchio di idropittura bianca per interni, chiuso |
| `pittura-lavabile.webp` | Barattolo di pittura lavabile per interni |
| `finitura-a-calce.webp` | Barattolo di finitura a calce, colore naturale |
| `stucco-veneziano.webp` | Barattolo di stucco veneziano lucido |
| `rasante-antimuffa.webp` | Sacco di rasante antimuffa in polvere |
| `primer-antimuffa.webp` | Barattolo di primer/fissativo antimuffa |
| `pannello-fonoassorbente.webp` | Pannello fonoassorbente in fibra, superficie porosa |
| `nastro-mascheratura.webp` | Rotolo di nastro di carta per mascheratura |
| `rete-portaintonaco.webp` | Rotolo di rete in fibra di vetro per intonaco |

---

## AREA `pergole`

### Scene di tipologia (→ `templates/pergole/tipologie/`)
| file | soggetto (scena) |
|---|---|
| `tipologia-pergole-bioclimatiche.jpg` | Pergola bioclimatica in alluminio su terrazzo, lamelle orientabili, arredo esterno |
| `tipologia-pergole-a-telo.jpg` | Pergola addossata con telo avvolgibile su un giardino, tavolo apparecchiato |
| `tipologia-tende-da-sole.jpg` | Tenda da sole a bracci estesa sulla facciata di una villetta, ombra sul terrazzo |
| `tipologia-vetrate-e-verande.jpg` | Veranda con vetrate panoramiche scorrevoli che chiudono un porticato |
| `tipologia-carport.jpg` | Carport in alluminio addossato che ripara un'auto accanto a una casa |

### Packshot prodotto (→ `templates/pergole/products/`)
| file | soggetto (packshot) |
|---|---|
| `pergola-bioclimatica-alluminio.webp` | Modulo di pergola bioclimatica in alluminio con lamelle orientabili |
| `lamella-orientabile-alluminio.webp` | Lamella orientabile in alluminio per pergola, sezione a goccia |
| `telo-per-pergola.webp` | Rotolo di telo tecnico per pergola avvolgibile |
| `tenda-a-bracci.webp` | Tenda da sole a bracci estensibili, cassonetto e tessuto |
| `cassonetto-tenda-sole.webp` | Cassonetto chiuso di tenda da sole in alluminio |
| `motore-tubolare-tenda.webp` | Motore tubolare per tenda/avvolgibile, cilindro con cavo |
| `vetrata-scorrevole.webp` | Anta di vetrata scorrevole a profilo minimale |
| `guida-a-pavimento-vetrata.webp` | Binario a pavimento per vetrata scorrevole, profilo in alluminio |
| `struttura-carport-alluminio.webp` | Pilastro e trave in alluminio per carport |
| `copertura-policarbonato.webp` | Lastra di copertura in policarbonato alveolare |

---

## AREA `giardini`

### Scene di tipologia (→ `templates/giardini/tipologie/`)
| file | soggetto (scena) |
|---|---|
| `tipologia-realizzazione-verde.jpg` | Giardino residenziale appena realizzato: prato, aiuole, vialetto, arredo |
| `tipologia-manutenzione-verde.jpg` | Giardino curato in manutenzione, siepi potate, prato rasato |
| `tipologia-irrigazione.jpg` | Prato con irrigatori a scomparsa in funzione, goccioline al sole |
| `tipologia-recinzioni-e-cancelli.jpg` | Recinzione moderna con cancello pedonale su un giardino |

### Packshot prodotto (→ `templates/giardini/products/`)
| file | soggetto (packshot) |
|---|---|
| `rotolo-di-prato.webp` | Rotolo di prato pronto arrotolato, erba verde e zolla |
| `semente-per-prato.webp` | Sacco di sementi per prato, chiuso |
| `terriccio-universale.webp` | Sacco di terriccio universale da giardino |
| `essenza-per-siepe.webp` | Pianta in vaso per siepe (es. lauroceraso), fogliame sano |
| `irrigatore-pop-up.webp` | Irrigatore pop-up a scomparsa per prato |
| `gocciolatore-irrigazione.webp` | Ala gocciolante/gocciolatore per irrigazione a goccia |
| `centralina-irrigazione.webp` | Centralina/programmatore d'irrigazione da parete |
| `elettrovalvola-irrigazione.webp` | Elettrovalvola per impianto d'irrigazione interrato |
| `pannello-recinzione-modulare.webp` | Pannello modulare di recinzione in grigliato metallico |
| `rete-per-recinzione.webp` | Rotolo di rete metallica per recinzione |
| `cancello-pedonale.webp` | Cancello pedonale moderno in metallo |
| `cancello-carrabile-scorrevole.webp` | Cancello carrabile scorrevole in metallo |
| `paletto-per-recinzione.webp` | Paletto/montante in metallo per recinzione |

---

## AREA `facciate`
> Nota: molti materiali di facciata (isolamento a cappotto, rasanti, pitture, primer) sono già
> coperti dall'area **`cappotto`** (25 prodotti). Qui solo ciò che manca: pietra e ventilata.

### Scene di tipologia (→ `templates/facciate/tipologie/`)
| file | soggetto (scena) |
|---|---|
| `tipologia-facciate-ventilate.jpg` | Facciata ventilata contemporanea con rivestimento a doghe, giunti d'ombra |
| `tipologia-rivestimenti-in-pietra.jpg` | Facciata di villa con rivestimento in pietra/listelli, luce radente |
| `tipologia-pulizia-e-consolidamento.jpg` | Facciata storica pulita e protetta, prima/dopo suggerito dalla luce |

### Packshot prodotto (→ `templates/facciate/products/`)
| file | soggetto (packshot) |
|---|---|
| `listello-in-pietra.webp` | Listello di pietra ricostruita per rivestimento facciata |
| `doga-facciata-ventilata.webp` | Doga in alluminio/gres per facciata ventilata |
| `pannello-facciata-ventilata.webp` | Pannello di rivestimento per facciata ventilata |
| `staffa-sottostruttura-facciata.webp` | Staffa a L in alluminio per sottostruttura di facciata ventilata |
| `consolidante-facciata.webp` | Tanica di consolidante per intonaci di facciata |
| `idropittura-silossanica.webp` | Secchio di idropittura silossanica per esterni |
| `velatura-facciata.webp` | Barattolo di velatura/patina per facciata |
| `primer-fissativo-facciata.webp` | Tanica di primer fissativo per facciate |

---

## Consegna

Metti i file in cartelle con la struttura `<area>/tipologie/…` e `<area>/products/…` (o anche
tutte insieme, basta che i nomi combacino) e passamele. Io le sposto in `public/templates/`,
verifico che il test di copertura resti verde (`listinoTemplateAssets.test.ts`, che pretende
scena↔packshot per ogni tipologia) e committo. Se poi vuoi anche il **listino** di queste 4 aree
(le voci con prezzo, oggi assenti), dimmelo: è un lavoro a parte dai dati, non dalle foto.

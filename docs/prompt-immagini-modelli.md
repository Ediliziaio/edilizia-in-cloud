# Prompt e specifiche immagini — modelli di preventivo e prodotti

Guida operativa per generare le immagini dedicate ai **nuovi modelli** di preventivo
(Lotti 2-11 di `docs/piano-modelli-preventivo.md`) e ai **prodotti del listino**.
Finora i modelli nuovi riusano foto stock esistenti: qui c'è tutto il necessario per
dare a ciascuno le sue immagini, mantenendo lo stile della libreria attuale.

> Riferimento di stile già in repo: `public/render-references/` (foto CC del contesto
> edilizio italiano, per settori: `roofs`, `shutters`, `profiles`, `bathroom`, `floors`,
> `facades`, `outdoor`, `handles`, `accessories`). Guardarle prima di generare.

---

## 1. Convenzioni tecniche (dimensioni, formato, cartelle, naming)

| Uso | Dimensioni | Aspetto | Formato | Cartella | Naming | Note |
|---|---|---|---|---|---|---|
| **Copertina modello** (hero del PDF) | 1536×1024 (orizz.) *oppure* 1024×1536 (vert.) | 3:2 o 2:3 | JPG | `public/module-art/` | `<area>-<id>-cover.jpg` | è anche la sorgente della miniatura |
| **Dettaglio "come funziona"** (1° blocco) | 1600×900 | 16:9 | JPG | `public/module-art/` o `public/pdf-stock/<settore>/` | `<area>-<id>-dettaglio.jpg` | primo piano tecnico del prodotto/lavorazione |
| **Foto operative** (protezione, controlli, documenti, diario) | 1600×900 | 16:9 | JPG | `public/pdf-stock/<settore>/` | descrittivo (es. `protezione.jpg`) | **condivise per settore**, non per modello (vedi §5) |
| **Miniatura selettore** | 480×720 | 2:3 | WebP q72, < 90 KB | `public/quote-picker/` | `<area>-<id>.webp` | **generata**, non a mano: `python3 scripts/miniatura-selettore.py <sorgente> <area>-<id>` |
| **Foto prodotto listino** | 800×800 | 1:1 | WebP | `public/templates/<area>/products/` | `<slug-prodotto>.webp` | sfondo neutro, prodotto isolato |

**Settori** (`<settore>` di `pdf-stock`): `tetti`, `serramenti`, `bagni`, `ristrutturazione`,
`termoidraulico`, `fotovoltaico`, `pavimenti`, `piscine`, `elettrico`, `comune` (foto trasversali:
consegna documenti, giro finale, pulizia, protezione ambienti, domande).

**Area → cartella prodotti** (numero prodotti attuali): `bagno` (84), `serramenti` (73),
`elettrico` (34), `pavimenti` (34), `termoidraulico` (34), `tetti` (32), `piscine` (26),
`cappotto` (24), `ristrutturazione` (25), `climatizzazione` (25), `fotovoltaico` (18).

**Nota copertina ↔ catalogo:** la copertina di un modello è registrata in
`src/lib/moduli-vendita/fullModuleCatalog.ts` (o derivata dal contenuto editoriale) e
**deve combaciare** con quella dichiarata nel modello. Cambiare il file immagine senza
aggiornare il percorso lascia il test del catalogo rosso.

---

## 2. Stile visivo comune (il DNA)

Tutte le immagini condividono lo stesso stile, così la libreria resta coerente.

- **Fotografia editoriale realistica** (o render pulito e credibile), luce naturale
  morbida, profondità di campo curata, colori sobri e naturali.
- **Contesto edilizio italiano**: case, cantieri, materiali e finiture riconoscibili in Italia.
- **Illustrativa, mai un cantiere aziendale reale**: nessuna pretesa di documentare un
  lavoro eseguito. Nel PDF ogni immagine porta già la nota «immagine illustrativa».
- **Vietati**: testo, scritte, loghi, marchi, watermark, volti riconoscibili, mani in
  primo piano con dettagli identificabili, cartelli, targhe, insegne.
- **Persone**: al massimo di spalle o sfuocate, mai riconoscibili; meglio senza persone.
- **Sicurezza**: dove si mostra un cantiere, DPI corretti (casco, imbrago in quota) — mai
  scene pericolose o non a norma.

### Prompt base (wrapper) — da combinare col soggetto di ogni slot

> **Copertina (hero):**
> `Fotografia editoriale professionale, [SOGGETTO COPERTINA], contesto residenziale italiano, luce naturale morbida, composizione ampia ed elegante, realistico, alta qualità, palette naturale e sobria. Senza testo, senza logo, senza marchi, senza watermark, senza volti riconoscibili.`
> — resa **1536×1024** (o **1024×1536** se il soggetto è verticale, es. una porta).

> **Dettaglio "come funziona":**
> `Primo piano tecnico realistico, [SOGGETTO DETTAGLIO], messa a fuoco sul particolare costruttivo, luce naturale, contesto edilizio italiano, alta qualità. Senza testo, senza logo, senza marchi, senza watermark, senza volti.`
> — resa **1600×900**.

> **Negative prompt (per tutti):**
> `testo, scritte, lettere, logo, marchio, watermark, firma, volti riconoscibili, persone in posa, cartelli, insegne, targhe, resa cartoon, deformazioni, mani deformi, colori innaturali, HDR esagerato.`

---

## 3. Prompt per modello — copertina + dettaglio

Per ogni modello nuovo: il **soggetto** della copertina e del dettaglio. Il prompt completo
= wrapper (§2) + soggetto. Le foto operative (protezione/controlli/documenti/diario) sono
condivise per settore (§5): non servono per modello.

### Lotto 2 · Pareti e soffitti (`pareti-soffitti`, settore ristrutturazione)

| id | Soggetto copertina (1536×1024) | Soggetto dettaglio (1600×900) |
|---|---|---|
| `tinteggiatura-interna` | Soggiorno luminoso appena tinteggiato, parete a tinta unita calda, luce radente che mostra la planarità | Rullo che stende l'ultima mano su una parete già preparata, nastro di mascheratura sul bordo del soffitto |
| `carta-da-parati` | Parete di camera con carta da parati dal disegno delicato, arredo essenziale | Posa di un telo di carta da parati, spatola che liscia le bolle, allineamento del motivo |
| `cartongesso` | Parete divisoria in cartongesso finita, con nicchia e faretti a incasso | Struttura metallica di cartongesso con lastre in posa, isolante tra i montanti |
| `controsoffitti` | Controsoffitto ribassato con illuminazione perimetrale in un ambiente moderno | Orditura metallica del controsoffitto con faretti predisposti, dettaglio del piano ribassato |
| `decorativi` | Parete con finitura decorativa materica (spatolato/veneziano) su cui cade luce laterale | Frattazzo che lavora una finitura decorativa a calce, texture materica in evidenza |
| `umidita` | Parete al piano terra risanata, intonaco chiaro sano dopo trattamento dell'umidità di risalita | Rimozione dell'intonaco ammalorato alla base di un muro, sali evidenti sul vecchio strato |
| `acustica` | Studio/ambiente con pannelli fonoassorbenti a parete, atmosfera raccolta | Pannello fonoassorbente in posa su parete, dettaglio del materiale poroso e del fissaggio |

### Lotto 3 · Pergole e tende (`pergole`, settore ristrutturazione)

| id | Soggetto copertina | Soggetto dettaglio |
|---|---|---|
| `pergola-bioclimatica` | Pergola bioclimatica in alluminio su terrazzo, lamelle orientabili, arredo esterno | Dettaglio delle lamelle orientabili in alluminio e del profilo di gronda integrato |
| `pergola-telo` | Pergola addossata con telo avvolgibile su un giardino, tavolo apparecchiato | Meccanismo del telo avvolgibile e guida laterale, tessuto teso |
| `tende-sole` | Tenda da sole a bracci estesa sulla facciata di una villetta, ombra sul terrazzo | Cassonetto della tenda e braccio a molla, tessuto in tensione |
| `vetrate` | Veranda con vetrate panoramiche scorrevoli che chiudono un porticato | Profilo minimale della vetrata scorrevole e binario a pavimento |
| `carport` | Carport in alluminio addossato che ripara un'auto accanto a una casa | Struttura del carport: pilastro, trave e copertura, fissaggio a parete |

### Lotto 4 · Ristrutturazioni (+5, settore ristrutturazione)

| id | Soggetto copertina | Soggetto dettaglio |
|---|---|---|
| `cucina` | Cucina moderna appena rifinita, con impianti e finiture coordinate | Predisposizioni idrauliche ed elettriche a parete per la zona cucina, tracce chiuse |
| `sottotetto` | Sottotetto recuperato e abitabile, travi a vista e lucernario | Isolamento della falda dall'interno tra i travetti, prima delle finiture |
| `aperture-portanti` | Ambiente open space con una nuova apertura in un muro portante, trave a vista | Architrave/trave in acciaio in posa su un muro portante, puntelli di sostegno |
| `condominio` | Androne o vano scala condominiale rinnovato, finiture sobrie | Ripristino di una parete comune del condominio, ponteggio interno leggero |
| `montascale` | Montascale/servoscala installato su una scala domestica interna | Guida del montascale fissata al gradino, dettaglio della seduta ripiegabile |

### Lotto 5 · Tetti (+3, settore tetti)

| id | Soggetto copertina | Soggetto dettaglio |
|---|---|---|
| `amianto` | Copertura in cemento-amianto (eternit) da bonificare vista dall'esterno, cielo neutro | Operatore in DPI completo che imballa lastre incapsulate su un tetto (di spalle, sicurezza a norma) |
| `linea-vita` | Tetto a falde con sistema linea vita installato: ancoraggi e cavo lungo il colmo | Ancoraggio della linea vita fissato al colmo, moschettone e cavo in acciaio |
| `lucernari` | Sottotetto luminoso con due finestre da tetto aperte, luce naturale dall'alto | Raccordo impermeabile (scossalina) attorno a una finestra da tetto sulle tegole |

### Lotto 6 · Elettrico (+4, settore elettrico)

| id | Soggetto copertina | Soggetto dettaglio |
|---|---|---|
| `antifurto` | Ingresso di villa con telecamera di sorveglianza discreta e sensore, sera | Centrale antifurto a parete e sensore volumetrico, cablaggio ordinato |
| `illuminazione` | Soggiorno di sera con illuminazione studiata: faretti, strisce LED, luce d'accento | Faretto da incasso nel controsoffitto e striscia LED in gola, luce calda |
| `automazioni` | Cancello carrabile scorrevole automatizzato all'ingresso di una proprietà | Motore del cancello e fotocellula di sicurezza, cremagliera |
| `rete-dati` | Studio/casa con postazione ordinata, access point a parete, cablaggio pulito | Armadio rack/centro stella con permutazione dati etichettata |

### Lotto 7 · Termoidraulica (+3, settore termoidraulico)

| id | Soggetto copertina | Soggetto dettaglio |
|---|---|---|
| `pellet` | Soggiorno con stufa a pellet accesa, fiamma visibile, ambiente accogliente | Serbatoio del pellet e display della stufa/caldaia, canna fumaria sullo sfondo |
| `solare-termico` | Tetto di villetta con pannelli solari termici, cielo sereno | Collettore solare termico sulla falda e bollitore di accumulo nel locale tecnico |
| `trattamento-acqua` | Locale tecnico ordinato con addolcitore d'acqua installato sull'ingresso idrico | Addolcitore con by-pass e collegamenti, sacco di sale accanto |

### Lotto 8 · Pavimenti (+3, settore pavimenti)

| id | Soggetto copertina | Soggetto dettaglio |
|---|---|---|
| `posa-parquet` | Soggiorno con parquet in rovere appena posato, luce naturale che ne esalta le venature | Posa di doghe di parquet con giunto di dilatazione a parete, incastro maschio-femmina |
| `scale` | Scala interna rivestita in gres/legno, gradini con profilo del naso curato | Posa di pedata e alzata su un gradino, profilo del naso e livella |
| `levigatura` | Pavimento in marmo/graniglia lucidato a specchio in una sala d'epoca | Levigatrice che lucida un pavimento in marmo, superficie a metà tra opaco e lucido |

### Lotto 9 · Serramenti (+2, settore serramenti)

| id | Soggetto copertina (verticale 1024×1536 consigliato) | Soggetto dettaglio |
|---|---|---|
| `portoni-garage` | Portone sezionale del garage di una villetta, chiuso, facciata ordinata | Guide laterali e pannelli coibentati del portone sezionale, molla di bilanciamento |
| `grate` | Finestra con grata di sicurezza in ferro di design, esterno di una casa | Snodo/serratura di una grata apribile a battente, fissaggio nel muro |

### Lotto 10 · Facciate (+3, settore ristrutturazione/facciate)

| id | Soggetto copertina | Soggetto dettaglio |
|---|---|---|
| `ventilata` | Facciata ventilata contemporanea con rivestimento a doghe, giunti d'ombra | Sottostruttura della facciata ventilata con pannello e camera d'aria dietro |
| `pietra` | Facciata di villa con rivestimento in pietra/listelli, luce radente | Posa di listelli di pietra su una porzione di parete, stuccatura dei giunti |
| `pulizia` | Facciata storica pulita e protetta, prima/dopo suggerito dalla luce | Idropulitura/consolidamento di una porzione di intonaco di facciata da un ponteggio |

### Lotto 11 · Giardini (+4, opzionale, settore pavimenti)

| id | Soggetto copertina | Soggetto dettaglio |
|---|---|---|
| `giardino` | Giardino residenziale realizzato: prato, aiuole, vialetto, arredo | Posa di prato/aiuola con teli pacciamanti e cordoli, terreno preparato |
| `verde` | Giardino curato in manutenzione, siepi potate, prato rasato | Potatura di una siepe e tosaerba sul prato, attrezzi ordinati |
| `irrigazione` | Prato con irrigatori a scomparsa in funzione, goccioline al sole | Irrigatore pop-up e tubazione interrata, centralina a parete |
| `recinzioni` | Recinzione moderna con cancello pedonale su un giardino | Pannello di recinzione e plinto di fondazione, montante fissato |

---

## 4. Copertine: verticale o orizzontale?

- **Serramenti e porte** (finestre, persiane, porte, portoni, grate): meglio **verticale
  1024×1536** — il soggetto è alto e la miniatura 2:3 lo valorizza.
- **Tutto il resto** (tetti, impianti, pavimenti, ambienti, facciate, giardini): **orizzontale
  1536×1024** va bene; la miniatura ritaglia il centro.
- La miniatura del selettore si genera **sempre** dalla copertina con
  `scripts/miniatura-selettore.py` (parametro opzionale di spostamento in pixel per centrare
  il soggetto).

---

## 5. Foto operative condivise per settore

Nel PDF le pagine **protezione, controlli, documenti, diario** usano foto **condivise per
settore** (non per modello). Se vuoi rinnovarle, basta una serie per settore, in `1600×900`,
in `public/pdf-stock/<settore>/`. Soggetti:

- **protezione** — organizzazione del cantiere: teli e protezioni su pavimenti/arredi, aree
  delimitate, accessi liberi. (Trasversale: `public/pdf-stock/comune/protezione-ambienti.jpg`.)
- **controlli** — verifica finale: strumento di misura/controllo sul lavoro eseguito, gesto di
  riscontro (senza volto).
- **documenti** — consegna della documentazione: cartellina/fascicolo tecnico su un tavolo, penna.
  (Trasversale: `public/pdf-stock/comune/consegna-documenti.jpg`.)
- **diario** — lavorazione in corso, «prima/durante/dopo»: dettaglio del lavoro a metà, prima
  delle finiture.

Foto **comuni** (`public/pdf-stock/comune/`), valide per tutti: `protezione-ambienti`,
`consegna-documenti`, `giro-consegna`, `pulizia-consegna`, `domande`.

---

## 6. Foto prodotti del listino

Ogni prodotto del listino ha una foto **800×800 WebP** in `public/templates/<area>/products/<slug>.webp`,
prodotto isolato su **sfondo neutro** (bianco/grigio chiaro), luce da studio, nessuna ombra dura.

> **Prompt prodotto:**
> `Foto prodotto professionale su sfondo bianco/grigio neutro, [PRODOTTO], luce da studio morbida e uniforme, prodotto isolato e centrato, alta qualità, catalogo tecnico. Senza testo, senza logo, senza marchi, senza watermark, senza mani.`
> — resa **800×800**, quadrata.

Esempi di soggetto per area:
- **serramenti**: finestra a due ante in PVC bianco; persiana in alluminio; zanzariera plissettata; maniglia cromata.
- **bagno**: sanitario sospeso; piatto doccia in resina; miscelatore; box doccia in cristallo.
- **elettrico**: placca serie civile; faretto LED; centralina domotica; wallbox.
- **termoidraulico**: caldaia a condensazione; radiatore; pompa di calore; addolcitore.
- **pavimenti/tetti/cappotto**: campione di materiale (gres, parquet, tegola, pannello isolante) inquadrato frontale.

**Regola:** il nome file (`<slug>.webp`) deve combaciare con lo slug del prodotto nel listino;
un prodotto senza foto usa un segnaposto neutro finché non arriva la sua.

---

## 7. Flusso consigliato

1. Genera la **copertina** di ogni modello (§3) → `public/module-art/<area>-<id>-cover.jpg`.
2. Aggiorna il percorso copertina nel modello/catalogo (`fullModuleCatalog.ts` o contenuto
   editoriale) e lancia il test del catalogo.
3. Genera il **dettaglio** → `public/module-art/<area>-<id>-dettaglio.jpg`, collegalo al blocco
   `comeFunziona`.
4. Rigenera la **miniatura**: `python3 scripts/miniatura-selettore.py public/module-art/<area>-<id>-cover.jpg <area>-<id>`.
5. (Se rinnovi le operative) sostituisci le foto di settore in `public/pdf-stock/<settore>/`.
6. Prodotti: genera i mancanti in `public/templates/<area>/products/`.
7. Rigenera le impronte dei modelli toccati (`IMPRONTE_NUOVE` non serve: è un cambio voluto,
   aggiorna l'impronta a mano nel commit) e verifica QA PDF + test asset.

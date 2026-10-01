# Master prompt immagini — cosa resta da creare (28/09/2026)

Documento unico e operativo: **tutto ciò che manca da generare**, con il **prompt pronto**
per ognuno. Da leggere insieme a:
- `docs/prompt-immagini-modelli.md` — convenzioni tecniche complete, stile, prompt base.
- `docs/immagini-da-creare.md` — checklist storica (stato pre-pacchetti, per riferimento).

Regola d'oro dei prompt (vale per tutti): **niente testo, loghi, marchi, watermark, volti
riconoscibili, cartelli**. Fotografia editoriale realistica, luce naturale, palette sobria,
contesto edilizio italiano. Negative prompt in fondo (§6).

---

## 0. Stato reale oggi (cosa NON serve più creare)

Dopo i pacchetti caricati il 27-28/09 e i fix, sono **completi**:

| Set | Stato |
|---|---|
| Copertine dei 109 modelli (`module-art/*-cover.jpg`) | ✅ complete, tutte presenti e decodificabili |
| Miniature modelli (`module-thumbs/*-cover-thumb.webp`) | ✅ complete (inclusa `termoidraulica-pompa-calore`, generata 28/09) |
| Miniature di area (`module-art/<area>-thumb.jpg`) | ✅ complete (pareti-soffitti, pergole, giardini generate 28/09) |
| Scene di tipologia del listino (`templates/<area>/tipologie/*.jpg`) | ✅ 87/87 |
| Packshot di categoria (`templates/<area>/products/tipologia-*.webp`) | ✅ 87/87 (i 4 mancanti generati 28/09) |
| Varianti cover di serie (`cover-stock/<area>/`) | ✅ 14 aree coperte |
| Link immagine nel codice | ✅ 221 riferimenti, 0 rotti |
| Link listino serramenti in DB (tapparelle/zanzariere/cassonetti) | ✅ già `.svg` corretti in produzione |

> I 4 packshot di categoria e le 4 miniature generate il 28/09 sono **riempitivi ricavati
> dalle scene esistenti**: funzionano, ma se vuoi puoi sostituirli con versioni dedicate
> (prompt in §2 e §3).

---

## 1. PRIORITÀ 1 — Packshot prodotti FOTOVOLTAICO (il buco vero)

È l'unica area con i **prodotti reali** scoperti. Oggi in `public/templates/fotovoltaico/products/`
ci sono 11 packshot reali (accessori AlphaESS + 1 modulo) e 7 packshot di **categoria**.
Mancano i packshot dei prodotti veri delle 5 categorie qui sotto.

**Dove vanno:** `public/templates/fotovoltaico/products/<slug>.webp` — **800×800 WebP**, sfondo
neutro. Lo `<slug>` = nome prodotto in minuscolo, trattini al posto degli spazi, senza marca
se è un marchio registrato (es. `modulo-monocristallino-450w`, non `trina-vertex-450`… a meno
che tu non voglia il nome commerciale, come per `trina-vertex-470` già presente).

Per ogni prodotto del tuo listino AlphaESS/Renova di queste categorie, genera **una foto** col
prompt della categoria. Gli slug esatti li prendi dal tuo listino (le cartelle che avevi
caricato: `inverter`, `moduli`, `Accumulo`, `Ottimizzatore`, `Colonnina di ricarica`, `Zavorre`,
`Sistema ibrido`).

### 1.1 Inverter (categoria `tipologia-inverter`) — oggi 0 packshot reali

> **Prompt (per ogni inverter):**
> `Foto prodotto professionale su sfondo bianco/grigio neutro, inverter fotovoltaico da parete, scocca compatta chiara con alette di dissipazione, display frontale spento e connettori in basso, luce da studio morbida e uniforme, prodotto isolato e centrato, alta qualità, catalogo tecnico. Senza testo, senza logo, senza marchi, senza watermark, senza mani.`
> — 800×800. Varianti: monofase (più piccolo), trifase (più grande), ibrido (con predisposizione batteria).

### 1.2 Batterie / accumulo (categoria `tipologia-batterie`) — oggi 0 packshot reali

> **Prompt (per ogni batteria):**
> `Foto prodotto professionale su sfondo bianco/grigio neutro, batteria di accumulo domestica a torre verticale, moduli impilati con base, superficie opaca chiara, forma pulita e moderna, luce da studio morbida e uniforme, prodotto isolato e centrato, alta qualità, catalogo tecnico. Senza testo, senza logo, senza marchi, senza watermark, senza mani.`
> — 800×800. Varianti: taglie diverse (numero di moduli impilati), da parete vs a pavimento.

### 1.3 Ottimizzatori (categoria `tipologia-ottimizzatori`) — oggi 0 packshot reali

> **Prompt (per ogni ottimizzatore):**
> `Foto prodotto professionale su sfondo bianco/grigio neutro, ottimizzatore di potenza per moduli fotovoltaici, piccolo dispositivo rettangolare piatto con due coppie di cavi e connettori MC4, involucro chiaro, luce da studio morbida e uniforme, prodotto isolato e centrato, alta qualità, catalogo tecnico. Senza testo, senza logo, senza marchi, senza watermark, senza mani.`
> — 800×800.

### 1.4 Colonnine di ricarica / wallbox (categoria `tipologia-colonnine-di-ricarica`) — oggi 0 packshot reali

> **Prompt (per ogni wallbox):**
> `Foto prodotto professionale su sfondo bianco/grigio neutro, wallbox per ricarica auto elettrica a parete, scocca verticale chiara con cavo di ricarica avvolto e connettore Type 2, design compatto e moderno, luce da studio morbida e uniforme, prodotto isolato e centrato, alta qualità, catalogo tecnico. Senza testo, senza logo, senza marchi, senza watermark, senza mani.`
> — 800×800. Variante colonnina da terra (piantana) se in listino.

### 1.5 Moduli fotovoltaici (categoria `tipologia-moduli-fotovoltaici`) — oggi solo `trina-vertex-470`

> **Prompt (per ogni modulo):**
> `Foto prodotto professionale su sfondo bianco/grigio neutro, modulo fotovoltaico monocristallino, celle nere a griglia regolare con cornice in alluminio sottile, vista frontale leggermente inclinata, riflessi morbidi sul vetro, luce da studio uniforme, prodotto isolato e centrato, alta qualità, catalogo tecnico. Senza testo, senza logo, senza marchi, senza watermark, senza mani.`
> — 800×800. Varianti: full-black, bifacciale (retro visibile), potenze diverse.

### 1.6 Strutture e zavorre (categoria `tipologia-strutture-e-zavorre`) — verificare copertura

Oggi c'è `struttura-di-fissaggio-a-modulo`. Se in listino ci sono zavorre, staffe a triangolo,
binari: uno per prodotto.
> **Prompt:** `Foto prodotto professionale su sfondo bianco/grigio neutro, [staffa/binario/zavorra in cemento] per struttura di montaggio pannelli fotovoltaici su tetto, metallo o cemento, forma tecnica pulita, luce da studio uniforme, prodotto isolato e centrato, alta qualità. Senza testo, senza logo, senza marchi, senza watermark, senza mani.`
> — 800×800.

---

## 1-bis. PRIORITÀ 1 — Le 4 aree senza catalogo foto (qui c'è la carta da parati)

Le aree **classiche** hanno un catalogo foto ampio (bagno 84, serramenti 73, tetti 37,
elettrico 38, pavimenti 36, termoidraulico 35, climatizzazione 32, piscine 31, ristrutturazione
28, cappotto 25). Ma **quattro aree non hanno nessuna cartella `templates/<area>/`** — zero
foto prodotto e zero scene di tipologia:

- **`pareti-soffitti`** ← qui sta la **carta da parati** (+ cartongesso, controsoffitti,
  tinteggiatura interna, finiture decorative, umidità di risalita, pannelli acustici)
- **`pergole`** (pergola bioclimatica, pergola a telo, tende da sole, vetrate, carport)
- **`giardini`** (realizzazione a verde, manutenzione, irrigazione, recinzioni)
- **`facciate`** (in parte coperta da `cappotto`: isolamento, rasanti, pitture; mancano pietra/ventilata)

Oggi queste aree funzionano nei **modelli PDF** (le loro cover e foto ci sono), ma nel listino
riusano il catalogo del motore genitore (ristrutturazione/pavimenti/cappotto) e **non hanno
articoli/foto propri**. Se vuoi dargli un catalogo, servono le scene di tipologia + i packshot.

**Scene di tipologia** (1600×900 JPG → `templates/<area>/tipologie/tipologia-<slug>.jpg`) e per
ognuna il packshot 800×800 gemello (`…/products/tipologia-<slug>.webp`). Tipologie consigliate:

| area | tipologie (slug) |
|---|---|
| `pareti-soffitti` | `carta-da-parati`, `cartongesso`, `controsoffitti`, `tinteggiature-interne`, `finiture-decorative`, `risanamento-umidita`, `pannelli-acustici` |
| `pergole` | `pergole-bioclimatiche`, `pergole-a-telo`, `tende-da-sole`, `vetrate-e-verande`, `carport` |
| `giardini` | `realizzazione-verde`, `manutenzione-verde`, `irrigazione`, `recinzioni-e-cancelli` |
| `facciate` | `facciate-ventilate`, `rivestimenti-in-pietra`, `pulizia-e-consolidamento` |

**Packshot prodotto reali** (800×800 → `templates/<area>/products/<slug>.webp`), esempi tipici:
- pareti-soffitti: `carta-da-parati`, `lastra-cartongesso`, `orditura-metallica`, `idropittura`,
  `pannello-fonoassorbente`, `finitura-a-calce`, `rasante-antimuffa`
- pergole: `telo-per-pergola`, `lamella-in-alluminio`, `tenda-a-bracci`, `vetrata-scorrevole`, `struttura-carport`
- giardini: `rotolo-di-prato`, `irrigatore-pop-up`, `centralina-irrigazione`, `pannello-recinzione`, `cancello-pedonale`
- facciate: `listello-in-pietra`, `pannello-facciata-ventilata`, `staffa-sottostruttura`

Prompt: scena di tipologia → §5 «Scena di tipologia»; packshot → §5 «Prodotto listino».
> Es. carta da parati (packshot): `Foto prodotto professionale su sfondo bianco/grigio neutro, rotolo di carta da parati parzialmente srotolato con disegno delicato, accanto spatola e colla, luce da studio morbida e uniforme, prodotto isolato e centrato, alta qualità, catalogo tecnico. Senza testo, senza logo, senza marchi, senza watermark, senza mani.`
> Es. carta da parati (scena tipologia): `Fotografia editoriale realistica, parete di camera rivestita con carta da parati dal disegno delicato, arredo essenziale, luce naturale, contesto residenziale italiano, alta qualità. Senza testo, senza logo, senza marchi, senza watermark, senza volti riconoscibili.`

---

## 2. PRIORITÀ 2 — Sostituire (facoltativo) i 4 packshot di categoria "riempitivi"

Il 28/09 ho generato questi 4 packshot ritagliando la scena ambientata (funzionano, ma sono una
scena, non un packshot pulito). Se li vuoi coerenti col resto, rigenerali come packshot di
categoria dedicati e sovrascrivi il file:

| File (800×800 WebP) | Prompt soggetto |
|---|---|
| `pavimenti/products/tipologia-pietre-e-pavimenti-esterni.webp` | Composizione di campioni di pietra naturale e gres da esterno (porfido, quarzite, effetto pietra) su sfondo neutro |
| `ristrutturazione/products/tipologia-sistemi-a-secco.webp` | Lastra in cartongesso/gesso rivestito con orditura metallica e vite, campione di sistema a secco su sfondo neutro |
| `tetti/products/tipologia-lattoneria.webp` | Elementi di lattoneria (canale di gronda, scossalina, pluviale) in alluminio/rame su sfondo neutro |
| `tetti/products/tipologia-membrane-e-teli.webp` | Rotolo di membrana impermeabile e telo traspirante sottotegola, sezione visibile, su sfondo neutro |

Prompt completo = wrapper prodotto (§6) + soggetto.

---

## 3. PRIORITÀ 3 — Copertine dedicate per i modelli ancora su immagine generica (facoltativo)

Alcuni modelli capofila usano ancora una cover generica dell'area invece di una dedicata. Non è
urgente (il PDF funziona), ma una cover dedicata li distingue nel selettore. L'elenco completo con
i soggetti è in `docs/immagini-da-creare.md §1`; i prompt-soggetto per i lotti nuovi in
`docs/prompt-immagini-modelli.md §3`. Per ognuno: **cover 1536×1024** (verticale 1024×1536 per
serramenti/porte) in `public/module-art/<area>-<id>-cover.jpg`, poi rigenera la miniatura.

---

## 4. Convenzioni tecniche (richiamo veloce)

| Uso | Dimensioni | Formato | Cartella | Naming |
|---|---|---|---|---|
| Copertina modello | 1536×1024 (o 1024×1536 vert.) | JPG | `public/module-art/` | `<area>-<id>-cover.jpg` |
| Miniatura modello | 480×720 | WebP | `public/module-thumbs/` | `<area>-<id>-cover-thumb.webp` |
| Miniatura di area | 640×426 | JPG | `public/module-art/` | `<area>-thumb.jpg` |
| Foto prodotto listino | 800×800 | WebP | `public/templates/<area>/products/` | `<slug>.webp` |
| Packshot di categoria | 800×800 | WebP | `public/templates/<area>/products/` | `tipologia-<slug>.webp` |
| Scena di tipologia | 1600×900 | JPG | `public/templates/<area>/tipologie/` | `tipologia-<slug>.jpg` |
| Foto operative PDF | 1600×900 | JPG | `public/pdf-stock/<settore>/` | descrittivo |

**Attenzione ai nomi-file "sinonimo"** (già in uso, non cambiarli senza motivo): fotovoltaico
«Sistemi di accumulo» → file `tipologia-batterie.jpg`; termoidraulico «Pompe di calore» → file
`tipologia-pompe-di-calore-e-sistemi-ibridi.jpg`; «Accessori» serramenti/bagno → con suffisso area.

**Aree (cartella `templates/`):** `bagno, cappotto, climatizzazione, elettrico, fotovoltaico,
pavimenti, piscine, ristrutturazione, serramenti, termoidraulico, tetti`. (Nota: `bagno`, non `bagni`.)

---

## 5. Master prompt riutilizzabili (copia-incolla)

**Prodotto listino / packshot (800×800):**
> `Foto prodotto professionale su sfondo bianco/grigio neutro, [PRODOTTO], luce da studio morbida e uniforme, prodotto isolato e centrato, alta qualità, catalogo tecnico. Senza testo, senza logo, senza marchi, senza watermark, senza mani.`

**Copertina modello / hero (1536×1024):**
> `Fotografia editoriale professionale, [SOGGETTO], contesto residenziale italiano, luce naturale morbida, composizione ampia ed elegante, realistico, alta qualità, palette naturale e sobria. Senza testo, senza logo, senza marchi, senza watermark, senza volti riconoscibili.`

**Scena di tipologia (1600×900):**
> `Fotografia editoriale realistica, ambiente/lavorazione che rappresenta la categoria [TIPOLOGIA], contesto edilizio italiano, luce naturale, composizione pulita, alta qualità. Senza testo, senza logo, senza marchi, senza watermark, senza volti riconoscibili.`

---

## 6. Negative prompt (per tutti)

> `testo, scritte, lettere, logo, marchio, watermark, firma, volti riconoscibili, persone in posa, cartelli, insegne, targhe, resa cartoon, deformazioni, mani deformi, colori innaturali, HDR esagerato.`

---

## 7. Come consegnarmele

Mettile in una cartella (anche con la stessa struttura `<area>/products/<slug>.webp`) e passamela:
le sposto io in `public/`, verifico che i test di copertura restino verdi
(`src/test/logic/listinoTemplateAssets.test.ts` e `module68ContentAssetsAudit.test.ts`), committo
e pusho. Per il fotovoltaico, se mi passi anche l'elenco degli slug del listino, aggancio io le
foto ai prodotti giusti.

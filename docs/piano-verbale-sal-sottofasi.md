# Piano: il verbale SAL con le sottofasi, e il nuovo verbale in un passaggio

10/11/2026. Si aggiunge a [piano-sal-standard.md](piano-sal-standard.md) (lotto 1 fatto: le voci
del verbale sono legate alle fasi). Vale per tutte le aziende.

Due richieste:

1. **Il verbale fa vedere le sottofasi**, a video e nel PDF: sotto ogni fase, le sue lavorazioni
   con quanto è stato fatto. Oggi una fase come «Primo solaio» è una riga sola, e il
   committente non vede le lavorazioni che ci sono dentro (getto, travi, parapetti…).
2. **Il SAL successivo si prepara in un passaggio.** Chi fa il SAL n. 3 deve trovare tutto già
   compilato: cosa è cambiato dal SAL n. 2, la rata da certificare, il certificato di pagamento
   con ritenuta, acconti e netto. Deve solo controllare e salvare.

## Com'è oggi (letto da origin/main il 10/11)

| Pezzo | Dove | Cosa fa |
|---|---|---|
| Voci del verbale | `sal_voci` (`fase_id` dal lotto 1) | una riga per fase: importo contrattuale, % cumulativa, importo SAL (generato) |
| Sottofasi | `order_work_subphases` | nome, peso, %, fatta, `quantita_fatta`; nessun legame col SAL |
| Voci della commessa | `order_work_phase_voci` | descrizione, unità, quantità, importo, `subphase_id`: dal computo o dal preventivo |
| Bozza del verbale | `SalTab.tsx` → `vociSalDaFasi` (`salDaFasi.ts`) | si compila dalle fasi all'apertura; la % non scende sotto il SAL precedente |
| Certificato | `sal_certificati`, `CertificatoSal.tsx` | passaggio separato, dopo il verbale |
| PDF | `generate-sal-pdf` (`index.ts`, `render.ts`) | legge solo `sal_voci`: tabella per voce, precedente per descrizione |

Difetti visti su una commessa vera con computo a misura, da sistemare insieme:

- **Nuovo verbale:** la rata parte da «Nessuna», anche se c'è una sola rata ancora libera da
  certificare.
- **Due avanzamenti diversi:** la testata della commessa scrive «57% · 4/7 completate» (conta le
  fasi), mentre la commessa è al 62% pesato sugli importi (`peso_media = venduto`) e il verbale
  dice 61,7%. Per la stessa commessa devono dire lo stesso numero.
- **Certificato a parte:** il certificato si fa dopo il verbale, e gli «acconti precedenti» si
  ricostruiscono a mano.

## Le regole

1. **La fase resta la voce del verbale; le sottofasi sono il suo dettaglio.** Gli importi del
   SAL, le rate e la fattura restano per fase, come oggi. La fase vale la somma delle sue
   sottofasi.
2. **L'importo di una sottofase:**
   - la somma delle voci della commessa collegate (`order_work_phase_voci.subphase_id`), se ci
     sono;
   - altrimenti la sua quota del venduto della fase in base al `peso`;
   - se la fase non ha venduto, la sottofase non ha importo e mostra solo la %.
3. **Avanzamento della sottofase, nell'ordine:**
   - quantità fatta / quantità del contratto, se ci sono le quantità (lavori a misura, come
     computo a misura);
   - altrimenti la sua `percentuale`;
   - «fatta» vale 100%.

   Mai sotto quella già certificata nel SAL precedente.
4. **I SAL vecchi non cambiano:** i 481 verbali esistenti hanno solo le fasi e si stampano come
   oggi.

## Lotti

### Lotto A — Le sottofasi nel verbale (dati e calcolo)

- **Migrazione `sal_voci_sottofasi`:** le righe di dettaglio stanno in `sal_voci`, con una
  colonna che dice di quale fase sono il dettaglio. Colonne nuove, tutte facoltative:
  - `sottofase_id` (riferimento a `order_work_subphases`, `on delete set null`);
  - `voce_padre_id` (la riga della fase);
  - `unita`, `quantita_contratto`, `quantita_a_oggi`, `prezzo` (per i lavori a misura).

  Una riga con `voce_padre_id` è dettaglio: non entra nel totale del SAL, che continua a sommare
  le sole righe di fase. Così `importo_totale`, certificati, rate e fattura non cambiano. Più
  un trigger che rifiuta una sottofase di un'altra fase o commessa. Prima di scrivere:
  - controllare `sal_voci` in `types.ts`;
  - aggiornare il controllo dei totali di `render.ts`, che oggi somma **tutte** le voci;
  - escludere le righe di dettaglio da ogni somma che legge `sal_voci`:
    - `CreaFatturaDialog.tsx`, `fatturaDaLavori.ts`, `OrdinePDF.tsx`, `OrderDetail.tsx`;
    - `registroCommessa.ts`, `saveSalDraft.ts`;
    - `suggerisci-sal-ai`.

    Il modo sicuro è una sola funzione `vociDiFase(sal)` usata da tutti.
- **`salDaFasi.ts`:** `vociSalDaFasi` restituisce per ogni fase anche le sue sottofasi, con
  importo e avanzamento secondo le regole 2 e 3. Per il SAL precedente:
  - `percentualiPrecedenti` legge anche la % per `sottofase_id`;
  - la % della fase è la media delle sottofasi pesata sugli importi, non più un campo a sé.
- **Salvataggio (`saveSalDraft`):** le righe di fase e quelle di dettaglio si salvano in una sola
  chiamata.
- **Test:** fase con sottofasi da computo (quantità), fase con sottofasi a peso, fase senza
  sottofasi, SAL successivo che riparte dalle % della sottofase.

### Lotto B — Il verbale a video e nel PDF

- **A video («Voci del verbale»):** la fase in grassetto con il suo totale, e sotto, rientrate, le
  sottofasi con:
  - % precedente → % a oggi;
  - quantità a oggi / quantità del contratto con l'unità, se ci sono;
  - importo.

  Le fasi già chiuse in un SAL precedente si possono comprimere: «Fondazioni — 100% dal SAL n. 1».
- **PDF (`generate-sal-pdf`):**
  - stessa struttura: riga di fase con le colonne di oggi (contratto, % prec., avanzamento, a
    tutto il SAL, precedente, questo SAL), righe di sottofase rientrate e in corpo più piccolo;
  - per i lavori a misura, le colonne quantità e prezzo nelle sottofasi;
  - interruttore «Dettaglio sottofasi» nel dialogo di stampa, acceso per default, per chi vuole
    il verbale breve;
  - il precedente per sottofase si prende da `sottofase_id`, non dalla descrizione.

  **Attenzione al deploy:** si tocca `index.ts` insieme a `render.ts`. Il job ripubblica solo le
  funzioni con file cambiati sotto `supabase/functions/`.
- **Collaudo:**
  - Demo Azienda 2;
  - una commessa vera con computo a misura: ristampato, il SAL deve mostrare sotto ogni fase le
    sue voci con quantità a oggi su quantità del contratto e importo.

### Lotto C — Il nuovo verbale in un passaggio

Un solo modulo, già compilato:

- **Testata:** numero (automatico), «lavori a tutto il» (oggi, modificabile), rata.
- **Rata proposta:**
  - con il pagamento a rate, la prima rata non ancora certificata da un SAL;
  - con il pagamento «a SAL» (lotto 3 del piano standard), la rata nuova creata dal verbale.

  «Nessuna» resta una scelta, non il punto di partenza.
- **Cosa cambia dal SAL precedente:** per default si vedono solo le righe che avanzano rispetto
  al SAL n. N−1 (fase → sottofasi), con «Mostra tutte le voci». Per ogni sottofase si corregge la
  % o la quantità a oggi; «Fatta» la porta a 100.
- **Riepilogo in fondo, nello stesso modulo** (il certificato non è più un passaggio a parte):
  - lavori a tutto il SAL;
  - meno SAL precedenti = periodo;
  - meno ritenuta (la % del certificato precedente o delle impostazioni);
  - meno acconti già certificati (la somma dei netti precedenti, non riscritta a mano);
  - meno altre detrazioni (con nota);
  - = netto, più IVA = da pagare.

  Arrotondamento a scelta (nessuno, a 10 o a 100 euro), come nei certificati PriMus.
- **Due pulsanti:** «Salva bozza» ed «Emetti». Emettere salva anche il certificato, nella stessa
  chiamata.
- **Avvisi, non blocchi:**
  - righe sotto il SAL precedente: rettifica dichiarata, come oggi;
  - avanzamento del cantiere oltre quello certificato: «eseguito non ancora certificato».
- **«Suggerisci AI»** resta come aiuto: le voci che propone si agganciano alle sottofasi per nome.
- **Test UI:** commessa con SAL 1 e 2 → «Nuovo verbale» apre il SAL n. 3 con la rata libera
  scelta, le sole righe cambiate e un netto che torna con ritenuta e acconti.

### Lotto D — Le sottofasi seguono il verbale emesso

Va insieme al lotto 2 del piano standard: lì è la fase ad alzarsi al certificato, qui la
sottofase.

- **All'emissione:** sottofasi sotto la % certificata → si alzano (percentuale o quantità fatta),
  mai si abbassano. La fase si ricalcola dalle sottofasi con i trigger che ci sono già.
- **Data:** una sottofase portata a 100% dal verbale prende come data di fine la data del SAL,
  non oggi. Il trigger oggi mette `completata_il = now()`, quindi va passata la data.
- **Testata della commessa:** stesso avanzamento di `orders.percentuale_avanzamento`, che segue
  `peso_media`. Così la testata, il verbale e la scheda dicono lo stesso numero.

## Ordine

1. A e B insieme: senza il PDF il dato nuovo non si vede.
2. C, la parte che fa risparmiare tempo ogni mese.
3. D, dopo il lotto 2 del piano standard.

Ogni lotto si pubblica da solo, con il collaudo sulla Demo Azienda 2 e una ristampa su una
commessa vera.

## Fuori dal piano

- Il SAL a misura sul computo (`lp_sal`, libretto delle misure): resta il lotto 5 del piano
  standard. Le quantità del lotto A sono quelle delle voci della commessa, non del libretto.
- La firma del cliente via link: lotto 6 del piano standard.

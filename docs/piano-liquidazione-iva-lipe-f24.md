# Liquidazione IVA, LIPE e F24 — piano di sviluppo

Data: 7 novembre 2026. Parte da `docs/fiscalita-analisi-piano-20261026.md`: quel
lavoro ha reso affidabili registro IVA, prospetto e anteprima F24 in sola
lettura. Questo piano porta EiC a fare la **liquidazione vera**, il **file LIPE**
da mandare all'Agenzia e l'**F24 da pagare**, con numeri che un commercialista
firma senza rifarli.

## In una riga

Prima dati completi, poi il conto, poi la conferma, poi i file. Se si invertono
i passi, il file LIPE parte con numeri sbagliati e la sanzione la paga l'azienda.

## Cosa deve uscire alla fine

| Cosa | Quando | A chi |
|---|---|---|
| Liquidazione IVA del periodo (mese o trimestre) | ogni periodo | resta in EiC, firmata da chi la conferma |
| F24 con codice tributo e importo | 16 del mese dopo (mensili) · 16/05, 20/08, 16/11 e 16/03 (trimestrali) | si paga dalla banca o da Entratel |
| Acconto IVA di dicembre | 27/12 | F24, codice 6013 o 6035 |
| File LIPE (XML) | 31/05, 30/09, 30/11, fine febbraio | si carica su Entratel/Fisconline o lo manda l'intermediario |
| Prospetto per la dichiarazione IVA annuale | entro il 30/04 | al commercialista (non il file telematico) |

**Fuori dal piano, di proposito:** invio diretto all'Agenzia (servono le
credenziali Entratel dell'azienda o di un intermediario), pagamento automatico
dell'F24, file telematico della dichiarazione annuale.

## Cosa c'è oggi e cosa manca davvero (verificato sul database il 07/11)

**Già fatto e da riusare**
- Registro IVA vendite/acquisti con lettura corretta delle aliquote, note di credito col segno giusto, paginazione completa.
- `liquidazione_iva_periodo` (SQL): calcolo di lettura con split payment separato e ipotesi dichiarate.
- `fatture_ricevute_periodo_iva` (vista) con `data_detrazione`; `fatture_vendite_iva` con `esigibilita_iva`.
- Anteprima F24 in sola lettura + conferma separata; catalogo codici corretto; `fiscalita_periodi` per chiudere un mese con snapshot e storico.
- `fiscal_reports` ha già le colonne giuste (`report_type` `lipe`/`f24`, `xml_storage_path`, `ade_protocol_number`, `submitted_at`, revisione del commercialista). Contiene **10 bozze vuote del 09/05** (`data_summary = {}`), mai usate: vanno eliminate o ignorate, non mostrate come LIPE.

**I buchi nei dati, che oggi rendono impossibile una liquidazione giusta**

| Buco | Quanto è grande | Perché conta |
|---|---|---|
| Fatture ricevute senza **data di ricezione SDI** | Vulcano 1.208/1.208, Innovasol 1.519/1.519, Best Infissi 1.235/1.235, Bonarrigo 870/870, Dimora 621/621, Renova 268/379 | L'IVA sugli acquisti si detrae nel periodo in cui la fattura **arriva**, non in quello della sua data. Senza la data di ricezione, una fattura del 28/09 ricevuta il 03/10 finisce nel trimestre sbagliato |
| Fatture emesse **importate** senza riepilogo per aliquota | 1.239 su 1.239 (tutte quelle da Fatture in Cloud) | Si sa il totale IVA ma non quanta è al 22%, al 10%, al 4%, esente o in reverse charge: la LIPE separa le operazioni imponibili dal resto |
| **Natura** dell'operazione sulle righe | Ricevute: 651 righe su 3.153 · Vendite: 2 su 299 | Senza natura (N1…N7) non si distingue esente, non imponibile, reverse charge |
| **Indetraibilità** (auto, telefonia, rappresentanza) | Non esiste nessun campo | Oggi tutta l'IVA sugli acquisti è considerata detraibile al 100%: falso per quasi ogni azienda |
| **Impostazioni fiscali** dell'azienda (mensile/trimestrale, IVA per cassa, pro-rata, credito dell'anno prima) | Non esistono | Il calcolo non sa quale periodo fare, se aggiungere l'1% di interessi, da quale credito partire |
| Collegamento fra una liquidazione e la successiva | Non esiste | Il credito di un mese deve diventare il punto di partenza del mese dopo; un debito sotto i 100 € si rinvia |

La maggior parte dei clienti veri è in `billing_mode = external` (fatture da
Fatture in Cloud). Il piano deve funzionare **anche per loro**, non solo per chi
emette da EiC.

## Avanzamento

**07/11/2026 — fase 0 e fase 1.1 applicate in produzione**
(`20281230100000_iva_impostazioni_azienda`, `20281230101000_iva_data_ricezione_dichiarata`).
- Impostazioni IVA: tabella `fiscalita_impostazioni_iva` e scheda «Impostazioni IVA» in
  Contabilità fiscale (`?vista=impostazioni_iva`).
- Data di ricezione: le fatture arrivate dal canale SDI di EiC l'avevano già (openapi). Il
  webhook `ricevi-sdi` invece non la salvava: ora registra l'istante della consegna. Per le
  importate, che lo SDI non ce l'hanno, la data si **presume** uguale a quella della fattura
  (giusto quasi sempre, grazie alla regola del 15 del mese dopo) oppure si **dichiara** dal
  Registro acquisti («Dichiara data di ricezione», in blocco, firmata). Le fatture dal 20
  dicembre in poi senza data restano **da verificare**: se arrivate a gennaio, la loro IVA va
  nell'anno dopo.
- Registro, prospetto e controllo dei mesi chiusi usano la stessa data
  (`ricezione_iva_il`, `ricezione_iva_origine`).
- Test: `src/test/logic/ivaRicezioneImpostazioni.test.ts` (PGlite, SQL veri) e
  `src/test/ui/ivaRicezioneImpostazioni.test.tsx`.

**07/11/2026 — simulazioni del caos** (`src/test/logic/ivaCaos.test.ts`, e in produzione
con utenti veri di Demo Azienda 2 in transazioni annullate). Trovati e corretti quattro
difetti:
- La scheda Impostazioni IVA non salvava, nemmeno la prima volta: l'upsert ha bisogno
  dell'UPDATE su azienda e anno. Corretto con la migrazione `20281230102000`.
- Una data di ricezione nel futuro, scritta direttamente nella colonna, passava (`…102000`).
- Dichiarazioni in parallelo potevano bloccarsi a vicenda; gli id ripetuti gonfiavano le
  «saltate» (`…102000`).
- Una partita IVA scritta con «IT» davanti veniva rifiutata (`…103000`).
- In più, nel codice delle funzioni: una fattura entrata prima da un gestionale e poi
  arrivata dallo SDI perdeva la data SDI (`salvaFatturaRicevuta`).

Confermato:
- 600 fatture casuali: database e un oracolo scritto da zero danno lo stesso periodo per ognuna,
  e il prospetto torna col registro.
- Bordi del calendario: Capodanno, il 15 contro il 16, il cambio d'ora.
- Mesi chiusi: niente entra e niente esce, e un blocco di fatture che fallisce non lascia
  niente a metà.
- Permessi: dipendente, anonimo e altra azienda restano fuori.
- Backup: la nuova tabella è coperta.
- Tempi su Innovasol (1.519 acquisti): 65–100 ms per trimestre.

**07/11/2026 — controllo a fondo del calcolo sui dati veri** (migrazioni
`20281230104000`, `…105000`, `…106000`; test `src/test/logic/ivaCalcolo.test.ts`).

| Difetto | Effetto nel 2026 | Stato |
|---|---|---|
| Integrazioni e autofatture ricevute (TD16–19, `self_invoice` di Fatture in Cloud): IVA solo a credito, mai a debito | saldo da versare più basso del vero: Best Infissi 57.367 €, Renova 14.045 €, Vulcano 10.612 €, Bonarrigo 3.222 € | corretto |
| Righe negative (sconti, acconti scalati) prese in valore assoluto | IVA a credito gonfiata: Vulcano 2.709 €, Bonarrigo 646 € | corretto |
| Riepilogo per aliquota assente: 1.239 emesse importate, 3.375 ricevute da Fatture in Cloud | nessun dettaglio per aliquota (serve alla LIPE e alla dichiarazione) | ricostruito dalle righe quando tornano coi totali; altrimenti resta il totale, segnalato |
| Reverse charge N6 senza aliquota di integrazione (315 fatture) | 22% presunto senza dirlo: saldo uguale, righi VP4/VP5 incerti | ora dichiarato nel prospetto; l'aliquota vera va chiesta (fase 1.4) |
| L'imponibile del reverse charge contato tra le operazioni attive | rigo VP2 gonfiato | corretto |

Verifiche fatte:
- prova a secco in produzione su 7 aziende × 3 trimestri prima di applicare;
- confronto fra la versione vecchia e la nuova del riepilogo: 0 differenze su 24.416 documenti;
- 400 documenti casuali confrontati con un oracolo.

Una prima versione della correzione faceva sparire i documenti senza nessun riepilogo (in SQL `NOT NULL` è `NULL`). L'hanno presa le simulazioni, prima di arrivare in produzione.

Tempi, da utente vero di Innovasol:
- prospetto di un trimestre: 75 → 152 ms;
- registro vendite di un anno: 117 ms;
- registro acquisti di un anno: 203 ms.

Resta aperto:
- le fatture di Fatture in Cloud a IVA zero non hanno la natura. Fatture in Cloud la manda in `vat.ei_type` solo se si leggono i tipi IVA dell'azienda: da fare nel sincronizzatore. Non cambia i righi VP della LIPE, serve alla dichiarazione annuale;
- Dimora ha 48–74 ricevute a trimestre senza righe: restano sul totale.

**Prossimo:** la fase 1.2 (riepilogo delle emesse importate) è fatta, vedi sopra. Restano:
- 1.3, indetraibilità;
- 1.4, aliquota vera del reverse charge, da chiedere per fornitore o per fattura;
- la natura IVA dal sincronizzatore di Fatture in Cloud.

## Fasi

Ogni fase finisce con test verdi e una prova su un'azienda vera **in sola
lettura**. Si passa alla successiva solo quando la precedente è chiusa.

### Fase 0 — Impostazioni IVA dell'azienda

Nuova tabella `fiscalita_impostazioni_iva` (una riga per azienda e anno):
- periodicità: mensile / trimestrale (con interessi 1%) / trimestrale speciale;
- regime: ordinario / forfettario (forfettario = niente liquidazione, la pagina lo dice e si ferma);
- IVA per cassa sì/no; pro-rata di detrazione in %; attività separate: no (se sì, caso non gestito e dichiarato);
- credito IVA dell'anno precedente usato in compensazione, metodo dell'acconto (storico / previsionale / analitico);
- dati per il frontespizio LIPE: codice fiscale del contribuente e del dichiarante, codice carica, eventuale intermediario.

Si compila dalla scheda Fiscalità. Finché manca, liquidazione e LIPE restano bloccate con il motivo scritto.
RLS per azienda, scrittura solo per titolare/amministrazione e commercialista delegato.

### Fase 1 — Dati completi (la fase più importante)

1. **Data di ricezione SDI** — *fatto il 07/11, vedi Avanzamento.*
   - Ricevute dal canale SDI di EiC: data salvata (openapi da sempre, `ricevi-sdi` dal 07/11).
   - Importate: il file XML non contiene la data di consegna. Presunta alla data della fattura, dichiarabile in blocco, «da verificare» se di fine dicembre.
   - Resta da vedere se l'API di Fatture in Cloud espone la data di ricezione dei documenti ricevuti: se sì, riempirla con un ricarico **a lotti per azienda** (regole di `CLAUDE.md`: `lock_timeout`, `statement_timeout`, lotti piccoli).
2. **Riepilogo per aliquota delle emesse importate**: rileggere l'XML della fattura elettronica (o le righe dell'API FIC) e compilare `riepilogo_iva` con aliquota, natura, esigibilità. Non ricavare mai l'aliquota dividendo imposta per imponibile: se manca la fonte, la fattura resta «da completare».
3. **Natura e indetraibilità sulle ricevute**:
   - colonna `detraibilita_percentuale` per riga di riepilogo (default 100);
   - regole proposte per categoria (auto 40%, telefonia 50%…) che l'utente **conferma**, mai applicate da sole;
   - l'AI può suggerire la categoria, non la percentuale finale.
4. **Reverse charge in edilizia** (subappalti, art. 17 c.6): ogni ricevuta con natura N6.x va abbinata alla sua integrazione (TD16, o registrazione interna con aliquota confermata) che entra **in entrambi** i registri. Una ricevuta N6 senza integrazione è un errore bloccante, non un importo a zero.
5. **Pagina «Cosa manca per liquidare»** per periodo:
   - elenco cliccabile di ogni documento incompleto, col motivo;
   - azione per sistemarlo in blocco;
   - contatore che deve arrivare a zero.

**Fine fase:** su Renova (native) e su una external (Bonarrigo o Vulcano), il trimestre luglio–settembre 2026 ha zero documenti incompleti.

### Fase 2 — Il conto: un'unica funzione che dà i righi LIPE

Nuova `liquidazione_iva_calcola(company, anno, periodo)` (SQL, sola lettura, versionata) che restituisce **i righi del modello**, non solo «vendite − acquisti»:

| Rigo | Cosa | Da dove |
|---|---|---|
| VP2 / VP3 | Totale operazioni attive / passive (imponibili) | registri, per data emissione / data detrazione |
| VP4 | IVA esigibile | vendite − note credito, **senza** split payment, con IVA per cassa solo se incassata, + integrazioni reverse charge |
| VP5 | IVA detratta | acquisti × detraibilità × pro-rata, + integrazioni RC |
| VP6 | IVA dovuta o a credito | VP4 − VP5 |
| VP7 | Debito del periodo precedente sotto 100 € | liquidazione confermata precedente |
| VP8 | Credito del periodo precedente | liquidazione confermata precedente |
| VP9 | Credito dell'anno precedente | impostazioni fase 0 |
| VP10–VP11 | Versamenti auto UE, crediti d'imposta | manuali, con nota |
| VP12 | Interessi 1% (solo trimestrali) | calcolo |
| VP13 | Acconto versato | F24 di dicembre confermato |
| VP14 | **Da versare / a credito** | risultato |

Regole:
- importi in centesimi;
- ogni rigo con l'elenco dei documenti che lo compongono, apribile;
- se un dato della fase 1 manca, la funzione risponde «non calcolabile» col motivo, **mai** un numero;
- la vecchia `liquidazione_iva_periodo` resta per il prospetto e poi viene ritirata.

**Test:** casi costruiti a mano con il risultato scritto prima (aliquote miste, note di credito, split payment, IVA per cassa, reverse charge, fattura ricevuta il 15 del mese dopo, a cavallo d'anno, debito sotto 100 €, credito che si trascina, interessi trimestrali, pro-rata). Gira su PGlite come i test fiscali del 26/10.

### Fase 3 — Liquidazione confermata

- Nuova tabella `liquidazioni_iva`: azienda, periodo, righi VP, versione del calcolo, snapshot dei documenti inclusi, chi ha confermato e quando, stato (bozza → confermata → rettificata).
- **Conferma:** anteprima, poi conferma esplicita. Dopo la conferma il periodo si chiude con `fiscalita_periodi`: una fattura che cambia o arriva dopo non sposta in silenzio il numero, crea un avviso «rettifica necessaria».
- **Rettifica:** nuova versione con motivo; la precedente resta nello storico.
- **Stampa PDF:** registri del periodo + prospetto di liquidazione, da archiviare.
- La liquidazione confermata è la sola fonte per F24 e LIPE: i due file non ricalcolano niente.

### Fase 4 — F24

- Dalla liquidazione confermata con VP14 a debito (≥ 100 €, altrimenti rinvio al periodo dopo) si crea la riga in `f24_entries`:
  - codice tributo 6001–6012 (mensili) o 6031–6034 (trimestrali);
  - anno di riferimento e scadenza calcolata, interessi già dentro.
- **Acconto di dicembre:** calcolo col metodo scelto (storico 88% di default), codice 6013/6035, scadenza 27/12.
- **Promemoria F24 in PDF:** sezione Erario compilata, da portare in banca o al commercialista. Non è il file telematico: la pagina lo dice.
- **Pagato:** si segna solo con data e riferimento della quietanza; facoltativo il collegamento al movimento bancario riconciliato.
- **Compensazioni:** si mostrano come nota; sopra 5.000 € serve il visto di conformità, avviso esplicito.

### Fase 5 — File LIPE

- **Generatore XML** dal trimestre confermato (i tre mesi, per i mensili; il trimestre, per i trimestrali):
  - frontespizio dalla fase 0;
  - un modulo per mese o trimestre con i righi VP2–VP14.
- **Schema XSD ufficiale** dell'Agenzia salvato nel repository con la sua versione. Ogni file generato si valida contro lo schema prima di poterlo scaricare, sia in un test che a runtime.
- Si salva in `fiscal_reports` (`report_type = 'lipe'`); le 10 bozze vuote del 09/05 si eliminano.
- **Flusso:**
  1. si scarica il file;
  2. l'azienda o l'intermediario lo firma e lo invia da Entratel;
  3. si carica in EiC la ricevuta dell'Agenzia, che riempie `ade_protocol_number` e `submitted_at`;
  4. lo stato «inviata» esiste solo con la ricevuta caricata.
- **Promemoria scadenze** (31/05, 30/09, 30/11, fine febbraio) nel brief del mattino e nella campanella, 10 giorni prima.
- **Correzione:** se una liquidazione confermata viene rettificata dopo l'invio, il file LIPE si rigenera come correttiva, con avviso.

### Fase 6 — Prospetto annuale per la dichiarazione IVA

Dalle liquidazioni confermate dell'anno, un prospetto dei quadri riepilogativi (VE, VF, VH, VL) in PDF/CSV per il commercialista. Non il file telematico.

### Fase 7 — Collaudo vero

1. Prendere un'azienda che ha già le LIPE 2026 fatte dal commercialista. È l'ideale quella che ha fatto la domanda; se no, Renova o Bonarrigo.
2. Ricalcolare in EiC Q1, Q2 e Q3 2026 **senza confermare niente**.
3. Confrontare rigo per rigo con le LIPE inviate. Ogni differenza va spiegata e chiusa: un errore nostro si corregge, un errore del dato si sistema nella fase 1.
4. **Accettazione:** tre trimestri identici al centesimo, oppure ogni differenza spiegata per iscritto dal commercialista.
5. Validazione del file LIPE generato con il controllo dell'Agenzia (software di controllo Entratel) **prima** di qualsiasi invio reale.

## Ordine e peso

| Fase | Peso | Dipende da |
|---|---|---|
| 0 Impostazioni | piccola | — |
| 1 Dati completi | **grande** (ricarico da FIC, XML, pagina dei mancanti) | 0 |
| 2 Calcolo righi VP | media | 1 |
| 3 Conferma e chiusura | media | 2 |
| 4 F24 | piccola | 3 |
| 5 LIPE XML | media | 3 |
| 6 Prospetto annuale | piccola | 3 |
| 7 Collaudo | media | 4, 5 |

Le fasi 4, 5 e 6 possono andare in parallelo dopo la 3.

## Regole per tutto il lavoro

- **Mai un numero inventato.** Se manca un dato, si dice cosa manca: non si scrive 0 e non si fanno stime.
- **Una sola fonte.** Registro, liquidazione, F24 e LIPE leggono la stessa liquidazione confermata.
- **Ogni importo apribile** fino al documento originale.
- **Migrazioni** come da `CLAUDE.md`:
  - idempotenti;
  - `apply_migration` + riallineamento della versione;
  - le funzioni nuove nascono con `REVOKE … FROM PUBLIC, anon`;
  - i ricarichi di dati vanno a lotti con i timeout.
- **Nessuna scrittura fiscale sulle aziende vere** durante lo sviluppo: le prove che scrivono si fanno su PGlite o su Demo Azienda 2.
- **La firma resta umana.** EiC prepara e controlla; conferma, invio e pagamento li fa una persona.

## Da decidere prima di partire

1. Quale azienda ha chiesto: usa Fatture in Cloud (external) o fattura da EiC (native)? Cambia da dove parte la fase 1.
2. Quell'azienda è mensile o trimestrale, e manda la LIPE da sola (Entratel proprio) o tramite un intermediario?
3. Ci dà le LIPE 2026 già inviate per il collaudo della fase 7?

## Avanzamento 09/11/2026

- **Fasi 2, 3 e 5 fatte.** `liquidazione_iva_righi` calcola VP2-VP14 (periodicità dalle impostazioni), `liquidazione_iva_conferma` li ferma in `fiscal_reports`, in ordine di periodo. Pagina «Liquidazione IVA» in Contabilità fiscale.
- **File LIPE:** `src/lib/contabilita/lipeXml.ts`, fornitura IVP18 secondo le specifiche del 14/03/2024 e `comunicazioneIvp_2018_v1.xsd`; i controlli bloccanti stanno in `controlliLipe`.
- **Da fare prima di usarlo sul serio:** passare un file vero nel Software di controllo dell'Agenzia (Entratel) e confrontare con una LIPE già inviata (fase 7). Mancano indetraibilità e pro-rata nel calcolo (fase 1.3) e l'F24 che nasce dalla liquidazione (fase 4).

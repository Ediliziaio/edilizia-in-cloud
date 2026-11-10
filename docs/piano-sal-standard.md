# Piano: il SAL standard

10/11/2026. Obiettivo: un solo modo di fare il SAL, uguale per ogni azienda, così che nessuna
debba chiedere qualcosa di particolare. L'azienda sceglie due cose — **come si paga** e **se la
commessa ha un computo** — e il resto è già deciso.

## Le tre regole

1. **Pagamento:** «a rate» oppure «a SAL», scelto sulla commessa (e proposto dal preventivo).
2. **Avanzamento:** nasce dalle voci (fasi o righe del computo); la percentuale totale è sempre
   calcolata, mai scritta a parte; il verbale emesso alza le fasi rimaste indietro.
3. **Documento:** verbale e certificato di pagamento sono un unico documento a struttura fissa.

## Com'è oggi (letto da origin/main e dal database il 10/11)

| Pezzo | Dove | Uso reale |
|---|---|---|
| Verbale SAL a percentuale | `sal_records` + `sal_voci`, `SalTab.tsx` | 481 verbali, 926 voci, 4 aziende |
| Certificato di pagamento | `sal_certificati`, `CertificatoSal.tsx` | 63 |
| SAL a misura sul computo (libretto, SAL, certificati, varianti) | `lp_sal`, `lp_sal_voci`, `lp_certificati_pagamento`, `ContabilitaLavoriPubblici.tsx`, `useContabilitaLavori.ts` | **0** |
| Vecchia tabella `sal` (AI, rapportini, DDT) | `sal` | **0** righe |
| Rate «al SAL n°» | `order_installments.trigger_evento = 'sal_numero'` | 18 rate (17 `deposit`, 1 `balance`) |
| Firma del cliente via link | `sal_signature_tokens`, `/firma-sal/:token` | **0** link |

Cosa manca rispetto alle tre regole:

- **Non esiste il pagamento «a SAL».** Le rate vanno scritte prima: chi lavora con «acconto +
  SAL quando servono» deve inventarsi rate «al SAL n° 1, 2, 3».
- **Voci e fasi non sono legate.** `vociSalDaFasi` copia nome, % e venduto della fase *una volta*,
  quando nasce la bozza; `sal_voci` ha solo `descrizione` (non c'è il `fase_id`). Il verbale non
  può aggiornare le fasi, e un secondo SAL non sa quale voce corrisponde a quale fase.
- **La % totale non è un dato:** non si può dire «siamo al 40%», e nessuno controlla che le
  voci tornino.
- **Verbale e certificato sono due documenti** e due passaggi separati.
- **La parte a misura c'è ma non si vede:** sta nella contabilità lavori pubblici del computo, non
  nella sezione SAL della commessa.

## Lotti

Ogni lotto si pubblica da solo e ha un collaudo su una commessa vera della Demo Azienda 2.

### Lotto 1 — Voci legate alle fasi (la base di tutto) · fatto il 10/11

- Migrazione `20290201104500_sal_voci_fase`: `sal_voci.fase_id` (facoltativo, `on delete set null`)
  e un trigger che rifiuta una fase di un'altra commessa. Le voci vecchie collegate per nome dove
  la fase con quel nome è una sola: 390 su 926, le altre 536 restano libere.
- Il nuovo verbale si compila da solo dalle fasi appena si apre (se la bozza è ancora vuota);
  le voci dell'AI e quelle scritte a mano si collegano alla fase con lo stesso nome, altrimenti
  restano «voce libera, fuori dalle fasi».
- Ogni voce parte dalla % del cantiere ma **mai sotto il SAL precedente** per la stessa fase, e
  accanto al campo mostra «SAL n. 2: 60%».
- Percentuali cumulative: una voce sotto il SAL precedente non si blocca in assoluto (il sistema
  prevede già le rettifiche), ma il salvataggio chiede la spunta «È una rettifica» con l'elenco
  delle voci che scendono.
- Importo della voce = venduto della fase: le varianti approvate ci sono già dentro
  (`20281215100000_variante_approvata_crea_lavori` le somma a `importo_venduto`).

### Lotto 2 — La percentuale totale e il ritorno sulle fasi

- La % totale del verbale = somma degli importi a oggi / somma degli importi contrattuali,
  sempre calcolata.
- Campo «Porta tutto al __%»: divide la % sulle voci in proporzione all'importo, rispettando i
  minimi del SAL precedente, e mostra la divisione prima di applicarla.
- Migrazione: `order_work_phases.percentuale_certificata numeric not null default 0`, insieme
  alla funzione che la scrive (una colonna senza chi la tiene aggiornata invecchia).
- All'**emissione** (non in bozza), in una sola funzione di database:
  - `percentuale_certificata` = % della voce;
  - se `percentuale` di cantiere < % certificata → si alza alla % certificata;
  - se è maggiore resta: la differenza si vede come «eseguito non ancora certificato»;
  - riga nel registro della commessa («SAL n° 3 ha portato Massetti dal 30% al 40%»).
- Nella sezione fasi: due barre per fase, cantiere e certificato.

### Lotto 3 — Il pagamento «a SAL»

- Impostazioni della commessa, una riga per commessa (prima di creare la tabella: verificare se la
  tabella delle impostazioni della contabilità lavori, già per commessa, può essere estesa invece
  di crearne una seconda):
  `modo_pagamento` (`rate` | `sal`), `acconto_percentuale`, `recupero_acconto`
  (`proporzionale` | `primo_sal`), `ritenuta_percentuale`, `sal_minimo_percentuale` (facoltativo).
  Le commesse esistenti restano `rate`: niente cambia per chi lavora già.
- Con `modo_pagamento = sal` il piano pagamenti ha solo **acconto** e **saldo a fine lavori**;
  ogni SAL emesso **crea la sua rata** (`order_installments`, `trigger_evento = 'sal_numero'`,
  importo = netto del verbale, collegata con `installment_id`). Il saldo è quello che resta.
- Recupero dell'acconto proporzionale: in ogni SAL si toglie acconto × (importo del periodo /
  importo del contratto), così all'ultimo SAL l'acconto è recuperato tutto e niente si conta due
  volte.
- «SAL minimo»: sotto la soglia il verbale si può salvare in bozza, ma per emetterlo si chiede
  conferma.
- Il preventivo propone il modo (il modello di pagamento dice «a rate» o «a SAL»).

### Lotto 4 — Un solo documento

- Il certificato non è più un passaggio a parte: le sue righe (ritenuta, recupero acconto, altre
  detrazioni) stanno nel riepilogo del verbale, calcolate dalle impostazioni del lotto 3 e
  correggibili. I 63 certificati esistenti restano leggibili.
- PDF con struttura fissa, con la veste documenti dell'azienda (logo, piè di pagina):
  - **testata:** azienda, committente, cantiere, contratto, SAL n°, periodo, data;
  - **tabella per fase:** importo del contratto · % precedente · % a oggi · importo a oggi ·
    importo del periodo; le varianti approvate in un blocco proprio;
  - **riepilogo:** lavori a tutto oggi − SAL precedenti = periodo − ritenuta − recupero acconto
    − altre detrazioni = **netto**, + IVA = **da pagare**; barra dell'avanzamento totale;
  - **firme:** impresa, committente, direttore dei lavori se c'è.
- Lo stesso schema per il SAL a misura (lotto 5): cambiano solo le colonne della tabella
  (quantità del contratto, precedente, a oggi, prezzo).

### Lotto 5 — Commesse con computo: SAL a misura dalla stessa sezione

- Se la commessa ha un computo contrattuale, «Nuovo SAL» apre il SAL a misura (`lp_sal`) che
  c'è già, invece del verbale a percentuale. Una sola sezione SAL, due motori.
- Prima di esporlo: collaudo completo su un computo vero (libretto → SAL → certificato →
  fattura), perché non è mai stato usato.
- Ritorno sulle fasi: solo se le righe del computo sono assegnate a una fase (da verificare cosa
  c'è oggi per l'abbinamento voce → fase); altrimenti il SAL a misura non tocca le fasi.

### Lotto 6 — Fattura e firma

- «Crea fattura» dal SAL usa il **netto del verbale** e, in modo `sal`, la rata creata dal lotto 3:
  chiude la nota del piano della commessa semplice («la fattura prende la rata, non l'importo del
  SAL»).
- Firma del cliente via link: provata una volta per intero (0 usi finora) prima di proporla.

## Fuori dal piano

- La tabella `sal` vecchia (0 righe): prima di toglierla, verificare chi la usa ancora
  (`silvio_tool_compone_sal_da_rapportini`, `silvio_tool_approva_sal`,
  `silvio_tool_lista_sal_in_attesa`, `silvio-piano-volo`). Silvio deve lavorare su `sal_records`.
- I SAL ricevuti dai subappaltatori (`sal_subappaltatori`) e il SAL dell'appalto verso il
  committente: sono altri flussi, non cambiano.

## Decisioni già prese

- Due modi di pagamento, non di più.
- La % totale non si scrive mai a parte: è il risultato delle voci.
- Il verbale non abbassa mai una fase; la alza solo quando è emesso.
- Due numeri per fase (cantiere e certificato): nessuno dei due sovrascrive l'altro.
- Verbale e certificato in un unico documento.

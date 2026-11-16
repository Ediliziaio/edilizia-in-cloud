# Tesoreria e controllo di gestione: riconciliazioni senza doppi conteggi

Area **C** del piano `docs/piano-ai-addebiti-e-automazioni-20261115.md` (§7.10, §7.15).
Scritto il 15/11/2026 dopo la ricognizione di codice e database. Il documento descrive
cosa c'è, cosa si aggiunge e con quale regola; i numeri vengono da produzione il 15/11.

## 0. Cosa c'è già (e resta)

| Pezzo | Dove | Cosa fa |
|---|---|---|
| Ripartizione di un movimento su più documenti | `riconcilia_movimento_su_documenti`, `bank_conferma_ripartizione`, `scollega_riga_ripartita` | Quote su fatture emesse, scadenze, rate; residui controllati nel database, tutto o niente |
| Lotto di conferme | `bank_conferma_lotto` (richiesta idempotente, lock aziendale, fino a 100 movimenti) | Riusa le funzioni sopra; un errore annulla il lotto |
| Bonifico su fattura / bonifico parlante | `riconcilia_bonifico_fattura`, `riconcilia_bonifico_parlante` | Netto, lordo, ritenuta, commissioni |
| Differenze e commissioni | `private.bank_register_difference` / `bank_reverse_difference` | Commissione o arrotondamento ≤ 1 € come costo pagato, stornabile solo se creato lì |
| Prove di pagamenti già registrati | `bank_associa_pagamenti`, `bank_scollega_pagamento` | Il bonifico diventa prova di un pagamento esistente, senza crearne un altro |
| Annullamento incasso | `annulla_incasso_scadenza`, `bank_scollega_pagamento` | Storno della fonte contabile, storico conservato |
| Proposte | `bank_suggerisci_riconciliazioni` (cron `bank-auto-reconcile`), `bank_proposte_movimento` («Trova corrispondenze») | Importo uguale al residuo + numero o nome nella causale; punteggio con flag `forte` |
| Movimento senza fattura | `chiudi_movimento_senza_fattura` | Crea un costo pagato «senza fattura» oppure chiude «nessun costo» |
| Fatture importate | `private.bank_record_imported`, `bank_external_payment_target` | Residuo locale + write-back con target assoluto |
| Rate fornitori | `rate_fornitori` (fattura_ricevuta_id, company_cost_id) | Piano di pagamento della fattura ricevuta |
| Previsionale di cassa | `src/lib/finance/forecastLedger.ts` (18 fonti, nel browser) | Doppioni marcati `possibleDuplicate` sui collegamenti esatti |
| Economia commessa | `private.office_order_economics_base` → `v_ordine_marginalita`, `economia_commesse(ids)` | Costi da ODA, magazzino, costi diretti e ripartiti, manodopera, SAL subappalto |
| IBAN dei fornitori | `fornitori_iban_storico` (confermato, da chi, quando), `suppliers.iban` | Tabella vuota il 15/11: nessun IBAN confermato |

Numeri del 15/11: 1.733 movimenti in 2 aziende, 181 ancora da collegare, 1.375 abbinamenti
attivi, 0 annullati, 0 proposte aperte; 6.491 scadenze, nessuna previsionale; 579 righe
fattura↔commessa.

### Cosa manca nel motore attuale

1. **Il punteggio compensa.** Un IBAN diverso è solo un avviso: importo + nome + data
   possono ancora fare «forte». Il piano chiede che un conflitto su un dato essenziale blocchi.
2. **Il numero vale da solo.** «FT 12» nella causale vale anche se la fattura 12 è di un
   altro cliente o di un altro anno.
3. **Solo uno a uno.** Cumulativi, parziali, acconti senza fattura, compensazioni con nota di
   credito, giroconti, F24, storni non sono riconosciuti: finiscono «da collegare» senza un perché.
4. **La proposta non si spiega dopo.** In `reconciliation_suggestions` restano solo gli id;
   i motivi si ricalcolano ad ogni apertura e non c'è versione della regola né storia.
5. **Un movimento può creare un costo che c'era già.** `chiudi_movimento_senza_fattura`
   registra una spesa nuova anche se una scadenza aperta dello stesso fornitore, stesso
   importo, è lì da pagare: la commessa conta il costo due volte.
6. **Previsione e fattura convivono.** Una scadenza previsionale non viene chiusa quando
   arriva la fattura vera: oggi non ce ne sono, ma la regola non è scritta.

## 1. Matrice dei flussi (§7.1)

| Flusso | Comportamento attuale | Dati disponibili/mancanti | Parser e regole proposti | AI residua | Eccezioni | Moduli | Priorità | Impegno | Criterio di accettazione |
|---|---|---|---|---|---|---|---|---|---|
| Bonifico in entrata = una fattura | Proposta se importo = residuo e numero o nome in causale; conferma a mano | Causale, nome e IBAN ordinante, numero/anno/cliente del documento, P.IVA nello snapshot; manca un IBAN verificato dei clienti | R-DOC: numero con anno e soggetto, IBAN, nome normalizzato senza forma societaria; esito unico/plausibile/più candidati/conflitto/nessuno | Nessuna | Numero di un altro anno → conflitto; nome di un altro cliente → conflitto | Tesoreria, Fatture emesse, Prima nota | Alta | S | Caso unico e verificato → `automatico`; numero giusto ma anno diverso → `conflitto` |
| Bonifico cumulativo (più fatture) | A mano con la ripartizione | Partite aperte dello stesso soggetto | R-CUMULO: sottoinsieme delle partite aperte dello stesso soggetto (≤ 8 partite, ≤ 256 combinazioni) che somma esattamente | Nessuna | Due combinazioni diverse → `scelta` | Tesoreria, Scadenzario | Alta | M | 400 + 600 = 1.000 → una proposta con due quote; nessun doppio |
| Pagamento parziale / più pagamenti per una fattura | A mano | Residuo del documento | R-PARZIALE: soggetto certo, importo < residuo → proposta di quota parziale | Nessuna | Importo > residuo → resto da qualificare, mai ricavo | Tesoreria, Fatture | Alta | S | Dopo 400 su 1.000 il residuo è 600; il secondo bonifico da 600 è `automatico` |
| Acconto prima della fattura | Finisce «da collegare» | Rate della commessa (`order_installments`) non fatturate, cliente della commessa | R-ACCONTO: soggetto = cliente della commessa, rata non pagata senza fattura, importo uguale → proposta «acconto su rata» | Nessuna | Rata già fatturata → si propone la fattura, non la rata | Commesse, Tesoreria | Media | S | Accredito 2.000 su rata da 2.000 → proposta di tipo `rata`; alla fattura il denaro non si conta due volte (rata pagata = fattura collegata) |
| Compensazione con nota di credito | A mano | NC aperte dello stesso cliente | R-NC: fatture − note di credito dello stesso soggetto = importo | Nessuna | NC di un altro cliente → esclusa | Fatture emesse | Media | S | Fattura 1.000, NC 200, bonifico 800 → proposta con la NC come quota negativa |
| Commissioni e arrotondamenti | `bank_register_difference` ≤ 1 € alla conferma | Differenza importo/residuo | R-DIFF: differenza ≤ 1 € con soggetto certo → proposta con differenza esposta | Nessuna | Oltre 1 € → parziale | Tesoreria, Costi | Media | S | 998 su 1.000 → proposta con differenza 2 € da classificare (non chiude da sola) |
| Rimborsi e storni | Non riconosciuti | Movimento opposto stesso conto, stessa controparte, stesso importo | R-STORNO: movimento di segno opposto entro 60 giorni + parola chiave (storno, rimborso, reso, retrocessione) | Nessuna | Più movimenti originari → `scelta` | Tesoreria | Bassa | S | Accredito 500 dopo un addebito 500 allo stesso IBAN → proposta di storno, nessun ricavo |
| Giroconto | Testo: «l'IBAN di un altro conto segnala un giroconto» | IBAN dei conti dell'azienda | R-GIRO: IBAN controparte = IBAN di un altro conto dell'azienda; gamba opposta ±5 giorni | Nessuna | IBAN di un conto di un'altra azienda → non è giroconto | Tesoreria | Alta | S | Uscita 5.000 da A, entrata 5.000 su B → esito `automatico` natura `giroconto`, nessun costo né ricavo |
| F24 e movimenti senza fattura | `chiudi_movimento_senza_fattura` a mano | Causale (F24, delega, Agenzia Entrate, INPS), scadenze `scadenza_fiscale` | R-F24: causale F24 → scadenze fiscali aperte con lo stesso importo; senza scadenza → da gestire con «componenti F24 mancanti» | Nessuna | F24 a saldo zero, più deleghe stesso giorno → `scelta` | Tesoreria, Contabilità | Media | S | Addebito F24 = scadenza fiscale → proposta; nessun costo di commessa |
| Spesa bancaria senza documento | A mano | Causale (commissioni, canone, bollo, interessi) | R-BANCA: parole chiave → natura `spesa_bancaria`, esito `da_gestire` con suggerimento | Nessuna | — | Tesoreria | Bassa | S | Movimento «canone» → da gestire con la categoria suggerita |
| Pagamento da/a un soggetto diverso | Non distinto | Relazione pagante ↔ intestatario (manca) | R-TERZO: numero giusto ma pagante diverso → conflitto se non c'è un rapporto in `tesoreria_paganti_autorizzati` | Nessuna | Un solo pagamento non crea il rapporto | Tesoreria | Media | S | Senza rapporto → `conflitto`; con rapporto documentato → proposta |
| Movimento che chiude un debito già registrato | Si può creare una spesa nuova | Scadenze di uscita aperte, fornitore, importo | GUARDIA: `chiudi_movimento_senza_fattura` (spesa) rifiuta se esiste un debito aperto unico con lo stesso importo e lo stesso fornitore/IBAN, finché la proposta non è scartata | Nessuna | Proposta scartata → la spesa si può registrare | Tesoreria, Costi, CdG | Alta | S | Scadenza aperta 300 del fornitore X + uscita 300 a X → la spesa nuova è rifiutata |
| Previsione → fattura ricevuta | Nessuna regola | Scadenze `is_previsionale`, fornitore, commessa | REGOLA: `tesoreria_sostituisci_previsione(previsione, reale)`: la previsione si chiude (annullata) per la parte coperta, il resto rimane; collegamento tracciato | Nessuna | Fattura > previsione: previsione chiusa intera; < : residuo aperto | Scadenzario, Previsionale | Media | S | Previsione 1.000 + fattura 800 → previsione residua 200, cassa prevista 1.000 non 1.800 |
| Ripartizione su più commesse | Quote per bonifico (`bank_transaction_contexts`) e per costo (`allocations`) | `fattura_ordine.importo_associato`, `company_costs.allocations`, `scadenze.order_id` | La commessa si ricava dalle partite collegate, in proporzione; se mancano le quote → «ripartizione da completare» | Nessuna | Documento senza commessa → nessuna attribuzione | Commesse, CdG | Alta | S | Bonifico 1.000 su fatture di due commesse 400/600 → commesse 400 e 600 |
| Integrità di cassa e CdG | Controlli sparsi | Tutte le fonti sopra | `cdg_controllo_doppi(azienda)`: sei controlli (sotto) | Nessuna | — | CdG, Tesoreria | Alta | M | Ogni anomalia ha tipo, documenti, importo e cosa fare |
| Retry e concorrenza | Lock aziendale nel lotto | — | Classificazione sotto `pg_advisory_xact_lock`, impronta degli input: stesso input = nessuna nuova riga di storia | Nessuna | — | Tesoreria | Alta | S | Due classificazioni simultanee → una sola riga di esito, una sola riga di storia |

## 2. Gli esiti (regola `tesoreria_classifica_movimento`, versione 1)

Gli esiti sono **cinque** e non si compensano.

| Esito | Quando | Cosa può fare il sistema |
|---|---|---|
| `automatico` | Un solo candidato (o una sola combinazione), importo esatto, identità forte (IBAN verificato, oppure numero+anno **e** soggetto), nessun conflitto | Idoneo alla conferma automatica **se** l'azienda la abilita. Oggi nessuna azienda la ha: resta una proposta «verde» |
| `proposta` | Identità certa ma incompleta (parziale, acconto, differenza, NC, cumulativo), oppure identità debole con importo esatto | Proposta da confermare |
| `scelta` | Più candidati con la stessa forza | L'utente sceglie; ogni alternativa ha i suoi motivi |
| `conflitto` | Un dato essenziale contraddice: IBAN verificato di un altro soggetto, numero di un altro anno, numero del documento con un pagante diverso senza rapporto | Nessun collegamento proposto, il conflitto è scritto |
| `da_gestire` | Nessun candidato | Elenco dei dati mancanti (soggetto, numero, documento) e una natura suggerita (spesa bancaria, F24) |

**Identità** (in ordine di forza): IBAN verificato (`fornitori_iban_storico.confermato`, IBAN
dei conti dell'azienda per i giroconti) → numero del documento con anno compatibile **e**
soggetto → IBAN in anagrafica (`suppliers.iban`, `iban_cliente`) → nome normalizzato
(minuscolo, senza accenti, senza forma societaria: srl, s.r.l., spa, snc, sas, sapa, ss,
scarl, coop) → solo importo (mai sufficiente).

**Numero di documento**: «12/2026», «FT-2026-0012», «2026/12», «n. 12 del 2026» si leggono come
(numero 12, anno 2026). Il numero vale se nella causale c'è come parola intera (non dentro un
IBAN o una cifra più lunga); se nella causale c'è anche un anno vicino e non è quello del
documento, è **conflitto**. Un numero corto (1–2 cifre) senza parola «fattura/ft/fatt/n.»
vicino non vale.

**Commessa**: dalle partite collegate — `fattura_ordine.importo_associato` per le fatture
emesse, `scadenze.order_id` o il costo collegato (`company_costs.order_id` o `allocations`)
per le uscite, `order_installments.order_id` per le rate. Più commesse sullo stesso
documento senza quote → `ripartizione_da_completare`.

**Dove si legge**: `public.tesoreria_esiti` (una riga per movimento: esito, natura, regola,
versione, candidati con motivi, conflitti, mancanti, commesse, impronta), storia in
`public.tesoreria_esiti_storia`. `tesoreria_esito_movimento(azienda, movimento)` la
restituisce; `tesoreria_classifica_movimenti(azienda, limite)` la aggiorna (la chiama anche il
cron `bank-auto-reconcile`).

### Forma per le schermate

```jsonc
{
  "esito": "proposta",            // automatico | proposta | scelta | conflitto | da_gestire
  "natura": "cumulativo",         // documento | cumulativo | parziale | eccedenza | acconto | compensazione_nc
                                  // differenza | giroconto | f24 | storno | spesa_bancaria | spesa_carta
                                  // gia_riconciliato | sconosciuta
  "regola": "R-CUMULO", "versione": 1,
  "motivi": ["Stesso soggetto", "Somma esatta di 2 partite aperte"],
  "conflitti": [],                // testo leggibile, uno per riga
  "mancanti": [],                 // cosa servirebbe per chiudere
  "differenza": 0,                // importo non attribuito (commissione, eccedenza)
  "candidati": [                  // una o più alternative; ognuna è una ripartizione completa
    { "chiave": "...", "forza": "forte|media|debole", "motivi": [...], "conflitti": [],
      "righe": [ { "tipo": "documento|scadenza|rata|movimento", "id": "uuid", "titolo": "FT 12/2026",
                   "controparte": "...", "residuo": 400, "quota": 400,
                   "commesse": [ { "order_id": "uuid", "quota": 400 } ] } ] }
  ],
  "commesse": [ { "order_id": "uuid", "quota": 1000 } ],
  "ripartizione_da_completare": false
}
```

Ogni riga di `righe` si passa così com'è a `bank_conferma_ripartizione` / `bank_conferma_lotto`:
la conferma resta quella esistente, che ricontrolla residui e concorrenza.

## 3. Integrità e controllo di gestione (§7.15)

### Chi alimenta cosa

| Oggetto | Budget | Consuntivo (costo/ricavo di commessa) | Cassa |
|---|---|---|---|
| Ordine (ODA) | Impegno | Sì, finché non c'è la fattura: `marginalita_costo_oda` | No (previsto nel previsionale come impegno) |
| DDT | — | No: movimento fisico; valorizza il magazzino e la copertura ODA | No |
| SAL attivo | Avanzamento | Ricavo maturato | No |
| SAL subappalto | — | `sal_sub_da_fatturare` finché non è fatturato | No |
| Fattura ricevuta / costo | — | Sì, **sostituisce** l'ODA collegato (`purchase_order_id`) | Genera scadenze / rate |
| Fattura emessa | — | Ricavo | Genera scadenze / rate |
| Scadenza (reale) | — | No: è il calendario del debito/credito | Prevista |
| Scadenza previsionale | — | No | Prevista **finché** non è sostituita dalla fattura |
| Movimento bancario | — | **Mai**, tranne commissioni/spese senza documento | Effettiva |
| Allocazione alla commessa | — | Ripartisce il costo/ricavo del documento, non il denaro | Ripartisce il denaro sulla commessa per l'esposizione |

Regole che tengono separati i conteggi:

1. **Un movimento che chiude un debito non crea un costo.** Il pagamento aggiorna il saldo e
   chiude la partita; il costo è già nella fattura/costo. Guardia nel database su
   `company_costs` (`private.tes_spesa_da_banca_non_doppia`): blocca quando il debito aperto è
   verificato (stesso fornitore e importo + numero del documento in causale, oppure IBAN
   verificato del fornitore). Il caso solo plausibile (stesso fornitore e importo) passa,
   finché l'interfaccia non permette di scartare la proposta, e lo segnala `cdg_controllo_doppi`.
2. **La fattura ricevuta sostituisce la previsione** collegata (`tesoreria_sostituisci_previsione`):
   la previsione si riduce dell'importo della fattura, mai sotto zero; il collegamento resta.
3. **La rata della commessa fatturata è la fattura**: il previsionale già la marca doppione
   quando la fattura è sulla rata; l'acconto prima della fattura si collega alla rata, e
   quando la fattura arriva sulla stessa rata il denaro è già lì.
4. Ogni collegamento conserva azienda, documenti e righe, importi, regola, prove, chi, quando,
   stato e storia: `bank_reconciliations` (quote, `matched_by`, `matched_at`, `unmatched_at`,
   `unmatch_reason`) + `tesoreria_esiti` / `_storia` (regola, versione, prove). Le colonne
   `regola` e `prove` si aggiungono a `bank_reconciliations` e le compila un trigger dalla
   proposta in vigore al momento della conferma.

### `cdg_controllo_doppi(azienda)`

| Controllo | Cosa trova |
|---|---|
| `movimento_oltre_importo` | Quote attive di un movimento che superano il suo importo |
| `documento_oltre_totale` | Incassi di una fattura emessa oltre il totale da pagare |
| `spesa_da_banca_su_debito_aperto` | Spesa creata da un movimento mentre un debito aperto dello stesso fornitore e importo aspettava quel pagamento |
| `previsione_non_sostituita` | Scadenza previsionale aperta con una scadenza reale dello stesso fornitore e commessa |
| `prima_nota_doppia` | Due righe di prima nota non stornate per lo stesso movimento e lo stesso documento |
| `allocazioni_non_100` | Costo con ripartizione su commesse che non somma a 100% |

## 4. Dati storici

Prima l'anteprima, poi i lotti. `tesoreria_classifica_movimenti` scrive solo nelle tabelle
degli esiti (nessun pagamento, nessun costo, nessuna modifica ai movimenti) a lotti di 100
con `lock_timeout` 3 s e `statement_timeout` 60 s. Anteprima del 15/11: vedi §6.

## 5. Decisioni per il titolare

1. ~~**Conferma automatica**~~ — deciso il 15/11/2026: un interruttore per azienda, **comune a
   tutti i collegamenti**, spento di base (lo costruisce la sessione Acquisti). Acceso: l'esito
   «unico e verificato» si collega da solo; spento: è una proposta da confermare con un clic.
2. **Soglia delle differenze**: oggi 1 € per commissioni e arrotondamenti. Resta così?
3. ~~**IBAN verificati dei clienti**~~ — fatto nel lotto 4: registro per chiave fiscale, confermato
   da una persona su un incasso già collegato, mai dedotto da un solo pagamento.

## 6. Stato dei lotti

### Lotto 1 — motore degli esiti, guardie, controllo dei doppi (15/11/2026)

Migrazioni `20290404310000_tesoreria_esiti_riconciliazione`,
`20290404311000_tesoreria_esiti_regole_dati_veri` e `20290404312000_tesoreria_guardia_solo_se_verificato`
(guardia ristretta ai casi verificati, intermediari solo con nomi interi), applicate e riallineate; cron
`bank-auto-reconcile` che dopo le proposte di sempre registra anche gli esiti.

| Funzione | Cosa fa | Chi |
|---|---|---|
| `tesoreria_classifica_movimento(azienda, movimento)` | Esito calcolato ora, senza scrivere | lettura tesoreria |
| `tesoreria_classifica_movimenti(azienda, limite, anteprima)` | Registra gli esiti a lotti (≤ 500), lock aziendale, impronta: un retry non scrive niente | riconciliazione (o servizio) |
| `tesoreria_esito_movimento(azienda, movimento)` | Esito registrato + storia | lettura tesoreria |
| `tesoreria_scarta_esito(azienda, movimento, motivo)` | Scarta con motivo; resta nella storia | riconciliazione |
| `tesoreria_sostituisci_previsione` / `tesoreria_annulla_sostituzione` | Regola previsione → fattura, idempotente e annullabile | gestione scadenze |
| `cdg_controllo_doppi(azienda)` | I sei controlli del §3 | CdG o tesoreria |

Trigger: `tes_spesa_da_banca_non_doppia` (company_costs), `tes_previsione_da_reale` (scadenze),
`tes_quota_eredita_prove` (bank_reconciliations: colonne nuove `regola`, `prove`).

**Anteprima e registrazione sui dati veri** (181 movimenti da collegare, 2 aziende):

| Azienda | Esiti |
|---|---|
| Demo Azienda 2 (24) | 3 proposte (2 giroconti, 1 eccedenza), 2 scelte (parziali), 19 da gestire |
| Azienda cliente (157) | 157 da gestire: 62 acquisti con carta senza ricevuta, 40 uscite senza partita aperta, 31 spese bancarie (di cui 14 con un intermediario al posto del pagante), 10 incassi senza documento, 12 con solo l'importo che coincide, 2 F24 senza scadenza fiscale |

Il motore non collega niente sull'azienda cliente perché i documenti non ci sono: gli
incassi citano i codici di cantiere del cliente (es. «rif MMxxx»), che nel gestionale non
esistono; le uscite vanno a fornitori senza fattura registrata. È un dato mancante, non
una regola mancante. La prima anteprima aveva trovato un falso conflitto («del 26 05 2026»
letto come fattura 26 e 5): corretto nella seconda migrazione, con il test.

Esiti registrati a lotti da 100 (scrivono solo `tesoreria_esiti` e `_storia`); il secondo
giro su Demo Azienda 2 ha cambiato 0 righe. `cdg_controllo_doppi` sulle aziende con banca e
sulle otto con più costi: un rilievo, un costo ripartito su commesse che non arriva al 100%
(2.055,17 €).

**Test**: `src/test/security/tesoreriaEsitiRiconciliazione.test.ts` (PGlite, 50 casi; UI `impostazioniAutomazioni.test.tsx`):
unico verificato, anno diverso, pagante terzo con e senza rapporto, scelta, cumulativo,
parziale e saldo, acconto prima della fattura e poi fatturato, nota di credito, commissione
sotto e sopra 1 €, giroconto e non-giroconto, F24, storno, spesa bancaria, acquisto con
carta, solo importo, IBAN verificato di un altro fornitore, ripartizione su più commesse e
ripartizione da completare, abbinamento annullato, isolamento fra aziende, nessuna scrittura
di denaro, anteprima/retry/simultaneità, eredità delle prove, costo doppio bloccato,
previsione sostituita/annullata/chiusa, previsioni ambigue, controlli, guardia verificata contro
plausibile, fornitore col nome di una banca.

Nota: il trigger `tes_previsione_da_reale` riduce da solo la previsione quando arriva una
scadenza reale dello stesso fornitore e della stessa commessa e la previsione aperta è una sola;
la riduzione è tracciata in `scadenze_sostituzioni` e si annulla.

### Lotto 2 — conferma automatica con l'interruttore comune (15/11/2026)

Migrazioni `20290404313000` … `20290404316000_tesoreria_conferma_con_interruttore_comune`,
applicate e riallineate.

- **Interruttore**: quello comune a tutti i collegamenti, `company_governance_settings.collegamento_automatico`
  (sessione Acquisti, Impostazioni → Approvazioni e avvisi), spento di base, letto con
  `azienda_collegamento_automatico(azienda)`. La tesoreria non ne ha uno suo (quello creato per
  la prova del 15/11 è stato tolto in `…315000`).
- **Acceso**: il giro `tesoreria_conferma_automatica(azienda, limite)`, chiamato dal cron dopo la
  classificazione, conferma da solo gli esiti `automatico`. **Spento**: lo stesso esito resta una
  proposta, che si conferma con un clic con `tesoreria_conferma_esito(azienda, movimento)`.
  Gli altri esiti non cambiano.
- **Per conto di chi**: giro lanciato da una persona → a suo nome; giro del cron → a nome del
  titolare dell'azienda (`companies.titolare_user_id`). Valgono i permessi di quella persona;
  senza titolare o senza permesso il giro si ferma e lo dice. Le quote del giro sono
  `match_type='auto'` (evento `confermato_auto`), quelle del clic `manual` (`confermato_clic`).
- **Cosa si conferma** (`private.tes_conferma_una`): solo un esito **ricalcolato in quel momento**
  che sia `automatico`, con un solo candidato «forte», senza conflitti, che copre esattamente il
  residuo; mai uno scartato. Nature: `documento` (incassi di fatture emesse **native**; le
  importate restano manuali per il write-back verso il gestionale esterno) e `giroconto` (chiude
  le due gambe come «nessun costo»). Passa dalle funzioni di sempre (`bank_conferma_ripartizione`
  → `riconcilia_movimento_su_documenti`, `chiudi_movimento_senza_fattura`).
- **Demo Azienda 2**: interruttore comune **acceso** il 15/11/2026 su richiesta del titolare
  (vale anche per gli acquisti). Non ha un titolare indicato: il cron risponde «fermata» e le
  conferme partono quando qualcuno con il permesso apre la tesoreria.
- **Prova fatta su Demo Azienda 2**: bonifico simulato di 3.105,60 € «saldo fattura FT-2026-30204»
  sul conto «DEMO · 2026 · Conto simulato» → esito `automatico` → confermato: fattura pagata, una
  riga di prima nota, nessun costo creato, movimento riconciliato; secondo giro senza conferme.
  Trovato e corretto lì: la quota diceva «manuale» perché la conferma vera la scrive sul
  movimento di cassa, non sull'id della fattura (`…314000`).

### Lotto 3 — traccia comune e riga nelle Automazioni (15/11/2026)

Migrazione `20290404317000_tesoreria_traccia_comune_e_stato`.

- **Traccia comune**: ogni conferma vera (automatica o con un clic) si registra anche in
  `acquisti_collegamenti` con `acquisti_collegamento_registra`: `movimento_banca → documento_fiscale`
  (incasso) o `movimento_banca → movimento_banca` (giroconto), importo, regola `tesoreria:R-…`,
  esito `automatico` o `manuale`, prove nel formato comune (`private.tes_prove_comuni`: IBAN
  verificato e numero del documento *identificano*, controparte e importo *confermano*, data è
  *indizio*). Mai prima della conferma: il popup comune non deve mostrare «collegato» senza il
  pagamento registrato. Se la traccia rifiuta (chi conferma non ha il permesso acquisti),
  l'incasso resta registrato e la storia dell'esito lo annota (`traccia[].non_registrato`).
- **Impostazioni → Automazioni**: riga «Incassi e giroconti dalla banca» (`incassi-giroconti-banca`,
  area Tesoreria) in `registroAutomatismi.ts`, con lo **stesso** interruttore del collegamento
  automatico (`useStatoCollegamento`, esportato) e l'ultimo esito da
  `tesoreria_stato_automatismo(azienda)` (`src/hooks/useUltimoEsitoTesoreria.ts`): prima un
  errore dell'ultimo giro, poi i movimenti certi in attesa, poi l'ultima conferma. Chi non vede
  la tesoreria riceve «nessun esito».

### Lotto 4 — IBAN verificati dei clienti e pagante terzo (15/11/2026)

Migrazione `20290404318000_tesoreria_iban_clienti_e_paganti`.

- `tesoreria_iban_verificati`: IBAN del cliente per **chiave fiscale** (P.IVA o CF con
  `partner_tax_key`; su 6.564 fatture 4.861 la hanno, solo 737 hanno l'anagrafica). Si scrive solo
  con `tesoreria_ricorda_iban_cliente(azienda, movimento, fattura)`, da una persona, su un incasso
  **già collegato** a quella fattura; si revoca con `tesoreria_revoca_iban_cliente`. Nel motore
  identifica il cliente (anche senza nome nella causale) e, se è verificato per un altro cliente
  e non per questo, è **conflitto**.
- Pagante terzo: `tesoreria_registra_pagante(azienda, intestatario, pagante, iban, prova)` (prova
  obbligatoria) e `tesoreria_revoca_pagante`. Elenco per le schermate:
  `tesoreria_riferimenti_verificati(azienda)`.

### Lotto 5 — note di credito ricevute e F24 su più scadenze (15/11/2026)

Migrazione `20290404319000_tesoreria_note_ricevute_e_f24_multiple`.

- **Nota di credito ricevuta non ancora collegata** (`fatture_ricevute` TD04 o `passive_credit_note`
  senza riga in `note_credito_storni`): candidato delle uscite solo come quota negativa in una
  compensazione dello stesso fornitore → proposta R-NC («fattura 1.000 − nota 200 = bonifico
  800»). Non si conferma da sola: la nota si collega con `nota_credito_collega`, che riduce la
  rata; dopo, la nota esce dai candidati e il bonifico è il residuo esatto (niente doppio sconto).
- **F24 su più scadenze fiscali**: senza una scadenza dell'importo esatto, la combinazione di
  scadenze fiscali aperte (fino a 8, entro 20 giorni) che lo somma → proposta; più combinazioni →
  scelta. Una riga per componente, mai su una commessa.
- Anteprima sui 181 movimenti veri: nessun esito cambia.

### Lotto 6 — incassi di fatture importate (15/11/2026)

Migrazione `20290404320000_tesoreria_conferma_importate`; `bank-auto-reconcile` e il pulsante
«Conferma» di `EsitoMovimento.tsx`.

- La conferma (automatica o con un clic) vale anche per le fatture **importate** da un gestionale
  esterno: riga `invoice` a `riconcilia_movimento_su_documenti`, poi `private.bank_record_imported`
  (residuo locale e registro delle quote importate), come la conferma in lotto.
- Il risultato porta `esterne`: il cron chiama `billing-payment-push` in modo interno con
  `allinea_banca`, il pulsante usa `syncBankExternalPayments`. Il gestionale si allinea al valore
  **assoluto** calcolato dal server (`bank_external_payment_target`): un retry non somma due volte;
  se non risponde, il pagamento locale resta e l'errore lo dice.
- Traccia comune: `a_tipo = fattura_emessa`.

### Lotto 7 — controllo di gestione sui dati veri (15/11/2026)

Migrazioni `20290404321000_cdg_controllo_doppi_ordini_e_rate` e `20290404322000_cdg_incassi_oltre_totale_affinato`.

Verificato prima, sui dati veri:
- **Impegno e consuntivo**: `marginalita_costo_oda` conta il massimo fra ordinato e fatturato, non
  la somma; i costi con l'ordine escono dai costi diretti. Nessun doppio.
- **Cassa prevista**: un costo con scadenze **e** rate fornitore esce dalle scadenze, le rate sono
  ignorate (`forecastLedger`). Nessun doppio in cassa.

Controlli aggiunti a `cdg_controllo_doppi`:
- 7. `fattura_su_ordine_e_su_commessa`: fattura collegata a un ordine (anche via
  `fattura_ricevuta_ordini`) col costo sulla commessa ma senza l'ordine → contata due volte.
  0 casi.
- 8. `scadenza_e_rata_sullo_stesso_costo`: due calendari aperti sullo stesso costo (la cassa ne usa
  uno, ma possono divergere). 1 caso, 335,40 €.
- 2. `documento_oltre_totale` affinato: sotto 1 € non si segnala (erano 47 arrotondamenti di
  fatture importate); «incassato il lordo» dice che la ritenuta è finita fra gli incassi.

Rilievi del 15/11 su tutte le aziende: 1 fattura incassata per il lordo (7.333,37 €), 1 costo con
due calendari (335,40 €), 10 costi ripartiti su una commessa per meno del 100% (277.124,08 €: nove
sono ripartizioni parziali volute su una sola commessa, il resto resta spese generali; uno è un
arrotondamento da 0,82 €). Nessuna correzione automatica: sono dati da sistemare a mano.

### Lotto 8 — schermate (15/11/2026)

Migrazione `20290404323000_tesoreria_ricorda_iban_dalla_quota`. La sessione «Fatture, Scadenzario e
Tesoreria» ha lasciato le schermate a questa area.

- **Dettaglio movimento → Fatture e pagamenti**: su un incasso con l'IBAN dell'ordinante, ogni
  fattura collegata ha «Ricorda questo IBAN» (`tesoreria_ricorda_iban_da_quota`, che risale alla
  fattura dalla quota, anche importata).
- **Esito → conflitto «pagante diverso»**: «Registra il rapporto» apre il modulo già compilato con
  pagante, intestatario e IBAN; la prova è obbligatoria (`tesoreria_registra_pagante`).
- **Tesoreria → Impostazioni → Riferimenti verificati** (`RiferimentiVerificati.tsx`): IBAN dei
  clienti e rapporti coi paganti, con revoca e aggiunta; chi non riconcilia vede soltanto.
- **Controllo di gestione → Controllo dei dati → «Niente contato due volte»**
  (`ControlliDoppiCard.tsx`): i rilievi di `cdg_controllo_doppi` con titolo, importo e cosa fare.
- Test: `src/test/ui/tesoreriaRiferimentiVerificati.test.tsx`.

### Revisione finale (15/11/2026)

Migrazione `20290404324000_tesoreria_revisione_finale`: ogni funzione toccata è ridefinita per
intero, quindi si può rilanciare. Undici difetti trovati in revisione, tutti verificati veri:

1. **Scarto legato al candidato**: `tesoreria_esiti.scartato_chiavi` ricorda i candidati scartati.
   Il ricalcolo toglie lo scarto solo se compare un candidato nuovo; un candidato scartato non si
   conferma mai, né dal cron né col clic.
2. **R-DOC automatico solo senza conflitti**: se un altro candidato è in conflitto (per esempio un
   IBAN verificato di un altro cliente) l'esito è «proposta»; la conferma rifiuta esiti con conflitti.
3. **Le uscite «automatico» non si confermano da qui**: giro, «in attesa» e pulsante «Conferma»
   considerano solo incassi e giroconti. R-GIRO non propone gambe già chiuse, riconciliate o con quote.
4. **Guardia sul costo doppio**: blocca il caso verificato (residuo esatto + IBAN confermato o numero
   in causale); se il fornitore, scelto o riconosciuto dall'IBAN del movimento, ha un debito aperto
   con residuo ≥ importo, **avvisa senza bloccare**. Il controllo 3 di `cdg_controllo_doppi` trova
   anche i pagamenti parziali e le spese senza fornitore (dall'IBAN).
5. **Previsioni**: a interruttore spento la sostituzione resta una proposta (`scadenze_sostituzioni.stato
   = 'proposta'`, previsione invariata) e il controllo 4 dice di confermarla. Se la scadenza reale
   viene annullata o cancellata, la previsione torna com'era (trigger `tes_reale_sparita`, FK
   `ON DELETE SET NULL`); non scatta durante la purga di un'azienda.
6. **Fatture importate**: il motore emette righe `invoice`; dal Dettaglio movimento le alternative si
   confermano con `tesoreria_conferma_alternativa` (conferma + `bank_record_imported`).
7. **Gestionale esterno non allineato**: un write-back fallito si segna in
   `tesoreria_riallineo_esterno` (`tesoreria_riallineo_segna`) e il cron `bank-auto-reconcile` lo
   ritenta a ogni giro (fino a 20 volte), poi lo chiude con `tesoreria_riallineo_risolto`.
8. **Migrazioni a sostituzione di testo** (312, 318, 319, 322): rilanciate a mano non applicano due
   volte le sostituzioni (controllo sul testo già presente).
9. `payment_source` letto con `tes_uuid` (un valore non uuid non rompe più); IBAN della controparte
   anche da `counterparty_iban`, nel motore e in «Ricorda questo IBAN»; il pannello CdG tace solo
   senza permesso (42501) e mostra gli altri errori; i moduli del pagante hanno id distinti.
10. **Uscite**: il conflitto parla di «beneficiario» e il modulo si precompila con l'IBAN del
    beneficiario, non con quello dell'azienda.
11. **Pagante senza doppioni** (indice unico, la seconda registrazione restituisce la prima);
    l'anteprima della classificazione è riservata a chi può riconciliare.

Verifica: 22 funzioni in produzione con impronta uguale al file; classificazione di tutti i 1.566
movimenti di Demo Azienda 2 senza errori. Test: `tesoreriaEsitiRiconciliazione.test.ts`
(«Revisione finale»), `esitoMovimento.test.tsx`, `tesoreriaRiferimentiVerificati.test.tsx`.

### Copertura del §7.10, §7.15 e §7.18 (15/11/2026)

| Caso | Dove | Test |
|---|---|---|
| Pagamento cumulativo e parziale | R-CUMULO, R-PARZIALE | cumulativo; parziale poi saldo |
| Acconto prima della fattura | R-ACCONTO (rata della commessa) | acconto, poi fatturato |
| Nota di credito emessa / ricevuta | R-NC (lotti 1 e 5) | compensazione emessa e ricevuta |
| Commissioni e differenze | R-DIFF (≤ 1 €), poi parziale | commissione sotto e sopra 1 € |
| Rimborsi e storni | R-STORNO | storno |
| Giroconti | R-GIRO, conferma delle due gambe | giroconto; IBAN di un'altra azienda |
| F24 e movimenti senza fattura | R-F24 (una o più scadenze fiscali), spesa bancaria, carta | F24 singolo e multiplo; spesa bancaria; carta |
| Pagante diverso | rapporto documentato (lotto 4) | pagante con e senza rapporto, revoca |
| IBAN verificati | fornitori (esistente) e clienti (lotto 4) | IBAN di un altro fornitore/cliente; conferma e revoca |
| Ripartizione su più commesse | `tes_commesse_riga` | due commesse; ripartizione da completare |
| Movimento che chiude un debito non crea un costo | guardia su `company_costs` | numero in causale blocca, plausibile passa e si segnala |
| Previsione sostituita dalla fattura | `tes_sostituisci_previsione`, trigger | sostituita, annullata, chiusa; due previsioni |
| Budget, consuntivo e cassa senza doppi | `cdg_controllo_doppi` (8 controlli) | controlli 1–8 |
| Retry e simultaneità | impronta, lock aziendale, chiave della traccia | anteprima/retry; giro ripetuto; conferma ripetuta |
| Annullamento | coppie annullate escluse; sostituzione annullabile | abbinamento annullato |
| Isolamento fra aziende | `bank_operativa_access`, documenti dell'azienda | isolamento |
| Conferma automatica e con un clic | interruttore comune, `tesoreria_conferma_esito` | spento/acceso, cron/persona, clic, permesso perso |
| Fatture importate | conferma + `allinea_banca` | importata con «esterne» |

### Lotto 9 — punti aperti decisi il 16/11/2026

Migrazioni `20290417100000` … `20290417100400`, applicate e riallineate (piano
`docs/piano-punti-aperti-20261116.md` §3, §4, §5, §10).

- **R-CODICE dentro R-DOC/R-PARZIALE**: `private.tes_codici_in_causale` trova le commesse il cui
  codice del committente (`orders.codici_committente`, `riferimento_committente`, o dalla
  descrizione del lavoro se vuoti) è nella causale di un incasso; `private.tes_ordini_riga` dice la
  commessa del candidato. Codice + soggetto → forte; solo codice → media. Codice senza partite:
  il «mancante» lo dice. Sui 182 movimenti aperti del 16/11 nessun esito è cambiato (nessuna
  commessa ha ancora codici); 28 ms per incasso.
- **Soglia della banca per azienda**: `private.soglia_banca_differenza` in R-DIFF, nella finestra
  dei conflitti e in `bank_register_difference`.
- **Costi annullati**: esclusi dai controlli 3, 6 e 7 di `cdg_controllo_doppi`; `cdg_da_verificare`
  aggiunge a ogni rilievo i documenti da aprire.
- **Prove su Demo Azienda 2** (transazioni annullate): annullo con scadenza e rata, modifica
  bloccata, ripristino; pagamento in prima nota che blocca, storno e poi annullo (prima nota con
  le due righe); codici dal campo e dalla descrizione, con e senza il nome del cliente, parziale,
  doppioni (due fatture uguali sulla stessa commessa → scelta); soglia 1 € contro 5 €.
- **Incidente**: la prima versione della riga «codice senza partite» usava alias che in
  `tes_classifica` sono variabili; per circa un minuto la classificazione degli incassi senza
  partite dava errore. Corretta in `…100150`.

### Cosa resta, e perché

1. ~~**Codici di cantiere del cliente nelle causali**~~ — fatto nel lotto 9: vanno scritti sulle
   commesse dell'azienda cliente (o nella descrizione del lavoro); il motore poi li usa da solo.
2. **Acconti versati ai fornitori prima della fattura**: oggi non c'è dove registrarli (né sul
   costo né sull'ordine), quindi un'uscita di acconto resta «da gestire». Va deciso dove vive
   l'anticipo al fornitore (sull'ordine d'acquisto, area Acquisti).
3. **Rilievi sui dati veri** (`cdg_controllo_doppi`): una fattura incassata per il lordo
   (7.333,37 €), un costo con due calendari (335,40 €), nove ripartizioni parziali su una commessa
   da confermare come volute. Si sistemano a mano, nessuna correzione automatica.
4. **Titolare di Demo Azienda 2**: non indicato, quindi il cron non conferma da solo lì;
   conferma chi apre la tesoreria.
5. **Prova a schermo** delle tre schermate nuove (sotto): verificate con i test dell'interfaccia,
   non ancora aperte nell'app con un utente vero.

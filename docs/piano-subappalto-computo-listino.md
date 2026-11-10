# Contratti di subappalto dal computo e dal listino della ditta — piano (versione 2)

Versione 1 e versione 2 scritte il 10/11/2026. **Stato: Florin ha approvato il piano e le
proposte delle 8 domande il 10/11/2026; fatti i lotti 1, 2 e 3** (migrazioni `20290213100000`,
`20290213180000/180100/180200`, `20290213190000/190100/190200`, `20290213200000` dopo la revisione, applicate e riallineate).

La versione 2 aggiunge:
- l'impostazione concreta: schermate, dati e regole;
- i rischi e i difetti prevedibili, ognuno con la sua difesa;
- l'elenco di ciò che si riusa, per non creare doppioni.

Rispetto alla versione 1 cambiano tre scelte:
1. una voce **non** si duplica per dividerla fra due ditte;
2. gli abbinamenti ricordati usano una tabella che esiste già (`product_aliases`);
3. le unità di misura si normalizzano prima di ogni confronto.

---

## 0. In una riga

**Il computo dice cosa si fa e a quanto si vende. Il listino della ditta dice a quanto lo fa lei.
L'affidamento dice chi fa cosa. Il contratto è la fotografia firmata dell'affidamento.** Ogni
informazione vive in un posto solo; tutto il resto la legge o la fotografa.

---

## 1. La richiesta, e cosa c'è già

Florin, 10/11/2026: nel contratto con il subappaltatore deve uscire la tabella delle fasi e
sottofasi che fa lui, dal computo, con quantità e misure. Ogni ditta fa le sue fasi **a meno del
venduto**, partendo dal **suo** listino. Va capito come impostare il listino del subappaltatore
per manodopera e servizi.

**Era già stato chiesto in parte, da Dimora Torino, tra il 29 e il 31/10.** Cosa è stato
costruito:

| Cosa | Dove |
|---|---|
| Pannello «Ditte e contratti» nella commessa | `DitteContrattiCommessa.tsx` |
| Contratto con l'Allegato A dalle fasi, prezzi modificabili prima di salvare | commit 8c077c793, bb7db1e54 |
| Prezzo «concordato con la ditta», cioè la variante di costo della voce di listino per quella squadra | f44e71fb3, `costoDitta.ts` |
| Quadro misure, SAL, variante dell'importo | 6bc94db8e, fc80d8300 |
| Voce propria di una squadra nel listino | migrazione 20280901100000 |
| Commessa dal computo: capitolo = fase, voce = sottofase | 4242fe27b |

**Cosa manca:**
- si affida solo la fase intera, senza controllo sui doppi affidamenti e senza l'elenco di cosa
  resta da affidare;
- il listino della ditta lo usa solo la Demo 2 (66 righe), non ha una pagina sua né un import,
  ed è legato alla squadra. Bonarrigo, per esempio, ha 0 squadre;
- le voci del computo non hanno la voce di listino: 1.143 voci senza nessun costo, Bonarrigo
  1.109 voci e 8,4 M€ venduti con costo 0;
- il corrispettivo non è la somma della tabella;
- venduto e margine non si vedono mentre si prepara il contratto;
- le righe del contratto non sanno da quale voce vengono (0 su 171).

I numeri completi sono nella sezione 6.

---

## 2. L'impostazione proposta

### 2.1 Come lo usa l'impresa: quattro schermate

**① Scheda subappaltatore → linguetta «Listino».** Si tiene una volta sola per ditta e vale per
tutte le commesse.

```
 Listino di ROSSI SRL                       valido dal 01/11/2026  [Carica Excel/PDF] [+ Voce sua]
 ┌────────────────────────────────┬──────┬─────────────┬──────────────┬─────────┐
 │ Voce (listino aziendale)       │ U.M. │ Costo nostro│ Prezzo Rossi │ Origine │
 ├────────────────────────────────┼──────┼─────────────┼──────────────┼─────────┤
 │ Intonaco civile                │ mq   │ 15,00       │ 14,00        │ Excel   │
 │ Rasatura                       │ mq   │  8,00       │  —           │         │  ← vuoto = non ha prezzo
 │ ★ Punto luce (voce sua)        │ pz   │  —          │ 38,00        │ a mano  │
 └────────────────────────────────┴──────┴─────────────┴──────────────┴─────────┘
 [ ] solo con prezzo     Storico: listino 2025 (chiuso il 31/10/2026)
```

**② Commessa → Fasi → «Chi fa cosa».** È l'albero del computo.

```
 Venduto 100.000 · affidato 72.400 a 3 ditte · margine 27,6% · SENZA DITTA 0        [Filtra: senza ditta]
 ☐ ▸ 1 DEMOLIZIONI                          venduto 12.000   ROSSI      8.900   26%
 ☑ ▾ 2 INTONACI                             venduto 18.000   ⚠ 2 ditte
 ☑     2.1 Intonaco civile   420 mq  ×28,5  venduto 11.970   ROSSI 300 mq · BIANCHI 120 mq
 ☑     2.2 Rasatura          420 mq  ×14,3  venduto  6.030   — senza ditta —
 ────────────────────────────────────────────────────────────────────────────────────────
 2 voci selezionate   [Affida a… ▾]  [Dividi quantità…]  [Togli ditta]
```

Venduto e margine compaiono solo a chi ha il permesso sui costi. Chi non ce l'ha vede le voci e
le ditte senza cifre.

**③ «Prepara contratto» su una ditta.** È la finestra che c'è già (`ElencoLavoriDialog`), con le
righe prese dagli affidamenti.

Per ogni riga si vedono:
- il prezzo con il pallino d'origine: listino ditta, voce sua, costo nostro o a mano;
- a destra, solo all'interno, venduto e margine.

«Ricorda nel listino di Rossi» salva il prezzo corretto. Il salvataggio scrive il contratto in
bozza; il corrispettivo è la somma delle righe, calcolato dal database.

**④ PDF e firma.** Il PDF ha la tabella «Lavori affidati» per fase, con il totale di ogni fase.
All'invio per la firma il contratto si fotografa. Alla firma nasce il quadro misure, e da lì
partono misure, SAL e il costo per fase nella commessa.

### 2.2 I dati: una sola fonte per ogni cosa

| Informazione | Dove vive (l'unica fonte) | Chi la legge o la fotografa |
|---|---|---|
| Cosa si fa, quantità, venduto | `order_work_phase_voci` (esiste) | tutto |
| L'elenco delle lavorazioni dell'impresa | `tariffe_aziendali` (esiste) | listino della ditta, abbinamenti |
| Il prezzo della ditta su una voce | `tariffa_costi_varianti` (esiste) + **`subappaltatore_id`** | affidamento (proposta di prezzo) |
| La voce che ha solo quella ditta | `tariffe_aziendali` con **`subappaltatore_id`** (esiste per squadra) | come sopra |
| Voce del computo ↔ voce di listino | `order_work_phase_voci.tariffa_id` (esiste) | prezzo della ditta |
| Abbinamento ricordato per la prossima volta | **`product_aliases`** (esiste, vuota: c'è già la colonna `tariffa_id`) | abbinamento automatico |
| Chi fa cosa, e a che prezzo | **`subappalto_affidamenti`** (NUOVA, l'unica tabella nuova) | contratto, ditta sulla fase, margini |
| La ditta sulla fase (calendario, app, costo previsto) | `order_external_teams` (esiste) | **calcolata** dagli affidamenti, mai scritta a mano accanto a loro |
| Il contratto firmato | `contratti_subappalto.elenco_lavori` (esiste) | fotografia, mai riscritta dopo l'invio |
| Cosa si misura dopo la firma | `subappalto_quadri_lavori` (esiste) | misure e SAL; la revisione 1 nasce dalla fotografia |
| La ditta | `subappaltatori`, l'anagrafica (esiste) | squadra, scheda sicurezza e fornitore puntano a lei |

**La tabella nuova `subappalto_affidamenti`:**

```
id, company_id, order_id
voce_id            → order_work_phase_voci   ON DELETE RESTRICT (vedi rischio R6)
subappaltatore_id  → subappaltatori (anagrafica)
contratto_id       → contratti_subappalto (vuoto finché non c'è il contratto)
quantita           numeric(14,3)  > 0
prezzo_unitario    numeric(12,4)  senza IVA
origine_prezzo     listino_ditta | voce_ditta | costo_aziendale | manuale
variante_id        → tariffa_costi_varianti (il prezzo usato, per sapere da dove)
comprende          posa | fornitura_e_posa        (vedi rischio R9)
stato              bozza | a_contratto | revocato
creato_da, creato_il, aggiornato_il
```

Il venduto **non** si scrive qui: si legge dalla voce, protetta dal permesso sui costi (rischio
R10).

**Le funzioni:** tutte nascono chiuse (`REVOKE … FROM PUBLIC, anon`) e controllano il permesso
sull'azienda della commessa.
- `affida_voci(order, voci[], subappaltatore, quantita?)`: in un colpo solo, e blocca le voci
  mentre lavora.
- `dividi_affidamento(id, quantita)`.
- `revoca_affidamento(id)`: solo se non è a contratto.
- `prepara_elenco_contratto(order, subappaltatore, data)`: le righe con il prezzo proposto e la
  sua origine.
- `margini_affidamenti(order)`: venduto e margine, solo con il permesso sui costi.
- `listino_ditta_salva(subappaltatore, righe[], valido_dal)`: chiude il listino vecchio e apre
  il nuovo.

**Le colonne aggiunte a tabelle esistenti:**
- `subappaltatore_id` su `tariffa_costi_varianti` e su `tariffe_aziendali`;
- `voce_id` e `affidamento_id` nelle righe di `elenco_lavori` e del quadro: è jsonb, quindi
  nessuna migrazione di schema;
- il valore `contratto` per `order_external_teams.costo_origine`.

### 2.3 Le regole, scritte come si controllano

1. **Una voce non si affida mai per più della sua quantità.** La somma delle quantità affidate
   e non revocate deve restare ≤ alla quantità della voce. Il controllo sta nel database, con
   la riga della voce bloccata (`FOR UPDATE`) mentre si scrive.

   È questa la «divisione fra due ditte»: 300 mq a Rossi e 120 a Bianchi. **La voce resta
   una**, il venduto non raddoppia, la sottofase non si tocca. Il database ammette **una sola
   voce per sottofase** (indice unico `order_work_phase_voci_sottofase_key`), quindi duplicare
   la voce, come diceva la versione 1, avrebbe rotto quell'indice.
2. **Il prezzo proposto si cerca in quest'ordine:**
   1. prezzo della ditta valido alla data del contratto;
   2. voce propria della ditta;
   3. costo aziendale, con l'avviso «non è un prezzo della ditta»;
   4. a mano.

   La proposta automatica si usa solo se **l'unità combacia** dopo la normalizzazione.
3. **Il corrispettivo è la somma delle righe arrotondate al centesimo, riga per riga.** È lo
   stesso conto nel database, nella finestra e nel PDF.
4. **Dopo l'invio per la firma il contratto non cambia.** Si cambia solo con una variante, che
   apre una nuova revisione del quadro e aggiorna gli affidamenti nello stesso passaggio.
5. **Un listino nuovo della ditta non cambia nessun contratto esistente.**
6. **Il venduto e il margine non escono mai dall'interno**: né nel PDF, né nel contratto, né
   nella fotografia, né all'app del subappaltatore.

---

## 3. Niente doppioni: cosa si riusa e cosa NON si crea

| Tentazione | Perché no | Al suo posto |
|---|---|---|
| Una tabella «listino subappaltatori» | duplicherebbe `tariffe_aziendali` + `tariffa_costi_varianti`, e due listini divergono | le due tabelle esistenti, con `subappaltatore_id` |
| Una tabella «abbinamenti voce→listino» | `product_aliases` ha già `alias_normalized`, `tariffa_id`, `learned_from`, `use_count` | `product_aliases` con `learned_from='voce_computo'` |
| Duplicare la voce per dividerla | venduto doppio, indice unico della sottofase rotto | quote di quantità negli affidamenti |
| Scrivere a mano il costo della ditta sulla fase *e* negli affidamenti | due numeri che divergono | `order_external_teams` calcolata dagli affidamenti (trigger) |
| Un'anagrafica nuova per la ditta | ne esistono già quattro | si punta a `subappaltatori`; le altre la raggiungono |
| Un nuovo dialog per l'elenco | `ElencoLavoriDialog` e il PDF esistono e sono collaudati | gli stessi, alimentati dagli affidamenti |
| Un nuovo sistema di misure | `subappalto_misure` e `sal_subappaltatori` esistono | si aggiunge `voce_id` alle righe del quadro |
| Una funzione di unità in TS e un'altra in SQL scritte a mano | si allineano male | una tabella di sinonimi sola, generata in un file per il codice e uno per l'SQL, con lo stesso test (rischio R4) |
| Import listino nuovo da zero | `parseVociIncollate` (listino fornitore) e il lettore AI di Silvio esistono | si riusano; cambia solo la destinazione |

**Doppioni nei dati: il rapporto del lotto 1 (10/11/2026).** Nessuno si fonde da solo, e
nessuna fusione automatica per nome.

| Cosa | Dove | Cos'è davvero | Cosa si fa |
|---|---|---|---|
| 26 voci di listino con lo stesso nome e la stessa unità | 25 Bonarrigo, 1 Dimora | Bonarrigo: la stessa lavorazione presa da computi diversi, con **prezzi di vendita diversi** (es. porta EI60 a doppia anta: 970/710/930/860 €). Non sono doppioni da fondere: sono prezzi di progetti diversi. Dimora: una vera copia («gres porcellanato 60x60», stessi prezzi) | l'abbinamento automatico usa il codice, che è unico; con un nome omonimo si chiede sempre conferma. La copia di Dimora la sistema Dimora |
| 2 voci con due prezzi della stessa ditta | Demo 2 (Vais Home, MG Posa) | prezzi per condizioni diverse, «su nuovo» e «con smontaggio» | restano: vedi R2 corretto |
| 1 subappaltatore doppio per nome | Green Energy: «SWEET HOME S.R.L.» senza P.IVA e «SWEET HOME SRL» con P.IVA | probabile doppione | da far decidere a Green Energy |
| 81 subappaltatori senza P.IVA | Green Energy 59, Demo 2 14, Demo 5, Ke Bei 3 | anagrafiche incomplete | nessuna delle aziende che usano il subappalto dal computo |
| 34 schede sicurezza senza anagrafica | Bonarrigo 17, Demo 2 10, Demo 7 | la scheda del contratto non è legata alla ditta | **Bonarrigo va sistemata prima del lotto 4**: un contratto su quelle schede non trova il listino della ditta |
| 6 squadre esterne senza anagrafica | Demo 2 (MG Posa), Demo (3), Innovasol (1), Renova (1) | squadre mai collegate alla ditta | quando si collegano, i loro prezzi seguono da soli (trigger del lotto 1) |

---

## 4. Rischi, difetti prevedibili e come si evitano

| # | Rischio | Cosa succederebbe | Difesa |
|---|---|---|---|
| **R1** | Due persone affidano la stessa voce nello stesso momento | voce affidata due volte, costo doppio | `affida_voci` blocca le voci (`FOR UPDATE`) e controlla la somma dentro la transazione; test con due transazioni parallele |
| **R2** | La ditta ha più prezzi per la stessa voce (2 casi già oggi) | prezzo scelto a caso | **corretto dopo il lotto 1**: i 2 casi non sono doppioni ma prezzi diversi per condizioni diverse («su nuovo» 85 €, «con smontaggio» 110 €). Regola: più prezzi con il loro nome, uno predefinito (`is_default`, esiste già); il contratto propone il predefinito e chiede quale se la scelta conta. Le date di validità servono a chiudere un listino vecchio, non a vietare due prezzi nello stesso periodo |
| **R3** | Abbinamento sbagliato fra voce del computo e voce di listino (descrizioni simili, 26 omonimi) | prezzo di un'altra lavorazione nel contratto | automatico solo per codice identico o abbinamento ricordato; l'AI propone e una persona conferma; omonimi = sempre «da confermare»; il pallino d'origine resta visibile |
| **R4** | Unità diverse: nelle voci ci sono 21 scritture (m2/mq, mc/m3, cad/cad./n., ora/ore, a corpo/a.c./corpo…), nel listino 8 | 420 m2 × prezzo «a pezzo», oppure nessun abbinamento | normalizzazione unica con test (m2→mq, m3→mc, cad/n.→pz, ore→h, a.c.→corpo); unità diverse = mai proposta automatica, avviso in riga |
| **R5** | Il contratto cambia dopo l'invio in firma | il firmato non è il PDF mandato | fotografia all'invio; la modifica annulla la firma in attesa (esiste già) e si rifà; test |
| **R6** | Si cancella una fase o una voce già a contratto: oggi la fase porta via le sue voci (`ON DELETE CASCADE`) | righe del contratto senza voce, affidamenti spariti in silenzio | `voce_id … ON DELETE RESTRICT` sugli affidamenti a contratto, con un messaggio leggibile; quelli in bozza si revocano prima. Va aggiunta la tabella all'ordine della **purga azienda** e controllato che `admin_backup_tabelle_scoperte()` resti vuota |
| **R7** | Il trigger che calcola il corrispettivo urta `subappalto_base_contratto_protetta`, che blocca l'importo con misure o SAL | errore al salvataggio di una variante | il ricalcolo vale solo in bozza; dopo, l'importo cambia solo dentro `subappalto_variante_registra`, che già apre il blocco; test di entrambi i casi |
| **R8** | Arrotondamenti: totale del PDF ≠ importo nel database per qualche centesimo | contestazioni, SAL che non chiudono | stesso conto ovunque (riga arrotondata, poi somma); test che confronta database, finestra e PDF |
| **R9** | **Il venduto della voce comprende i materiali, la ditta fa solo la posa** (634 voci hanno anche il costo materiali) | margine falso: sembra 60% ed è 15% | `comprende` sull'affidamento (posa / fornitura e posa); con «posa» il margine sottrae anche i materiali della voce; la colonna lo dice |
| **R10** | Chi vede i prezzi. I contratti si leggono anche con il solo permesso «subappaltatori» (`scheda_subappaltatori_leggi`), senza il permesso sui costi | se il venduto finisse nel contratto o negli affidamenti, lo vedrebbe chi non deve | venduto e margine **mai salvati** fuori dalle voci; calcolati da `margini_affidamenti` solo con `can_view_costs`; test con un utente senza permesso |
| **R11** | Le regole di accesso del listino delle ditte usano `get_my_company_id()`: un utente con più aziende vede il listino dell'azienda attiva | prezzi di un'altra azienda proposti | **rivisto nel lotto 1, nessuna modifica**: `get_my_company_id()` è l'azienda attiva, come in altre 450 regole (listino aziendale compreso), e l'azienda per scheda è un lavoro a parte (ramo `claude/azienda-per-scheda`). La scrittura dei prezzi è già aperta a chi ha permesso listino + costi (`varianti_scrittura_listino`). Riscriverle solo qui le farebbe divergere dal resto e bloccherebbe l'accesso per la durata della migrazione |
| **R12** | Le voci di Bonarrigo (1.752 su 1.777 dal computo) non puntano più alla riga del computo da cui vengono | una variante del computo non trova le voci della commessa | per quelle commesse il confronto lavora sulla voce della commessa (quantità cambiata → «da rivedere»), non sul computo; per i computi nuovi si usa la voce radice (`voce_origine_id`), che esiste già |
| **R13** | Commesse grandi: Villa Ida ha 643 voci | lentezza, 643 chiamate, limite di 1.000 righe di PostgREST | una chiamata per azione (`affida_voci` con un elenco); letture con RPC o a pagine; albero chiuso per fase di default |
| **R14** | La ditta del contratto ha più schede sicurezza (fino a 33 per la stessa anagrafica) | contratto sulla scheda sbagliata | si usa la regola che c'è già (`schedeSicurezzaDitta`: prima quella della commessa, poi la generale) |
| **R15** | Il costo previsto della fase si scrive da due parti (a mano sulla ditta e dagli affidamenti) | doppio conteggio in `economiaFasi` e nei Margini | con affidamenti la riga della ditta sulla fase è in sola lettura (`costo_origine='contratto'`); senza, resta come oggi |
| **R16** | IVA: le ditte sono in reverse charge, ma qualcuna mette l'IVA | importi con l'IVA scambiati per imponibili | affidamenti e contratto sempre senza IVA; l'IVA entra solo nella riga della ditta sulla fase (`conIva`), come già oggi |
| **R17** | L'import da PDF legge numeri sbagliati (1.250,00 letto 1,25) | listino falsato | lettura AI = proposta: righe con prezzo fuori scala rispetto al costo nostro (meno di un quinto o più di cinque volte) segnalate in rosso; nessun salvataggio senza conferma |
| **R18** | Contratti esistenti: 18 bozze di Dimora senza `voce_id`, 21 di Bonarrigo quasi tutti a 0 € | doppio affidamento fra contratto vecchio e nuovo | i contratti vecchi restano come sono e le loro fasi risultano «coperte da contratto senza voci» (si usa `contrattoPerFase`, che riconosce la fase dal nome); rifarli è una scelta di Florin (domanda 6) |

---

## 5. Piano a lotti

Ogni lotto si pubblica da solo, con i test e una prova sui dati veri.

| Lotto | Contenuto | Fatto quando |
|---|---|---|
| **1. Fondamenta** ✅ 10/11 | `subappaltatore_id` su varianti e voci di ditta, ricavato dalla squadra; normalizzazione delle unità (R4); rapporto dei doppioni (sezione 3). Le regole di accesso restano come sono (R11 rivisto) | fatto: 62 righe su 66 hanno l'anagrafica (le 4 di MG Posa la prenderanno quando la squadra verrà collegata); test delle unità verde, e la funzione del database dà le stesse unità del codice su tutte le 22 grafie vere; trigger provato in 6 casi in una transazione annullata |
| **2. Listino della ditta, a mano** ✅ 10/11 | linguetta «Listino» nella scheda subappaltatore (voci dell'azienda col prezzo della ditta, «Voce sua», «Prezzi passati», «Valgono dal»); `listino_ditta_salva` chiude il prezzo vecchio e apre il nuovo; prezzi scaduti mai proposti; voci proprie di una ditta mai proposte alle altre; squadra cancellata senza perdere i prezzi | fatto: prova in transazione annullata con l'amministratore della Demo 2, 8 casi su 8 (nuovo, correzione, listino nuovo che chiude il vecchio, uguale, tolto, negativo rifiutato, subappaltatore rifiutato, squadra cancellata). Trovato e corretto nella prova: `is_default` è uno per voce in tutta l'azienda (è la variante «di norma» dei preventivi), quindi un prezzo di ditta nasce senza (migrazione 20290213180100). Anche il ricalcolo automatico del previsto della ditta (`ditte_ricalcola_previsto`) ignorava le date: ora usa solo i prezzi validi oggi e trova quelli dell'anagrafica (20290213180200; sui dati di oggi 0 importi cambiati su 28 fasi; prova 50 → 30 → 50 €). Vista a schermo con dati d'esempio a 960 px e sul telefono |
| **3. Abbinamento voci ↔ listino** ✅ 10/11 (senza AI) | «Collega al listino» in «Ditte e contratti»: proposte per stesso codice, come l'ultima volta (`product_aliases`, `learned_from='voce_computo'`), stessa descrizione unica; unità diverse = da guardare; scelta a mano con ricerca; «Al listino» crea la voce dal computo (col permesso listino); `voci_abbina_listino` scrive e ricorda (R3) | fatto: Villa Ida 252 voci su 643 si collegano da sole per codice; Cagliari L1/L2 e Courmayeur 0 (i loro codici non sono nel listino: si collegano a mano, poi si ricordano). Prova in transazione annullata con un amministratore di Bonarrigo, 6 casi su 6. **Resta: la proposta per significato con l'AI** — il listino di Bonarrigo non ha gli embedding; serve generarli (costo AI) |
| **4. Affidamento per voce** ✅ 10/11 (database + finestra «Affida le voci alle ditte») | `subappalto_affidamenti`, funzioni, «Chi fa cosa», quote di quantità, «senza ditta», ditta sulla fase calcolata (R1, R6, R13, R15) | due affidamenti in parallelo: uno fallisce; l'esempio 7 fasi × 5 voci con 3 ditte torna al centesimo; fase con voce a contratto non cancellabile |
| **5. Contratto dagli affidamenti** ✅ 10/11 (senza «ricorda nel listino») | prezzi proposti con l'origine, «ricorda nel listino», margini interni con «comprende» (R9, R10), corrispettivo calcolato (R7, R8), PDF «Lavori affidati» | PDF di O-0001 di Dimora; utente senza permesso sui costi: nessuna cifra di venduto in nessuna risposta; database, finestra e PDF uguali al centesimo |
| **6. Firma → quadro → misure → costi** | fotografia all'invio (R5), quadro con `voce_id` alla firma, previsto e consuntivo per fase, Margini e controllo di gestione | contratto Demo 2 firmato in una transazione annullata: quadro, misura, SAL e consuntivo della fase coerenti |
| **7. Listino da Excel e PDF** | finestra di abbinamento, controllo dei prezzi fuori scala (R17) | un listino vero di una ditta, riga per riga |
| **8. Varianti** | voce cambiata → «da rivedere» (R12), «Proponi variante» per riga, nuova revisione del quadro | variante di quantità su una voce con misure: le misure restano valide, l'importo segue |
| **9. Collaudo a schermo** | Bonarrigo e Dimora, due ruoli (con e senza costi), telefono | visto a schermo, non solo nei test |

L'import (lotto 7) è stato spostato dopo il contratto: il listino si costruisce già con
«ricorda nel listino» lavorando, e l'import serve solo quando la ditta manda un file.

---

## 5-bis. Controllo prima di pubblicare i lotti 2 e 3 (10/11/2026)

Florin: «prima controlla bene tutto». Due controlli indipendenti più il mio:

- **Revisione del codice** (agente senza contesto): 7 difetti, tutti corretti nella migrazione
  `20290213200000_listino_ditta_revisione` e nel codice:
  - il «principale» della ditta cambiava dopo un salvataggio (ora il prezzo riaperto tiene la data
    di creazione, e il codice usa lo stesso ultimo criterio del database);
  - un prezzo da oggi si accavallava con uno già fissato per il futuro (ora si ferma il giorno prima);
  - la casella del listino confrontava col prezzo di oggi anche con un'altra data scelta;
  - in «Ditte e contratti» un vecchio prezzo chiuso della squadra nascondeva quello della ditta;
  - togliere un prezzo già usato in un preventivo dava un errore tecnico (ora si spegne);
  - cambiare il listino non aggiornava il previsto delle fasi (ora sì, solo commesse aperte);
  - il collegamento al listino aggiornava una voce per volta (ora una sola istruzione: 265 voci di
    Villa Ida in 1,9 secondi);
  - «a_corpo» non era uguale ad «a corpo» nel database.
- **Accessi** (guardiano): un buco fra aziende, gravità media-bassa, mai usato (0 righe incoerenti).
  L'amministratore di un'azienda poteva scrivere un prezzo che puntava a squadra e voce di un'altra
  azienda e decidere il costo previsto di quella. Chiuso con chiavi esterne composte e filtri per
  azienda. Il ricalcolo dei previsti resta del solo sistema: dal listino si passa da
  `listino_ditta_ricalcola_previsto`, che controlla i permessi.
- **Resta da decidere (non mio, già esistente):** `product_aliases` si legge e si scrive da
  chiunque nell'azienda, anche operai e subappaltatori (nessun prezzo dentro, ma possono guastare i
  suggerimenti). Va cambiata la regola di accesso, in una finestra tranquilla perché le regole
  bloccano l'accesso mentre si applicano. E le edge function e il super admin non possono usare
  `listino_ditta_salva` (servono un utente vero dell'azienda).

## 5-ter. Lotto 4, parte database (10/11/2026)

Migrazioni `20290213210000_subappalto_affidamenti` e `20290213210100`, applicate e riallineate.
- Tabella `subappalto_affidamenti` (l'unica nuova del piano): quota di una voce a una ditta, prezzo
  proposto (listino della ditta → costo aziendale → a mano), «comprende» posa / fornitura e posa,
  stato bozza / a contratto. Si legge con commesse + costi; si scrive solo con `affida_voci`,
  `affidamento_modifica`, `affidamento_togli` (controllano commesse + costi).
- Σ quote ≤ quantità della voce, con la voce bloccata mentre si scrive; la stessa ditta sulla stessa
  voce si somma alla sua quota.
- La ditta sulla fase segue da sola (`order_external_teams`, `costo_origine = 'contratto'`, nota
  «Dagli affidamenti»); se la ditta non ha una squadra, nasce. Una ditta assegnata a mano prima non
  si perde: torna «a mano» quando le sue quote se ne vanno.
- Una voce o una fase con quote a contratto non si cancella; in bozza le quote se ne vanno con lei;
  la purga dell'azienda passa. Un contratto cancellato riporta le sue quote in bozza.
- Provato su Villa Ida in transazioni annullate: voce intera, voce piena, divisione 70 + 30,
  previsto della ditta 875 €, oltre la quantità rifiutato, voce/fase a contratto bloccate, quota a
  contratto non modificabile, cliente rifiutato e senza lettura.

## 5-quater. Collaudo dei subappalti (10/11/2026, sera)

Due revisori indipendenti (commessa → ditte → contratto; scheda subappaltatore → contratti,
misure, SAL), più il controllo dei dati veri (15 controlli: 14 coerenti; l'unico scarto è un contratto
in bozza di Dimora con due varianti, che è il caso «corrispettivo ≠ tabella» del lotto 5).

**Corretto nell'interfaccia (pubblicato):**
- «Assegna ditte e costi»: la ditta nasce sempre «dal preventivo» (prima, a 0 €, il previsto non seguiva
  più le voci); se la regola d'accesso non lascia scrivere lo dice invece di «salvato».
- Dopo assegnazioni e voci la commessa si aggiorna (chiavi di cache sbagliate).
- Numero del contratto: il più alto usato + 1 (prima poteva ripetere un numero dopo una cancellazione).
- Riga dell'elenco spostata in un'altra fase: l'importo va alla fase nuova.
- «Aggiungi dal listino» sulla fase: mai le voci proprie di un'altra ditta.
- Prezzi «1.500» = 1500; anteprima del SAL a mano letta all'italiana.
- Listino o abbinamenti che non si caricano: avviso e «Riprova»; nomi accessibili sui pulsanti ripetuti.
- Contratto firmato: dal modulo non si riscrivono più commessa, lavori, ritenuta, garanzie, penali,
  pagamenti; commessa non cambiabile con SAL o ritenute; eliminazione bloccata anche con ritenute, e
  se il controllo non riesce non elimina.
- SAL: «Approva» e «Contesta» solo dagli stati giusti (un SAL pagato non torna indietro); dopo la
  contestazione il registro ritenute si rilegge.

**Applicata il 10/11/2026 sera col via di Florin** (`20290213235000` + correzione `20290213235100`: le funzioni di trigger devono girare con l'identità di chi scrive, altrimenti il controllo «scrive il browser?» non scatta mai; provato: 12 casi su 12, pagamento SAL e variante passano). Era la migrazione con le stesse protezioni nel
database — il controllo automatico l'ha fermata perché tocca regole di accesso in produzione. Il file
è nella cartella delle note della sessione (`20290213220000_subappalto_protezioni.DA_APPROVARE.sql`),
fuori da `supabase/migrations/` perché al push si applicherebbe da sola. Contiene: contratto firmato e
SAL protetti anche dalle scritture dirette; eliminazione di contratti con SAL/ritenute/fatture
bloccata nel database (oggi la cascata porta via i SAL); SAL oltre importo + oneri rifiutato; ditte
sulla fase scrivibili da chi ha commesse + costi (oggi solo l'amministratore: per gli altri
«Assegna ditte e costi» non salva).

**Decisioni per Florin:**
- DURC — **deciso da Florin (10/11/2026): non blocca niente**. Il blocco sul SAL scritto a mano è
  diventato un avviso (nella finestra del SAL e dopo il salvataggio). Nota: alcune pagine del sito
  dicono ancora «pagamenti bloccati con DURC scaduto» (GestioneSubappalti, RitenuteGaranzia, blog).
- 14 ritenute di Bonarrigo del 06/11 (146.158,52 €) senza commessa, mentre il loro contratto ce l'ha:
  da ricollegare (dati del cliente, registro fiscale).
- Reinvio in firma: il link vecchio si annulla prima di sapere se il nuovo parte; per invertirlo serve
  cambiare `subappalto_firma_annulla` (escludere la richiesta nuova).

## 6. I numeri di oggi (produzione, 10/11/2026)

| | Bonarrigo | Dimora | Demo 2 | Scavolo |
|---|---|---|---|---|
| Voci delle fasi | 1.109 (4 commesse) | 186 (3) | 657 + 14 | 25 |
| Costo del lavoro sulle voci | 0 | 156 k€ | 1,76 M€ | 0 |
| Voci di listino | 561 (solo vendita) | 290 | 174 | — |
| Codici della voce che si ritrovano nel listino | 265 su 1.109 | (voce di listino già presente) | 0 | 0 |
| Contratti | 21 (19 a 0 €) | 18 bozze con Allegato A (171 righe) | 129 | 0 |
| Ditte | 71 anagrafiche, 0 squadre | 11 squadre | 7 | 0 |

**In tutto il sistema:**
- `tariffe_aziendali`: 1.361 voci in 12 aziende, 553 con un costo;
- prezzi per ditta: 8, voci proprie di una ditta: 58, tutti della Demo 2;
- `product_aliases`: 0 righe;
- quadri lavori: 5, misure: 2, SAL dei subappaltatori: 109.

---

## 7. Domande per Florin (con la mia proposta)

**10/11/2026: Florin ha approvato le proposte («Sì, parti dal lotto 1»).** Le domande 5 (da dove
partire, e con quali listini delle ditte di Bonarrigo) e 7 (oneri della sicurezza) non avevano
una proposta: restano da chiedere prima dei lotti 3 e 5.

1. **Voce divisa fra due ditte per quantità** (300 mq a Rossi + 120 a Bianchi, la voce resta
   una). *Proposta: sì.*
2. **La ditta non ha un prezzo per una voce.** *Proposta: si propone il costo aziendale con
   l'avviso; se manca anche quello, la casella resta vuota e il contratto non si salva finché
   non c'è un prezzo.* Oppure preferisci una percentuale fissa del venduto?
3. **Il prezzo della ditta comprende anche i materiali?** *Proposta: si sceglie a ogni
   affidamento, con «solo posa» come valore iniziale.* Serve per un margine vero (R9).
4. **Un listino nuovo della ditta lascia i contratti già fatti col prezzo vecchio.** *Proposta:
   sì, sempre.*
5. **Si parte da Bonarrigo** (Villa Ida)? Le sue ditte hanno un listino da caricare, o i prezzi
   si scrivono man mano nei contratti?
6. **I contratti esistenti** (18 bozze di Dimora, 21 di Bonarrigo): *proposta: restano come
   sono; chi vuole rifà una bozza dagli affidamenti con un pulsante.*
7. **Oneri della sicurezza della ditta**: importo a mano, come oggi, o percentuale sui lavori?
8. **Il subappaltatore nell'app** vede il suo contratto con i prezzi? *Proposta: sì, solo il
   suo, mai il venduto.*

## 5-quinquies. Lotto 4, la finestra (10/11/2026)

Commessa → Ditte e contratti → «Affida le voci alle ditte» (`AffidaVociDialog.tsx`, calcoli in
`src/lib/subappaltatori/affidamentiCommessa.ts`). Voci divise per fase, con ricerca e «Solo senza
ditta»; si sceglie una voce o una fase intera (solo le voci libere), la ditta e cosa comprende il
prezzo (solo posa / fornitura e posa); con una voce sola si può scrivere la quantità. Ogni quota è
un bottone: si cambiano quantità, prezzo e cosa comprende, o si toglie; a contratto è bloccata.
In alto: venduto, costo delle ditte, margine sull'affidato, venduto ancora senza ditta, e una riga
per ditta. Tutto passa da `affida_voci` / `affidamento_modifica` / `affidamento_togli`.
Prove: 7 sui calcoli (quote, residuo, margine pro-quota, materiali nostri con la sola posa),
4 sulla finestra. Non provata ancora su una commessa vera con un utente vero (lotto 9).
Prossimo: lotto 5, il contratto nasce dagli affidamenti della ditta e il PDF «Lavori affidati».

## 5-sexies. Lotto 5, il contratto dagli affidamenti (10/11/2026)

- Commessa → Ditte e contratti: se la ditta ha voci affidate, «Crea contratto…» parte da quelle (le sue quote
  libere e quelle già di questo contratto), con la quantità e il prezzo della quota, non da tutte le voci delle
  sue fasi. Senza affidamenti resta tutto come prima. «Riprendi le voci affidate» rimette l'elenco.
- Nella finestra, sotto ogni voce affidata: cosa comprende il prezzo e da dove viene (listino della ditta,
  «costo nostro, non della ditta» in arancio, a mano). Un prezzo cambiato diventa «a mano». Una voce
  affidata senza prezzo blocca il salvataggio (domanda 2 approvata): si scrive il prezzo o si toglie la riga.
- Database, `20290216120000_contratto_aggancia_affidamenti` (applicata e riallineata): a ogni scrittura di un
  contratto non firmato, le righe con `affidamento_id` passano «a contratto» con quantità e prezzo della riga;
  quelle tolte tornano in bozza; ditta o commessa sbagliata, quota già in un altro contratto, quantità oltre
  il resto della voce annullano tutto il salvataggio. Dopo la firma non si tocca niente. Provato con un utente
  vero della Demo 2 in transazione annullata: 5 casi su 5 (aggancio con prezzo cambiato → «a mano», altra
  ditta rifiutata, quantità oltre rifiutata, riga tolta → bozza, contratto cancellato → bozza).
- PDF e stampa: l'Allegato A era già per fase con i totali di fase; ora accanto alla voce c'è «(solo posa)» o
  «(fornitura e posa)». Il venduto non è nelle righe del contratto (provato).
- Non fatto: «ricorda nel listino di Rossi» dalla finestra del contratto (si fa dal listino della ditta);
  il controllo «prezzo > 0» è nella finestra, non nel database. Restano: lotto 6 (firma → quadro, misure, SAL,
  costi), 7 (import Excel/PDF del listino), 8 (varianti), 9 (prova a schermo su una commessa vera).

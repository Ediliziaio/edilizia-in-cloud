# Commessa in appalto — piano

> Stato al 28/10/2026. In produzione: modulo `appaltatore_module` acceso su 3
> aziende (Demo, Demo 2, Green Energy Group), **2** profili `customer_type='appaltatore'`,
> **zero** commesse `order_type='appaltatore_lavoro'`. Nessun dato da migrare:
> si disegna libero.
>
> Deciso con Florin il 28/10/2026: (a) in Clienti si separano **Clienti** e
> **Committenti**, e la scheda del committente è il centro — contratto, condizioni
> generali, listino, e da lì i lavori che quel committente passa; (b) il listino
> vive sul contratto, con **override di riga** sulla singola commessa; (c) la
> fatturazione è **sia** per commessa **sia** mensile cumulativa per committente,
> scelta sul contratto; (d) gli appalti possono includere **anche la fornitura** di
> materiale, non solo manodopera.

## 1. Cosa c'è oggi, e perché non basta

`20261228000000_appaltatore_module_foundation` ha messo le fondamenta:

- `profiles.customer_type` = `privato` | `appaltatore`;
- `orders.order_type` = `cliente` | `appaltatore_lavoro`;
- `orders.work_address`, `work_description`, `materials_location`,
  `work_start_date`, `work_end_date`.

La pagina `/azienda/ordini/nuovo-lavoro-appaltatore`
([CreateLavoroAppaltatore.tsx](../src/pages/azienda/CreateLavoroAppaltatore.tsx), 903 righe)
dichiara nel suo commento di essere uno «skeleton (Phase 5)». Chiede: committente,
codice, descrizione, indirizzo, posizione materiali, date, **un importo totale**, rate.
Su [OrderDetail.tsx](../src/pages/azienda/OrderDetail.tsx) l'ordine d'appalto mostra una
sola card in sola lettura (`OrdineAppaltatoreLavoroCard`) ed è **escluso** da
`CantiereDaOrganizzare`.

Quattro buchi, nell'ordine in cui bloccano:

1. **Il committente non esiste nell'interfaccia.**
   [CreateCustomer.tsx](../src/pages/azienda/CreateCustomer.tsx) sa scrivere
   `customer_type='appaltatore'`, ma [CustomersList.tsx](../src/pages/azienda/CustomersList.tsx)
   e [CompanyCustomerDetail.tsx](../src/pages/azienda/CompanyCustomerDetail.tsx) non
   nominano mai quel campo: un committente finisce nel mucchio dei clienti privati e
   non ha una scheda sua.
2. **Non c'è il listino del committente.** L'accordo («il trasporto a X, la giornata
   uomo a Y») non ha dove stare. L'unica cosa simile, `listini_cliente`, tiene un
   solo numero: lo sconto globale percentuale su un preventivo al privato.
3. **C'è un importo solo, e si pretende che si sappia subito.** Il caso «vengo pagato
   in base a quello che ho fatto» non è rappresentabile: `total_amount` nasce
   certo, e le rate ci si appendono.
4. **Non c'è la rendicontazione.** I rapportini di campo
   (`campo_rapportini`: data, ore, fase, foto, firma) restano un fatto operativo;
   nessuno li trasforma in «ti devo fatturare 10 giornate».

## 2. La decisione che decide tutto: come si valorizza la commessa

Ogni altra scelta scende da questa. Due modi, dichiarati alla nascita della
commessa e **mai dedotti**:

| | **A corpo** | **A misura** |
|---|---|---|
| L'importo | concordato prima: 1.500 € | si sa alla fine |
| `total_amount` | il valore del contratto | una **stima**, etichettata tale |
| Da cosa nasce il dovuto | dal contratto | dalla rendicontazione × tariffe |
| Pagamenti | rate / SAL come la commessa privata | SAL periodico sul rendicontato |
| Il rischio | sbagliare il prezzo | lavorare oltre senza accorgersene |

Il rischio della colonna destra si copre con un **tetto** (`tetto_importo`): oltre
quella cifra la commessa avvisa, non si blocca. È la differenza fra un sistema che
ti dice «hai già fatto 1.800 € su un accordo da 1.500» e uno che te lo fa scoprire
dal commercialista.

**Niente terza via.** «A corpo con extra a misura» non è un terzo modo: è una
commessa a corpo con righe di rendiconto fuori contratto, marcate `extra_contratto`.
Sono quelle che si litigano a fine lavori, e vanno viste separate.

## 3. Lo schema

### 3.1 Committenti: una sezione propria

`profiles.customer_type` c'è già e basta: non serve una tabella nuova, serve che
l'interfaccia la guardi.

- **Clienti** e **Committenti** diventano due voci distinte (due rotte,
  `clienti` e `committenti`, sulla stessa lista filtrata — stessi permessi
  `canViewCustomers` / `canEditCustomers`). La voce Committenti compare solo se
  `appaltatore_module` è attivo: le aziende senza il modulo non vedono niente di nuovo.
- **La scheda del committente è il centro del modulo**, non una copia della scheda
  cliente. Sopra l'anagrafica: il **contratto attivo** con le condizioni generali
  (pagamento, ritenuta, maggiorazioni, modo di fatturazione), il **listino**, e
  l'**elenco dei lavori** che quel committente ti passa — aperti, da rendicontare,
  da fatturare, chiusi — con il totale rendicontato e il margine a fianco.
  Da lì si apre una commessa nuova con contratto e listino già agganciati.

Niente campi privato sulla scheda committente (nascita, codice fiscale personale,
bonus fiscali): è un'impresa, usa i campi business già esistenti.

### 3.2 Il contratto col committente — `appalto_contratti`

Il contenitore dell'accordo e delle condizioni generali. Uno per committente, più
di uno se si rinnova ogni anno (i prezzi cambiano e le commesse vecchie devono
restare coi prezzi vecchi).

```
id, company_id
committente_id        → profiles (customer_type='appaltatore')
nome                  'Accordo 2026', 'Appalto scuola Via Dante'
valido_dal, valido_al
giorni_pagamento      30, 60, 90 — dalla data fattura
ritenuta_pct          se trattengono una garanzia
maggiorazione_straordinario_pct, maggiorazione_festivo_pct   default del contratto
modo_fatturazione     'per_commessa' | 'mensile_cumulativa'      (§3.6)
include_fornitura     boolean — se gli appalti di questo contratto comprendono materiale
riferimento_committente   il loro numero d'ordine/PO di riferimento
condizioni            testo delle condizioni generali concordate
note, attivo, created_at, updated_at
```

### 3.3 Il listino del committente — `appalto_tariffe`

Il pezzo che oggi non esiste. Una riga = una cosa che a quel committente si può
fatturare.

```
id, company_id, contratto_id
tipo            'manodopera' | 'trasporto' | 'lavorazione' | 'nolo' | 'materiale' | 'forfait'
codice, descrizione
unita_misura    'ora' | 'giornata' | 'uomo_giorno' | 'viaggio' | 'km' | 'mq' | 'ml' | 'cad' | 'corpo'
prezzo_unitario
maggiorazione_straordinario_pct, maggiorazione_festivo_pct   NULL = quelle del contratto
tariffa_id      → tariffe interne (opzionale): da qui esce il COSTO, non il prezzo
qualifica       per le righe manodopera: a quale livello si applica
valido_dal, valido_al
ordine, attivo
```

E l'eccezione per cantiere, deciso il 28/10 — **`appalto_tariffe_commessa`**,
creata in Fase 3 insieme al rendiconto che la legge:

```
id, company_id, order_id, tariffa_id, prezzo_unitario, nota
unique (order_id, tariffa_id)
```

Una riga sola per dire «su questo cantiere il trasporto me lo paga 80». Il
rendiconto pesca il prezzo con una regola in tre passi, in quest'ordine:
override di commessa → tariffa di contratto valida alla data → errore parlante
(mai zero muto).

Due righe di principio:

- **Il prezzo del committente e il costo mio sono due numeri diversi e vivono
  separati.** Il prezzo sta qui; il costo lo sa già la piattaforma
  ([costoOrarioDipendente.ts](../src/lib/costoOrarioDipendente.ts),
  [lib/tariffe/costoLavorazione.ts](../src/lib/tariffe/costoLavorazione.ts),
  costo orario CCNL). `tariffa_id` è il ponte: serve a mostrare il margine già
  mentre si scrive il listino, non a derivare il prezzo.
- **Le tariffe si versionano, non si sovrascrivono.** Alzare un prezzo nel 2027
  non deve cambiare un rendiconto del 2026: all'uso si fa lo **snapshot** del
  prezzo sulla riga di rendiconto. È lo stesso schema di `lp_sal_voci`, che
  fotografa prezzo e quantità dentro il SAL.

### 3.4 La commessa — colonne nuove su `orders`

```
appalto_contratto_id    → appalto_contratti
valorizzazione          'a_corpo' | 'a_misura'      obbligatorio se order_type='appaltatore_lavoro'
tetto_importo           numeric NULL
riferimento_committente text NULL                   il loro n° d'ordine, serve in fattura
```

Niente tabella nuova per la commessa: è una `orders`, e deve restare tale per
ereditare fasi (`order_work_phases`, `order_work_subphases`), assegnazioni
(`order_employees`), rapportini, calendario, materiali, allegati, permessi e purga.

### 3.5 La rendicontazione — `appalto_rendiconto_righe`

Il cuore. Una riga = un fatto fatturabile.

```
id, company_id, order_id, data
tariffa_id                     + snapshot: descrizione, unita_misura, prezzo_unitario
quantita, maggiorazione_pct
importo                        GENERATED: quantita * prezzo_unitario * (1 + maggiorazione/100)
employee_id     NULL           per la manodopera: chi
fase_id         NULL           → order_work_phases
origine         'rapportino' | 'timbratura' | 'manuale' | 'nolo' | 'materiale'
rapportino_id   NULL           → campo_rapportini (ON DELETE SET NULL)
costo_interno                  snapshot del costo vero (ore × costo orario CCNL, o costo d'acquisto)
extra_contratto  boolean       fuori accordo: da far approvare
stato           'bozza' | 'confermata' | 'in_sal' | 'fatturata'
sal_id          NULL
```

`importo` e il margine (`importo - costo_interno`) si calcolano in colonna
generata, non nel codice: il numero deve essere lo stesso nella pagina, nel PDF,
nel report e in Silvio.

### 3.6 Il rendiconto al committente — `appalto_sal`

Deciso il 28/10: **entrambi i modi**, scelti sul contratto. Quindi il legame forte
è **committente + periodo**, e la commessa sta sulla riga:

```
appalto_sal
  id, company_id
  committente_id       → profiles            ← sempre presente
  contratto_id
  order_id        NULL → orders              ← valorizzato solo in modo 'per_commessa'
  periodo_dal, periodo_al
  numero               progressivo per committente
  stato                'bozza' | 'inviato' | 'approvato' | 'fatturato'
  totale, ritenuta, netto
  pdf_url, firma_url, approvato_da, approvato_at
  documento_fiscale_id NULL → documenti_fiscali
```

Un SAL `per_commessa` ha `order_id` pieno e prende solo righe di quella commessa;
un SAL `mensile_cumulativa` ha `order_id` NULL e raccoglie le righe confermate di
**tutte** le commesse di quel committente nel periodo, raggruppate per cantiere nel
PDF. Una sola tabella per i due casi, un solo PDF, una sola fattura.

Una regola, copiata da `lp_sal` perché lì ha già funzionato: **una riga entrata in
un SAL approvato non si modifica e non si cancella.** Si libera solo cancellando
un SAL ancora in bozza. È quello che rende un rendiconto una prova e non un
appunto.

## 4. Il flusso, e l'unico punto dove si decide se il modulo verrà usato

```
Committenti  →  scheda committente
                   ├─ Contratto 2026 + condizioni (60 gg, ritenuta 0, fatturazione mensile)
                   ├─ Listino: giornata uomo 180 €, trasporto 60 €/viaggio, posa 22 €/mq
                   └─ Lavori che mi dà
                        └─ Commessa «Cantiere Via Dante»  a_corpo 1.500 €  |  a_misura (stima 1.400 €)
                              ├─ Fasi, operai assegnati, calendario, materiali   ← già esistenti
                              ├─ RENDICONTO
                              │     ├─ dal rapportino di campo:  3 operai × 8 h × 10 giorni
                              │     ├─ a mano: 4 viaggi, 120 mq di posa
                              │     └─ totale 9.480 € · costo 6.100 € · margine 3.380 € (35,7 %)
                              └─ nel SAL di ottobre del committente → PDF → firma → fattura
```

Il punto fragile è uno: **se il titolare deve ribattere a mano 10 giorni × 3 uomini,
non lo farà.** L'operaio quei dati li ha già messi nel rapportino di `/campo`
(data, ore, fase). Quindi su una commessa d'appalto il rapportino **approvato**
genera la riga di rendiconto: ore × tariffa manodopera della qualifica di chi l'ha
compilato, stato `bozza`, l'ufficio conferma. Trasporti, misure e noli si
aggiungono a mano o si leggono dalle quantità del rapportino.

Da non sbagliare: le righe nascono **bozza**, non confermate. Un rapportino
sbagliato non deve diventare da solo una cifra da fatturare. E l'operaio non deve
vedere i prezzi del committente: il permesso esiste già (`canViewOrderAmounts`), in
`/campo` va tenuto chiuso.

## 5. Cosa si replica dalla commessa privata e cosa no

| Pezzo | Appalto |
|---|---|
| Fasi e sottofasi, modelli di fase | **sì**, identici |
| Operai assegnati, calendario, rapportini, timbrature | **sì**, identici |
| SAL / avanzamento | **sì**, ma sul rendiconto, non sul computo |
| Rate e scadenze (`order_installments`) | **sì** per a corpo; per a misura le rate nascono dal SAL |
| Margine, incassato, esposizione di cassa | **sì** — qui il margine è più vero che altrove |
| Materiali, acquisti, ODA | **sì**, deciso il 28/10: esistono appalti con fornitura. Il materiale fatturato al committente è una riga di rendiconto `tipo='materiale'`; il costo d'acquisto entra nel margine |
| Preventivo al cliente, listino di vendita, bonus fiscali | **no** |
| Contratto e firma del privato, condizioni standard, PDF commerciale | **no**: il contratto è l'accordo col committente |
| Portale cliente, recensioni, richiamo a caldo | **no** |

## 6. Fasi di lavoro

Lotti piccoli, ognuno utile da solo e verificato prima del successivo.

**Fase 1 — Committenti, contratto e listino. ✅ FATTA il 28/10/2026.**

- `20281028110000_appalto_contratti_e_listino_committente` — `appalto_contratti` e
  `appalto_tariffe`. Due guardie in trigger, non nel frontend: un contratto
  d'appalto richiede un profilo `customer_type='appaltatore'` **della stessa
  azienda** (un cliente privato viene respinto), e il `company_id` di una tariffa
  si **deduce dal contratto** invece di fidarsi di quello che manda il client.
  Letture: il contratto a chi vede i clienti, il listino solo a chi ha anche
  «Importi delle commesse» — così capocantiere e operai non leggono i prezzi del
  committente nemmeno interrogando il database. Provata in una transazione
  annullata: 5 controlli su 5, zero righe lasciate.
- `20281028111000_committenti_separati_nell_elenco_clienti` — `get_customers_paginated`
  prende `p_customer_type` in coda (default `all`: nessun altro chiamante cambia
  comportamento) e restituisce la colonna. Su Demo Azienda il committente stava
  fra 410 clienti privati; ora i due elenchi sono separati.
- [CustomersList.tsx](../src/pages/azienda/CustomersList.tsx) — le due divisioni
  **Clienti / Committenti** nella testata, solo col modulo attivo, nell'URL
  (`?tipo=committenti`) con **una** scrittura sola su `useSearchParams`: due di
  fila si cancellano fra loro (lezione 09/10). «Nuovo» dalla divisione
  Committenti crea già un committente.
- [CommittenteDetail.tsx](../src/pages/azienda/CommittenteDetail.tsx) — la scheda
  centro, su `/azienda/committenti/:id` dietro `FeatureRoute appaltatore_module`:
  contratto in corso con le condizioni, listino con aggiungi/modifica/elimina,
  lavori che quel committente passa. Un cliente privato aperto su quell'URL non
  vede contratto né listino: vede il rimando alla sua scheda.
- [committenteScheda.test.tsx](../src/test/ui/committenteScheda.test.tsx) — 4
  prove, fra cui quella che conta: senza «Importi delle commesse» i prezzi non
  compaiono, ma le condizioni del contratto sì (non sono prezzi).

*`appalto_tariffe_commessa` (l'override per cantiere) NON è stata creata: in
Fase 1 non esiste ancora nessuna pagina che la leggerebbe. Nasce in Fase 3 col
rendiconto. Lezione già pagata: `listino_override_cliente` è nata per il portale
manutenzione e sta vuota da allora — una tabella senza interfaccia è una promessa
su carta.*

**Fase 2 — La commessa in due rami. ✅ FATTA il 28/10/2026.**

- `20281028120000_commessa_appalto_a_corpo_o_a_misura` — su `orders`:
  `appalto_contratto_id`, `valorizzazione`, `tetto_importo`,
  `riferimento_committente`. Un vincolo pretende la valorizzazione su ogni
  commessa d'appalto (aggiunto `NOT VALID` e poi validato, per un lock più
  debole) e un trigger pretende che il contratto agganciato sia della **stessa
  azienda e dello stesso committente**: senza, una commessa potrebbe fatturare
  col listino di un altro. Lo stesso trigger impedisce di appiccicare un
  contratto d'appalto a un ordine cliente. Le due commesse dimostrative di
  aprile (importo fisso 18.500 €) sono state marcate `a_corpo`: due righe su 766.
  Provato in transazione annullata, 8 controlli su 8.
- [CreateLavoroAppaltatore.tsx](../src/pages/azienda/CreateLavoroAppaltatore.tsx) —
  prima committente e contratto (si propone quello valido oggi, con le sue
  condizioni in chiaro), poi **la scelta che decide il resto della pagina**:
  a corpo → importo certo e piano rate; a misura → importo *stimato*, tetto,
  e nessuna rata. Il contratto è obbligatorio solo a misura, perché lì l'importo
  nasce dalle tariffe e senza listino non nasce da niente.
- **Niente rate sulle commesse a misura**, né nel form né in `order_installments`:
  una scadenza su un importo stimato entra nel previsionale di cassa come un
  incasso previsto che non esiste. Nasceranno dal rendiconto approvato.
- [CantiereDaOrganizzare](../src/components/orders/CantiereDaOrganizzare.tsx) non è
  più escluso dalle commesse d'appalto — era saltato del tutto — ma su quelle a
  misura non chiede «come si paga» (`senzaRate`): sarebbe un promemoria che non
  si chiude mai.
- [OrdineAppaltatoreLavoroCard](../src/components/orders/OrdineAppaltatoreLavoroCard.tsx) —
  modo di pagamento, contratto, tetto e numero d'ordine del committente. Il tetto
  è un importo e obbedisce a `canViewOrderAmounts`.
- `contrattoDiOggi` vive in [lib/appalto/contratti.ts](../src/lib/appalto/contratti.ts),
  non in due copie nelle due pagine: due copie della stessa regola è come sono
  nati i due parser divergenti dei decimali (luglio 2026). 6 prove sue, fra cui
  che un contratto scade il giorno **dopo** `valido_al`.
- Prove: [lavoroAppaltoDueRami](../src/test/ui/lavoroAppaltoDueRami.test.tsx) (4),
  [ordineAppaltoCard](../src/test/ui/ordineAppaltoCard.test.tsx) (4),
  [appaltoContrattoDiOggi](../src/test/logic/appaltoContrattoDiOggi.test.ts) (6).

*Due cose lasciate fuori di proposito.* La scheda **Materiali** resta accesa su
tutte le commesse d'appalto invece di dipendere da `include_fornitura`:
nasconderla rischia di nascondere materiali già inseriti, e la condizione del
contratto è scritta in chiaro sulla scheda. E nella **scheda Finanza** l'importo
di una commessa a misura si legge ancora come certo: lo corregge la Fase 3, che è
quella che sa il numero vero.

**Fase 3 — Rendicontazione a mano. ✅ FATTA il 28/10/2026.**

- `20281028130000_appalto_rendiconto_righe_e_override_cantiere` —
  `appalto_tariffe_commessa` (l'eccezione di prezzo di cantiere, che ora ha
  finalmente una pagina che la legge) e `appalto_rendiconto_righe`.
  **Il prezzo lo decide il database, non il browser:** il trigger riscrive
  sempre descrizione, unità di misura e prezzo dalla tariffa, in tre passi —
  eccezione di cantiere → tariffa del contratto valida a quella data → errore
  parlante. Provato: mandando dal client prezzo 1 e una descrizione falsa, la
  riga viene scritta a 60 € con la descrizione del listino.
- `importo` e `margine` sono **colonne generate**, così pagina, PDF, report e
  Silvio dicono lo stesso numero. Il margine resta **NULL** quando il costo non
  si sa, invece di sembrare pari all'incasso: un margine finto è peggio di un
  trattino, perché il titolare ci prende una decisione sopra.
- `20281028131000_appalto_rendiconto_operaio_e_employees` — correzione: avevo
  puntato `employee_id` a `profiles`, ma «quale operaio» qui è `employees`
  (dove puntano `order_employees` e il costo orario CCNL), e un operaio esiste
  in anagrafica anche senza un account nell'app. Tabella ancora vuota, FK
  ripuntata, più il controllo che l'operaio sia dell'azienda della commessa.
- [RendicontoAppalto.tsx](../src/components/orders/RendicontoAppalto.tsx) — nuova
  vista **Rendiconto** nella scheda Finanza, che compare **solo** sulle commesse
  in appalto (sulle altre non avrebbe niente da mostrare). Totali col confermato
  e le bozze separate, costo, margine; righe con fase, operaio, maggiorazione;
  l'avviso quando si supera il tetto concordato; le righe fuori contratto
  contate a parte, perché sono quelle che si discutono a fine lavori. Il
  pannello in panoramica porta qui con un clic.
- Le eccezioni di prezzo di cantiere hanno la loro sezione, e dicono quello che
  conta: valgono per le righe nuove, non per quelle già scritte.
- Conti in [lib/appalto/rendiconto.ts](../src/lib/appalto/rendiconto.ts), non nel
  componente: si provano senza montare una pagina.
- Prove: [rendicontoAppaltoTotali](../src/test/logic/rendicontoAppaltoTotali.test.ts) (10),
  [rendicontoAppalto](../src/test/ui/rendicontoAppalto.test.tsx) (8) — fra cui che
  senza «Importi delle commesse» del rendiconto non si vede niente. Più 14 prove
  SQL in transazioni annullate (11 sul prezzo e i vincoli, 3 su operaio e fase).

*Fuori di proposito:* `sal_id` e gli stati `in_sal` / `fatturata`. Arrivano in
Fase 5 con la tabella del rendiconto al committente e il congelamento delle righe
approvate: una colonna che punta a una tabella che non c'è non è una fondazione,
è un buco.

**Fase 4 — Rapportino → rendiconto. ✅ FATTA il 28/10/2026.**

- `20281028140000_appalto_rendiconto_dal_rapportino` — il rapportino di campo
  **approvato** diventa una riga di rendiconto in **bozza**: ore × tariffa di
  manodopera della qualifica di chi l'ha compilato, con il costo dal suo costo
  orario, quindi il margine. L'ufficio conferma.
- **Una riga per rapportino, sempre.** L'idempotenza sta in un indice unico su
  `rapportino_id`, non in un controllo applicativo: provato approvando e
  disapprovando quattro volte di fila, la riga resta una.
- **L'approvazione non può fallire per un problema di prezzi.** Il trigger
  inghiotte i propri errori: un capocantiere non deve restare bloccato in
  cantiere perché in ufficio manca una tariffa.
- **Niente salti silenziosi.** Dove la riga non si può scrivere, il rapportino
  compare in `v_appalto_rapportini_da_rendicontare` col motivo, e il rendiconto
  lo mostra come «Giornate di campo non rendicontate». Un rapportino saltato in
  silenzio è una giornata di lavoro che nessuno fattura — la stessa trappola dei
  lead Meta del 21/10 (vedi [[project_meta_moduli_opt_in_buco_20261022]]).
- Come le ore diventano quantità: tariffa a `ora` → le ore; a `giornata` o
  `uomo_giorno` → 1, perché una giornata è una giornata anche se sono state nove
  ore. Ogni altra unità non si converte da sola e lo dice.
- Quale tariffa: quella della **qualifica** dell'operaio (confronto senza badare
  a maiuscole e spazi), altrimenti la generica **solo se ce n'è una**. Con due
  generiche non indovina: indovinare qui vuol dire fatturare la cifra sbagliata.
- Approvazione ritirata: la riga generata se ne va solo se è ancora in bozza. Se
  qualcuno l'ha confermata l'ha guardata, e non si cancella il lavoro di una
  persona per un clic su un'altra pagina.
- `20281028141000_appalto_rapportino_operaio_anche_non_attivo` — correzione
  trovata provando: l'operaio si cercava fra gli **attivi**, ma un rapportino è
  un fatto storico. Su Demo Azienda quasi tutti gli operai sono `is_active =
  false`: il rapportino di un operaio uscito perdeva la tariffa della sua
  qualifica (cadeva sulla generica, cioè su un prezzo diverso) e perdeva il
  costo, quindi il margine.
- La regola sta in **una** funzione (`appalto_riga_da_rapportino`) usata dal
  trigger per scrivere e dalla vista per spiegare: due copie direbbero cose
  diverse, e l'elenco segnerebbe «pronto» mentre il trigger non scrive niente.
- Prove: 10 passi SQL in transazione annullata (dal listino vuoto alla doppia
  approvazione, dalla qualifica che vince sulla generica alla commessa non in
  appalto che non genera nulla) più 3 prove nuove sull'interfaccia.

*Lezione sul metodo, da non ripetere:* il primo giro di prove passava perché
confrontava con `<>` invece di `is distinct from`, e `NULL <> x` non è vero —
così un operaio non agganciato passava per agganciato. È quel confronto che
nascondeva il difetto dell'`is_active`.

**Fase 5 — Rendiconto al committente, nei due modi. ✅ FATTA il 28/10/2026 (meno il PDF).**

- `20281028150000_appalto_sal_rendiconto_al_committente` — `appalto_sal`: periodo,
  numero, totale, ritenuta, netto, stato (bozza → mandato → approvato →
  fatturato). Il legame forte è **committente + periodo**, con `order_id` pieno
  per il modo «per commessa» e vuoto per il mensile cumulativo: una tabella, un
  flusso, due modi.
- **Il congelamento.** Una riga entrata in un rendiconto che non è più in bozza
  non si modifica e non si cancella — è quello che rende il documento una prova
  e non un appunto. Si libera solo annullando una bozza, e allora le righe
  tornano «confermata». Nell'interfaccia quelle righe perdono i pulsanti e
  mostrano un lucchetto.
- **Il numero è progressivo per committente**, assegnato sotto advisory lock
  nella stessa transazione che aggancia le righe: due persone che compongono nel
  medesimo istante non prendono lo stesso numero. L'INSERT non è concesso al
  browser — si passa solo da `appalto_sal_crea`, perché un rendiconto scritto a
  mano non avrebbe né le righe agganciate né un numero senza buchi.
- **Righe di contratti diversi non si mescolano**: contratti diversi vogliono
  dire ritenuta e condizioni di pagamento diverse, e il sistema rifiuta invece
  di fare una media.
- Entrano solo le righe **confermate**: le bozze restano fuori finché qualcuno
  non le guarda.
- `20281028151000` — correzione: `appalto_sal_crea` usava una **tabella
  temporanea** `on commit drop`, e due rendiconti composti nella stessa
  transazione si scontravano. In produzione ogni chiamata è una transazione sua,
  ma qualunque lavoro a lotti ci sarebbe finito dentro. Ora un array di id.
- `20281028152000` — correzione più interessante: portando un rendiconto a
  «fatturato» il trigger scriveva `fatturata` su ogni sua riga, e **il
  congelamento bloccava il sistema stesso**. Si poteva aprire un'eccezione nel
  congelamento; il difetto vero era che lo stato di fatturazione stava scritto
  in due posti. Ora sta solo sul documento, e il congelamento resta assoluto.
- [SalAppalto.tsx](../src/components/orders/SalAppalto.tsx) — lo stesso blocco
  serve i due casi: sulla commessa (vista Rendiconto) e sulla scheda del
  committente, dove vivono i cumulativi. Compone proponendo **il mese appena
  chiuso** ([periodoDaRendicontare](../src/lib/appalto/rendiconto.ts), con la
  prova che a gennaio torna a dicembre dell'anno prima — è lì che si rompono le
  versioni scritte con `setMonth(-1)`).
- Prove: 11 passi SQL in transazione annullata (composizione per commessa e
  cumulativa, numerazione che avanza, periodo senza righe, congelamento su
  modifica e su cancellazione, bozza annullabile e inviato no, approvato che non
  torna indietro, fatturato che non cambia più, righe liberate dall'annullo,
  contratti diversi rifiutati) più 13 prove sull'interfaccia.

**Fase 5b — Il PDF e la fattura. ✅ FATTA il 28/10/2026.**

- [RendicontoAppaltoPDF.tsx](../src/components/orders/RendicontoAppaltoPDF.tsx) —
  il documento che il committente riceve, **raggruppato per cantiere**: la prima
  domanda di chi ha tre lavori aperti con te è «questa giornata su quale
  cantiere l'hai fatta?». Ogni riga porta data, quantità, prezzo concordato e
  importo; i costi e il margine **non ci sono**, non sono affari suoi. In fondo
  totale, ritenuta, netto e due righe per le firme: il committente lo firma per
  accettazione, ed è quella la prova.
- [useRendicontoAppaltoPDF.ts](../src/hooks/useRendicontoAppaltoPDF.ts) — legge
  le righe **dal rendiconto**, non dalle tariffe: è il senso del congelamento.
  La carta che il committente ha in mano resta quella anche se domani il listino
  cambia. `@react-pdf/renderer` arriva con un import dinamico al primo click.
- `20281028160000_appalto_sal_fattura` — tre cose:
  - **`appalto_contratti.regime_iva`**. Un subappalto edile va in inversione
    contabile (art. 17 co. 6 lett. a DPR 633/72, natura N6.3) e la fattura non
    espone l'IVA. Non è una decisione da prendere su ogni fattura: con lo stesso
    committente è sempre la stessa, quindi sta sul contratto, accanto alla
    ritenuta. Predefinito `ordinaria`, così i contratti che esistono non
    cambiano regime da soli.
  - **`appalto_sal_collega_fattura`** — un rendiconto e una fattura si agganciano
    1 a 1, con un indice unico: due rendiconti non possono dichiararsi fatturati
    dallo stesso documento, perché sarebbe lo stesso incasso contato due volte.
    Un rendiconto in bozza non si fattura: le sue righe non sono congelate.
  - **La prova.** «Fatturato» non lo decide il bottone: lo decide l'emissione.
    Una bozza di fattura agganciata lascia il rendiconto dov'era; quando quella
    fattura viene emessa, un trigger su `documenti_fiscali` porta il rendiconto a
    «fatturato». Resta il passaggio a mano («L'ha fatturato lui») per quando
    l'autofattura la fa il committente.
- [fattura.ts](../src/lib/appalto/fattura.ts) — `raggruppaPerCantiere` e
  `prefillFatturaDaRendiconto`, le due trasformazioni che il committente vede,
  provate senza montare una pagina. La fattura nasce con **una riga per
  cantiere** (il dettaglio lo porta il PDF, che si allega) e il riferimento del
  committente va in `riferimenti_ordine`, cioè nel `DatiOrdineAcquisto/IdDocumento`
  della FatturaPA: è il campo che il suo ufficio legge per abbinare la fattura
  al proprio ordine. La bozza la scrive l'**editor dei documenti**, che sa già
  fare numerazione, riepilogo IVA ed emissione: duplicare quella logica avrebbe
  voluto dire due posti che col tempo dicono numeri diversi.

*Difetti trovati provando, non ragionando:*
- `20281028161000` — «fuori contratto» era impossibile su una riga a listino: il
  trigger scriveva `extra_contratto := false` su ogni riga con una tariffa. Ma
  lo smaltimento che nessuno aveva previsto si paga con la giornata uomo del
  contratto e **non** è dentro l'accordo: è proprio la riga che si discute a
  fine lavori. Il commento della colonna diceva già la cosa giusta; era il
  codice a dire di meno.
- Il PDF scriveva **«€ 5885,00»**: senza `useGrouping: "always"` il separatore
  delle migliaia non viene scritto. Trovato dalla prova che legge il PDF vero
  con pdfjs, non dall'oggetto che gli passiamo — da un oggetto sarebbe passato.
- Nella scheda del committente le date uscivano come `2026-01-01` e un lavoro **a
  misura** valeva «€ 0,00», che fa sembrare inutile un cantiere di tre mesi: ora
  dice «a misura», e un lavoro a corpo col tetto dice «max € …».
- Un `<p>` conteneva i `Badge`, che sono `<div>`: HTML non valido, il browser
  chiudeva il paragrafo da solo.

*Prove:* 11 passi SQL in transazione annullata sull'aggancio (bozza rifiutata,
stato che non si muove con una bozza di fattura, emissione vera via
`documento_emetti` che chiude il rendiconto, stessa fattura su due rendiconti,
DDT rifiutato, fattura di un'altra azienda, già emessa che fattura subito,
scollegamento, `anon` chiuso), 3 sul «fuori contratto», 14 sulla parte pura e
7 che **leggono il PDF generato** (raggruppamento, subtotali, totali, maggiorazione,
prezzo del cantiere, «Fuori contratto», e che non compaiano né costi né margini).

*Simulazione viva su Demo Azienda 2* (28/10/2026): committente Edil Costruzioni
Rossi con contratto in reverse charge e fatturazione mensile cumulativa, listino
di 5 voci, un'eccezione di prezzo su un cantiere (trasporto a 95 invece di 85),
tre cantieri (due a misura, uno a corpo col tetto), 18 righe fra settembre e
ottobre, il rendiconto n. 1 di settembre composto e approvato (€ 10.314,00,
ritenuta € 412,56, netto € 9.901,44). Ottobre è lasciato confermato e fuori da
ogni rendiconto, così si può comporre a mano e vedere il congelamento.

*Resta fuori, e si vede:* `codice_commessa_convenzione` viene salvato e si legge
nell'editor, ma **non finisce nell'XML** della FatturaPA — né in
`src/lib/fatturazione/generateXML.ts` né in `supabase/functions/_shared/generateXML.ts`.
Il riferimento del committente arriva comunque nell'XML per altre due strade
(`DatiOrdineAcquisto/IdDocumento` e la `Causale`), quindi non è un buco nel
flusso dell'appalto; è un campo dell'editor che non viene emesso, e vale per
tutte le fatture, non solo per queste.

**Fase 6 — I numeri. ✅ FATTA il 28/10/2026.**

- `20281028170000_appalto_i_numeri_per_committente` — due funzioni, non una
  vista: `appalto_conti_committente(dal, al)` (un quadro per committente) e
  `appalto_margine_mensile(committente, mesi)` (il margine mese per mese). I
  conti li fa il database: su PostgREST una tabella a mille righe si taglia, e
  i margini non si sommano nel browser.
- [NumeriAppalto.tsx](../src/pages/azienda/NumeriAppalto.tsx) —
  `/azienda/committenti/numeri`, raggiungibile dall'elenco Committenti. Tre
  blocchi: i committenti a confronto (in classifica per rendicontato, col
  margine accanto), il margine **mese per mese** del committente scelto, e i
  soldi fermi (confermato mai rendicontato, ritenute trattenute, fatturato non
  incassato). La scelta del periodo sta in cima, perché decide tutto il resto.
- [numeri.ts](../src/lib/appalto/numeri.ts) — `tendenzaMargine` dice in parole
  se un committente **peggiora**: confronta la mediana della seconda metà dei
  mesi con quella della prima. La media l'avevo scritta prima, e la prova l'ha
  bocciata: cinque mesi al 30% e uno al 20% le facevano dire «peggiora», perché
  un valore isolato tira la media di tre punti. La mediana no.

*Il difetto vero di questa fase, e vale per tutte:* **il margine percentuale si
calcola sul ricavo delle righe di cui il costo si conosce, non sul rendicontato
intero.** Sui numeri veri di Demo Azienda 2 usciva 28,9% dove il margine era
30,6%: due righe di nolo senza costo stavano al denominatore e non al
numeratore. Corretto in tre posti — le due funzioni nuove, `totaliRendiconto`
(che lo sbagliava allo stesso modo dalla Fase 4) e la pagina della commessa, che
ora scrive anche **su quanta parte** del lavoro il margine è calcolato
(«30,6% sul 94% del lavoro»).

*Una falla di permessi nella Fase 4, trovata arrivando qui:* costo e margine si
vedevano con il solo permesso «Importi delle commesse». Ma `can_view_costs` e
`can_view_margins` sono **due permessi distinti** — un commerciale può avere
l'uno e non l'altro — e nessuno dei due era controllato. Ora lo sono, nelle
funzioni e nella pagina: il costo vuole «Costi», il margine vuole «Margini», e
dove manca il permesso la casella dice «riservato», non un numero.

*Resta aperto, e va deciso:* sulla tabella `appalto_rendiconto_righe` le colonne
`costo_interno` e `margine` sono **leggibili da chiunque possa leggere le righe**:
il controllo oggi è nell'interfaccia e nelle funzioni, non nel GRANT. La cura è
un GRANT per colonna come su `ai_whatsapp_numbers`, ma lì c'è una trappola nota
(un `select("*")` dal browser fallisce, e `RendicontoAppalto` fa esattamente
quello): va fatto con il suo giro di prove, non in coda a una sessione.

*Prove:* 16 sulla parte pura (copertura dei costi, tendenza con il caso del mese
isolato, totali, periodi a cavallo di gennaio e dicembre), 2 nuove su
`totaliRendiconto` e 2 sui permessi di costo e margine nella pagina della
commessa. Le due funzioni provate sui dati veri di Demo Azienda 2 impersonando
il titolare: 18.734 € rendicontati, margine 5.405 € = 30,6% sul 94% del lavoro,
8.420 € confermati e mai rendicontati, 412,56 € di ritenute. E la serie mensile
dice già la sua: settembre 31,5%, ottobre 29,6%.

## 7. Resta da decidere

- **Chi vede i prezzi del committente?** Proposta: titolare e ufficio sì,
  capocantiere e operai no (`canViewOrderAmounts`, già esistente).
- **Il numero del SAL**: progressivo per committente o per azienda? Proposta: per
  committente, perché è il documento che vede lui.
- **La fattura la emette la piattaforma o la carica il committente?** Alcuni
  appaltatori emettono loro l'autofattura: se succede, il SAL approvato resta un
  rendiconto e la fattura si aggancia dopo.

## 8. Il giro del flusso del 29/10/2026

Fatto quello che Florin ha chiesto: creare **da zero, dall'interfaccia**, un
committente nuovo — contratto, listino, commessa, rendiconto, PDF, fattura — e
guardare dove si rompe. Il committente di prova è *Costruzioni Alpine S.r.l.*,
con le tre variabili che nella realtà di un appaltatore ci sono sempre: la
**giornata uomo** (280 €/uomo·giorno, con la maggiorazione festiva al 50%), il
**chilometro** (1,25 €/km) e il lavoro **a corpo** (1.450 € il bagno).

Il flusso regge da capo a fondo: 3 giornate con +50% = 1.260 €, 420 km = 525 €,
un bagno = 1.450 €; rendiconto n. 1 da 3.235 € con ritenuta 4% (129,40 €),
netto 3.105,60 €; fattura FT-2026-30204 in reverse charge N6.3, emessa, e il
rendiconto passato a «fatturato» **dall'emissione**, non da un bottone.

Quello che si è rotto, e che è stato corretto:

**1. Il costo si poteva scrivere solo sulle righe libere.** Il campo «Costo tuo»
compariva solo quando NON si sceglieva una voce di listino — cioè quasi mai. Su
una riga a listino il costo poteva arrivare solo da una tariffa aziendale
agganciata, che il dialogo del listino non permette nemmeno di impostare: in una
azienda nuova il margine sarebbe rimasto **NULL per sempre**, e la pagina «quale
committente mi conviene» non avrebbe avuto niente da dire. Ora il campo c'è su
tutte le righe; dove la voce è agganciata a una tariffa aziendale vince il costo
di quella, ed è giusto così.

**2. L'intestazione di una commessa in appalto era tutta a zero.**
`OrderFinancialOverview` legge `total_amount`, il piano incassi e le scadenze:
su un lavoro per un appaltatore quei campi sono vuoti per costruzione, e il
titolare vedeva «0,00 €» e «Importo da definire» su un cantiere con 5.050 € di
lavoro rendicontato. Nuovo componente `RiepilogoAppaltoCommessa`: rendicontato,
da rendicontare, margine € e %, e quanto è chiuso nei rendiconti e già
fatturato. Fatturato e incassato **in euro per cantiere non ci sono di
proposito**: con la fatturazione mensile cumulativa una fattura copre più
cantieri, e spalmarla su uno solo sarebbe inventare.

**3. La vista dei rapportini da rendicontare rispondeva 403 a tutti.**
`v_appalto_rapportini_da_rendicontare` è concessa ad `authenticated` ma chiama
in lateral `appalto_riga_da_rapportino`, che era chiusa al service role: il
privilegio di una funzione dentro una vista si controlla su chi interroga. Il
riquadro era quindi invisibile da sempre, e un rapportino approvato che non
diventa una riga è una giornata che non viene fatturata. Non è stato risolto con
un GRANT: la funzione è SECURITY DEFINER e restituisce il **costo orario di una
persona**, quindi il controllo degli accessi è stato messo dentro la funzione
(migrazione `20281029110000_appalto_rapportino_vista_403`). Provato: il titolare
vede la proposta (1 uomo·giorno, costo 228 €), un utente di un'altra azienda si
prende «Non hai accesso a questo rapportino».

**4. «Componi» proponeva un periodo vuoto.** Il periodo suggerito era il mese
appena chiuso, giusto quando si lavora al passo; ma con 3.235 € di ottobre da
rendicontare, il 29 ottobre proponeva settembre e il rendiconto usciva con
«Nessuna riga confermata da rendicontare in questo periodo». Ora il periodo si
prende dalle righe in attesa (`periodoDaRigheInAttesa`).

**5. La finestra «Ultimi 12 mesi» finiva oggi, non a fine mese.** Un rendiconto
mensile copre fino al 31: il 29 ottobre il rendiconto di ottobre restava fuori
dalla finestra, e con lui la sua ritenuta e la sua fattura. Ora i dodici mesi
sono dodici mesi interi, come «Quest'anno» che già finiva al 31/12.

**6. La tendenza su tutti i committenti insieme diceva «stabile».** Con un
committente fermo al 30% e uno che scende dal 18 al 10, `tendenzaMargine` su una
serie che contiene righe di committenti diversi non legge una curva: legge righe
in fila. La pagina nascondeva esattamente la cosa per cui esiste. Ora, senza
nessuno selezionato, ognuno ha la sua lettura e chi peggiora si chiama per nome:
«Immobiliare Brianza S.p.A.: il margine peggiora (−6,1 punti)».

**7. Minori, ma veri.** La scheda committente mostrava `orders.status` (lo slug
vecchio, «in_progress») invece della fase da `current_status_id`, che è quella
che legge tutto il resto dell'app. I rendiconti di un contratto *per commessa*
non dicevano **di quale cantiere** fossero. Il riepilogo della nuova commessa
prometteva «Codice: Auto» e poi non generava niente (ora usa
`prossimo_numero_commessa`, come la commessa normale). La data del contratto
usciva in ISO nel menù a tendina. E tre motivi sbagliati accanto a un margine
vuoto: «nessun costo noto» dove il costo c'era e la riga era solo in bozza, o
dove era già tutto in un rendiconto.

**8. Un difetto che mi ero fatto da solo.** Il riquadro «Già fatturato» leggeva
le righe in stato `fatturata` — stato a cui le righe **non arrivano mai**, da
quando la migrazione `appalto_sal_una_verita_sullo_stato` ha tolto la
propagazione («lo stato del documento sta sul documento»). Sarebbe rimasto a
zero per sempre. Ora lo legge dallo stato del rendiconto.

**Le varianti di «Come viene pagato questo lavoro».** Ne restano due, e
coprono i casi veri: *a misura* (a giornata, al km, al metro quadro — si sa alla
fine) e *a corpo* (l'importo è concordato). Il terzo caso che in cantiere
esiste davvero, il **misto** — prezzo chiuso più lavori in più — non è una terza
scelta: è *a corpo* più le righe segnate **fuori contratto**. Il sistema già lo
reggeva; la pagina non lo diceva, e chi prendeva un lavoro a corpo con degli
extra non sapeva dove metterli. Ora c'è scritto sotto la scelta.

*Non corretto, e resta da decidere:* in Demo Azienda 2 **nessuna fattura si
poteva emettere**. Lo storico demo usa `numero_progressivo` dai 10.000 in su
mentre `ultimo_numero_fattura` era fermo a 81, e il controllo data/numero di
`documento_emetti` blocca qualunque nuova fattura. È un problema dei dati di
demo, non del codice — il controllo fa il suo mestiere — ed è stato sbloccato
allineando il contatore a 30.203. Vale la pena chiedersi se la stessa cosa possa
capitare a un cliente che importa lo storico.

*Prove:* 116 verdi sul modulo (13 nuove sui conti della commessa e sul periodo
proposto, 3 sulle tendenze per committente, 2 sulla finestra a fine mese).

## 9. Il resto del flusso, stesso giorno

Dopo il giro principale sono stati provati i pezzi che restavano, e ne sono
usciti altri cinque difetti.

**Il rapportino che diventa riga.** Funziona, e le sue regole reggono: la riga
nasce in **bozza** (origine «rapportino»), con la tariffa che corrisponde alla
qualifica dell'operaio e il costo preso dal suo costo orario — 8 ore a 28,50 €
diventano 1 uomo·giorno a 280 € con 228 € di costo. Se togli l'approvazione la
riga sparisce, ma **solo se è ancora in bozza**: una già confermata resta, e
riapprovando non si duplica.

**L'eccezione di prezzo sul cantiere.** Provata nel modo che conta: ho scritto
dal browser una riga con descrizione «PROVA SCRITTA DAL BROWSER», unità «cad» e
prezzo 999. Il database ha salvato la descrizione del listino, unità «km» e
prezzo **1,10** — l'eccezione di questo cantiere, non il listino a 1,25 e
tantomeno il 999. La riga vecchia ha tenuto il suo 1,25. È la regola «il prezzo
lo decide il database, non il browser», verificata invece che creduta. Nello
stesso giro il trigger ha rifiutato una tariffa **di un altro contratto**.

**1. «Il numero non verrà riusato» era falso.** Il dialogo di annullamento lo
prometteva; il progressivo è `max(numero)+1`, quindi il numero di una bozza
annullata viene riusato dal rendiconto successivo. Il comportamento è giusto —
si annulla solo una bozza, che al committente non è mai arrivata — ed è la frase
a essere stata corretta.

**2. «Stacca» lasciava uno stato che mente.** Staccando la fattura da un
rendiconto già fatturato, lo stato resta «fatturato» (non torna indietro per
progetto) e la scheda continuava a dire «è diventato una fattura» senza niente
da aprire. Ora c'è la riga che lo dice, e staccare una fattura **emessa** chiede
conferma spiegando che la fattura non viene toccata ma lo stato non torna
indietro. La stessa riga copre il caso dell'autofattura del committente
(«L'ha fatturato lui»), che porta allo stesso stato per un'altra strada.

**3. Si poteva agganciare la fattura di un altro cliente.** L'elenco di
«Collega una fattura già fatta» mostrava tutte le fatture dell'azienda, e
`appalto_sal_collega_fattura` non guardava a chi fossero intestate. Con la
fatturazione per committente quel legame è la sorgente di *fatturato*,
*incassato* e *da incassare*: una fattura sbagliata sposta soldi veri da un
committente all'altro nella pagina su cui il titolare decide. Corretto in tutte
e due le direzioni: la lista ora mostra solo le fatture di quel committente, e
il database rifiuta le altre (migrazione
`20281029120000_appalto_fattura_dello_stesso_committente`). Provato: agganciando
la fattura di un altro cliente arriva «Quella fattura è intestata a un altro
cliente».

**4. La fattura nasceva staccata dall'anagrafica.** «Prepara la fattura»
riempiva il nome del cliente nello snapshot ma lasciava `anagrafica_id` vuoto:
la fattura non compariva fra i documenti del committente e niente poteva
verificare che fosse la sua — ed è proprio quello che serve al controllo del
punto 3. Ora l'anagrafica si cerca per partita IVA o codice fiscale e, se non
c'è, si crea: la stessa cosa che fa l'editor quando scrivi un cliente nuovo.

**5. Sul PDF uscivano le sigle del database.** Nella colonna U.M. della carta
che riceve il committente si leggeva `uomo_giorno` e `corpo`; ora «uomo/giorno»
e «a corpo», come ovunque nell'app.

**Permessi, verificati sui dati veri.** Con `ufficio2@azienda.srl` (importi e
costi sì, margini no) `appalto_conti_committente` restituisce rendicontato,
costo, fatturato e incassato ma **margine NULL**; un operaio senza «Importi
delle commesse» si prende «Non puoi vedere i numeri dell'appalto di questa
azienda» e non vede niente.

**Telefono (375px).** Nessuno scorrimento orizzontale di pagina né sul
rendiconto né sui numeri: i riquadri si impilano a due a due e le tabelle
scorrono dentro il loro contenitore. *Resta aperto:* nella tabella «Committenti
a confronto» su telefono la colonna del **margine %** finisce fuori schermo, ed
è la colonna per cui la pagina esiste. Va ripensata per il telefono, non
allargata.

**Il PDF, guardato.** Generato con i dati veri di Costruzioni Alpine e aperto:
intestazione dell'azienda, committente e contratto con il «Vs. riferimento», un
blocco per cantiere col suo totale, totale del periodo, ritenuta 4% e «Netto da
fatturare» € 3.105,60, note, due righe per le firme, piè di pagina con la
numerazione. I separatori delle migliaia ci sono.

**6. La fattura nasceva senza scadenza.** `giorniPagamento` arrivava dal
contratto al `prefillFatturaDaRendiconto` e **non lo usava nessuno**: il
contratto diceva «pagamento a 45 giorni» e la fattura usciva con la scadenza
vuota, cioè fuori dallo scadenzario e fuori dal previsionale di cassa. Per un
appaltatore quella data è il punto. Ora la scadenza si calcola dai giorni del
contratto (`scadenzaDaGiorni`) e finisce sia in `data_scadenza` sia nelle
`scadenze_pagamento`. Provato: il rendiconto di Immobiliare Brianza, contratto a
60 giorni, esce con scadenza 28/12/2026.

Nello stesso punto è stata corretta una promessa che nessuno manteneva: il
wizard diceva «le rate nasceranno dal rendiconto approvato», e **niente le
crea** — non c'è nessun trigger da `appalto_sal` a `order_installments`. Ed è
giusto che non ci sia: la scadenza vera sta sulla fattura, e metterla anche
come rata della commessa farebbe contare lo stesso incasso due volte nel
previsionale. Ora la frase dice dove guardare.

## 10. La testata del telefono (29/10/2026)

Fuori dall'appalto, ma vista guardando il modulo da telefono: l'intestazione
aveva **sette elementi in 375 px** — indietro, logo, nome azienda, timbra,
rotellina impostazioni, cervello di Silvio, chat, campanella — e il nome
dell'azienda usciva tagliato («Demo Az…»).

Tolte due icone:

- **Il cervello di Silvio.** Sul telefono Silvio è già il bottone grande e
  arancione al centro della barra in basso, dove arriva il pollice. Due porte
  per la stessa stanza in una testata da 375 px erano una di troppo.
- **La rotellina delle impostazioni.** Era però l'**unico** accesso alle
  impostazioni da telefono: toglierla e basta le avrebbe rese irraggiungibili.
  La voce è stata quindi aggiunta alla griglia «App», in fondo, con la sua
  sezione — che è il posto dove un utente le cerca, insieme a tutto il resto.

Risultato: cinque elementi, e il nome dell'azienda si legge per intero. Su
desktop non cambia niente: quelle due icone erano `md:hidden`.

## 11. Creare per un cliente finale e creare in appalto: la differenza

Domanda di Florin: «c'è differenza quando creo la commessa per cliente finale e
il cliente come appalto? Le modifiche sono diverse». Sì, e nel punto peggiore:
il lavoro in appalto si crea con un wizard suo e si **modifica** con la maschera
del cliente finale. Cinque difetti.

**1. Si poteva cambiare il committente.** Il menu «Cliente *» elencava tutti i
clienti finali: spostando il lavoro da Costruzioni Alpine a una famiglia
restavano appesi al vecchio committente il contratto, il listino, ogni riga di
rendiconto e i rendiconti già mandati — e il trigger dei prezzi avrebbe
rifiutato ogni riga nuova con «la tariffa appartiene a un altro contratto».
Sulle commesse d'appalto il committente ora è **in sola lettura**, con il
collegamento alla sua scheda e il motivo scritto sotto.

**2. Chiedeva l'importo e le rate su un lavoro a misura.** Il wizard di
creazione, a misura, chiama l'importo «stima», aggiunge il tetto e toglie le
rate spiegando perché; la modifica mostrava «Importo Totale (Imponibile) *»,
IVA, bonus edilizio, acconti e saldo — cioè proprio quello che genera una
previsione di incasso falsa. Ora, a misura, al loro posto ci sono importo
stimato e tetto concordato, con la riga che dice dove nasce la scadenza vera.

**3. Mancavano i campi che contano.** Come viene pagato, il contratto, il tetto
e il loro numero d'ordine non si vedevano nemmeno. Ora: i primi due in sola
lettura (cambiarli a lavoro iniziato riscriverebbe il senso delle righe già
rendicontate), gli altri due modificabili.

**4. E, sotto, un no-op silenzioso.** Resi modificabili i due campi, il
salvataggio rispondeva «campo non scrivibile da qui: tetto_importo»:
`commessa_salva` tiene un elenco dei campi ammessi. Aggiungerli all'elenco però
**non basta**: la UPDATE della testata elenca le colonne una per una, quindi il
salvataggio sarebbe andato a buon fine senza scrivere niente. Un no-op
silenzioso è peggio dell'errore. Entrambi i punti corretti nella migrazione
`20281029140000_commessa_salva_tetto_e_riferimento`, che modifica la funzione
viva invece di ricopiarne quattrocento righe.

**5. Dalla parte opposta: «Nuova Commessa» accetta un committente senza dirlo.**
Il menu dei clienti contiene anche i committenti, e da lì nasce una commessa
normale: senza contratto, senza listino, senza rendiconto, e invisibile fra i
«Lavori che ti passa» sulla sua scheda. Non si blocca — un committente può
anche comprarti qualcosa — ma ora un avviso lo dice e porta al wizard giusto
con il committente già scelto (`?committente=…`).

Provato per intero: salvataggio dall'interfaccia con tetto 12.000 € e numero
d'ordine, e dopo il salvataggio committente, contratto, 5 righe e 1 rendiconto
tutti al loro posto.

## 12. Sopralluoghi: indirizzo e tecnico (29/10/2026)

Due guasti segnalati da Florin sul wizard «Nuovo sopralluogo», passaggio 3.

**L'indirizzo era un campo libero.** Tre caselle — via, città, CAP — e nessun
cercatore: si poteva scrivere «sdgasdg» e la bozza partiva con un cantiere che
non esiste, senza coordinate, quindi senza mappa e senza navigatore per chi ci
deve andare. Ora c'è lo stesso `AddressAutocomplete` della commessa: si cerca
l'indirizzo vero e città, CAP, provincia e coordinate arrivano da soli; resta
scrivibile a mano, perché il luogo si può completare durante il rilievo.

**«Tecnico incaricato» elencava tutti.** La query prendeva ogni riga di
`profiles` con quel `company_id` — e i clienti sono profili anche loro: nel menu
comparivano «ZAHREBEER SOCIETA' SEMPLICE AGRICOLA» e mezzo archivio clienti, col
rischio di assegnare il rilievo a un cliente. Ora usa `useCompanyStaffUsers`, lo
stesso filtro di «Assegnato a» sulle commesse, che esclude customer, referrer e
il team della piattaforma. Su Demo Azienda 2: da **146 nomi a 11**.

# I flussi della merce: tutte le strade, e dove si pestano i piedi

> Il seguito — dall'ordine al pagamento del fornitore, acconti, saldi, RiBa e
> commessa — è in `docs/flussi-acquisti-pagamenti.md`.

Scritto il 29/10/2026 misurando il database di produzione, non ragionando a
memoria. Accompagna `docs/piano-ddt-bolle-fatture.md`.

## Prima di tutto: una correzione

Nei giorni scorsi ho usato come prove alcune percentuali sulle bolle — «il 40%
non ha righe di dettaglio», «231 su 232 non hanno un corriere». **Quei numeri
descrivono dati di prova, non il comportamento di clienti veri**: tutte le 232
bolle, e tutte le 840 ricezioni merce, appartengono a *Demo Azienda 2* e hanno
la nota `[DEMO …]`. Nessuna azienda vera ha mai caricato una bolla.

Le conclusioni restano, ma stanno su un'altra gamba: sul **codice**, non su quei
conteggi. L'ODA era `NOT NULL` (quindi la bolla non si poteva caricare senza
ordine), la maschera chiedeva `legacy_format: true` (quindi le righe lette si
buttavano), `goods_receipts.order_item_id` è obbligatorio (quindi un prodotto
fuori ordine non ha dove andare). Questi sono fatti del codice, verificabili, e
non dipendono da quante bolle ci sono dentro.

## Chi usa cosa, davvero

| Azienda | ODA | Bolle | Giacenze | Fatture ricevute | Rapportini | Commesse |
|---|---|---|---|---|---|---|
| Best Infissi | 0 | 0 | 0 | **7.137** | 0 | **0** |
| Innovasol | 0 | 0 | 0 | **4.525** | 0 | 1 |
| Dimora Torino | 0 | 0 | 0 | **1.271** | 0 | 1 |
| renova solution | 0 | 0 | 0 | 355 | 0 | 41 |
| Demo Azienda 2 | 238 | 232 | 114 | 1.024 | 4.220 | 192 |
| Demo Azienda | 41 | 0 | 17 | 0 | 3 | 65 |

Due cose salgono da questa tabella.

**Le aziende vere hanno solo fatture.** Zero ordini d'acquisto, zero bolle, zero
giacenze, zero rapportini. E delle 13.288 fatture ricevute delle aziende vere,
**zero** hanno una commessa o un ordine collegato — non «il 97% no»: zero. Le
uniche con un collegamento sono le 431 della Demo.

**La catena progettata non è mai stata percorsa da nessuno.** Il giro
ODA → bolla → magazzino → scarico in cantiere esiste solo nelle due aziende
dimostrative. Delle 840 ricezioni merce, **nessuna** ha prodotto un movimento di
magazzino: sono state inserite coi trigger spenti (è così che si caricano i dati
di prova), quindi il carico automatico — quello che la pagina promette con
«il carico magazzino è automatico» — **non è mai girato per davvero**.

## Le sei porte, e le quattro tabelle

Lo stesso fatto del mondo reale — «è arrivata della merce» — entra da sei strade
e finisce in quattro tabelle diverse.

| # | Chi | Da dove | Scrive in | Produce giacenza? | Produce costo? |
|---|---|---|---|---|---|
| 1 | Ufficio | scheda bolla (`NewDDTDialog`) | `ddt_ricezione` + `ddt_righe` | no (non ancora) | no |
| 2 | Magazziniere | arrivo merce da ODA, anche con barcode | `goods_receipts` | sì, via trigger | no (è sull'ODA) |
| 3 | Operaio | `/campo/merce` «Merce presa» | `campo_acquisti` | no | sì, `company_costs` sulla commessa |
| 4 | Operaio | foto su WhatsApp (`carica_ddt`) | `email_ddt_carico` (bozza) | sì, alla conferma | no |
| 5 | Posta | DDT allegato a una email | `email_ddt_carico` (bozza) | sì, alla conferma | no |
| 6 | SDI | fattura del fornitore | `fatture_ricevute` | no | sì, ma senza cantiere |

Le strade 4 e 5 convergono: `conferma_carico_ddt` crea (o riusa) una riga in
`ddt_ricezione` e scrive la giacenza direttamente, **senza passare da
`goods_receipts`**. Quindi ci sono due modi diversi di caricare il magazzino, e
scrivono in posti diversi.

E le righe della merce vivono in **quattro forme**: righe vere in `ddt_righe`,
righe vere in `goods_receipts`, un `jsonb` dentro `campo_acquisti`, un altro
`jsonb` dentro `email_ddt_carico`.

Più tre lettori AI con tre schemi: `ddt-ai-extract` (ufficio, campo, posta),
`ai-ddt-analyzer` (magazzino), `_shared/ddtLetto.ts` (WhatsApp); e
`ddt-ocr-extract`, che non è chiamato da nessuno.

## Le varianti di una bolla

Ogni bolla, oggi, è una combinazione di quattro domande indipendenti.

| Domanda | Possibilità | Chi la decide |
|---|---|---|
| Da dove nasce | da un ODA · da una commessa · da sola | chi carica (fase 1) |
| Dove va la merce | magazzino · cantiere | chi carica (fase 2-bis) |
| Chi l'ha portata | il fornitore · noi (ritiro) · un corriere | letto dall'AI, correggibile |
| Chi paga il trasporto | compreso (franco) · a nostro carico (assegnato) | letto dall'AI, correggibile |

Tre per due per tre fa diciotto combinazioni, e non sono tutte sensate: il
database ne vieta tre, e sono i vincoli che impediscono i doppioni.

1. «in cantiere» esige una commessa;
2. una bolla con ODA non porta un costo suo (il costo è sull'ordine);
3. la merce posata in cantiere non entra mai in giacenza.

## Dove due flussi si pestano i piedi

**(a) Operaio e ufficio, lo stesso documento.** Il controllo doppioni
dell'operaio guarda solo `campo_acquisti`; quello dell'ufficio (nuovo) solo
`ddt_ricezione`. Provato: l'operaio segna il documento, il secondo invio è
bloccato; poi l'ufficio carica la bolla con lo stesso numero e **passa**. Oggi
non si raddoppia nessun costo, perché una bolla senza ODA non ne genera ancora —
si raddoppierà col pulsante «registra il costo dalla bolla». Tappabuchi messo:
salvando, la pagina avvisa. **Da decidere: fondere le due registrazioni.**

**(b) Due modi di caricare il magazzino.** `goods_receipts` (col trigger) e
`conferma_carico_ddt` (scrittura diretta). Due codici che fanno la stessa cosa
divergeranno.

**(c) La fattura non sa niente.** Nessuna colonna lega `fatture_ricevute` alle
bolle, e la commessa è un solo campo: la fattura di fine mese con dieci bolle di
cantieri diversi non è rappresentabile. È la fase 4 del piano.

## Due guasti che ho introdotto io oggi, e corretto

Trovati ragionando sui flussi, non da un errore in produzione: lì sarebbero
emersi al primo caso sfortunato.

**1. La conferma di un carico moriva sul vincolo.**
`conferma_carico_ddt` cercava una bolla già esistente solo fra quelle dello
stesso ordine. Da quando l'ODA è facoltativo, l'ufficio può averla caricata
senza ordine: la ricerca non la trovava, l'inserimento urtava il vincolo unico
(azienda, fornitore, numero) e `unique_violation` non gestita faceva fallire
tutta la conferma. Ora la bolla si cerca per numero dentro l'azienda — stesso
ordine o nessun ordine — e ci si attacca, agganciando l'ODA a quella che c'era.
Migrazione `20281029220000`.

**2. Gli arrivi sui cantieri archiviati venivano rifiutati.**
La regola «una bolla nuova non si attacca a un cantiere cancellato» colpiva
anche la commessa che nessuno ha scelto: quella dedotta dall'ordine. Lì non è
una scelta, è un fatto. Sulla Demo 2 il 19% degli ODA è su una commessa
archiviata: per tutti quelli la registrazione dell'arrivo moriva con «La
commessa e' stata cancellata». Ora la regola vale solo sulla commessa scritta da
una persona. Migrazione `20281029230000`.

Provati entrambi su dati veri, in transazioni annullate: l'arrivo su commessa
archiviata passa, la scelta a mano di un cantiere cancellato resta vietata, la
ricerca vecchia non trovava la bolla e la nuova la trova e la riusa.

## Che cosa dice tutto questo sull'ordine del lavoro

Il piano mette la fattura ripartita per cantiere alla fase 4, dopo bolle, righe
e pagina. Per un'azienda vera **è il contrario**: le fatture sono l'unica cosa
che ha già in casa (13.288 righe), e per ripartirne una sui cantieri non serve
nessuna bolla — basta poter dire «questa fattura da 8.000 € è per 5.000 al
cantiere A e 3.000 al cantiere B».

Tre strade, ordinate per quanto l'azienda deve già fare prima di avere qualcosa
in mano:

1. **Fattura → ripartizione sui cantieri.** Non richiede niente a monte.
   È l'unica che funzionerebbe oggi per Best Infissi, Innovasol, Dimora.
2. **Foto della bolla → costo sul cantiere.** Non richiede ODA né magazzino.
   Possibile da oggi grazie alle fasi 1 e 2.
3. **ODA → bolla → magazzino → scarico.** La catena intera, per chi ha un
   magazzino e lo tiene. Oggi la percorre solo la Demo.

**Questa è una proposta di riordino del piano, non una decisione presa.**

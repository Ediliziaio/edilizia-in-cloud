# Piano: tutti i costi della commessa, giusti e alla data giusta

*Scritto il 01/11/2026 su richiesta di Florin («ragiona dall'alto: vendita, operai, fornitori in RiBa
30/60/90, costi senza fattura… dimmi se c'è tutto e se non ci sono problemi»). Si appoggia a
[flussi-acquisti-pagamenti.md](flussi-acquisti-pagamenti.md) (ciclo passivo, 29/10) e a
[piano-personale-costi-commesse.md](piano-personale-costi-commesse.md) (manodopera, 13/10): qui non si
ripetono, si dice cosa manca e in che ordine farlo.*

## L'obiettivo in una frase

Per ogni commessa: **quanto ho venduto, quanto mi costa davvero (senza IVA), quanto devo ancora pagare
e incassare e in che giorno (con IVA)**, con ogni numero che porta al documento da cui viene, nessun
costo contato due volte e nessuna scelta fatta in silenzio.

## 1. Come stanno le cose oggi (misurato il 01/11/2026)

| Voce | Lo strumento c'è? | Funziona sui dati veri? |
|---|---|---|
| Vendita: contratto, varianti, rate, SAL, fatture emesse | Sì | Sì |
| Operai: ore dei rapportini × costo orario (lordo, mensilità, INPS, INAIL, Cassa Edile, TFR) | Sì | Nessuna delle 4 aziende vere registra ore in commessa |
| Busta paga di fine mese che corregge il costo stimato | **No**: 1.021 cedolini, nessuno arriva alle commesse | — |
| Ditte e subappalti: contratto, SAL, fattura, reverse charge | Sì (rifatto il 31/10) | Solo Dimora, 37 righe |
| Fornitori: ordine → bolla → fattura → costo, ripartizione | Sì | **Dimora: 1.277 fatture, 0 su una commessa** |
| Rate dei fornitori (RiBa 30/60/90) da XML SDI/OpenAPI | Sì, ma **solo quando la fattura è contabilizzata** | renova 224/224; Bonarrigo 20 RiBa nell'XML, 0 contabilizzate → invisibili in cassa |
| Rate dei fornitori da Fatture in Cloud | **No**: `billing-import` legge `payments_list` solo per le EMESSE | Dimora, Innovasol, Best Infissi: scadenze e RiBa perse |
| Accordo col fornitore (giorni, fine mese, metodo, IBAN) | Il posto c'è (`suppliers`) | Nessuno lo compila, nessuna funzione lo legge |
| Ritenuta d'acconto dei professionisti (geometra, DL, progettista) | **No**: `fatture_ricevute` non la registra | Si paga il lordo, l'F24 del 16 non esiste |
| Costi senza fattura (Comune, bolli, F24, extra) | Sì, con ricevuta e lavorazione | Usati pochissimo |
| Debiti segnati pagati | Sì (spunta, prima nota) | **0 pagati** su Dimora, renova, Best Infissi; banca non collegata |
| Acconto sull'ordine d'acquisto | Margine giusto | **Cassa sbagliata**: il saldo sparisce dopo la fattura d'acconto |
| Fornitore riconosciuto dalla P.IVA | Parziale | Dimora 421/1.277, Innovasol 105/4.528, Best 13/7.172 |

**In breve:** i pezzi principali ci sono. Tre buchi falsano i numeri (rate da Fatture in Cloud, busta paga,
fatture non assegnate) e uno falsa la cassa (niente risulta pagato). Il resto è completezza.

## 2. Le regole che valgono per tutto il piano

1. **Costo senza IVA, cassa con IVA.** Il margine si fa sull'imponibile, scadenze e pagamenti sul lordo
   (o sul netto da pagare: ritenute e reverse charge cambiano quanto esce, non quanto costa).
2. **Per la data di pagamento valgono tre fonti, in quest'ordine:** l'accordo (ordine d'acquisto, poi
   scheda fornitore), poi la fattura (XML o Fatture in Cloud), poi niente. **Mai la data della fattura
   da sola.** Se accordo e fattura non coincidono, **si segnala**, non si sceglie in silenzio.
3. **Un costo, una fonte.** Ordine, bolla, fattura e costo a mano si collegano, non si sommano. Ogni
   lotto ha un test che lo prova.
4. **Stimato e consuntivo si distinguono.** Ogni costo dice se è una stima (ore × tariffa, ordine non
   fatturato) o un fatto (cedolino, fattura). Il margine «reale» dice quanto è ancora stima.
5. **Niente di nuovo nasce pagato.** Pagato lo dice la banca, la prima nota o una persona; una regola
   automatica (RiBa scaduta = pagata) solo se l'azienda la accende.

## 3. Le cose da fare

### A. Fornitori e pagamenti: le uscite alla data giusta

**A1. Rate dalle fatture ricevute di Fatture in Cloud.** In `billing-import` (`salvaRicevuteFic`) leggere
`payments_list` (importo, scadenza, stato, pagato il) e il metodo come per le emesse, e salvarli sulla
fattura. Alla contabilizzazione `crea_rate_fornitore` crea una rata per scadenza, come per l'XML.
Prima, una chiamata di prova per sapere se `received_documents` con `fieldset=detailed` restituisce
`payments_list`. Se non lo fa, si usa l'accordo del fornitore (A3).
*Fatto quando:* una fattura FIC da 10.000 € in RiBa 30/60/90 genera tre rate alle tre date, e lo
scadenzario e la cassa della commessa le mostrano.

**A2. Fatture dallo SDI (OpenAPI, Aruba, XML caricato): il piano di pagamento appena arriva.** Oggi
rate e RiBa nascono solo alla contabilizzazione. Proposta:
- leggere subito `DatiPagamento` (tutte le rate, `ModalitaPagamento`, IBAN, `CondizioniPagamento`) e
  mostrarli nella fattura ricevuta: «3 rate RiBa: 12/12, 11/01, 10/02»;
- metterle nel previsionale di cassa come **uscite probabili**, anche prima della contabilizzazione;
- un'impostazione dell'azienda: «contabilizza da sole le fatture con fornitore riconosciuto e ordine o
  commessa certi», così le RiBa diventano debiti senza aspettare l'ufficio.

*Fatto quando:* le 20 RiBa di Bonarrigo compaiono nel previsionale e in Tesoreria il giorno in cui
arriva la fattura.

**A3. L'accordo col fornitore, usato davvero.** Nella scheda fornitore: giorni (30/60/90/120), fine
mese sì/no, giorno fisso, metodo (bonifico, RiBa, RID, carta, contanti), IBAN. Lo leggono:
`crea_rate_fornitore` quando la fattura non dice niente, l'ordine d'acquisto (che lo può cambiare) e il
controllo che **segnala** quando la fattura dice altro («RiBa 60 gg in fattura, accordo 90 gg»).
L'accordo si propone in automatico dalle ultime 5 fatture di quel fornitore.

**A4. Fornitore riconosciuto dalla P.IVA.** Ogni fattura ricevuta trova o crea il suo fornitore da
P.IVA o codice fiscale (oggi 13 su 7.172 per Best Infissi). Doppioni uniti con una funzione apposita.
È la base di A3, B1 e dei debiti per fornitore.

**A5. Il portafoglio RiBa.** Una vista per tutte le RiBa: in arrivo, avvisata dalla banca, addebitata,
insoluta. Avviso al titolare 5 giorni prima delle RiBa della settimana, con il totale. Una RiBa
addebitata chiude la rata; una RiBa insoluta la riapre e lo segnala.

**A6. Ritenuta d'acconto dei professionisti.** Leggere `DatiRitenuta` dall'XML (o scriverla a mano):
il costo della commessa è il **lordo**, al professionista si paga il **netto**, e nasce una scadenza
F24 il 16 del mese dopo il pagamento, per l'importo della ritenuta. Vale anche per la cassa
previdenziale (`DatiCassaPrevidenziale`) e il bollo.

**A7. Acconto sull'ordine d'acquisto, lato cassa.** Il saldo resta un debito (totale dell'ordine
meno acconti fatturati) finché non arriva la sua fattura. Nessun costo contato due volte: lo prova un
test sui tre casi (acconto prima, insieme, dopo l'ordine).

**A8. Note di credito dei fornitori.** Stornano il costo e la rata della fattura che correggono, sulla
stessa commessa (come per le note di credito ai clienti del 23/10).

### B. Fatture e costi sulla commessa giusta

**B1. «Fatture da assegnare».** Una coda unica delle fatture ricevute che non stanno su una commessa né
sono spese generali, ognuna con una **proposta** e la sicurezza della proposta:
- ordine d'acquisto o bolla collegati: certa;
- fornitore che in quel periodo lavora su una sola commessa aperta: alta;
- indirizzo del cantiere, codice commessa o nome del cliente nel testo della fattura: media;
- AI sulle righe (esiste già `order_id_suggerito`): da confermare.

Un clic conferma, due dividono su più commesse (per righe o per percentuale) o la segnano «spesa
generale». La coda dice quanto vale il non assegnato. *Fatto quando:* su Dimora le fatture da luglio
(255) sono tutte assegnate o spese generali.

**B2. Regole dell'azienda.** «Il fornitore X va sempre in spese generali» (commercialista, utenze,
software), «il fornitore Y va sulla commessa attiva in quel cantiere». Si applicano all'arrivo; ogni
applicazione si può annullare.

**B3. Costi senza fattura del cantiere, già pronti.** Voci con nome, scadenza e metodo tipico: oneri
comunali e diritti di segreteria, occupazione suolo pubblico, bolli e marche, smaltimento rifiuti e
formulari, polizza CAR e fideiussioni, pratiche e permessi, noleggi senza fattura, spese di trasferta.
Pagabili con F24 o bollettino; la ricevuta si fotografa dal telefono.

**B4. Spese generali di struttura.** Una percentuale (o un importo al mese) ripartita sulle commesse
per ricavo o per ore, scelta dall'azienda, mostrata **a parte** nel conto economico: margine di
commessa e margine dopo struttura.

### C. Manodopera: dalla stima alla busta paga

**C1. Chiusura del mese con il cedolino.** A cedolino caricato, per ogni dipendente: costo vero del mese
(lordo + oneri del datore + TFR + Cassa Edile, dal prospetto) meno costo già imputato ai cantieri
(ore × tariffa). La differenza si **ripartisce sulle commesse in proporzione alle ore del mese**; le
ore non di cantiere (magazzino, ufficio, assenze) vanno in struttura. Ogni commessa vede «stimato» e
«consuntivato». Le tariffe sono storicizzate: una tariffa nuova non cambia i mesi chiusi.
*Fatto quando:* un operaio con 168 ore su due cantieri e una busta da 3.200 € di costo azienda porta
esattamente 3.200 € sui cantieri e sulla struttura, né un euro di più né di meno.

**C2. Ore che mancano.** Avviso all'ufficio: rapportini da approvare più vecchi di 3 giorni, giornate HR
senza cantiere, ore di cantiere senza giornata HR. Il margine della commessa dice «ore da approvare:
32» invece di sembrare migliore del vero.

**C3. Stipendi in cassa.** La quota degli stipendi di ogni commessa esce nella cassa alla data in cui
l'azienda paga davvero (giorno imparato dai pagamenti: mai fisso), così «Chi finanzia il cantiere»
conta anche gli operai.

### D. Cassa: pagato vero e previsione per rata

**D1. Segnare i pagamenti senza fatica.** Tre strade, l'azienda sceglie: banca collegata (movimento ↔
rata, con proposta e conferma); RiBa scaduta = pagata salvo insoluto (se accesa); spunta in blocco
dallo scadenzario («segna pagate le 12 RiBa di ottobre»). Gli «scaduti» diventano veri.

**D2. Previsionale della commessa per rata.** Entrate (rate del cliente) e uscite (rate dei fornitori,
SAL dei subappalti, F24 delle ritenute, quota stipendi) settimana per settimana fino a fine lavori,
con il punto più basso della cassa. Sostituisce la stima «sui soli materiali».

**D3. IVA della commessa completa.** A debito sulle fatture emesse, a credito sulle ricevute, reverse
charge che entra e esce insieme, split payment per i committenti pubblici.

### E. Controllo: accorgersene prima

**E1. Preventivo, consuntivo e «a finire» per voce e per lavorazione.** Per ogni lavorazione: previsto,
speso, ancora da spendere stimato, margine a fine lavori. **Allarme** al titolare quando una
lavorazione supera il previsto del 10% o il margine a fine lavori scende sotto la soglia
dell'azienda.

**E2. Semaforo «dati completi» della commessa.** Fatture del fornitore non assegnate, ore da
approvare, costi senza data di pagamento, ditte senza costo previsto, ordini non fatturati: un elenco
di cose da sistemare, ognuna con il pulsante che la sistema. Il margine reale dice se è affidabile.

**E3. Chiusura della commessa.** Verbale economico finale (ricavo, costi per voce, margine, cassa),
controllo che non resti niente da fatturare o pagare, blocco dei costi dopo la chiusura salvo
riapertura motivata.

### F. Farlo usare

**F1. Primo avvio per azienda.** Data di taglio dello storico (Dimora non l'ha ancora scelta),
assegnazione guidata delle fatture degli ultimi 3 mesi, accordi dei 20 fornitori principali,
collegamento banca. Una lista di controllo per azienda con la percentuale fatta.

**F2. Silvio.** Le stesse domande al telefono: «quanto devo pagare questa settimana?», «quali fatture
non sono assegnate?», «come va il margine della O-0001?», con i numeri delle stesse funzioni.

## 4. In che ordine

| Lotto | Cosa | Perché prima |
|---|---|---|
| **1** | A1, A2, A3, A6 | Le uscite e le loro date: sono i soldi veri, e oggi per tre aziende su quattro mancano |
| **2** | A4, B1, B2 | Senza fatture sulle commesse il margine reale non esiste |
| **3** | D1, D2, A5, A7 | La cassa diventa vera: pagato, previsto per rata, RiBa |
| **4** | C1, C2, C3 | Gli operai dalla stima al consuntivo |
| **5** | E1, E2, E3, B3, B4, A8, D3 | Controllo, completezza, chiusura |
| **6** | F1, F2 | Adozione per azienda e Silvio |

Ogni lotto si chiude con: migrazione applicata e riallineata, test che provano niente doppioni e date
giuste, prova su Demo 2 e su una copia dei dati di un'azienda vera (transazione annullata), e la pagina
vista a schermo.

## 5. Decisioni che servono da Florin

1. **RiBa scaduta = pagata in automatico** (salvo insoluto), oppure solo quando lo dice la banca o una persona?
2. **Contabilizzare da sole** le fatture SDI con fornitore e commessa certi, o sempre una persona?
3. **Differenza della busta paga**: ripartita per ore sulle commesse del mese (proposta), o tutta in struttura?
4. **Spese generali**: per percentuale sul ricavo, per ore, o importo fisso al mese?
5. **Soglie degli allarmi**: sforamento della lavorazione (proposta 10%) e margine minimo a fine lavori.

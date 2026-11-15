# Come viene pagata un'impresa edile: i flussi in Edilizia in Cloud

15/11/2026. Schema di tutti i modi in cui un'impresa viene pagata, di come l'app li gestisce e di cosa resta da
sistemare. Provato su Demo Azienda 2 (commesse PROVA-SAL-001, MAN-2026-001, AP-2026-00x).

## Le tre domande che decidono il flusso

1. **Per chi lavoro?** Un cliente privato (commessa cliente) o un committente/impresa con un contratto quadro
   (lavoro in appalto: `order_type = appaltatore_lavoro`). Per un cantiere grande con più lotti e acquirenti:
   commessa generale.
2. **Come si stabilisce il prezzo?** A corpo (un prezzo fisso), a misura (quantità × prezzi di un elenco o
   computo), in economia (ore e mezzi × tariffe, dai rapportini).
3. **Quando mi pagano?** A rate legate a momenti (firma, merce, posa, fine lavori), a SAL (stato avanzamento
   lavori, di solito a fine mese), a rendiconto (quello che ho fatto nel periodo).

## Lo schema

| Impresa tipo | Prezzo | Pagamento | Nell'app | Documento al cliente | Fattura |
|---|---|---|---|---|---|
| Serramenti, fotovoltaico, bagni | a corpo | acconto alla firma, saldo a posa/fine lavori | Commessa cliente → Finanza → Incassi (piano rate) | nessuno (il preventivo firmato è il contratto) | Crea fattura → «Un importo» sulla rata |
| Ristrutturazione per un privato | a corpo, a volte da computo | acconto + SAL (a %) + saldo, ritenuta | Commessa cliente → Finanza → **SAL al cliente** | Verbale SAL + certificato di pagamento | Crea fattura → «SAL» (netto del certificato) |
| Lavori a misura con computo (privati grandi, condomini) | a misura | acconto + SAL a misura | come sopra; rate «a misura» dal preventivo con computo | Verbale SAL | come sopra |
| Lavori pubblici | a misura, computo | SAL + certificato, ritenuta 0,50% | Articoli → Apri computo → «Lavoro pubblico»: libretto, registro, SAL | SAL e certificato della contabilità lavori | dal certificato |
| Impresa che lavora per committenti (tipo Vulcano) | a corpo | rate o saldo unico | Lavoro in appalto → Finanza → Rendiconto + Incassi | Rendiconto | «Prepara fattura» dal rendiconto |
| Idem, a misura / in economia | a misura o ore | a rendiconto, per commessa o mensile per committente | Lavoro in appalto → Rendiconto (righe da tariffe e rapportini) | Rendiconto mensile | «Prepara fattura» dal rendiconto |
| General contractor / sviluppo | a misura su elenco prezzi | SAL di contratto, ritenuta, anticipazione | Commessa generale → Contratto e SAL | SAL di contratto | Bottone «Fattura» del SAL |
| I miei subappaltatori (costo) | a corpo o misura | SAL del sub, ritenuta | Commessa → Costi → Subappaltatori | Verbale SAL del subappaltatore + benestare alla fattura | la fattura la manda il sub |

## Il SAL di una ristrutturazione, passo per passo

1. Il preventivo (o il contratto letto con l'AI) mette nel piano: acconto, «al SAL n. 1, 2…» (anche «a misura»),
   saldo, e la ritenuta di garanzia. Tutto passa alla commessa.
2. In cantiere si segna l'avanzamento delle fasi (e sottofasi).
3. Finanza → SAL al cliente → **Prepara SAL** sulla rata che aspetta il verbale: il modulo è già compilato
   (voci dalle fasi, mai sotto il SAL prima, certificato con ritenuta e recupero dell'acconto). **Salva ed emetti**.
4. **Verbale PDF** (con il logo) da mandare o far firmare.
5. **Crea fattura → SAL**: la fattura prende il netto del certificato; la rata si segna fatturata e poi incassata.
6. Il SAL finale prende la rata di saldo. La ritenuta finisce nel registro «Ritenute a garanzia» e al collaudo si
   fattura con «Fattura lo svincolo».

Esempio da 200.000 € + IVA 10%, acconto 20%, ritenuta 5%, 5 SAL: netti 23.850, 30.300, 34.950, 45.000, 15.900;
acconto 40.000 + netti 150.000 + svincolo 10.000 = 200.000.

## Corretto il 15/11

- Acconto mai recuperato nei SAL (fatture oltre il contratto), ritenuta 10% d'ufficio e fuori registro, SAL finale
  non legato al saldo, rate che perdevano termine/soglia/«a misura» quando si cambiava una rata.
- Importi dei SAL solo a chi ha «Venduto e importi».
- «SAL al cliente» solo dove serve: non più a chi lavora ad acconto e saldo, ai lavori in appalto (c'è il
  Rendiconto) e alle figlie di una generale (c'è il SAL di contratto).
- Preventivatori: con una rata «a misura» la commessa nasceva senza rate.
- La ritenuta del preventivo con computo arriva alla commessa.
- Cronologia della commessa: i SAL non si sommano più fra loro (sono cumulativi).

## Sistemato dopo (15/11, sera)

- Incassi: il riquadro «SAL al cliente» dava la differenza dei lavori; ora, col certificato, il netto da
  incassare (tolti acconto e ritenuta).
- Preventivatori: la ritenuta di garanzia sta nel piano di pagamento, esce nel PDF e arriva alla commessa.
- Lavori pubblici: la vista SAL lo dice e apre la contabilità del computo.
- Logo dell'azienda in tutte le stampe (anche contabilità dei lavori pubblici e rendiconto, dall'anagrafica).
- Fattura/proforma/DDT/nota di credito: senza fatturazione nativa disattivati col motivo, come in testata.

## Cosa resta

1. **Lavori pubblici**: i certificati di pagamento non sono legati alle rate (si fatturano da «Prepara la
   fattura» del certificato). Nessuna azienda ha ancora usato questa contabilità: da collegare al primo uso vero.
2. **Tre generatori di documenti** (verbale SAL, rendiconto, contabilità lavori pubblici): ora tutti col logo,
   ma con impaginazioni diverse.
3. **Vulcano** ha 59 lavori per committente e non ha mai usato il Rendiconto: da chiedere a loro se serve.

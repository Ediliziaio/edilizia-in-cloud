---
area: 02-finanza-cashflow
titolo: Tesoreria aziendale — gestione dei conti correnti
tags: [tesoreria, conti-correnti, cash-pooling, riconciliazione]
livello: intermedio
applicabile_a: [imprese-strutturate, gestione-finanziaria-quotidiana]
kpi_correlati: [saldo-medio-cc, costi-bancari, tempi-riconciliazione]
versione: 1.0
aggiornato_il: 2026-05-04
---

# Tesoreria aziendale — i conti correnti come strumenti di gestione

In imprese di una certa dimensione, i conti correnti non sono "il conto in banca": sono strumenti operativi specifici, ognuno con un ruolo. Strutturare bene la tesoreria significa pagare meno commissioni, avere visibilità in tempo reale, e ridurre rischi.

## Quanti conti correnti tenere

Per impresa edile da 1-3M:
- 1-2 conti operativi principali (per incassi e pagamenti)
- 1 conto dedicato a operazioni straordinarie (acquisti, vendite immobili)

Per impresa da 3-10M:
- 1 conto per incassi (concentrazione clienti)
- 1-2 conti per pagamenti operativi (fornitori, stipendi)
- 1 conto per F24 e tributi
- 1 conto per investimenti / accantonamenti

Per impresa > 10M:
- Configurazione multi-banca con cash-pooling

## Cash pooling — la centralizzazione

Per imprese con più conti correnti, il **cash pooling** consente:
- Concentrazione automatica dei saldi su un conto principale
- Compensazione di scoperti e disponibilità tra conti diversi
- Riduzione interessi passivi
- Visibilità unificata della tesoreria

Il cash pooling **virtuale** (sweep notional) compensa contabilmente senza movimentare materialmente fondi. Il cash pooling **fisico** (zero balancing) trasferisce saldi.

Necessita banca di riferimento robusta e contratto specifico. Tipico per imprese > 10M fatturato.

## Riconciliazione bancaria — il fondamento

Riconciliare significa confrontare:
- Saldi dei conti correnti (estratti conto banca)
- Saldi contabili (registri aziendali)

Frequenza: **giornaliera in imprese strutturate, settimanale come minimo**.

Differenze tipiche da indagare:
- Movimenti banca non ancora registrati in contabilità
- Movimenti contabili non ancora trasferiti in banca (assegni emessi non incassati, bonifici in transito)
- Errori di addebito banca (commissioni anomale, interessi calcolati male)
- Frodi (movimenti fraudolenti non autorizzati)

Senza riconciliazione regolare, le frodi e gli errori bancari restano nascosti. È il primo controllo da automatizzare.

## Strumenti automatici

API bancarie e PSD2 permettono:
- Import giornaliero automatico estratti conto
- Categorizzazione movimenti
- Riconciliazione automatica con fatture e ordini
- Allerta su movimenti anomali

Software gestionali (come EiC) integrano nativamente. Multi-banca: una sola dashboard per tutti i conti.

## Costi bancari — il monitoraggio

I costi bancari per impresa edile possono essere significativi:
- Commissioni di affidamento (sull'accordato)
- Interessi passivi (sull'utilizzato fido)
- Spese tenuta conto
- Commissioni bonifici (ordinari, urgenti, esteri)
- Commissioni RIBA / SEPA SDD / RID
- Costi handling assegni e contanti
- Spese liquidazione trimestrale

Per impresa da 3M tipica: 15-30k € l'anno di costi bancari complessivi.

Operazioni di ottimizzazione:
- Concentrazione movimenti su banche con condizioni migliori
- Negoziazione periodica di tariffe (annualmente)
- Eliminazione strumenti non usati (assegni, bollette domiciliate non più attive)
- Verifica trimestrale degli scaglioni di addebito

## Sicurezza — le 5 cose minime

1. **Doppia firma** per bonifici sopra soglia (es. 10.000 €).
2. **Codici e token** non condivisi, mai per email/WhatsApp.
3. **Account amministratore separato** per chi ha potere dispositivo.
4. **Logging delle operazioni**: chi ha disposto cosa e quando.
5. **Conferma telefonica** dei bonifici importanti, mai ordinati solo via mail.

Le frodi bancarie più frequenti per PMI italiane: man-in-the-middle (email modificata), social engineering (telefonata fingendosi banca), CEO fraud (email simulata del titolare). Costo medio: 30-150k a episodio.

## Il ruolo del tesoriere

Nelle imprese > 10M, conviene una funzione dedicata di tesoriere:
- Gestione quotidiana delle giacenze
- Riconciliazione bancaria
- Negoziazione condizioni
- Gestione strumenti di copertura (forward, opzioni se export)
- Forecasting di cassa
- Reporting alla direzione

Sotto i 10M, la funzione è del responsabile amministrativo o del titolare stesso.

## Errori comuni

1. **Saldo sui conti correnti troppo alto** — capitale che non rende, lasciato per inerzia.
2. **Saldo troppo basso e fido sempre tirato** — costi finanziari alti, rischio di sconfino.
3. **Tanti conti correnti dispersi** — visibilità zero, costi multipli.
4. **Bonifici manuali ricorrenti** — tempi e errori. Automatizzare con SCT istantaneo / SEPA programmato.
5. **Riconciliazione "una volta al mese"** — quando arriva il commercialista. Impossibile vedere problemi in tempo reale.
6. **Pagamenti F24 dimenticati** — sanzioni, interessi, perdita DURC.

## Indicatori operativi

- Saldo medio conti correnti
- Saldo minimo nei 30 giorni (se sotto soglia critica = ribilancia)
- Numero giorni in scoperto per mese
- Costi bancari mese / fatturato (dovrebbe essere < 0,5%)
- Numero movimenti non riconciliati > 10 giorni (target: 0)

## Quando il bonifico non basta — strumenti per i pagamenti ricorrenti

- **SEPA SDD** (Direct Debit) per addebiti ricorrenti su clienti consenzienti
- **RIBA** (Ricevute Bancarie) per riscossione tradizionale italiana
- **Domiciliazioni** per utenze ricorrenti
- **Carte aziendali** per acquisti diffusi (carburanti, materiali minuti)

Ognuno ha costi specifici. La scelta ottimizza commissioni e tempi di incasso/pagamento.

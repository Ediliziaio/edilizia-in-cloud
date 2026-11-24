# Commessa → «Fatture dei fornitori»: scegliere dalle fatture ricevute (piano 24/11/2026)

## Il problema
Nella commessa, scheda Costi → Fornitori, «Carica fattura» chiede subito un file
(`CaricaFatturaCommessaButton`, `src/components/orders/CaricaFatturaCommessa.tsx`).
Ma quasi sempre la fattura **è già** fra le ricevute (arrivata dallo SDI, importata da FIC).
Oggi per collegarla bisogna uscire, andare in Fatture ricevute, cercarla, aprire
`CollegaFatturaCommesseDialog` e scegliere la commessa. Al contrario di come si lavora.

## Cosa c'è già (da riusare, non rifare)
- `CollegaFatturaCommesseDialog` — sceglie commessa/e, divide per importo o **per righe**
  (`vociFattura`, `quoteDaVoci`), quota magazzino, spese generali; salva con
  `fattura_collega_commesse` e crea le bolle con `fattura_crea_bolle`. Accetta già
  `commessaIniziale`.
- Legami fattura↔DDT: `fattura_ddt` (con `ddt_ricezione.order_id`), riferimenti letti
  dall'XML (`leggiRiferimentiFattura`).
- Suggerimento AI: `fatture_ricevute.order_id_suggerito` + `order_match_confidenza`
  (già mostrato nella card come «suggerita»).
- ODA della commessa: `purchase_orders.order_id`.

## Cosa cambia per l'utente
«Carica fattura» diventa **«Collega fattura»** e apre un popup in due parti:

1. **Elenco delle fatture ricevute** non ancora (del tutto) assegnate, con ricerca
   (fornitore, numero, importo, data) e in testa le **probabili per questa commessa**,
   ciascuna col motivo:
   - legata a una bolla (DDT) di questa commessa o dei suoi ODA → «Bolla n. X del …»;
   - riferimento all'ODA della commessa nell'XML (`<DatiOrdineAcquisto>`) → «Ordine ODA-…»;
   - suggerita dall'AI (`order_id_suggerito`) → «Suggerita (85%)»;
   - fornitore che compare negli ODA/costi della commessa → «Fornitore della commessa»;
   - CUP/CIG o indirizzo cantiere nella causale → «Riferimento cantiere».
   Ogni riga mostra totale, **residuo non assegnato** e se è già divisa su altre commesse.
2. Scelta la fattura → si apre (nello stesso popup) `CollegaFatturaCommesseDialog` con
   `commessaIniziale` = questa commessa: tutta, una quota in €, oppure **solo alcune righe**
   (es. 3 righe su 10 sono di questo cantiere). Salva, torna all'elenco.

In fondo resta «Non c'è? Carica il file (XML, PDF, foto)», cioè il caricamento di oggi.

## Lotti
**Lotto 1 — dati (SQL, sola lettura)**
- RPC `fatture_candidate_commessa(p_order uuid, p_cerca text, p_limit int)`
  SECURITY INVOKER (RLS della ricevuta), `REVOKE … FROM PUBLIC, anon`, GRANT authenticated.
  Restituisce: id, numero, data, fornitore, imponibile, totale, residuo da assegnare
  (totale − quote su `company_costs.allocations` − magazzino − generali), commesse già
  collegate, punteggio e motivi (`text[]`).
- Punteggio: DDT della commessa 100, ODA nell'XML 90, AI ×confidenza, fornitore 40,
  riferimento cantiere 30; esclude le completamente assegnate e le note di credito già
  stornate. Indici se servono su `fattura_ddt(fattura_id)`.
- Prima: verificare colonne su `types.ts` (CLAUDE.md), niente `CREATE TABLE`.

**Lotto 2 — popup «Collega fattura»**
- `src/components/orders/CollegaFatturaRicevutaDialog.tsx`: sezione «Probabili» + «Tutte»
  (paginate, ricerca con debounce), pill dei motivi, residuo.
- Click → `CollegaFatturaCommesseDialog` con `commessaIniziale`; al chiudere invalida
  `commessa-fatture-fornitori` e `refreshFinancialQueries`.
- Il pulsante in `OrderDocumentiFornitore` diventa menu: «Scegli dalle ricevute» (default)
  / «Carica file». Stessi permessi di oggi (`puoModificare`).

**Lotto 3 — righe parziali comode**
- Nel dialog, quando si arriva dalla commessa: modalità «Per righe» proposta subito se la
  fattura ha più righe e le bolle collegano solo alcune di esse (pre-spunta le righe della
  bolla della commessa). Il resto rimane «da assegnare» e la fattura resta nell'elenco
  delle altre commesse col suo residuo.

**Lotto 4 — suggerimenti nella card**
- Sopra «Nessuna fattura collegata»: «3 fatture ricevute sembrano di questa commessa →
  Rivedi», con collega in un clic sulle probabilità alte (≥ bolla/ODA), conferma per le altre.

## Verifiche
- Test della RPC su Demo 2: fattura con DDT della commessa in testa, fattura divisa
  mostra il residuo giusto, fattura di un'altra azienda mai visibile (RLS).
- Test UI vitest del dialog (dbFinto) + prova a schermo: collegare 3 righe su 10,
  controllare costi/margine della commessa e il residuo sulla stessa fattura.
- Utente senza «Costi»: non vede importi (regola `puo_vedere_costi`).

## Decisioni aperte
1. Le fatture già interamente su **un'altra** commessa: nasconderle o mostrarle in grigio
   («sposta qui»)? Proposta: nascoste, con filtro «mostra anche assegnate».
2. Collegamento automatico senza conferma quando la fattura è legata a un DDT della
   commessa? Proposta: no, solo pre-selezione.

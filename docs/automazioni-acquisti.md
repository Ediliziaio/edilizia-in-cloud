# Ciclo acquisti senza AI dove bastano i dati — area B (15/11/2026)

Parte da `docs/piano-ai-addebiti-e-automazioni-20261115.md`, sezioni 2–6. Qui: cosa c'è,
cosa si è costruito, come lo usano le altre aree, cosa resta e con quale ordine.

## 1. Misure di partenza (produzione, 15/11/2026)

| Cosa | Numero |
|---|---|
| Fatture ricevute | 19.280 (12.515 senza fornitore in rubrica) |
| Righe `fattura_ddt` (DDT citati negli XML) | 1.560, di cui **180** agganciate a una bolla |
| … non agganciate, con bolla dello stesso numero registrata | 2 (ora si agganciano) |
| … non agganciate, la bolla non è mai stata caricata nel gestionale | 1.378 |
| Fatture con `DatiOrdineAcquisto` nell'XML | 570 in 6 aziende; solo **3** citano un nostro ordine (le altre: numeri del fornitore, «NO.ORD.», «.», nomi, ordini Amazon) |
| Fatture con `DatiContratto` | 519 |
| Fatture con `RiferimentoNumeroLinea` | 1.342 |
| Fatture con commessa proposta (`order_id_suggerito`) | 1.361 (7 dall'AI, il resto da regole) |
| Bolle registrate (`ddt_ricezione`) / con ordine | 446 / 248 |
| AI del ciclo acquisti, 30 giorni | `pdf_vision_extract` 96 (1,13 €), `fattura_riconcilia` 41 (0,64 €), `fattura_classify` 25 (0,29 €), `listino_abbina_voci` 9, `ddt_ocr` 1 |

Lettura: il costo AI del ciclo acquisti è piccolo (~2 € al mese); il problema vero è che i
collegamenti **mancano**, non che costano. Il grosso dei DDT citati in fattura riguarda bolle
mai caricate: il collegamento non si può fare finché la bolla non entra, e quando entra ora si
aggancia da sé (prima no: si cercava solo all'arrivo della fattura, col numero scritto uguale).

## 2. Ricognizione: cosa c'era già (esteso, non rifatto)

- **Fornitore della fattura**: `fattura_ricevuta_fornitore_automatico` → `fornitore_unico_per_cedente`
  (P.IVA/CF via `partner_tax_key`, solo se unico). Giusto: non usa il nome.
- **Fattura → ordine (testata)**: `aggancia_fattura_a_oda` aggancia l'ODA dello stesso fornitore
  con **totale uguale al centesimo** e non ancora fatturato. Regola da rivedere (vedi §6): l'importo
  da solo identifica.
- **Fattura → DDT**: `fattura_collega_ddt_e_mezzi` legge `NumeroDDT`/`DataDDT` dall'XML e
  aggancia la bolla con numero **identico** dello stesso fornitore, solo all'arrivo. Ignorava
  anno e data. → sostituita (§4).
- **Fattura → commessa**: `commessa_da_codici` (CUP/CIG, codice commessa nei tag) → proposta in
  `order_id_suggerito`; `fattura_collega_commesse` ripartisce a mano su più commesse e magazzino;
  `riconcilia-fattura-ai` per il resto.
- **Righe fattura ↔ righe DDT**: `fattura_riconciliazione_*` (equivalenze codici fornitore,
  conversioni, quantità riconciliate in `fattura_ddt_quantita`), `ddt_valorizza_da_fattura`.
- **Bolla ↔ ordini**: `ddt_ordini_acquisto`, `ddt_conferma_consegna`, `abbinaRigheOrdine.ts`
  (codice, misure, parole; si abbina da solo solo il chiaro).
- **Magazzino**: costo medio ponderato e quota magazzino della fattura (note del 04/11): il
  prelievo porta il costo in commessa, la fattura a magazzino no → niente doppio conteggio.
- **Anagrafiche**: `fornitori_iban_storico` (IBAN visti, con `confermato`), `anagrafica_reconciliation_log`.

Trappole trovate (non corrette qui, vedi §6):
- `ddt_ricezione_una_bolla_per_fornitore` è unico su (azienda, fornitore, numero) **senza anno**:
  la bolla 1068 del 2026 non si può registrare se c'è la 1068 del 2025 dello stesso fornitore.
- `aggancia_fattura_a_oda`: l'importo uguale fa da identificativo.

## 3. Componenti comuni — interfaccia per le aree C e D

Tutto in `shared/acquisti/`, TypeScript puro (browser, edge function, test). Import con
estensione: `import { decidi } from "../../shared/acquisti/riconciliazione.ts"`.

| Modulo | Cosa dà | Funzioni |
|---|---|---|
| `normalizza.ts` | dati confrontabili | `chiaveFiscale` (= `partner_tax_key`), `identificativoFiscale(v, paese)` (IT con controllo, formati UE), `pivaItalianaValida`, `codiceFiscalePersonaValido`, `nomeConfrontabile`, `formaSocietaria`, `dataIso`, `giorniFra`, `importo` (formati italiani), `centesimi`, `stessoImporto`, `unitaCanonica` («ml» = metro lineare), `fattoreConversione` (fisiche sempre, altre solo autorizzate), `numeroDocumento` (chiave, anno, serie; null per «NO.ORD.», «.», nomi), `confrontaNumeri`, `indirizzoConfrontabile` |
| `riconciliazione.ts` | il motore a cinque esiti | `decidi(candidati, {automaticoConsentito})` → `automatico / proposta / scelta / conflitto / nessuno`; `decidiTraFonti(indicazioni)` per più fonti che indicano un valore; `valutaCandidato` |
| `anagrafiche.ts` | anagrafica senza doppioni | `risolviAnagrafica(letto, rubrica)` → decisione + `azioni` (`ibanDaVerificare`, `identificativiDiscordanti`, `creaNuova`, `omonimiConAltroIdentificativo`, `aliasDaProporre`) |
| `riferimentiFattura.ts` | i riferimenti dell'XML | `leggiRiferimentiFattura(xml, corpo)` (ordini, contratti, convenzioni, ricezioni, DDT con `RiferimentoNumeroLinea`, righe con codici/periodo/`AltriDatiGestionali`, CUP/CIG), `ddtNelleDescrizioni` |
| `catena.ts` | fattura → DDT → ordine → commessa | `abbinaDdt`, `abbinaOrdine`, `abbinaContratto`, `costruisciCatena` → esito, allocazioni per commessa/magazzino/da attribuire, percorso di ogni collegamento |
| `righe.ts` | ordinato/consegnato/fatturato | `abbinaRigheFattura`, `confrontaRiga` (quantità, prezzo, unità, tolleranze), `prezzoRigaDdt` (bolla senza prezzi → prezzo dell'ordine), `statoRigaOrdine` |
| `traccia.ts` | formato della traccia | `Collegamento`, `chiaveCollegamento` (idempotenza), `statoDaEsito`, `transizioneAmmessa` |

**Interruttore del collegamento automatico** (decisione del titolare, 15/11/2026; migrazione
`20290404240000_collegamento_automatico_interruttore`). Vale per **tutti** i collegamenti:
acquisti, tesoreria, subappalti.

| Interruttore | «unico e verificato» | Altri esiti (plausibile, più candidati, conflitto, nessuno) |
|---|---|---|
| spento (di base, anche se manca la riga) | proposta, stato `proposto`, si conferma con un clic | invariati |
| acceso | collegato da solo, esito `automatico` nella traccia | invariati |

- Dove sta: `company_governance_settings.collegamento_automatico` (boolean, default false). La
  voce è in **Impostazioni → Automazioni** (`/azienda/impostazioni/automazioni`), prima riga;
  la cambia solo l'amministratore dell'azienda (policy `cgs_write`).
- Lettura, solo lato server: SQL `azienda_collegamento_automatico(azienda) → boolean` (false a
  chi non vede l'azienda); edge function `leggiCollegamentoAutomatico(db, companyId)` in
  `_shared/collegamentoAutomatico.ts` (false se la lettura fallisce: nel dubbio si propone).
- Chi scrive con `acquisti_collegamento_registra(…, esito => 'automatico', …)` **non deve
  leggerlo**: lo applica la funzione (spento → la riga nasce `proposto` con esito `proposta`).
  Così è impossibile dimenticarlo.
- Chi mostra un esito prima di scriverlo usa `conInterruttore(decisione, acceso)`
  (`shared/acquisti/riconciliazione.ts`).
- Conferma con un clic: `acquisti_collegamento_cambia_stato(id, 'collegato')` (per fattura↔bolla
  mette anche la bolla sulla riga `fattura_ddt`).
- I collegamenti fatti prima del 15/11 non si toccano. Restano automatici, senza passare
  dall'interruttore: `aggancia_fattura_a_oda` (ordine per importo uguale) e
  `fornitore_unico_per_cedente` (fornitore dalla P.IVA). Il primo è un collegamento fra
  documenti e va portato sotto l'interruttore (§6).

**Impostazioni → Automazioni: come si aggiunge una riga** (richiesta del titolare, 15/11/2026).
Tutti gli automatismi dell'azienda stanno in una sezione sola, una riga ciascuno: cosa fa, acceso
o spento, ultimo controllo o esito. Niente interruttori sparsi in altre pagine. Per aggiungerne uno:

1. **Dove si salva l'interruttore**: una colonna boolean in `company_governance_settings`
   (`ALTER TABLE … ADD COLUMN IF NOT EXISTS <nome> boolean NOT NULL DEFAULT false`: spento di
   base, salvo decisione diversa del titolare). La policy `cgs_write` la riserva già
   all'amministratore. Se serve leggerla lato server, una funzione come
   `azienda_collegamento_automatico` (`STABLE SECURITY DEFINER`, `REVOKE … FROM public, anon`,
   `GRANT` ad authenticated e service_role).
2. **Due hook** nel tuo modulo: uno che restituisce `StatoAutomatismo` (`acceso`, `caricamento`,
   `cambia(v)`, `salvataggio`; esempio: `useStatoCollegamento` in `registroAutomatismi.ts`, che
   usa `src/hooks/useCollegamentoAutomatico.ts`), e uno, facoltativo, per l'ultimo esito:
   `UltimoEsito | null` con `quando` (ISO), `testo` (una frase), `tono` (`neutro`, `ok`,
   `attenzione`, `errore`). Esempio: `src/hooks/useUltimoCollegamento.ts` (proposte in attesa,
   poi ultimo collegamento). Per un lavoro a giri, l'ultimo giro con il suo esito.
3. **Un elemento** in `AUTOMATISMI` (`src/components/settings/automazioni/registroAutomatismi.ts`):
   `{ id, area, titolo, cosaFa, daSpento, useStato, useUltimoEsito, Azione? }`. Chi segue
   l'interruttore comune usa `useStato: useStatoCollegamento` (esportato dallo stesso file):
   l'interruttore resta uno solo. `Azione` (facoltativa) è un componente `{ companyId,
   puoModificare }` mostrato sotto l'ultimo esito; per il collegamento è il popup di verifica. `id` in minuscolo col
   trattino (diventa l'ancora `#id`); `cosaFa` e `daSpento` in una o due frasi da cantiere.
4. **Test**: aggiungi i tuoi casi in `src/test/ui/impostazioniAutomazioni.test.tsx` (lì c'è già
   il controllo che ogni riga abbia id unico e tutti i testi).

La pagina (`SettingsAutomazioni.tsx`) non va toccata: mostra da sé ogni riga del registro.

**Regole del motore, da rispettare in ogni area:**
1. Le prove hanno un **ruolo**, non un peso: `identifica` (basta da sola), `conferma`, `indizio`.
   Niente punteggi da sommare.
2. Una prova `essenziale` con esito `diverso` esclude il candidato; se un'altra prova lo
   identificava, è **conflitto** e blocca tutto. Nessuna somiglianza compensa.
3. Solo indizi (nome, indirizzo, email) → al massimo **proposta**.
4. La sicurezza dichiarata da un modello AI non entra fra le prove. L'AI può *leggere* un dato
   (un numero di commessa sulla bolla); il dato letto entra nel motore come qualsiasi altro, e
   la traccia lo segna con `con_ai = true`.
5. Un numero di DDT o d'ordine vale solo con fornitore, anno e serie.

**Nel database:**
- `acquisti_collegamenti` (+ `acquisti_collegamenti_storia`, scritta da trigger): azienda, da/a
  (tipo, id, riga), quantità, unità, importo, regola e versione, esito, prove (jsonb, stesso
  formato di `Prova`), percorso, stato, autore (utente o processo), `con_ai`, chiave unica.
  Lettura: chi ha `can_view_costs` o `can_manage_purchasing`. Scrittura: solo dalle funzioni.
  Le aree C e D scrivono qui le loro righe con **`acquisti_collegamento_registra`** (lotto 3):
  `(azienda, da_tipo, da_id, da_riga, a_tipo, a_id, a_riga, regola, esito, prove, percorso,
  quantità, unità, importo, versione_regola, con_ai, motivo)` → id. Esiti registrabili:
  `automatico` e `manuale` (→ collegato), `proposta` (→ proposto); scelta, conflitto e nessuno
  restano all'utente e non si scrivono. Entrambi i documenti devono essere dell'azienda (tipi:
  fattura_ricevuta, ddt, riga_ddt, ordine, riga_ordine, commessa, fase, magazzino, anagrafica,
  contratto = `contratti_subappalto`, sal = `sal_subappaltatori`, rapportino, movimento_banca =
  `bank_transactions`, costo = `company_costs`; per la tesoreria, dal 15/11: fattura_emessa =
  `invoices`, documento_fiscale = `documenti_fiscali`, scadenza = `scadenze`, movimento_cassa =
  `movimenti_cassa_native`, prima_nota = `prima_nota_entries`, rata_fornitore = `rate_fornitori`,
  rata_commessa = `order_installments`, la cui azienda si verifica attraverso la commessa). Idempotente sulla chiave; una regola non rifà
  ciò che una persona ha annullato o rifiutato, una persona sì (esito `manuale`). Dal service
  role l'autore è il processo scritto in `acquisti.processo`.
- Stati: `proposto → collegato → verificato → approvato_pagamento → pagato`, più `rifiutato`
  e `annullato`; `acquisti_collegamento_cambia_stato(id, stato, motivo)` controlla le
  transizioni e chiede il motivo per annullare/rifiutare.
- `acquisti_numero_documento(text)` = `numeroDocumento()` (parità provata in test).

## 4. Fatto in questo giro

**Lotto 1 — componenti** (`shared/acquisti/`, 56 casi in `acquistiComponenti.test.ts` e
`acquistiCatena.test.ts`). Copre i casi del §7.18 sul lato regole: ordine esatto, solo DDT,
solo codice commessa, CUP, indirizzo con più commesse (scelta), ordine contro indirizzo
(conflitto), ordine contro DDT (conflitto), ordine di un altro fornitore (conflitto), stesso DDT
da fornitori/anni diversi, più ordini/DDT/commesse (ripartizione per riga, trasporto in
proporzione), magazzino, documento arrivato prima, isolamento fra aziende, riferimenti vuoti,
nessuna memoria per fornitore, contratto; righe: equivalenze, codice discordante, riga usata una
volta, differenze di quantità/prezzo/unità, conversione autorizzata, bolla senza prezzi,
parziali, resi, note di credito, fattura prima della consegna, eccedenze.

**Lotto 2 — migrazione `20290404210000_acquisti_collegamenti_traccia`** (31 casi su PGlite in
`acquistiCollegamentiSql.test.ts`):
- traccia e storia (sopra);
- aggancio fattura ↔ bolla con numero normalizzato, stesso fornitore, stesso anno, data entro
  10 giorni; più bolle candidate = scelta; data lontana = proposta; bolla già su un'altra fattura
  (non nota di credito) = proposta (documento doppio); collegamento annullato non si rifà;
- **fuori sequenza**: il trigger `acquisti_ddt_cerca_fatture` sulla bolla cerca le fatture che
  la citavano;
- storico: `acquisti_ricollega_ddt_anteprima(azienda)` (non scrive) e
  `acquisti_ricollega_ddt_lotto(azienda, limite)` (lock_timeout 3 s; il tempo massimo del comando lo dà chi chiama: un `set_config` dentro la funzione non vale per la chiamata in corso). Anteprima sui dati
  veri: 2 righe agganciabili su 1.380, 1.378 senza bolla.

**Lotto 3** (migrazione `20290404220000_acquisti_collegamento_registra`, applicata):
- `acquisti_collegamento_registra` (sopra), 5 casi in più su PGlite;
- **regole prima dell'AI nel confronto righe** (`riconcilia-fattura-ai`): `_shared/riconciliazioneRegole.ts`
  abbina con codice (anche via equivalenze confermate), descrizione uguale, quantità con le sole
  conversioni autorizzate, una riga di bolla una volta, e righe d'ordine quando sono scelti ordini.
  Se TUTTE le righe si chiudono, la proposta si salva con modello «regole» e l'AI non si chiama;
  se ne resta anche una, decide l'AI su tutto il documento come prima. Righe di bolla già
  fatturate in parte o con residuo incerto non si abbinano da sole. L'esito va nel contatore della
  sessione A (`registraEsitoLavoroAi`, flusso `fattura_riconcilia_righe`, `senza_ai`/`con_ai`):
  la pagina «Consumo AI del team» dirà quante analisi si chiudono senza AI. 7 casi in
  `riconciliazioneRegole.test.ts`.

**Lotto 4**: sezione Impostazioni → Automazioni (sopra); `20290404250000_acquisti_collega_ddt_proposta_promossa`
(applicata): una proposta scritta a interruttore spento diventa «collegato/automatico» quando, a
interruttore acceso, la bolla si aggancia (prima restava «proposto» nella traccia).
Da sapere: per una fattura lunga analizzata a lotti, `riconcilia-fattura-ai` registra `chiamateAi: 1`
anche se le chiamate sono di più (il contatore della A sottostima).

**Lotto 5 — popup di verifica** (`components/acquisti/VerificaCollegamentiDialog.tsx`): si apre dalla
fattura ricevuta («Verifica collegamenti» accanto ai DDT). Schede Da confermare / Collegati /
Annullati; le proposte «certe» (tutte le prove tornano, una identifica, nessun dato dall'AI) si
confermano insieme, le altre una per una; per ogni riga regola, prove ✓ ✗ ?, percorso; rifiuto e
annullamento chiedono il motivo. Scrive solo con `acquisti_collegamento_cambia_stato`.

**Lotto 6 — la catena prima dell'AI** (`_shared/catenaFatturaServer.ts`, in `ai-fattura-classify`):
se CUP/CIG/codice non bastano, la catena DDT → ordine → commessa (o ordine diretto) dà la
commessa proposta solo quando è certa (l'indirizzo del cantiere da solo non basta) (`order_id_suggerito`, motivo «catena: DDT … → ordine …»). Se i documenti
indicano commesse diverse la proposta resta vuota, il motivo dice il conflitto e nemmeno l'AI
sceglie (`commessaFinale(…, conflitto)`); se la categoria è già nota l'AI non si chiama affatto
(esito `eccezione` nel contatore). Carica solo i documenti dell'azienda della fattura; bolle e
ordini solo se la fattura li cita; gli ordini annullati non contano. Tetto: 1000 bolle e 1000
ordini per azienda (PostgREST), oltre restano fuori le più vecchie. Contratti: non ancora (lista vuota). La commessa resta una
**proposta** come prima: assegnare il costo (`fattura_collega_commesse`) è un passo dell'utente.

**Lotto 7 — misura in pagina** (Impostazioni → Automazioni, riquadro «Quanto lavorano da sole»,
ultimi 30 giorni): quota di lavori chiusi senza AI per i flussi degli acquisti
(`fattura_classifica`, `fattura_riconcilia_righe`, dalla `metriche_ai_azienda` della sessione A) e,
per ogni regola di collegamento, quanti fatti da soli, confermati, in attesa e **corretti** da una
persona (annullati o rifiutati) con la percentuale: `acquisti_misura_collegamenti(azienda, giorni)`,
migrazione `20290404270000`. Un flusso nuovo degli acquisti si aggiunge a `FLUSSI_ACQUISTI` in
`MisuraAutomazioni.tsx`.

**Lotto 8 — fornitori dalle fatture** (migrazione `20290404280000`, pagina Fornitori →
«Rivedi e crea»): delle 12.515 fatture senza fornitore solo 3 avevano il fornitore in rubrica; le
altre vengono da 1.237 cedenti che in rubrica non ci sono. Anteprima del 15/11 (non scrive): 1.198
creabili con P.IVA valida (~9.000 fatture), 1 da agganciare soltanto, 38 esteri o con
identificativo non valido (a mano), 5 con un omonimo in rubrica (segnalati). La creazione la fa
l'azienda scegliendo i fornitori, a blocchi da 200; nessuna creazione massiva fatta da noi.
`acquisti_fornitori_dalle_fatture_anteprima` / `_crea`, `acquisti_nome_confrontabile`.

**Lotto 9 — DDT nelle descrizioni** (migrazione `20290404290000`): se l'XML non ha `DatiDDT`, i DDT
scritti nelle righe («Rif. DDT n. … del …», solo con la parola DDT/bolla davanti) diventano righe
`fattura_ddt` con origine `descrizione` e si agganciano con le stesse regole. Stessa lettura del
TypeScript (`ddtNelleDescrizioni`, parità provata). Storico del 15/11: anteprima 734 fatture /
1.115 DDT (800 con data), poi lotti eseguiti: 1.115 righe scritte, 0 agganciate da sole (2 proposte
in attesa perché l'interruttore è spento ovunque; per le altre la bolla non è nel gestionale: si
agganceranno da sole quando la bolla arriva).

**Lotto 10 — arrivato contro fatturato** (scheda dell'ordine → Contabilità, riga «Merce arrivata»):
valore della merce ricevuta (prezzo netto dell'ordine × quantità ricevuta, IVA inclusa come il
fatturato) contro il fatturato al netto delle note di credito: «arrivati e non ancora fatturati»
oppure «fatturati in più dell'arrivato» (fattura prima della consegna); le righe a prezzo da
definire sono contate a parte. È a valore perché le fatture sono agganciate all'ordine intero:
il 15/11 solo 7 righe avevano la quantità fatturata riga per riga (`fattura_ddt_quantita`).
`consegnatoFatturatoOda` in `lib/orders/odaContabilita.ts`; per riga resta `statoRigaOrdine`
(shared/acquisti/righe.ts) per quando la quantità fatturata per riga ci sarà.

**Lotto 11 — fattura ↔ ordine per importo** (decisione del titolare del 15/11, migrazione
`20290404300000`): l'aggancio per solo importo uguale (stesso fornitore) è ora sempre una
**proposta**; con importo **e** numero d'ordine citato nei `DatiOrdineAcquisto` vale l'interruttore.
Confermare/annullare dal popup passa da `collega_fattura_a_ordini` (costi compresi; annullato =
scollegato e mai più riagganciato da solo). Storico: le 147 fatture già agganciate senza conferma
(144 di Demo Azienda 2) restano agganciate, costi intatti, e sono nel popup come «Da ricontrollare».

**Lotto 12 — fornitori creati da soli dalle fatture** (richiesta del titolare del 15/11, migrazioni
`20290404303000`, `304000`, `305000`): quando arriva una fattura di un cedente che non è in rubrica,
il fornitore nasce da solo (trigger `acquisti_fornitore_automatico_da_fattura`), una volta per
P.IVA/CF anche se il nome è scritto in modi diversi, e le sue fatture si agganciano. Mai creato:
l'azienda stessa, un estero, un identificativo non valido, una P.IVA già su più fornitori (si dice
e lo sistema una persona). Il **tipo** si scrive solo se è certo: già tra i subappaltatori o
fatture in reverse charge edile (N6.3/N6.7) → «subappalto», ed entra da sé nell'elenco dei
subappaltatori; gestori noti per nome (luce, gas, telefonia, banche, enti, noleggi, carburanti,
grandi rivenditori) → il loro tipo, stessa lista di `tipoDaNome` (parità provata). Studi e
professionisti non si deducono dal nome: li propone la pagina «Tipi dei fornitori».
Storico del 15/11: **1.198 fornitori creati** in 6 aziende (`acquisti_fornitori_automatici_lotto`,
solo servizio): le fatture senza fornitore scendono da 12.515 a 4.309. Restano senza fornitore 40 cedenti (20 P.IVA non valida,
18 esteri, 2 con più fornitori in rubrica) e **3.520 fatture senza P.IVA né codice fiscale**
(testate importate senza i dati del cedente): senza identificativo non si crea niente.
Velocità: indici per chiave fiscale sulle fatture senza fornitore e sulla rubrica; prima ogni
fattura rileggeva tutta la rubrica (da 4,6 s a 0,04 s per fornitore).

**Lotto 13 — il costo segue la commessa** (migrazione `20290404306000`): la commessa trovata dalle
regole entra nella traccia da `acquisti_commessa_della_fattura` (solo servizio, chiamata da
`ai-fattura-classify`): la catena dei documenti come «automatico», i codici CUP/CIG/commessa come
«proposta». L'automatico (interruttore acceso) sposta sulla commessa solo un costo che c'è già e
che è libero; non contabilizza fatture da sé (il 15/11 l'88% non è contabilizzato) e non passa mai
sopra una persona che aveva tolto la commessa: in quei casi è una proposta. Nel popup di verifica,
**Conferma** porta il costo sulla commessa (tutto, o la quota scritta nel collegamento per una
riga) e **Annulla/Rifiuta** lo riporta indietro, passando da `fattura_collega_commesse` (stessi
controlli, permesso «Costi»; se serve contabilizza, come il popup della fattura). Un costo già su
un'altra commessa o diviso non si tocca: la conferma lo dice. Provato in produzione su Demo
Azienda 2 in una transazione annullata.

**Lotto 14 — all'AI solo le righe in dubbio** (`riconcilia-fattura-ai`): prima, se le regole
chiudevano 8 righe su 10, all'AI andava l'intero documento. Ora le righe chiuse dalle regole
(`chiuseRighe`) restano fuori dai lotti insieme alle righe di bolla/ordine che hanno usato, e
rientrano nell'unione finale con «Regola, senza AI». Il registro conta una chiamata per lotto
(30 righe), non una per fattura.

**Senza AI**: nessuno dei tre lotti chiama un modello. Nei test: 100% dei casi chiusi senza AI
(gli esiti «scelta»/«conflitto»/«nessuno» vanno a una persona, non all'AI).

## 5. Matrice dei flussi

Priorità: A subito, B dopo, C quando serve. Impegno: S ≤ ½ giornata, M 1–2 giorni, L di più.

| Flusso | Comportamento attuale | Dati disponibili/mancanti | Parser e regole proposti | AI residua | Eccezioni | Moduli | Priorità | Impegno | Criterio di accettazione |
|---|---|---|---|---|---|---|---|---|---|
| Fornitore della fattura | **fatto (lotti 8 e 12)**: P.IVA/CF unico → `fornitore_id` (trigger); i mancanti nascono da soli col tipo se certo | P.IVA, CF, IdPaese in XML; 12.515 fatture senza fornitore in rubrica | `risolviAnagrafica`: identificativo valido, alias verificati, omonimi segnalati; proposta di creazione solo con P.IVA valida | nessuna | omonimi con P.IVA diversa; stessa P.IVA e CF discordante (conflitto) | Fatture ricevute, Fornitori | A | M | 0 anagrafiche unite per nome; ogni nuova anagrafica ha P.IVA/CF valido |
| IBAN della fattura | `fornitori_iban_storico` registra, `confermato` a mano | IBAN in `DatiPagamento` | `ibanDaVerificare`: mai applicato ai pagamenti finché non confermato per altro canale | nessuna | IBAN cambiato dal fornitore (frode tipica) | Fornitori, Tesoreria (C) | A | S | un IBAN nuovo non entra in un bonifico senza conferma |
| Fattura ↔ DDT (testata) | era: numero identico, solo all'arrivo (180/1.560) | `DatiDDT` + `RiferimentoNumeroLinea`; bolle registrate | **fatto**: numero normalizzato + fornitore + anno + data ±10 gg; trigger sulla bolla | nessuna | numero ripetuto in anni diversi (vincolo unico senza anno); bolla mai caricata | Fatture ricevute, DDT | A | — | fatto: casi PGlite verdi, anteprima senza scritture |
| DDT nelle descrizioni | **fatto (lotto 9)** | «Rif. DDT n. … del …» nelle righe | `ddtNelleDescrizioni` (solo con la parola DDT/bolla davanti) → stesse regole | nessuna | numeri nudi (prezzi, misure) esclusi di proposito | Fatture ricevute | B | S | nuove righe `fattura_ddt` con origine «descrizione» |
| Fattura ↔ ordine (DatiOrdineAcquisto) | non letto; solo `aggancia_fattura_a_oda` per importo | `IdDocumento`, `Data`, `NumItem`, righe; 3/570 citano nostri ordini | `abbinaOrdine`: nostro numero o conferma del fornitore, anno, fornitore essenziale; riferimenti vuoti ignorati | nessuna | ordine di un altro fornitore (conflitto); conferma d'ordine del fornitore non registrata | Fatture, ODA | B | M | percorso «ordine X» nella traccia; nessun ordine agganciato per solo importo senza proposta |
| Fattura → commessa | **fatto (lotto 13)**: catena → automatico, codici → proposta, il costo segue la conferma; AI `riconcilia-fattura-ai` per il resto | catena DDT/ordine/contratto, codici, indirizzo | `costruisciCatena`: fonti forti in accordo → automatico; forte contro debole → conflitto; indirizzo da solo → proposta; per riga dove l'XML lo dice | AI solo per leggere un codice da un allegato scansionato, poi verificato | ordine e indirizzo in disaccordo; commessa chiusa; nessun elemento → «da attribuire» | Fatture, Commesse, CdG (C) | A | M | nessuna commessa forzata: le fatture senza elementi restano «da attribuire» con i dati mancanti |
| Ripartizione su più commesse | a mano (`fattura_collega_commesse`) | righe con riferimenti diversi | allocazioni per riga; accessori in proporzione, criterio scritto | nessuna | righe senza riferimento → da attribuire | Fatture, Commesse | B | M | somma allocazioni = imponibile, criterio visibile |
| Costi generali / da attribuire | categorie a mano | categoria fornitore, assenza di riferimenti | destinazione «da_attribuire» esplicita; costi generali per categoria del fornitore (regola dichiarata) | classificazione `fattura_classify` solo per la categoria contabile | fornitore misto (cantiere e sede) | Fatture, CdG (C) | B | S | nessun costo generale finisce su una commessa per default |
| Righe fattura ↔ righe DDT | `fattura_riconciliazione_*` con AI (`fattura_riconcilia`, 41 chiamate) | `RiferimentoNumeroLinea`, `CodiceArticolo`, equivalenze | `abbinaRigheFattura`: codice (anche via equivalenze), descrizione uguale; quantità conferma; una riga DDT una volta | AI solo per le righe rimaste senza codice e senza descrizione uguale, sulle sole righe | codici fornitore diversi dai nostri (equivalenze); unità diverse (conversioni autorizzate) | Fatture, DDT, Magazzino | A | M | % righe chiuse senza AI misurata per azienda; `fattura_riconcilia` cala |
| Differenze quantità/prezzo/unità | confronto nel popup | prezzi ordine, tolleranze | `confrontaRiga` con tolleranze per azienda; bolla senza prezzi → prezzo ordine | nessuna | tolleranze da decidere (§6) | Fatture, ODA | B | S | ogni differenza ha tipo e scarto, nessuna nascosta da arrotondamenti ≤ 2 cent |
| Ordinato/consegnato/fatturato | **fatto a valore (lotto 10)**; per riga quando la quantità fatturata c'è | consegne, resi, fatture, NC | `statoRigaOrdine` (somma, indipendente dall'ordine di arrivo) | nessuna | fattura prima della consegna; eccedenze | ODA, DDT, Fatture | B | M | per ogni riga ODA: da consegnare, da fatturare, fatturato non consegnato |
| Stati del collegamento | un solo stato implicito | — | **fatto**: proposto/collegato/verificato/approvato/pagato distinti, storia col motivo | nessuna | pagato da tesoreria (C) | Fatture, Tesoreria | A | — | fatto |
| Bolla ↔ ordine | `abbinaRigheOrdine`, `ddt_conferma_consegna`, AI `ddt_confronto_ai` | righe bolla e ordine | invariato; passare gli esiti al motore comune per la traccia | AI per le righe non chiare (già così) | bolla senza ordine (mai obbligatorio) | DDT, ODA | C | S | traccia anche per questi abbinamenti |
| Lettura bolle scansionate | AI `pdf_vision_extract` (96/30 gg) | PDF scansionato | OCR locale + P.IVA → fornitore + numero/data confrontati coi `DatiDDT` delle fatture (metodo dell'11/11: 167/175 senza AI); AI solo se l'OCR non trova numero o P.IVA | AI sulle sole pagine illeggibili | scansioni storte, bolle multiple in un PDF (`dividiPdf`) | DDT | B | L | % bolle lette senza AI ≥ 90% sui lotti simili a quello dell'11/11 |
| Magazzino → cantiere | costo medio, prelievo in commessa | movimenti | destinazione «magazzino» nella catena: la fattura non va in commessa | nessuna | merce consegnata in cantiere ma ordinata per magazzino | Magazzino, Commesse | A | — | coperto in test: nessun doppio conteggio |
| RDO → ODA | offerte lette con AI (`rdo-ai-estrai-offerta`) | offerte PDF/Excel | prima CSV/Excel strutturati, poi AI | AI per PDF non strutturati | — | RDO | C | M | — |
| Storico | — | 1.380 righe DDT in attesa | **fatto**: anteprima + lotti | nessuna | — | — | A | — | fatto |

## 6. Decisioni aperte (per il titolare)

1. **Tolleranze**: quantità 0% e prezzo 0,5% (con 2 cent di arrotondamento) sono i default del
   codice. Per azienda o per fornitore? Si scrivono in `company_governance_settings` come le
   soglie dei rincari?
2. ~~`aggancia_fattura_a_oda`~~ — **deciso il 15/11** (lotto 11). Era: aggancia per importo uguale dello stesso fornitore, sempre.
   Con la regola dell'interruttore dovrebbe diventare una proposta quando è spento; ma da lì
   discende il costo sull'ordine (`fattura_ricevuta_porta_costo_su_ordine`), quindi si cambia
   con un'anteprima di cosa smetterebbe di collegarsi da solo. Da confermare.
3. **Bolle con lo stesso numero in anni diversi**: il vincolo unico non lo permette. Si allarga
   all'anno (migrazione sul vincolo, da fare con anteprima dei doppioni)?
4. **Automatico per l'indirizzo del cantiere**: oggi mai (solo proposta). Confermato?

## 7. Prossimi lotti

**Sicurezza, chiusa il 15/11**: `oda_copertura_righe(uuid)` era eseguibile da anon, e senza utente
il suo filtro (`auth.uid() is null`) lasciava passare tutte le aziende. Migrazione
`20290404230000_oda_copertura_chiusa_ad_anon` (applicata col via del titolare): `REVOKE` da
public e anon, `GRANT` ad authenticated e service_role. Dopo: 0 funzioni non classificate in
`v_funzioni_aperte_ad_anon`.

3b. Traccia anche per `fattura_collega_commesse`, `commessa_da_codici` e gli abbinamenti bolla↔ordine.
4. Edge function `acquisti-catena-fattura`: carica i documenti dell'azienda (dal record, non dal
   browser), esegue `costruisciCatena`, scrive le proposte; aggancio a `ricevi-sdi` e
   `openapi-fatture-ricevute` prima di `riconcilia-fattura-ai`, che parte solo per ciò che resta.
5. Popup di verifica nella fattura ricevuta: ordine/DDT/fattura/commessa affiancati, il perché
   (prove e percorso), collega/ripartisci/conferma/rifiuta/annulla, lavoro in massa con i
   verificati separati dalle eccezioni.
6. Misura in pagina: % fatture chiuse senza AI, correzioni manuali (annullati/rifiutati sul
   totale), chiamate AI evitate.

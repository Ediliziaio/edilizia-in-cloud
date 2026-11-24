# Piano: sopralluogo commerciale e sopralluogo tecnico

23 novembre 2026. Analisi su codice, funzioni del database e dati di produzione.

## 0. In una frase

Oggi il sopralluogo è uno solo e vive nelle Commesse. Deve diventare **due cose**:

| | Sopralluogo **commerciale** | Sopralluogo **tecnico** |
|---|---|---|
| Chi lo fa | Il commerciale | Il tecnico o l'operaio, dall'app |
| Dove vive | Vendite: contatto e opportunità | Commesse e Campo; anche in vendita se serve il preciso prima del contratto |
| Misure | Di massima (`ruolo_misure = preliminare`) | Precise (`definitivo`) |
| Cosa compila | Testata, ambienti, elementi, misure principali, foto, note | Tutto il modello, foto obbligatorie, consegna all'ufficio e revisione |
| Cosa produce | L'offerta | Computo, preventivo preciso, righe su misura della commessa → ordini ai fornitori |

Il tecnico non riparte da zero: **trova l'elenco del commerciale** e scrive solo le misure.

## 1. Cosa c'è oggi

### 1.1 I modelli

- 10 modelli di serie (infissi, bagno, ristrutturazione, fotovoltaico, clima, cappotto, tetto,
  pergole, piscine, cantiere) e quelli dell'azienda. Il più grande, Infissi: 6 tipi di elemento,
  64 campi, 15 campi di testata, 24 kB di schema.
- L'editor (`SurveyTemplateEditor`) fa: sezioni, campi (tipo, larghezza, obbligatorio, opzioni
  scritte come `valore|etichetta` una per riga, unità, aiuto), tipi di elemento, foto richieste.
- **Non fa**: condizioni (`show_if`, usate da 4 campi dei modelli di serie), campi annidati
  (`compound_boolean`), minimi e massimi, e la **mappatura verso preventivo/ordine**
  (`output_mapping`: c'è in tutti i modelli di serie, l'editor la conserva ma nessuno la legge,
  tranne l'unità di misura in `misureRilievo.ts`).
- Fare un modello da zero è lavoro da un pomeriggio, e serve conoscere i tipi di campo.
  In produzione: 3 modelli d'azienda, di cui uno vuoto («nnn») e uno copia di quello di serie.
- Non c'è modo di dire «questa sezione è solo per il tecnico»: o tutto o niente.
- `mode = 'express'` esiste nel vincolo della tabella ma non lo usa nessuno.

### 1.2 «Fissa sopralluogo» e il tecnico — verificato sui dati

Due strade che non si parlano:

1. **«Fissa sopralluogo»** (commessa) e gli appuntamenti CRM aprono `AppointmentDialog`: crea
   **solo l'appuntamento**, mai il rilievo.
   - `rilievo_tecnico`: 51 appuntamenti, **51 senza rilievo**.
   - `sopralluogo_preventivo`: 110, **109 senza rilievo**.
   - Il tecnico ha l'appuntamento in agenda ma niente da compilare: il rilievo nasce solo se in
     ufficio qualcuno preme «Compila rilievo».
2. **«Pianifica»** (bacheca e commessa) scrive `surveys.technician_id` e crea l'appuntamento, ma
   **non** crea l'assegnazione in `survey_assignees`.
   - L'app operai (`/campo/sopralluoghi`) apre un rilievo solo con un'assegnazione
     **autorizzata** (`survey_private.field_allowed`).
   - Risultato: 170 rilievi hanno un tecnico senza assegnazione; 121 hanno per tecnico un
     operaio che **non può aprirli**. Le autorizzazioni attive in tutto il sistema sono 1.
   - L'avviso «Nuovo sopralluogo assegnato» parte solo dal pannello «Assegna» (lato browser),
     non da «Pianifica».

La scelta di ottobre (`docs/sopralluoghi-app-operai-20261028.md`): l'accesso all'app operai è
**esplicito**, non arriva con la sola assegnazione. Resta valida: diventa una spunta visibile nello
stesso gesto in cui si sceglie il tecnico, accesa di partenza quando la persona scelta è un operaio
(sceglierlo come tecnico vuol dire chiedergli di compilare).

### 1.3 Vendite

- Il rilievo può già essere legato a contatto e opportunità (`contact_id`, `opportunity_id`) da
  «Nuovo sopralluogo», e nasce `preliminare` se non c'è commessa.
- Ma in Vendite **non si vede**: né l'opportunità né il contatto mostrano i rilievi; la bacheca
  sta sotto Commesse; quando l'opportunità diventa commessa il rilievo si collega solo a mano
  («Sopralluoghi del cliente da collegare»).

### 1.4 Le uscite

| Verso | Oggi | Note |
|---|---|---|
| Preventivo generico (QuoteBuilder) | **No** | `surveys.estimate_id` mai scritto (0 su 195), senza chiave esterna; `quotes` non sa da quale rilievo nasce |
| Preventivo serramenti | Parallelo | «Rilievo per posizioni» nel QuoteBuilder è un secondo rilievo, separato dal modulo |
| Fotovoltaico, clima, termoidraulico | **Sì** | `EnergyQuoteImport` nei wizard |
| Computo | **No** | Le bozze (`computo_preventivo_drafts`) non hanno un'origine |
| Commessa | Sì | «Porta le misure in commessa» (`sopralluogo_applica_misure`), mai usato in produzione |
| Ordini ai fornitori | Sì, passando dalla commessa | Righe su misura → offerta/ordine su misura (piano articoli su misura, fasi 5-7) |

## 2. Le regole

1. **Il tipo si sceglie quando nasce** e si vede ovunque (badge). Si passa da commerciale a
   tecnico creando il tecnico **dal** commerciale, non cambiando l'etichetta: il commerciale resta
   com'era, come prova di cosa si è detto al cliente.
2. Commerciale ⇒ misure mai `definitivo` (vincolo nel database).
3. Un modello, due profondità: le sezioni segnate «solo tecnico» non si vedono nel commerciale.
4. Un appuntamento di sopralluogo ha **al massimo un rilievo** (indice univoco), e lo può
   preparare chi fissa l'appuntamento.
5. Il tecnico scelto è anche **assegnato**: una sola funzione nel database scrive tecnico,
   assegnazione, accesso all'app e avviso. Nessuna pagina scrive più `technician_id` da sola.
6. Ordini solo passando dalla commessa: dal rilievo non nasce un ordine al fornitore senza
   contratto.
7. Ogni uscita lascia il **collegamento indietro** (rilievo → preventivo, rilievo → computo),
   così da ogni documento si apre il rilievo da cui è nato.

## 3. I lotti

### Lotto 1 — Il tecnico ha davvero il rilievo *(fatto 24/11/2026)*
- Colonna `surveys.tipo` (`commerciale` | `tecnico`), vincolo con `ruolo_misure`, indice univoco
  sull'appuntamento.
- `sopralluogo_assegna_tecnico(rilievo, tecnico, app_operai)`: tecnico, assegnazione, accesso
  all'app per gli operai, avviso (rispettando la preferenza), registro.
- `sopralluogo_da_appuntamento(appuntamento, modello, tipo, app_operai)`: prepara il rilievo
  dall'appuntamento (cliente, opportunità, commessa, indirizzo, ora, tecnico), idempotente.
- Interfaccia: in «Fissa sopralluogo» / appuntamento di sopralluogo, riquadro «Rilievo» con il
  modello e la spunta «Prepara il rilievo per il tecnico»; in «Pianifica» la spunta «Può
  compilarlo dall'app operai» quando il tecnico è un operaio; «Pianifica» e la creazione passano
  dalla funzione unica.
- Non si toccano i 160 appuntamenti vecchi senza rilievo: «Compila rilievo» resta.

Fatto:
- Migrazioni `20290528100000_sopralluogo_tipo_tecnico_appuntamento` e
  `20290528100100_sopralluogo_tecnico_segue_appuntamento`, applicate e riallineate. Provate
  prima in transazione annullata con un ufficio e un operaio veri della Demo 2: rilievo
  dall'appuntamento con cliente, commessa, indirizzo e ora; l'operaio lo apre e lo modifica
  dall'app; seconda chiamata = stesso rilievo; l'operaio non può assegnare; cambio di tecnico
  (anche spostando l'appuntamento in calendario) = il vecchio perde l'accesso; persona
  estranea = l'appuntamento si salva lo stesso; commerciale «definitivo» rifiutato.
- Il tecnico segue l'appuntamento come già la data (`survey_segue_appuntamento`, ora anche su
  `assigned_to`): spostare il sopralluogo a un altro tecnico in calendario sposta anche il
  rilievo. Se l'assegnazione non riesce il calendario non si ferma.
- Riquadro «Rilievo» in ogni appuntamento di sopralluogo (`RilievoAppuntamento.tsx`): spunta
  accesa per i tecnici, spenta per il sopralluogo preventivo; propone l'ultimo modello usato.
- «Pianifica»: tecnico dalla funzione unica, prima dell'appuntamento; spunta «Può aprirlo e
  compilarlo dall'app operai» quando la persona è un operaio; l'appuntamento nuovo è
  `rilievo_tecnico` per i tecnici (prima sempre «preventivo»).
- «Nuovo sopralluogo» con tecnico: anche l'assegnazione.
- Test: `rilievoAppuntamento`, `pianificaSopralluogoTecnico`, `appuntamentoPreparaRilievo`.

Da sapere: `src/integrations/supabase/types.ts` su main è indietro di circa 300 oggetti
rispetto al database; rigenerarlo porta dentro il lavoro di altre sessioni, quindi le due
funzioni nuove passano da `assegnaTecnicoSopralluogo` e `rilievoDaAppuntamento` con il cast,
e `surveys.tipo` non è ancora nei tipi. Va rigenerato a parte.

### Lotto 2 — Commerciale e tecnico
- Scelta del tipo in «Nuovo sopralluogo»; badge in bacheca, commessa, campo, PDF.
- Filtro «Commerciali / Tecnici» in bacheca.
- Sezioni «solo tecnico» nei modelli (`FieldSection.solo_tecnico`), spunta nell'editor, segnate
  nei modelli di serie (sistemi, controtelaio, dettagli posa…).
- «Crea il tecnico da questo commerciale»: copia ambienti ed elementi, il tecnico completa.

### Lotto 3 — Il sopralluogo nelle Vendite
- Riquadro «Sopralluoghi» in opportunità e scheda contatto (stessa tabella della commessa).
- «Nuovo sopralluogo» e «Fissa sopralluogo» dall'opportunità, commerciale di partenza.
- Bacheca anche sotto Vendite, filtrata sui commerciali.
- Quando l'opportunità diventa commessa, i suoi rilievi si collegano da soli.

### Lotto 4 — Dal rilievo al preventivo e al computo *(prima parte fatta 24/11/2026)*
- Rilievo → preventivo: righe dal `output_mapping` del modello (descrizione, unità, quantità),
  `quotes.survey_id` con chiave esterna, `estimate_id` scritto davvero.
- Serramenti: il rilievo riempie il «Rilievo per posizioni» invece di riscriverlo.
- Rilievo → computo: bozza (`computo_preventivo_drafts`) con le voci e l'origine, aperta su
  `?bozza=id`.
- Dal preventivo e dal computo, link «Apri il rilievo».

Fatto (anticipato su richiesta, prima dei lotti 2 e 3):
- `lib/surveys/righeDalRilievo.ts` legge `output_mapping.estimate_lines` del modello: descrizione
  con le etichette delle opzioni (senza emoji), unità, quantità; a mq/ml cerca la superficie nei
  valori, altrimenti 1 con «misura non trovata». Un tipo senza mappatura diventa comunque una riga
  col suo nome. Per gli infissi, ogni complemento spuntato («Cosa rilevo»: tapparella, cassonetto,
  zanzariera, persiana, davanzale) è una riga a sé con le sue misure.
- «Crea preventivo» e «Crea computo» sul rilievo (in compilazione e firmato), per chi ha
  «Preventivi» in modifica: finestra con le righe da togliere o correggere e, per il preventivo,
  i prezzi e l'IVA. Preventivo in bozza col contatto e l'opportunità del rilievo; computo come bozza
  dell'editor nativo con l'ambiente come capitolo e l'indirizzo del cantiere.
- Il rilievo scrive `estimate_id` (prima mai scritto) e mostra «Apri preventivo».
- Fotovoltaico e clima: il preventivo resta quello del wizard; il computo c'è anche per loro.

Resta: i prezzi dal listino (oggi si scrivono a mano), il «Rilievo per posizioni» dei serramenti
riempito dal rilievo, `quotes.survey_id` con chiave esterna e il link «Apri il rilievo» dal
preventivo e dal computo (oggi l'origine è scritta nella descrizione di ogni riga).

### Lotto 5 — Dal rilievo agli ordini
- Collaudo vero di «Porta le misure in commessa» → righe su misura → offerta/ordine al fornitore,
  con un rilievo tecnico e una commessa veri (mai fatto in produzione).
- Dalla scheda del rilievo, stato delle sue righe: in commessa, in ordine, arrivate.

### Lotto 6 — Modelli più facili da costruire
- Editor: condizioni («mostra se»), campi annidati, minimi e massimi, mappatura verso il
  preventivo.
- Nuovo modello da un foglio di carta o da una descrizione (AI), con anteprima prima di salvare.

## 4. Cosa resta fuori
- Rilievo compilato dal commerciale senza rete: va provato col lotto 2 sul telefono vero.
- Rilievi vecchi senza tipo: diventano tecnici, tranne i preliminari (2), che diventano commerciali.

# Subappalti, operatività e bollette: collegamenti senza AI — area D (15/11/2026)

Documento di dettaglio dell'area **D** del piano `docs/piano-ai-addebiti-e-automazioni-20261115.md`
(§7.9 subappalti, §7.11 bollette, §7.12 rapportini e listini). Regole generali, esiti e prove
sono quelli delle sezioni 2–4 del piano: qui ci sono i flussi, cosa c'è già, cosa è stato fatto
e cosa resta.

## 1. Cosa c'è già (ricognizione sul codice e sul database, 15/11/2026)

| Pezzo | Dove | Stato |
|---|---|---|
| Contratto di subappalto, varianti che aggiornano l'importo | `contratti_subappalto`, `subappalto_varianti_contratto` (2 varianti in produzione) | completo |
| Base lavori e misure riconosciute per voce | `subappalto_quadri_lavori`, `subappalto_misure`, `lib/subappaltatori/lavoriMisure.ts` | completo |
| SAL del subappaltatore, verbale, accettazione | `sal_subappaltatori` (112 righe, 3 aziende), `sal_sub_verbali`, `genera-verbale-sal-sub` | completo |
| **`sal_subappaltatori.importo_lordo` è l'importo del periodo** | verificato: nessun contratto con SAL crescenti, i SAL si sommano nel riepilogo | da tenere distinto dal SAL del committente |
| SAL del committente (`sal_records.importo_totale`) è **cumulativo** | memoria «SAL da capo a fondo», 15/11 | non toccato qui |
| Ritenuta di garanzia dal contratto, registro, svincolo | `ritenute_garanzia`, `20290402100000_sal_ritenuta_nel_registro` | completo |
| Fattura ↔ contratto ↔ SAL | `fatture_ricevute.contratto_subappalto_id` / `sal_subappaltatore_id`, RPC `subappalto_collega_fattura` (P.IVA, azienda, SAL verificato, costo sulla commessa) | la RPC c'era, ma la scheda della fattura la saltava (vedi §3) |
| Riepilogo del contratto | `lib/subappaltatori/riconciliazioneContratto.ts` | esteso (§3) |
| Prezzo delle voci del rapportino | DB `prezzo_voce_commessa(order, tariffa, data)`: eccezione di cantiere → listino del committente → listino generale → «da definire»; specchio in `lib/campo/prezzoVoceRapportino.ts` | completo |
| Costo della manodopera del rapportino | trigger `fn_rapportino_costo_manodopera`: fotografia all'approvazione (`costo_registrato_at`), costo e ricavo in campi separati | completo, una lacuna (§5) |
| Costo orario dei mezzi | `mezzi_costo_orario`, `mezzo_costo_orario_effettivo` | completo, senza validità nel tempo |
| Listini fornitore con validità | memoria «Listini fornitore: validità» (CHECK dal<=al) | completo |
| Costi alternativi delle tariffe con validità | `tariffa_costi_varianti.valid_from/valid_to` | completo |
| Magazzino: costo medio ponderato, quota «a magazzino» in fattura, scarico per fase | note condivise `magazzino-costo-medio-e-quota-magazzino.md`; area B | dell'area B |
| Bollette e utenze | **nessuna tabella** (`information_schema`: niente `bollett*`, `utenz*`, `pod*`) | modulo da creare (§4) |

## 2. Matrice dei flussi

| Flusso | Comportamento attuale | Dati disponibili/mancanti | Parser e regole proposti | AI residua | Eccezioni | Moduli | Priorità | Impegno | Criterio di accettazione |
|---|---|---|---|---|---|---|---|---|---|
| **Fattura subappaltatore → contratto** | Prima del 15/11: tendina dei contratti con la stessa P.IVA, update diretto. **Ora**: `controllaFatturaSubappalto` propone o riconosce, il clic passa da `subappalto_collega_fattura` | P.IVA cedente, numero contratto nelle righe/note, importo; manca il numero di contratto strutturato in fattura (non c'è nell'XML) | P.IVA (`partner_tax_key`) → contratti del fornitore → numero citato nel testo → unico contratto → importo uguale a un solo SAL | Nessuna. Eventuale lettura del PDF solo se l'XML manca e le righe sono vuote | Più contratti senza riferimenti → scelta; numero citato che non esiste → conflitto | Fatture ricevute, Subappaltatori | Alta | Fatto (lotto 1) | 241 fatture libere con P.IVA di un subappaltatore (2 aziende, 135 con più contratti): ognuna mostra esito e perché |
| **Fattura → SAL** | Tendina dei SAL del contratto | Numero SAL nel testo («SAL n. 3», «3° SAL», «stato avanzamento lavori n° 4»), importo periodo, netto, stato | Numero citato → importo uguale al periodo o al netto, escluso il SAL già fatturato; più SAL uguali → scelta | Nessuna | SAL non verificato → proposta con avviso (la RPC rifiuta il collegamento finché non è verificato); SAL mancante → verifica, non errore | Fatture, SAL sub | Alta | Fatto | Fattura sul periodo del SAL citato e verificato = «Riconosciuta» |
| **SAL cumulativo vs periodo** | Riepilogo somma i periodi | `importo_lordo` + `oneri_quota` per SAL | `progressiviSal`: periodo e cumulativo calcolati, mai salvati. Fattura uguale al cumulativo (SAL ≥ 2) e diversa dal periodo → **blocco** | Nessuna | Contestati fuori dal cumulativo | SAL sub | Alta | Fatto | Test «cumulativo a tutto il SAL 2» bloccato |
| **SAL già fatturato** | Nessun controllo | Fatture sullo stesso `sal_subappaltatore_id` | Somma delle altre fatture + questa > periodo del SAL → blocco; parziali entro l'importo passano | Nessuna | Note di credito (TD04) sottraggono | Fatture, riepilogo contratto | Alta | Fatto | Avviso anche nel riepilogo del contratto |
| **Fattura oltre l'autorizzato** | Avviso solo nel riepilogo («fatturato più dei SAL approvati») | Valore contratto (varianti già dentro), SAL verificati/pagati, altre fatture | Oltre il valore del contratto → blocco; oltre i SAL approvati → avviso | Nessuna | Acconto contrattuale previsto: oggi non è un dato strutturato (vedi §6, domanda 2) | Fatture, Subappaltatori | Alta | Fatto | Test «oltre il contratto» e «oltre gli approvati» |
| **Periodi sovrapposti** | Nessun controllo | Periodo solo nel testo («dal … al …»); `sal_subappaltatori` ha solo `data_emissione` | Parser del periodo, sovrapposizione con le altre fatture dello stesso contratto → avviso | Nessuna | Senza periodo scritto non si controlla | Fatture | Media | Fatto (testo); periodo strutturato sul SAL da fare | Test periodo sovrapposto |
| **Riferimenti incoerenti** | Nessun controllo | Numero SAL / contratto nel testo vs collegamento | Citato ≠ collegato → blocco | Nessuna | Testo con due SAL diversi → nessun numero letto | Fatture | Alta | Fatto | Test SAL e contratto diversi |
| **Pagamenti e ritenute del SAL** | `registra_pagamento_sal_sub`, registro ritenute, avviso «ritenute non registrate» | Pagato, ritenute trattenute/svincolate | Restano quelli; residuo contrattuale = valore − eseguito; residuo finanziario = netto − pagato | Nessuna | Svincolo prima del collaudo: regola del contratto | Subappaltatori, Tesoreria (C) | Media | Esistente | Riepilogo del contratto coerente |
| **Rapportino: operaio, qualifica, costo** | Costo fotografato all'approvazione; tariffa a mano vince, altrimenti costo vero da lordo/oneri | Persona, ore, qualifica, storico del costo (`costi_orari_storico`, dal 15/11) | Costo valido alla **data del lavoro**: fatto (lotto 2) | Nessuna | Decorrenza passata: «Vale dal» nella scheda (15/11); i rapportini già approvati restano col costo di allora | Campo, Personale | Media | Fatto | Due rapportini dello stesso operaio prima/dopo l'aumento hanno costi diversi |
| **Rapportino: mezzo e tariffa** | `rapportino_mezzi_costi_trg`, costo orario del mezzo | Mezzo, ore; storico del costo manuale e delle ore previste | Costo alla data del lavoro: fatto (lotto 2); il calcolato sulle spese resta senza storia | Nessuna | Mezzo a noleggio: costo dalla fattura del noleggio (B) | Campo, Mezzi | Bassa | Fatto | — |
| **Rapportino: listino e prezzo** | `prezzo_voce_commessa`: cantiere → committente → generale | Tariffe, eccezioni per commessa | Esistente; il prezzo del committente **non** sostituisce il costo (campi separati) | Nessuna | Unità diverse fra listino committente e generale: segnalate (`unita_diverse`) | Campo, Listini | — | Esistente | Test in `src/test/logic/rapportiniPrezzoListino.test.ts` |
| **Materiali: magazzino → cantiere** | Scarico al costo medio, quota «a magazzino» sulla fattura | Movimenti, costo medio | La fattura a magazzino non va sulla commessa; lo scarico sì: un costo solo | Nessuna | Rientro dal cantiere al costo d'uscita | Magazzino (B) | — | Area B | Test dell'area B |
| **Bollette e utenze** | Non esiste | — | Vedi §4 | Lettura del PDF quando manca l'XML | Conguagli, note di credito, più utenze, doppioni | Nuovo modulo | Media | 3–4 lotti | Vedi §4 |
| **Documento approvato immutabile** | Verbale SAL con impronta (`pdf_sha256`), contratto firmato, preventivo firmato = contratto | — | Già così per SAL, contratti, preventivi; il controllo fattura non scrive niente senza un clic | — | — | — | — | Esistente | — |

## 3. Lotto 1 — fatto il 15/11/2026

- `src/lib/subappaltatori/controlloFatturaSubappalto.ts`: il motore. Ingressi: la fattura, i
  contratti, i SAL e le altre fatture già collegate. Uscita: esito (`automatico`, `proposta`,
  `scelta`, `conflitto`, `da_gestire`), la regola che l'ha deciso, le alternative motivate, i
  problemi (ognuno dice se blocca) e le prove. Un problema che blocca porta l'esito a
  `conflitto` qualunque sia il resto. Non scrive niente e non chiama servizi esterni.
- `src/components/fatturazione/ControlloSubappaltoFattura.tsx`: carica i dati e mostra l'esito
  nella riga «Subappalto» della fattura ricevuta, con «Collega» sulla proposta.
- `CollegamentiFattura`: il collegamento passa ora da `subappalto_collega_fattura` (P.IVA,
  azienda, SAL verificato, costo sulla commessa del contratto). **Effetto**: chi ha il permesso
  sulle fatture ma non `can_edit_orders` + `can_view_subappaltatori_amministrazione` non collega
  più contratti dalla fattura (stessi permessi della scheda del subappaltatore).
- `riconciliazioneContratto`: nuovo avviso «SAL fatturato per più del suo importo».
- Test: `src/test/logic/controlloFatturaSubappalto.test.ts` (20 casi),
  `riconciliazioneSubappalto.test.ts`, `src/test/ui/collegamentiFattura.test.tsx`.

**Collegamento automatico** (15/11/2026, migrazione `20290415130000_subappalto_fattura_interruttore_traccia`):
vale l'interruttore comune dell'azienda (`company_governance_settings.collegamento_automatico`,
spento di base; docs/automazioni-acquisti.md §3).
- Spento: l'esito «automatico» del controllo si mostra come **proposta** e si conferma con un
  clic (`conInterruttoreSubappalto`).
- Acceso: la scheda della fattura la collega da sola, una volta, con esito `automatico`.
- `subappalto_collega_fattura(…, p_esito, p_regola, p_prove)` lo ricontrolla: con `automatico` e
  l'interruttore spento non collega e registra solo la proposta.
- Ogni collegamento va nella traccia comune `acquisti_collegamenti` (fattura → contratto,
  fattura → SAL) con regola `subappalto_controllo_fattura`, prove, autore ed esito (`manuale`
  quando decide una persona). Scollegare o cambiare SAL annulla le righe vecchie col motivo.
- **All'arrivo, dal server** (15/11/2026): la funzione `subappalti-collega-fatture`, ogni 15
  minuti, passa per le sole aziende con l'interruttore acceso le fatture ricevute degli ultimi
  120 giorni ancora libere, il cui cedente ha un contratto di subappalto, e che non hanno già
  una riga nella traccia (una persona ha deciso: una regola non la contraddice). Le controlla
  col motore (`shared/subappalti/controlloFattura.ts`, lo stesso della scheda; `decidiGiro`
  considera già collegate le fatture decise prima nello stesso giro) e collega solo le
  «unico e verificato» con `subappalto_collega_fattura(…, 'automatico')`. Tetto di 40 fatture
  per giro, le più recenti prima; nessuna AI (l'esito `senza_ai` va in «Consumo AI del team»).
  Dal service role la funzione SQL accetta solo `automatico`, non scollega, e nella traccia
  l'autore è il processo `subappalti-collega-fatture` (migrazione
  `20290415140000_subappalto_collega_fattura_dal_servizio`). Test: `subappaltiCollegaFattureGiro.test.ts`.
- La scheda della fattura collega ancora da sola quando la si apre (stesso esito, stessa
  funzione): copre la fattura arrivata nei 15 minuti prima del giro.
- La P.IVA si confronta con `chiaveFiscale` (`shared/acquisti/normalizza.ts`), la stessa chiave
  di `partner_tax_key`.

**Dati storici**: anteprima eseguita il 15/11 — 241 fatture ricevute non collegate hanno la
P.IVA di un subappaltatore con contratto (2 aziende; 135 di fornitori con più contratti, quindi
in buona parte «scelta»). Nessuna scrittura massiva fatta: un collegamento storico si fa a lotti
(`lock_timeout` 3 s, `statement_timeout` 60 s, un'azienda per volta) solo per gli esiti
`automatico`, dopo il sì del titolare.

Anteprima col motore, 15/11 (sola lettura, dopo la correzione dei numeri di contratto):

| Azienda | Automatico | Proposta | Scelta | Conflitto |
|---|---|---|---|---|
| A (116 fatture) | 0 | 78 · 1.227.920 € | 38 · 516.832 € | 0 |
| B (125 fatture) | 0 | 39 · 132.174 € | 85 · 132.849 € | 1 · 700 € |

Nessuna «automatico»: in tutte le proposte manca il SAL (le due aziende hanno un solo SAL di
subappalto registrato) e molti contratti hanno importo 0. Il conflitto è una fattura di 700 €
su un contratto da 250 €. Quindi niente collegamento a lotti: si scelgono a mano. Nella stessa
anteprima 4 fatture risultavano in conflitto perché citavano «contratto n. 07» e il contratto in
archivio non ha numero: ora è una proposta con avviso (`contratto_senza_numero`), e il numero
breve («02 del 15/09/2025 — commessa 06/2025») si riconosce dalla fattura che scrive «n. 02».

## 4. Bollette e utenze — proposta (il modulo non esiste)

Tabelle (tutte con `company_id`, RLS per azienda, nate con `REVOKE ALL … FROM PUBLIC, anon`):

- `utenze`: fornitore (`fornitore_id`), tipo (luce, gas, acqua, telefono), **POD** (luce) / **PDR**
  (gas) / codice cliente, intestatario, numero contratto, indirizzo di fornitura (solo supporto),
  collegamento verificato a sede / immobile (`unita` di sviluppo immobiliare) / commessa
  (cantiere), con `collegato_da`, `collegato_il`, `regola`, `valido_dal`/`valido_al`
  (un contatore di cantiere passa da una commessa all'altra). Unico: `(company_id, pod_pdr)`.
- `bollette`: la fattura ricevuta (`fattura_ricevuta_id`, una bolletta **è** una fattura
  ricevuta: niente secondo registro di costi), numero, emissione, scadenza, tipo (ordinaria,
  conguaglio, nota di credito, rettifica).
- `bollette_utenze`: una riga per utenza dentro la bolletta (più POD nello stesso documento):
  periodo `dal`/`al`, consumi, importo, componenti (energia, trasporto, oneri, imposte, canone)
  in `jsonb`, letture effettive o stimate.

Riconoscimento, in quest'ordine, senza AI:

1. XML FatturaPA: il POD/PDR sta quasi sempre in `AltriDatiGestionali` o nelle descrizioni;
   parser per `IT\d{3}E\d{8}` (POD) e 14 cifre (PDR). Periodo e letture dalle descrizioni.
2. Utenza già registrata con quel POD/PDR → collegamento automatico (unico e verificato).
3. POD/PDR nuovo, stesso fornitore e intestatario → proposta di nuova utenza; indirizzo di
   fornitura confrontato con sedi, immobili e cantieri come supporto, mai da solo.
4. AI solo se manca l'XML e il PDF non ha testo, e solo sulla pagina del riepilogo.

Doppione o conguaglio:

- **Doppione**: stesso fornitore, stesso numero documento e anno → è la stessa fattura (lo
  scarta già l'impronta dell'XML); stesso POD, **stesso periodo** e stesso importo con numero
  diverso → doppione probabile, si blocca e si chiede.
- **Conguaglio legittimo**: tipo conguaglio o letture effettive dopo stimate, periodo che
  copre periodi già fatturati: l'importo del conguaglio è la differenza, i periodi stimati non
  si annullano. Si mostra il periodo coperto e le bollette che rettifica.
- **Nota di credito** (TD04): riduce la bolletta che cita; periodi sovrapposti ammessi.
- Periodi sovrapposti fra bollette ordinarie della stessa utenza → avviso.

Conseguenze: costo sulla commessa (contatore di cantiere) o costo generale della sede, ripartito
per giorni del periodo se l'utenza ha cambiato commessa a metà; scadenza nello scadenzario (C).

Criterio di accettazione: una bolletta con POD già associato si collega senza AI e senza clic;
un conguaglio non viene scambiato per doppione; un doppione non entra due volte nei costi.

## 5. Lacune trovate, non ancora corrette

1. ~~**Costo orario senza storia**~~ — **corretto il 15/11/2026** (lotto 2, migrazione
   `20290415100000_costo_orario_alla_data_del_lavoro`): `costi_orari_storico` registra ogni
   cambio del costo di un dipendente (scheda o parametri del profilo) o di un mezzo (costo
   manuale, ore previste) con `valido_dal` = oggi, e la prima volta anche il costo di prima,
   valido dal passato remoto. Il rapportino prende il costo valido alla `data_lavoro`
   (`private.costo_orario_dipendente_al`, `private.mezzo_costo_orario_al`). Nessun dato esistente
   cambia: senza storia il costo è quello di adesso, come prima. Verifica:
   `supabase/tests/costo_orario_alla_data_verifica.sql` (Demo 2, transazione annullata).
   Restano:
   - il costo **calcolato** di un mezzo (spese degli ultimi 12 mesi) cambia col tempo senza
     lasciare storia: si storicizzano solo le modifiche del manuale e delle ore previste;
   - ~~decorrenza passata di un aumento~~ — **fatta il 15/11/2026** (migrazione
     `20290415110000_costo_orario_decorrenza`): nella scheda del Personale, quando si cambia il
     costo, compare «Vale dal» (oggi, oppure fino a un anno fa; mai nel futuro). I rapportini
     da quella data prendono il costo nuovo quando vengono approvati; quelli già approvati
     restano come sono, e la scheda dice quanti hanno ancora il costo di prima. Aggiornarli è un
     passaggio esplicito ancora da costruire;
   - `rapportino_costo_recupera` (il costo che mancava e arriva dopo) usa il primo costo noto.
2. **Periodo del SAL del subappaltatore**: c'è solo `data_emissione`. Con `periodo_dal`/`periodo_al`
   sul SAL la sovrapposizione si controlla anche quando la fattura non scrive il periodo.
3. ~~**Acconto al subappaltatore**~~ — **fatto il 15/11/2026** (migrazione
   `20290415120000_subappalto_acconto`):
   - sul contratto `acconto_importo` (campo «Acconto» nella scheda) e `acconto_recupero_pct`
     (vuota = acconto / valore del contratto);
   - la fattura d'acconto si collega al contratto **senza SAL** e si riconosce dal testo
     («acconto», «anticipazione») o dall'importo uguale all'acconto ancora da fatturare;
     oltre l'acconto previsto si blocca (`acconto_oltre`);
   - ogni SAL registrato recupera la sua quota in `sal_subappaltatori.acconto_recuperato`,
     solo dell'acconto **già fatturato**, mai oltre il residuo; l'ultimo SAL recupera tutto il
     resto; il netto (colonna calcolata) è lordo − ritenuta − recupero, e il browser non lo
     cambia;
   - la fattura del SAL deve scalare l'acconto: se è sul netto senza recupero si blocca
     (`acconto_non_scalato`), perché l'acconto si pagherebbe due volte;
   - il riepilogo del contratto mostra acconto, fatturato, recuperato e **da recuperare**; il
     verbale del SAL ha la riga «Recupero dell'acconto già fatturato» nel benestare.
   Provato su Demo 2 (transazione annullata): contratto 12.400 €, acconto 3.100 €; SAL prima
   della fattura d'acconto → recupero 0; SAL da 4.000 € → 1.000 €; ultimo SAL → i 2.100 € che
   restano. Il recupero vale per i SAL registrati da oggi: quelli già registrati restano a 0.

## 6. Domande per il titolare

1. ~~Una fattura «Riconosciuta» si collega da sola?~~ Lo decide l'interruttore comune
   dell'azienda (§3).
2. ~~Gli acconti ai subappaltatori sono previsti dai contratti?~~ Sì, a volte: fatto (§5.3).
3. Le 241 fatture storiche: si collegano a lotti quelle «Riconosciute», azienda per azienda?

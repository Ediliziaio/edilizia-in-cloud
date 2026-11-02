# Revisione «Crea con Silvio» — 1/11/2026 (sul commit 4810ab755)

Tre revisori indipendenti, sola lettura: SQL (migrazioni 2028110609…142500), logica (`shared/` e
`src/lib/silvio-commessa`), interfaccia ed edge. Le righe si riferiscono a 4810ab755.
Già girati alla sessione UX (li corregge lei): chiusura del popup durante la lettura, doppio invio della chat,
data UTC della bozza ripresa.

## ALTA

- **E1 edge — chi non è staff entra.** `supabase/functions/silvio-commessa/index.ts:129, 272, 298, 376`:
  `requireCompanyAccess` senza ruoli lascia passare clienti del portale, segnalatori e subappaltatori (sono profiles).
  Un cliente legge, con la chiave di servizio, file caricati dallo staff (`valutaFile` accetta ogni percorso sotto
  `<azienda>/`) e consuma i crediti con `modo: "chat"`. → In ogni ramo `has_permission_for_company(uid,'can_edit_orders',company)`.
- **S1 annulla — tabelle senza `updated_at`.** `20281106100000:837-849, 919-924`: `contratti_subappalto`,
  `order_employees`, `order_external_teams`, `order_work_phase_voci`, `adempimenti_sicurezza`,
  `subappaltatori_sicurezza` non hanno `updated_at`. Un contratto firmato, una ditta segnata pagata, le ore dal
  rapportino spariscono con «Annulla». → Impronta `md5(to_jsonb(t)::text)` alla registrazione, ricalcolata a fine
  transazione; all'annullamento rifiutare se non corrisponde.
- **S2 annulla — cascata su dati dell'utente.** `20281106100000:862-870, 921`: figlie di `orders` saltate dal filtro
  (`mezzi_piani_cantiere` senza `created_at`, `lp_libretto_modifiche`, `lp_sal_voci`, `commesse_generali`,
  `order_variation_workspaces`, `generale_subappalto_ordini`) e figlie di righe di Silvio (`mezzi_piani_spese`,
  `mezzi_piani_costi`, `task_tag_assignments`) vanno via in cascata; FK a più colonne in NO ACTION
  (`sicurezza_fascicolo`, `sicurezza_incarichi`, `subappaltatori_operai`) danno l'errore grezzo. → Per le figlie non
  registrabili rifiutare se esiste qualunque riga che punta a una riga di Silvio, FK a più colonne comprese
  (`confdeltype`), con un messaggio chiaro.
- **L1 «Tieni questo» sceglie sempre il primo documento dello stesso tipo.** `fondi.ts:315-316`,
  `ColonnaCommessa.tsx:495`; i documenti letti con l'AI non hanno id (`leggiDocumento.ts:171,205`). Capitolato
  100.000, offerta 95.000, «tieni offerta» → resta 100.000. → id a ogni fonte letta (percorso o uuid), confronto anche
  per etichetta.
- **L2 importi dalla chat: il punto decimale moltiplica per 100.** `chat.ts:227`: "1250.50" → 125.050; "45.4642" →
  454.642; −500 e IVA 23 passano, come «persona/fatto». Anche `scrittura.ts:192-194` accetta negativi. → `numeroDa`
  di `letturaAI.ts`; `total_amount > 0`, IVA ∈ {0,4,5,10,22}, lat/lng nei limiti.
- **L3 rate % sull'imponibile se l'IVA manca.** `letturaAI.ts:503, 291`: 100.000 imponibile, «30% alla firma» → 30.000
  «fatto» invece di 33.000. → Senza IVA la rata resta in % e in `proposta` con «manca l'IVA», o si usa l'IVA del piano.

## MEDIA

- **E2 interruttore `silvio_crea_commessa` solo nel browser.** Edge, RPC `commessa_crea_con_silvio` /
  `commessa_completa_con_silvio` e lo strumento `commessa_da_documento` (`_shared/silvioTools.ts:6656-6700`) non lo
  controllano: in un'azienda spenta Silvio manda il link a un modulo senza popup, e la edge si chiama lo stesso. →
  `resolve_company_feature` (con l'eccezione Demo 2 come nel client) nella edge (403) e nello strumento.
- **E3 percorso dell'allegato non legato alla commessa.** `silvio-commessa/documenti.ts:56-63`: `file_url` di
  `order_attachments` è scritto dall'utente. → `path.startsWith('orders/<order_id>/')`, idem per
  `order-variation-documents`.
- **E4/S8 piano di volo nelle aziende grandi.** `silvio-piano-volo/index.ts:112-131`: fasi da −120 giorni senza limite
  superiore, ordine crescente, `limit(2000)` (PostgREST ne dà 1000), sempre le stesse 30 commesse. → Finestra
  oggi−15…oggi+21, stati esclusi nel DB, rotazione col tetto (regola di CLAUDE.md).
- **S3 promemoria vietati passano.** `20281106140000:168-182` toglie solo `pos`/`duvri`; `{"tipo":"cartello"}` passa.
  → Elenco consentito.
- **S4 `silvio_volo_conferma` non ricontrolla l'autonomia.** `20281106141000:129, 159-165`. → Rifiutare se
  `controllo_fase` / `proposta_sal` è vietata; alla nuova scelta segnare `scaduta` le proposte aperte.
- **S5 importi dei SAL a chi non ha «Importi di vendita».** `20281106141000:70-76, 167-180`. → Lettura via RPC che
  toglie gli importi senza `can_view_order_amounts`, stesso controllo nella conferma del SAL.
- **S6 campanelle ripetute.** `20281106141000:237-242`, `silvio-piano-volo/index.ts:144-146, 177`. → Restituire
  `nuova`/«azioni cambiate» e notificare solo allora.
- **L4 fasi sovrapposte se il documento dà i giorni solo ad alcune.** `letturaAI.ts:334` + `modelliLavoro.ts:231`. →
  Niente `giorno_inizio` se qualche fase è senza durata; sequenza da `durateDalModello`.
- **L5 annulla perde un conflitto.** `fondi.ts:147-151, 345-353`. → Tenere i candidati scartati e rifondere all'annulla.
- **L6 SAL proposto mescola ivato e imponibile.** `pianoVolo.ts:217`. → Una sola base (imponibile), scorporando l'IVA.
- **L7 «aggiungi fase» in mezzo non sposta le seguenti.** `chat.ts:319`. → Spostare le successive e la fine lavori.
- **L8 «sposta da una fase» non sposta l'inizio e permette sovrapposizioni.** `fondi.ts:304`.
- **L9 cambiare l'inizio lavori non ridata le fasi già datate.** `useBozzaSilvio.ts:578, 582`.
- **L10 i lettori ignorano il calendario dell'azienda (agosto, patrono).** `preventivo.ts:282`,
  `modelliLavoro.ts:294`, `lettori/commessa.ts`.
- **L11 impegni letti senza ordine e troncati a 1000.** `contestoRisorse.ts:61-63` → persona doppia non vista. →
  Filtrare commesse aperte e date future (o RPC), ordinare.

## BASSA

- E5 strumento dichiarato per WhatsApp senza allegati (`silvioTools.ts:6676`) → togliere `whatsapp` dai canali.
- E6 un link fa partire da solo una lettura AI di testo (`useBozzaSilvio.ts:533-535`) → fonti `testo` da link `da_confermare`.
- E7/L14 «oggi» UTC nella edge (`silvio-commessa/index.ts:198, 381`) → `oggiInItalia()`.
- E8 crediti finiti su PDF scansionato danno 422 «foto nitida» (`index.ts:167-190`) → rilanciare come 402.
- E9 lettura oltre i 150 s del gateway (`index.ts:168`) → timeout residuo a ogni chiamata.
- S7 indice su `scadenze(order_id)`.
- S9 `silvio_correzioni`: la policy non lega `bozza_id` all'azienda e all'autore.
- S10 `_silvio_colonne_scrivibili()` senza REVOKE.
- S11 dopo «Annulla» restano `automation_trigger_events` non elaborati sulle attività tolte → cancellarli.
- S12 soglia in euro degli ordini solo nel client (va saputo, non è un buco).
- L12 ordini «da sola»: il popup dice «da confermare» ma uno entra (`presentazione.ts:318` vs `scrittura.ts:388`).
- L13 conflitto inventato sulle rate per `null` contro campo assente (`fondi.ts:57`).
- L14 documenti ditta diversi dal DURC controllati su oggi e non sulla fine fase (`risorse.ts:258`); patrono non
  trovato con «Milano MI» senza parentesi (`calendario.ts:202`).

## Cosa Silvio non sa ancora fare sulla commessa (lacune, non difetti)

- Fasi senza inizio lavori: nascono senza date e senza durata (`FaseScritta` non ha `giorni`).
- Letti ma mai scritti: SAL dal contratto, acconto/saldo/finanziamento (`deposit_amount`…), bonus fiscali
  (`order_bonus_lines`), ritenuta di garanzia delle ditte, magazzino, tipo e stato della commessa.
- Gli ordini preparati da Silvio non hanno prezzo, quindi non sono mai «da sola».
- Nessun controllo di quadratura: rate = totale ivato; contratti ditte + ordini sotto l'imponibile.
- Contratto ditta che include materiali già messi in un ordine: costo contato due volte (`risorse.ts:443-452`).
- «Completa» non propone un pezzo mancante di una variabile a più colonne (c'è il telefono → l'email non si propone).
- Piano di volo «da solo» non esegue niente (gira senza utente).
- Fase 6 intera: varianti, ritardi a catena, margine vero contro previsto, chiusura, imparare dalle commesse chiuse.

---

## Correzioni del 1/11/2026 (ramo `claude/scm-correzioni-585af6`, base 4810ab755)

Fatto in locale: nessun push, nessuna migrazione applicata, nessun deploy. I file sotto
`src/components/silvio-commessa/` non sono toccati (li rifà la sessione UX, ramo `claude/scm-ux-chat-67b55b`).

### Voce per voce

**Edge**
- **E1 corretta.** `silvio-commessa`: una sola porta (`porta()`) nei quattro rami — lettura, `chat`, `apri`, `allega` —
  con `requireCompanyAccess` + `has_permission_for_company(uid, 'can_edit_orders', azienda)`: clienti del portale,
  segnalatori e subappaltatori ricevono 403 prima di toccare file o crediti.
- **E2 corretta.** `_shared/creaConSilvio.ts` (`moduloAttivo` senza il «bypass», Demo 2 sempre accesa, come
  `useCreaConSilvioAttivo`): la edge risponde 403 «non è attivo», lo strumento `commessa_da_documento` non manda il
  link. Anche nelle RPC: `_silvio_acceso()` in `commessa_crea_con_silvio` e `commessa_completa_con_silvio`
  (`resolve_company_feature`, Demo 2 sempre). L'annullamento resta possibile anche dopo aver spento l'interruttore.
- **E3 corretta.** `documenti.ts`: il percorso di `order_attachments.file_url` deve stare nella cartella della commessa
  (`orders/<commessa>/` o `<azienda>/<commessa>/`; per le varianti solo `<azienda>/<commessa>/`). In produzione
  3.342 allegati su 3.346 hanno `orders/<commessa>/`, i 4 restanti `<azienda>/<commessa>/`: nessuno resta fuori.
- **E4 corretta.** `silvio-piano-volo`: fasi da oggi−15 a oggi+21 (finite da poco o in partenza), commesse chiuse
  escluse nel database, tetto 1000 (quello vero di PostgREST, con un avviso se si raggiunge), e le commesse in ordine
  dalla meno vista dal piano di volo (`silvio_piano_volo.updated_at`): oltre le 30 non restano fuori sempre le stesse.
- **E5 corretta.** `commessa_da_documento` non è più dichiarato per `whatsapp`.
- **E6 rimandata** (`useBozzaSilvio.ts`, interfaccia).
- **E7 corretta.** `oggiInItalia()` nella lettura e nella chat.
- **E8 corretta.** I crediti finiti durante l'OCR non diventano più «carica una foto nitida»: l'errore si tiene da parte,
  le pagine dopo non si provano, la risposta è 402 col messaggio del router.
- **E9 corretta.** Un `AiTurnControl` per richiesta (140 s): OCR e lettura hanno un tempo che si accorcia a ogni
  chiamata, la lettura del PDF si ferma a 20 s dalla fine; oltre, 504 «dividi il documento».

**SQL dell'annullamento** (`20281106100000`)
- **S1 corretta.** Ogni riga di Silvio ha la sua `istantanea` (colonna nuova di `commessa_bozze_scritture`) presa a fine
  transazione da `_silvio_imprimi`; l'annullamento la confronta colonna per colonna (`updated_at` escluso). Una riga
  senza istantanea → rifiuto. Il messaggio dice cosa è stato toccato (`_silvio_cosa_e_cambiato`): «Il contratto di
  DEMO CFO · Impianti Betulla è stato firmato o avviato. Annulla a mano o tieni la commessa.», «Sono state scritte ore
  per …», «La ditta … è stata segnata pagata». Si guardano prima le righe in fondo, la commessa per ultima.
- **S2 corretta.** `_silvio_chiavi()` legge tutte le chiavi esterne, a una o più colonne (`conkey`/`confkey`), e il
  rifiuto scatta per qualunque riga che punta a una riga di Silvio senza essere sua, anche nelle tabelle senza
  `created_at`. Le figlie senza `id` (il costo di un mezzo, le etichette di un'attività, il margine della commessa)
  stanno nell'istantanea della madre come insieme. Le figlie di una riga nata nella stessa transazione si registrano
  tutte (sono nuove per forza): così le righe nate dai trigger senza `created_at` non bloccano un annullamento pulito.
- **S11 corretta.** All'annullamento si tolgono gli `automation_trigger_events` non elaborati delle righe tolte.

**SQL di autonomia e piano di volo**
- **S3 corretta** (`140000`). Un elenco dei tipi ammessi (`pos`, `duvri`, `avvio_cliente`), non dei vietati.
- **S4 corretta.** `silvio_volo_conferma` ricontrolla `controllo_fase`/`proposta_sal` (e chiude la proposta);
  `silvio_autonomia_salva` mette `scaduta` le proposte aperte della parte appena vietata.
- **S5 corretta.** Niente GRANT di lettura su `silvio_piano_volo`: si legge con `silvio_volo_della_commessa(order)`,
  che senza `can_view_order_amounts` toglie l'importo del SAL; la conferma del SAL chiede lo stesso permesso.
  `src/lib/silvio-commessa/pianoVolo.ts` usa la RPC e scrive «l'importo lo vede chi ha Importi di vendita».
- **S6 corretta.** `silvio_volo_registra` restituisce `{ id, nuova, cambiata }` (nuovo tipo: `drop function if exists`
  prima); la funzione notifica solo se nuova o con azioni/problemi diversi.
- **S7 corretta** (`120000`). `scadenze_order_id_idx` (6.153 righe, nessun indice su `order_id` oggi).
- **S8** (= E4) corretta con E4.
- **S9 corretta.** La policy di scrittura di `silvio_correzioni` (ridefinita in `100000`, dove nasce `commessa_bozze`)
  lega `bozza_id` alla stessa azienda e a chi l'ha creata.
- **S10 corretta.** `REVOKE … FROM public, anon, authenticated` su `_silvio_colonne_scrivibili()`.
- **S12 scartata** come difetto: la revisione dice «va saputo, non è un buco».

**Logica**
- **L1 in parte.** Fatta la parte fuori dall'interfaccia: `scegli_fonte` accetta `etichettaFonte` e, senza id, sceglie
  per etichetta; i testi letti hanno un id stabile (`idDelTesto`). I file e i documenti l'id lo avevano già (il percorso,
  messo dalla edge). **Resta all'interfaccia** (`ColonnaCommessa.tsx:495` e `presentazione.ts:426`): passare anche
  `etichettaFonte: c.fonte.etichetta`.
- **L2 corretta.** `numeroDellaColonna()` in `letturaAI.ts` (con `numeroDa`): «1250.50» = 1.250,50; importo > 0, IVA in
  {0, 4, 5, 10, 22}, latitudine e longitudine nei limiti. La usano la chat e `scrittura.ts`.
- **L3 corretta.** Senza IVA le rate in % si calcolano sull'imponibile ma restano `proposta` con «Manca l'IVA».
- **L4 corretta.** Niente `giorno_inizio` se una fase è senza durata; la sequenza la fa `durateDalModello`, per tutte.
- **L5 corretta.** I valori arrivati mentre una variabile era scritta a mano finiscono in `piano.scartati`; all'annulla
  rientrano nella fusione e il conflitto si riapre.
- **L6 corretta.** Il SAL dalla rata è scorporato dall'IVA della commessa (`iva` in `DatiSal`).
- **L7 corretta.** Una fase aggiunta in mezzo fa slittare le seguenti della sua durata, e fine lavori e consegna con loro.
- **L8 corretta.** «Sposta da» la prima fase sposta anche l'inizio lavori; indietro fin sopra la fase precedente si rifiuta.
- **L9 rimandata** (`useBozzaSilvio.ts`). La sessione UX (`claude/scm-ux-chat-67b55b`) sta scrivendo `conConseguenze`
  nell'hook: inizio lavori nuovo → `sposta_date` delle fasi già datate. Se resta così, L9 è chiusa lì.
- **L10 corretta nei lettori.** `dateDelleFasi` riceve il calendario in preventivo, computo, commessa e modello;
  `daDatabase.ts` legge le impostazioni dell'azienda (`silvio_autonomia_leggi`, una volta per azienda) e il patrono dalla
  città del cantiere: preventivi, computi nativi e commesse datano col calendario vero. **Resta all'interfaccia:** i file
  e i testi letti (`leggiDocumento`, `leggiTesto`) hanno `opz.calendario`, ma finché `useBozzaSilvio.ts` non passa
  `calendario: piano.calendario` usano le sole feste nazionali.
- **L11 corretta.** Impegni dalle sole commesse aperte, i più recenti prima; lo storico a parte; tetto 1000 esplicito.
- **L12 rimandata** (`presentazione.ts`).
- **L13 corretta.** `stessoValore`: un campo null vale come assente.
- **L14 corretta.** Gli altri documenti della ditta devono coprire la fase come il DURC; «20121 Milano MI» è Milano.

**Lacune fatte**
- `giorni` in `FaseScritta`: una fase senza date porta la durata, e la RPC la mette su una sottofase col nome della
  fase (`order_work_phases` non ha una colonna per la durata). Provata: «Collaudo=2».
- Quadratura (`shared/silvio-commessa/quadratura.ts`, chiamata da `fondi`, `applica`, `annulla`): rate ≠ totale ivato
  (oltre 1 €) o contratti + ordini oltre l'imponibile → i valori di Silvio vanno in ⚠ col motivo e non entrano; quelli
  scritti da una persona restano suoi con la nota. Lo stato di prima torna quando il conto torna.
- Contratto della ditta: fuori le voci già in un ordine al fornitore della stessa fase.

### Edge function da ripubblicare
Il job di deploy guarda solo i file cambiati sotto `supabase/functions/`; `shared/` non lo fa scattare.
- `silvio-commessa`, `silvio-piano-volo`: `index.ts` toccato, partono da sole.
- Importano `_shared/silvioTools.ts` (e il nuovo `_shared/creaConSilvio.ts`): `ai-orchestrator`, `silvio-chat`,
  `silvio-execute-action`, `silvio-morning-brief`, `telegram-bot-processor`, `whatsapp-ai-processor`. Se il job
  non le prende da `_shared/`, lanciare il workflow a mano con questo elenco.

### Migrazioni
Modificate, sempre non applicate: `100000`, `120000`, `140000`, `141000`. Nessuna migrazione nuova.

### La prova SQL (1/11, transazioni annullate su Demo Azienda 2, via `execute_sql`)
Lo script è in `docs/silvio-commessa-revisione-20261101-prova.sql`. Le migrazioni si caricano tutte e otto insieme
(la prima esecuzione è arrivata fino a dentro la creazione); per stare sotto la misura che `execute_sql` regge, la prova
è poi girata in due transazioni: annullamento (090000, 100000, 130000, 140000 senza le RPC non usate) e piano di volo
(140000, 141000). Esito:
- crea → 13 righe registrate in 12 tabelle, tutte con l'istantanea; il promemoria «cartello» non entra (S3);
  «Collaudo», senza date, ha la sottofase di 2 giorni;
- contratto firmato → «Non si può annullare: Il contratto di DEMO CFO · Impianti Betulla è stato firmato o avviato.
  Annulla a mano o tieni la commessa.»;
- spesa sul mezzo → rifiuto, «una spesa del mezzo (mezzi piani spese)»;
- ore su `order_employees` → «Sono state scritte ore per Laura Bianchi.»;
- etichetta su un'attività di Silvio (tabella senza `id`) → rifiuto;
- niente toccato → annullato: 13 righe tolte, commessa tolta, nessuna riga rimasta in nessuna tabella figlia di
  `orders`, nessun evento d'automazione aperto. Rifatto crea + annulla una seconda volta: stesso esito.
- piano di volo: registra nuova/uguale/cambiata → `nuova` true/false/false, `cambiata` false/false/true; la lettura dalla
  commessa dà 2 proposte e l'importo al titolare; vietato `controllo_fase` → la proposta di controllo va `scaduta`, quella
  del SAL resta aperta, e la conferma è rifiutata «Nelle impostazioni Silvio non controlla più le fasi».
- «Completa» + allegato, su una commessa esistente (terza transazione): ore sulla persona di Silvio → «Sono state scritte
  ore per Laura Bianchi.»; colonna riempita da Silvio e poi cambiata → rifiuto; un'attività aggiunta dalla persona sulla
  commessa non ferma l'annullamento e resta: 6 righe tolte, commessa identica a prima (colonna per colonna, salvo
  `updated_at` e `version`), file da togliere restituito.
Dopo le prove è cambiato solo il testo di tre messaggi di rifiuto.

**Cosa la prova non ha coperto.** Il taglio dell'importo del SAL (S5) è provato solo dal lato del titolare, che lo vede: chi
non ha «Importi di vendita» non è stato simulato. S9 e S7 sono caricati ma non esercitati. E4, L10 e L11 sono provati su
client finti, non su un giro vero contro il database.

### Test
`src/test/logic/silvioCommessaRevisione.test.ts` (nuovo) e i test della loro fase per E1–E3, E5, E7–E9, S3–S6, L2–L4,
L7, L8: 22 test nuovi o cambiati falliscono sul codice di 4810ab755 e passano ora.

### Controlli finali
`typecheck:ci`: 619 errori, soglia 703, nessun file peggiorato (baseline non aggiornata). Test `silvio*` e collegati: 974 verdi.
Lint sui file toccati: nessun errore (quelli di `supabase/functions` il lint li ignora). `build:fast` riuscita;
`preventivoRenderer.mjs` rigenerato e ripristinato.

### Cosa resta per l'interfaccia
- **L1:** passare `etichettaFonte: c.fonte.etichetta` in `ColonnaCommessa.tsx:495` e `presentazione.ts:426`.
- **L9, E6:** `useBozzaSilvio.ts` (L9 forse già chiusa da `conConseguenze` della sessione UX).
- **L10:** passare `calendario: piano.calendario` a `leggiDocumento`/`leggiTesto`.
- **L12:** `presentazione.ts`.
- `presentazione.ts:40` chiama «fonti in disaccordo» ogni ⚠: per la quadratura il motivo vero sta nella nota.

### Comportamenti da sapere
- Un annullamento può rifiutarsi anche per un cambiamento automatico sulla commessa (un job o un trigger che riscrive una
  sua colonna o il margine): si è scelto «nel dubbio rifiuta».
- `daDatabase.ts` tiene le impostazioni del calendario in memoria per azienda fino al ricaricamento della pagina.
- Le altre lacune della lista sopra (SAL dal contratto, acconto e bonus, fase 6…) restano non fatte.

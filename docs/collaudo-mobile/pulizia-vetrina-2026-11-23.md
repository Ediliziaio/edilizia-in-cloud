# Pulizia della vetrina Demo Azienda 2 — 23/11/2026

Richiesta dal founder («sì ripulisci la vetrina»). Solo `company_id = d2000000-0000-4000-a000-000000000002`.
Tutto reversibile: questa è l'istantanea dei valori di prima.

Criterio commesse: `order_code ~* '^(TEST|SIM|PROVA|COLLAUDO|QA)'` oppure descrizione con
«PROVA AI», «TEST AI», «simulazion», «collaudo», «QA », «SIM » → 24 commesse.

```json
{"orders":["fde9de03-61bf-47db-a024-24cc56f8cc54","49a25a8f-bbc1-46af-8dd1-71f4041810c5","001d50b0-954f-44ee-9b30-932a7da782aa","38aaeb0b-1100-4583-b104-cd2367fc4449","e7682cdd-b8d9-4007-b6ff-baef05a9837d","a1bceb24-232d-4b67-b233-fcd9bd56b427","33f18431-faac-4ac1-9bc3-8a8ad72cc713","77fe229e-291f-4ff2-851c-b5762a0784cb","149caa43-e50b-49de-8ff8-1674c4e157aa","006622c2-00f9-494c-9575-28825605e635","c6e98ffe-6877-46af-b33e-0dd8338ff0dc","18111811-0500-4000-a000-000000000001","18111822-1540-4000-a000-000000000001","fdbc1200-0000-4000-a000-000000000001","2a890484-2215-404e-9d43-c0ed0e56bd1f","ca271026-0001-4000-a000-000000000001","ca271026-0002-4000-a000-000000000002","a17c3cb4-1778-47af-929e-104d38ec5fab","ad64554c-eeed-4ec9-a3f9-7592dda24385","ec5bff4e-c812-4c77-b94a-940eb3a213b1","fe6705c5-7a14-4811-b0be-473e218b67b1","cd7e8951-e867-47fb-b4f1-ba074b0834ac","b1c435df-2b6c-415b-a7fd-640c1c8f9522","d941db87-1522-49f1-9fe1-2f2176a5cb5e"],
"documenti_fiscali":["8988da21-c069-4514-900f-0634b2eeafd5","d162f329-a00f-434e-a987-358aeda73cfd","0a0a9b28-f399-4958-8014-8e0a0fb2026c","b6e9fd8b-7eb1-44a2-bf1a-5c58b64910c5"],
"purchase_orders":[{"id":"eb90627a-7162-4621-9334-d0b1635be752","status":"ricevuto"},{"id":"fceb0001-0000-4000-a000-000000000002","status":"inviato"},{"id":"fceb0001-0000-4000-a000-000000000001","status":"parziale"},{"id":"12dedc63-534e-4280-ad99-aac133269543","status":"bozza"},{"id":"fddd0001-0000-4000-a000-000000000001","status":"ricevuto"},{"id":"501b5ab6-3320-48cc-87e9-f76536fa8e24","status":"bozza"},{"id":"fdbc1201-0000-4000-a000-000000000002","status":"ricevuto"},{"id":"fdbc1201-0000-4000-a000-000000000001","status":"ricevuto"},{"id":"3ed44710-df44-4f55-aef7-5c435486dda8","status":"parziale"},{"id":"6af9b951-a589-409f-9786-e1e831ad735c","status":"bozza"},{"id":"bdcece10-f048-4015-929d-a51a39c643c8","status":"annullato"},{"id":"9ec79fb1-3489-4306-bb72-8b11573a6772","status":"bozza"}],
"tickets":[{"id":"053d750a-0d0f-4588-9945-041e038640bb","status":"aperto"},{"id":"f63a2667-f359-4b43-bc9d-f71f2a5d0e2e","status":"aperto"},{"id":"2fb50c16-4bfa-4607-88e4-5bdc01abc4d9","status":"aperto"}],
"hr_profili_attivo_true":["a3ae41b8-945e-4fbb-b92c-79cf4e458521","cb92fe0a-de7d-40dc-9dde-19059f0c58ae","54d8836a-3716-47a4-b03b-a89601acdbc3","344d804d-ed9b-4d18-b749-88b134e240c1","d9b5d13e-aa9f-4322-a13c-de23c390d9f3","4cb8486b-5c04-457c-bfa8-63624aae2cc2","91b05636-42c0-43cb-832d-2710b11b8fb1","10ff3c11-dadf-4da1-b6bf-e7ca7dd802fd"]}
```

## Clienti (profiles) — seconda passata

- Nel cestino (`deleted_at`, prima `null`), nessuna commessa: `c1a10000-0000-4000-a000-000000000901`
  «Giulia Ferrari (simulazione)», `1528cd41-7870-45f8-9ea0-6ae294eb3325` «Collaudo PDF Silvio 1111»,
  `a79e8f74-8acd-4a05-b64c-ac4a7c4c11f5` «Collaudo Foto Silvio 1111».
- Rinominati (`last_name`), hanno commesse realistiche DEMO2-0020/0021:
  `c68e1998-6719-471b-907f-6762c955c33b` era «SIMULAZIONE - Casa di Riposo Maria SS. delle Grazie»,
  `600e0cb9-e573-46ce-98ca-6360cb2312c9` era «SIMULAZIONE 2 - Casa di Riposo Maria SS. delle Grazie».
- Lasciati di proposito: «Capocantiere DEMO Collaudo» e «Caposquadra DEMO Collaudo» (account usati per
  gli accessi di prova).

Eseguito con `session_replication_role = replica` (nessun avviso, automazione o sincronizzazione),
`lock_timeout 3s`. Per tornare indietro: rimettere i valori qui sopra con lo stesso accorgimento.

## Terza passata (filtro largo)

- Commesse nel cestino (`deleted_at`, prima `null`): `8ee455c4-ef6c-4a78-9b73-85884db190ce` DEMO2-0027
  «… QA Listini Serramenti», `6113cd76-1533-4799-b0a1-22c061a8a410` DEMO2-0010 «PROVA indirizzo generale»,
  `156beecc-45ba-4e40-bfc1-c16619515d1b` DEMO2-0011 «PROVA FASE 6 …», `fc96d517-5a1a-41f2-bb82-596e8a2a9532`
  DEMO2-0024 «PROVA COMPLETA 17/11 …».
- Ordini d'acquisto annullati (prima tutti `bozza`): `980e8fe1-68e7-4f6b-9ffd-0a9053d0734b` ODA-2026-0055,
  `3831af48-9217-4ff7-aa79-592bcc81379d` ODA-2026-0062, `4259a5ea-c547-44a9-b049-70e13b43ad0f` ODA-2026-0063.
- Descrizioni rinominate (prima): DEMO2-0013 «PROVA LOTTO 3 — Comune PA, contratto + ordine d'acquisto»,
  DEMO2-0014 «PROVA LOTTO 3 — privato con finanziamento pubblico (solo CUP)», DEMO2-0015 «PROVA LOTTO 3 —
  Comune PA, CIG non dovuto».
- Cliente `d2000000-0000-4000-a000-0000000a3001` (prima first_name «Comune di Prova», last_name
  «(PA DEMO lotto 3)», business_name «Comune di Prova (PA DEMO lotto 3)») → «Comune di Valle Verde».

## Quarta passata

- Preventivi nel cestino (`deleted_at`, prima `null`; il cestino dei preventivi si svuota da solo dopo
  30 giorni): `9c2430af-0027-acb5-b4ac-7da321683df2` PREV-2026-0001, `59f138b0-79d8-4ba8-b966-ae3bf06c7180`
  OFF-2026-013, `8ad7cd81-42cf-4f33-8840-a327799a7011` OFF-2026-012, `4c573b24-22db-495a-a045-fc56abc17e42`
  PRV-PROVA-F6-2, `b2084566-e5eb-4054-9cc6-94ef54aef576` PRV-PROVA-F6-3, `25625bdc-583f-40aa-9092-02cb4c9adaf5`
  PRV-PROVA-F6-1, `6f9e5fdd-0a91-4b44-bbaf-10df2778f577` OFF-2026-011.
- Appuntamento `ed9c364a-ac89-4cc6-8b7e-a15dca857905` (creato da questo collaudo): titolo era
  «COLLAUDO · Sopralluogo bagno Simone Farina».
- `documenti_fiscali.cliente_snapshot`: il testo «Comune di Prova (PA DEMO lotto 3)» e «Comune di Prova»
  sostituito con «Comune di Valle Verde» nei documenti di Demo 2 che lo contenevano.
- Lasciati: appuntamenti «DEMO · Collaudo e consegna · …» (è il nome di una fase vera di cantiere).

## Numeri fattura doppi (FT/2026/301)

Causa: `demo_scenario_applica` calcola `max(progressive_number)+1` su TUTTE le fatture dell'anno
(una serie di prova è a 30.144) e poi `lpad(v_prog::text,3,'0')`, che TAGLIA a 3 caratteri: 30144 → «301».
Dati corretti: le 9 fatture `invoice_number = 'FT/2026/301'` (external_id DEMO2-ORD-2026-0xx-…) rinumerate
per data come FT/2026/092 … FT/2026/100 (ultimo regolare era 091). Valore precedente: «FT/2026/301» per tutte.
**Funzione corretta (ok del founder, 23/11/2026):** migrazione `20290510100000_demo_scenario_numero_fattura`
applicata con `apply_migration` e riallineata nel registro (20290507120000 era già preso da un altro ramo).
Il progressivo si calcola solo sulla serie «FT/<anno>/<n>» e non si tronca più. Prova a vuoto (transazione
annullata, eventi dei prossimi 40 giorni): 8 fatture FT/2026/101–108, tutte diverse.

## Dati personali veri nella vetrina (riservatezza)

- La pagina Contatti mostrava anche i contatti **nel cestino** (297 = 176 vivi + 121 cestinati): corretto
  nel codice (`MarketingContacts.tsx`, lettura e contatore con `deleted_at is null`).
- Tra i 121 cestinati, **19 erano copie di contatti di due aziende clienti reali** (email gmail/libero/
  proton…, nomi, in qualche caso telefono e indirizzo). Resi anonimi: email `contatto-<8 caratteri>@esempio.it`,
  cognome all'iniziale, telefono/indirizzo/CF/P.IVA/ragione sociale svuotati, email e cellulari tolti dalle
  note («[email rimossa]», «[telefono rimosso]»). **Valori di prima NON conservati di proposito** (sono
  dati di terzi; gli originali restano nelle loro aziende).
- Preventivo con email del cliente sul dominio dell'azienda del founder → `cliente.preventivo@esempio.it`.
- Squadra esterna con email su dominio reale → `squadra-<6>@esempio.it`.
- PEC «pec.comunediprova.example» (dominio riservato agli esempi) → «comunevalleverde» per coerenza.
- Controllo finale su 25 tabelle visibili (contatti, clienti, fornitori, posta, fatture, preventivi,
  appuntamenti, assistenze, personale, banca, WhatsApp, opportunità, ordini…): nessun indirizzo email fuori
  dai domini finti. Il controllo su tutte le 628 tabelle supera il tempo massimo della connessione.

## Chat del team (vetrina)

- 96 canali `internal_chat_channels` di Demo 2 chiamati «DEMO · <codice commessa>» → «cantiere-<codice in
  minuscolo>», il formato dei canali veri (l'app li mostra «Cantiere <CODICE>», `lib/chat/nomeCanale.ts`).
  Per tornare indietro: `name = 'DEMO · ' || upper(substring(name from '^cantiere-(.+)$'))` sugli stessi canali
  (quelli con `order_id` di Demo 2 rinominati il 23/11).
- 353 messaggi `internal_chat_messages`: tolto il prefisso «[MESSAGGIO FITTIZIO DEMO] » dal testo.
- 82 messaggi «Controllo finale eseguito nella simulazione. Collaudo e documenti disponibili in commessa;
  nessuna firma o certificazione reale.» → «Controllo finale fatto. Collaudo e documenti sono in commessa,
  manca solo la firma del cliente.»

## Articoli di prova in magazzino (23/11, sera)

Due articoli rimasti da collaudi del 4–5/11 comparivano in testa all'elenco del magazzino.
Cambiati solo nome e codice; giacenze, costi e movimenti intatti.

| id | prima | dopo |
|---|---|---|
| d4e703c5-331f-4d07-9720-0d6f2e5af9e9 | «Articolo di prova magazzino», codice PROVA-UI-ART | «Silicone neutro trasparente 310 ml», codice SIL-310 |
| 116b7cc3-9b26-4d28-bedf-810bbfe9da86 | «GUIDADEMO Materiale prova manuale», senza codice | «Guanti da lavoro in nitrile (paio)» |

## Prefisso «DEMO · » sui nomi degli articoli (23/11, sera)

96 articoli di magazzino si chiamavano «DEMO · <nome>»: tolto il prefisso dal nome. Le descrizioni
restano come sono, perché `scripts/demo-company-history-deep-verify.mjs` trova gli articoli col
marcatore in descrizione. Gli script di costruzione usano id fissi, non il nome.
Sono esattamente gli articoli Demo 2 con descrizione che comincia per «[DEMO» (96 su 121). Per tornare indietro:

```sql
update warehouse_stock set name = 'DEMO · ' || name
 where company_id = 'd2000000-0000-4000-a000-000000000002'
   and description like '[DEMO%' and name not like 'DEMO · %';
```

## Altri nomi di prova in magazzino (23/11, sera)

| id | prima | dopo |
|---|---|---|
| 08063e1b-c1f7-4841-ab1a-9f1dfe705eec | DEMO CFO · Premiscelato cementizio sacco 25 kg | Premiscelato cementizio sacco 25 kg |
| 02a3d13d-6102-c620-ed21-fa1cd2754d7e | TEST E2E - Vite M8 zincate | Viti M8 zincate |
| e76b55a1-9829-4986-b1a8-659fb315a7dd | GUIDADEMO Modello da pallet virtuale | Caldaia a condensazione 24 kW |

`scripts/demo-cfo.mjs` inserisce l'articolo con id fisso: rilanciarlo riscriverebbe il nome vecchio.

## Nome vero del founder in 4 preventivi (23/11, sera)

OFF-2026-007, -008, -009, -010 avevano «Florin Andriciuc» come cliente (OFF-2026-010 anche nel titolo e
in `signed_by_name`; -008 e -009 nel titolo). Sostituito con il nome inventato «Lorenzo Bassi».
Nessuna email o telefono suo nelle righe. Controllati anche contatti, commesse, opportunità e
appuntamenti di Demo 2: nessuna occorrenza.

Non toccati di proposito: i nomi «DEMO …» di fornitori (15) e fatture ricevute (259). `fatture_ricevute` ha
oltre 30 trigger (guardia fiscale, impronta del documento, collegamento al fornitore) e `suppliers` ricollega le
fatture per fornitore: troppo rischio per un ritocco di vetrina. I ~100 preventivi «Famiglia/Studio/Condominio
DEMO <anno> <n>» vengono dallo storico generato: rinominarli è un lavoro a parte.

## Prefissi «DEMO · » e «DEMO CFO · <chiave> · » sui mezzi (23/11, sera)

26 mezzi e attrezzature di Demo 2: tolto il prefisso dal nome. I tre doppioni dello script CFO hanno preso
un numero (chiave → numero: int → 1, mix → 2, sub → 3):
«DEMO CFO · int|mix|sub · Furgone cantiere» → «Furgone cantiere 1|2|3»,
«DEMO CFO · int|mix|sub · Miscelatore e aspiratore» → «Miscelatore e aspiratore 1|2|3».
Gli altri 20 sono «DEMO · <nome>» → «<nome>». Gli script inseriscono i mezzi con id fisso: rilanciarli
riscriverebbe i nomi vecchi. Id e nomi prima/dopo nel risultato della query del 23/11 (26 righe);
per tornare indietro sui 20 semplici: `update mezzi set nome = 'DEMO · ' || nome where id in (…)`.

## 720 fatture importate doppie nella Demo 2 (23/11, sera — ok del founder: «sì unisci e cancella le copie doppie nella demo»)

Ogni documento c'era due volte nell'elenco documenti: come documento nativo (`documenti_fiscali`) e come fattura
importata (`invoices`) con lo stesso id. Viene dagli script demo che rispecchiano le fatture. Solo Demo 2.

- Codici salvati prima di toccare: `docs/collaudo-mobile/ripristino/demo2-fatture-importate-doppie-ids.txt`
  (720 id, impronta md5 della lista ordinata unita da virgole `5ac08dcfceafc9125b154d978252f6e8`, uguale a quella del database).
- Cancellazione morbida, non fisica: `invoices.deleted_at = '2026-11-23 19:30:00+01'` (data fissa, per ritrovarle),
  con `lock_timeout 3s` e `statement_timeout 60s`. Aggiornate 720 righe, stessa impronta.
- Trigger scattati: solo revisione finanza e registro azioni (nessun ricalcolo di importi, rate o scadenze: non cambiano
  stato, totale, date né commessa).
- Dopo: elenco documenti Demo 2 con 783 righe e 783 documenti distinti, nessun doppione; a schermo 25 righe per pagina
  senza ripetizioni. Restano 9 fatture solo importate. Le 720 finiscono nel cestino dei documenti.

Per tornare indietro:

```sql
update invoices set deleted_at = null
 where company_id = 'd2000000-0000-4000-a000-000000000002'
   and deleted_at = timestamptz '2026-11-23 19:30:00+01';
```

## Nome vero del founder come cliente in 4 interventi di assistenza (23/11, notte — ok del founder)

I ticket avevano come cliente il profilo `e592255e-0c82-86cd-7f7b-d3046317f9cd` («Florin Andriciuc»), che è
l'**account di accesso amministratore** della Demo 2 (demo2@azienda.srl), non un cliente: rinominare il profilo
avrebbe cambiato il nome di chi entra. Invece il cliente dei 4 ticket è passato al cliente della loro commessa
(Anna Verdi, Costruzioni Rossi Srl, Mario Bianchi ×2), che è anche il dato coerente. Profilo non toccato.

Per tornare indietro:
```sql
update tickets set customer_id = 'e592255e-0c82-86cd-7f7b-d3046317f9cd'
 where id in ('c3de39d5-bce7-1051-970a-7d7be1c8d55a','2cb1b101-3e64-b5c7-68a1-f72ee0aa5b20',
              '50ea07ac-f2fd-b0c7-2532-cefad6db7eec','2c5ab3ce-f00b-fcc2-f3ec-b911cb8f79f8');
```

Stessa sera: 23 ticket di Demo 2 erano **assegnati** allo stesso account amministratore (colonna «Assegnato a»
= «Florin Andriciuc»). Riassegnati a turno ai tecnici finti Marco Ricci (`ef724933-…`) e Marco Verdi
(`1dbe6ceb-…`), con `SET LOCAL session_replication_role = replica` per non far scattare automazioni
(spostamento commessa in assistenza, notifiche, automazioni ticket). Per tornare indietro:
```sql
begin; SET LOCAL session_replication_role = replica;
update tickets set assigned_to = 'e592255e-0c82-86cd-7f7b-d3046317f9cd' where id in (
'03a37bc8-61c3-4036-a999-50fb8165fc6d','08b19e15-40bb-4d34-aa46-4c0bbdc5e454','2cb1b101-3e64-b5c7-68a1-f72ee0aa5b20',
'2ceb45b4-8f31-433e-acc4-8226b964fd11','30af9bde-d66f-433d-a28d-4e3c84ad7915','50ea07ac-f2fd-b0c7-2532-cefad6db7eec',
'51831027-210c-4ef1-a316-b89688de8263','531ba6dd-b96c-4ba3-a3cc-3bf8a6510ad4','6d8de921-2139-48c6-a7fa-bf22cf9910a7',
'807eb443-a5e4-4957-a078-666592b33cf7','94f9bf66-ad87-4eac-ad3d-e9c6dd5969ee','99551906-357a-4a95-a609-8635ba4ee67b',
'ad07c9e9-4142-4b96-ad6d-e0705ac57749','b19d2678-8378-4dad-a1e8-6e6abbd65724','b70091c3-337f-412c-a965-285739cc0f23',
'c3deefb9-0eab-4746-a621-879d242af455','cdc5517a-5c97-43fe-a1c9-af7c5281ed18','d05fc07c-e2e9-4163-a5dd-b0ce72ef19ba',
'd8613faf-c3cf-4120-a72d-29235e95a6b9','db520adb-0590-47b9-a042-eecc3ea51702','dcfd0909-dc16-4e43-af69-00725e1be2c3',
'e458923e-4214-4094-a3e6-3eb45514929e','ed9ad34e-282c-4263-a16b-b4e6f4c0669e'); commit;
```

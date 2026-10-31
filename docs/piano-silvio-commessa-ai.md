# Silvio crea la commessa — piano di sviluppo

Redatto il 30/10/2026. Richiesta di Florin: «quando creo la commessa voglio usare Silvio:
si apre un popup e mi crea tutta la commessa con lui, considerando ogni variabile
presente nella commessa; cosa può impostare Silvio da solo, a monte, senza l'essere
umano, per avere un'azienda che va in automatico».

Questo piano copre **la nascita** della commessa e il **pilota automatico** che la segue.
Si appoggia a `docs/silvio-commessa-piano.md` (su main, 31/10), che copre Silvio **dentro**
una commessa che esiste già:
- `quadro_commessa`, il quadro della commessa in una chiamata;
- gli strumenti gialli `pianifica_fasi`, `proponi_ditte_e_costi`, `prepara_contratto_ditta`,
  `assegna_persone_fase`, `prenota_mezzo`;
- gli avvisi.

Qui quegli strumenti diventano i mattoni del popup di creazione; non si riscrivono.

---

## 1. Cosa dicono i dati prima di progettare

- **Le commesse non nascono dal preventivo** (conteggio del 31/10/2026, aziende reali,
  escluse le demo): delle 60 commesse create negli ultimi 120 giorni, **58 non hanno un
  preventivo collegato**; nello stesso periodo i preventivi firmati nel gestionale sono 1.
  Il preventivo si fa altrove, la commessa si apre a mano o si importa. Partire «solo dal
  preventivo firmato» servirebbe al 3 % dei casi: la **prima versione deve già leggere un
  documento qualsiasi** (contratto, capitolato, PDF, foto, testo).
- **Le commesse che ci sono sono quasi vuote**: delle 465 commesse aperte, 12 hanno le
  fasi (7 con le date), 16 le rate, 17 la data d'inizio, 12 le persone assegnate, 5 le
  righe. Il valore più grande e più vicino non è solo creare bene le commesse nuove, è
  **completare quelle che esistono**: stesso motore, stesso popup.
- **240 proposte automatiche di Silvio in 30 giorni, 0 accettate**: 174 scadute senza
  essere viste. Le proposte che arrivano in un elenco a parte, lontane dal momento in cui
  si lavora, muoiono. Il popup di creazione è il momento migliore che esista: il titolare
  è lì, sta guardando quella commessa, e ha appena deciso di farla partire.
  **Regola: tutto quello che va confermato, si conferma nel popup; non dopo.**
- **Una risposta della chat costa circa 7 centesimi e arriva in 14 secondi.** Il popup non
  può essere una conversazione lunga: deve partire già col lavoro fatto. Quello che si può
  compilare con regole (preventivo, computo, modelli per tipo di lavoro) si compila senza
  AI; l'AI legge i documenti in **una** chiamata, non in una conversazione.
- **Il contesto della pagina era rotto da sempre** (corretto il 31/10): ogni lettura nuova
  va provata contro le colonne vere, perché una query che fallisce in silenzio è una
  funzione morta.

---

## 2. Tutte le variabili della commessa, e chi le decide

La commessa ha più di 90 campi propri (`orders`) e 170 tabelle collegate. Raggruppate per
quello che significano in cantiere, sono 14 aree. Per ogni variabile il piano fissa
**da dove viene** e **il livello di autonomia**:

- 🟢 **Da solo.** Silvio la imposta senza chiedere: è interna, ha una regola certa e si
  annulla in un clic.
- 🟡 **Propone.** Silvio prepara, e il titolare conferma nel popup: impegna persone,
  mezzi o soldi.
- 🔴 **Mai da solo.** Esce verso terzi, oppure ha valore legale o fiscale. Silvio prepara la
  bozza, e solo l'umano la invia, la firma o la emette.
- ❓ **Solo se manca.** L'unica cosa che Silvio chiede, se non la trova da nessuna parte.

| # | Area | Variabili (tabelle) | Da dove le prende Silvio | Livello |
|---|---|---|---|---|
| 1 | **Identità** | `order_code`, `order_type`, `workflow_kind`, `tipo_lavoro`, `description`, `work_description`, `sede_id`, stato iniziale | prossimo numero, tipo dal modulo del preventivo, sede più vicina al cantiere | 🟢 |
| 2 | **Cliente** | `customer_id`, `client_*`, dati fiscali, `opportunity_id` | preventivo firmato → contatto CRM → profilo cliente (lo crea se manca) | 🟢 se c'è il preventivo, altrimenti ❓ |
| 3 | **Cantiere** | `indirizzo_lavori`, `work_address`, `work_lat/lng`, `distanza_sede_*`, `materials_location`, orari, geofence | indirizzo del cantiere del cliente → geocodifica → distanza dalla sede | 🟢; ❓ solo se manca l'indirizzo |
| 4 | **Economia** | `total_amount`, `vat_rate`, `has_building_bonus`, `valorizzazione`, `tetto_importo`, `order_items`, `order_bonus_lines`, `blocca_prezzo` | preventivo firmato, che è il contratto: si copia, non si stima | 🟢 copia; 🔴 cambiarlo |
| 5 | **Pagamenti** | `payment_type`, acconti, saldo, finanziamento, `order_installments` con `trigger_evento` | condizioni di pagamento del preventivo → rate agganciate agli eventi del cantiere | 🟢 |
| 6 | **Fasi e tempi** | `order_work_phases`, `order_work_subphases`, `order_work_phase_voci`, `work_start/end_date`, `expected_date` | cronoprogramma del preventivo o del computo (`commessa_pianifica_fasi`), modelli di fasi dell'azienda, commesse simili chiuse; con l'AI solo da testo libero | 🟢 la struttura; 🟡 le date se toccano il cliente |
| 7 | **Persone** | `assigned_to`, `capomastro_user_id`, `order_employees`, `order_phase_assignments`, `squadre_commesse`, `order_salespeople` | venditore dal preventivo; capomastro e squadra da competenze, calendario e assenze (`ai-allocazione-operai`) | 🟢 venditore e responsabile; 🟡 squadra |
| 8 | **Ditte e subappalti** | `order_external_teams`, `subappaltatori_assegnazioni`, `contratti_subappalto`, `ritenute_garanzia` (passive) | ditta abituale per quella lavorazione (`dittaProposta`), tariffa e listino (`costoFaseDitta`) | 🟡 la scelta; 🔴 la firma del contratto |
| 9 | **Costi previsti e margine** | costo per fase, `company_costs` previsti, `ordine_margine_stato` | listino, costo orario CCNL dei dipendenti, tariffe delle ditte, noli: **calcolo deterministico** | 🟢 calcolo; avviso sotto soglia |
| 10 | **Mezzi e attrezzature** | `mezzi_allocazioni`, `mezzi_piani_cantiere`, `cantiere_allocations` | mezzi tipici della lavorazione, liberi nelle date delle fasi | 🟡 interni; 🔴 noleggio esterno |
| 11 | **Materiali e acquisti** | `material_predictions`, `proposed_purchase_orders`, `supplier_rfqs`, `site_deliveries`, magazzino | voci del computo → articoli → fornitore abituale, data di consegna = inizio fase − anticipo | 🟢 il fabbisogno; 🟡 l'ODA proposto; 🔴 l'invio al fornitore |
| 12 | **Sicurezza e documenti** | `adempimenti_sicurezza`, `pos_documents`, `duvri_documents`, `sicurezza_fascicolo`, `pratiche_edilizie`, `order_document_folders`, checklist documenti delle ditte | tipo di lavoro → elenco degli adempimenti; POS e DUVRI in bozza (strumenti esistenti) | 🟢 elenco e cartelle; 🔴 POS e DUVRI firmati |
| 13 | **SAL, scadenze, fatture** | `sal` (piano), `ritenute_garanzia` (attive), `scadenze` previsionali, avvisi | rate, avanzamento, ritenuta % dal contratto | 🟢 le scadenze previsionali; 🔴 l'emissione e lo SDI |
| 14 | **Comunicazione e automatismi** | `weekly_report_enabled`, `giornale_auto_enabled`, `dl_notification_*`, `internal_chat_channels`, `google_calendar_order_events`, `next_action`, `operational_checklist`, `tasks` | preferenze dell'azienda; canale interno di cantiere; task d'ufficio dal flusso di lavoro | 🟢 interno; 🔴 messaggio al cliente |

**Cosa chiede Silvio, al massimo**: cliente, indirizzo del cantiere, importo e data
d'inizio. Lo chiede **solo** se non c'è un preventivo firmato da cui prenderli. Ogni
altra cosa ha un valore predefinito, segnato come «da Silvio» e modificabile.

---

## 3. L'esperienza: carichi qualsiasi cosa, la commessa si compone davanti a te

Aggiornato il 31/10/2026, su richiesta di Florin: «sia da preventivo che da contratto
generato con AI oppure computo ecc.: uno può caricare quasi qualsiasi cosa e il sistema
inizia a creare le voci. Deve essere tutto fluido, la user experience al massimo».

### 3.1 Da dove si entra

- «Nuova commessa» → **Crea con Silvio** (il modulo classico resta, un clic più in là);
- un preventivo o un computo firmato → **Trasforma in commessa con Silvio**;
- un contratto in `contratti_documents` → **Crea la commessa da questo contratto**;
- la chat o WhatsApp: «crea la commessa del bagno Rossi», con o senza allegati;
- una email con allegati (capitolato, contratto del committente) → **Fanne una commessa**;
- una commessa che esiste già e ha dei buchi → **Completa con Silvio** (fase 2): lo stesso
  popup, che parte da quello che c'è e aggiunge solo quello che manca.

Da ognuno il popup si apre **già al lavoro** con la fonte caricata: non c'è un passo
«scegli da cosa parti» da superare.

### 3.2 Lo schermo

```
┌─ Nuova commessa con Silvio ───────────────────────────── bozza salvata ✓ ─┐
│ FONTI                │ CHAT                  │ LA COMMESSA               │
│ ▸ PR-0142 firmato  ✓ │ Silvio: dal preventivo │ ✓ Cliente  Rossi Mario    │
│ ▸ Contratto.pdf    ⟳ │ ho già cliente, importi│ ✓ Importo  48.500 € ⓘ    │
│   sto leggendo p.4/9 │ e 6 fasi. Sto leggendo │   ⓘ preventivo + contratto│
│ ▸ Piantina.jpg     ✓ │ il contratto: penali e │ ⟳ Pagamenti (dal contratto)│
│ [+ trascina qui]     │ ritenute arrivano ora. │ ✓ Fasi 6 · 09/11 → 19/12  │
│ [🎙 parla]           │ [Inizio lun 9?] [Altro]│ ⚠ Importo: preventivo     │
│                      │ > scrivi o detta…      │   47.900, contratto 48.500 │
├──────────────────────┴───────────────────────┴───────────────────────────┤
│ 38 voci pronte · 3 aspettano te · costo AI 0,04 €   [Controlla] [Crea ▸] │
└───────────────────────────────────────────────────────────────────────────┘
```

Tre colonne su schermo largo; sul telefono tre schede (Fonti · Chat · Commessa) con la
barra in basso sempre visibile.

### 3.3 Cosa si può caricare, e chi lo legge

Nessun lettore nuovo dove ce n'è già uno. Un **riconoscitore** guarda il file (tipo,
prime pagine, nomi) e lo manda al lettore giusto:

| Fonte | Lettore (esiste già, salvo dove scritto) | Cosa dà alla commessa | AI? |
|---|---|---|---|
| Preventivo firmato (classico e 8 moduli edili) | `quotes`, `quote_items`, `payment_phases`, `cronoprogramma`, `useQuotePrefill` | cliente, cantiere, righe, IVA, rate, fasi e durate | no |
| Computo (bozza nativa) | `commessaDaComputo`, cronoprogramma del computo | voci per capitolo, fasi = capitoli, sottofasi, costi dal listino | no |
| Computo da file: XPWE, PDF di PriMus | `leggiFileComputo`, `computo-ai-extract` (lettori deterministici) | come sopra | no |
| Computo da altri PDF, Excel, foto | `computo-ai-extract` (ripiego AI) | come sopra, con le stime marcate | sì |
| Contratto in app (`contratti_documents`) | il Markdown della tabella | importo, durata, penali, ritenute, SAL, garanzie | sì (poco) |
| Contratto o capitolato del committente (PDF) | **nuovo**: il lettore unico `silvio-commessa` (lotto 1.2), sui testi di `pdfExtraction` | importo, termini, penali, ritenute di garanzia, anticipo, SAL, subappalto ammesso, CIG/CUP | sì |
| Offerta di una ditta o di un fornitore | `rdo-ai-estrai-offerta` | costo previsto della fase, ditta proposta | sì |
| Sopralluogo | `sr-import-da-sopralluogo` | misure, foto, note, indirizzo | no |
| Piantina, foto del cantiere | `parse-matrix-image` / visione | metri quadri, locali, note per le fasi | sì |
| Vocale | `trascrizione-audio`, poi come testo libero | tutto quello che si dice | sì |
| Testo libero («rifare bagno 6 mq a Monza, 12k») | **nuovo**: il lettore unico `silvio-commessa`, più i modelli per tipo di lavoro (1.3) | fasi e durate stimate, importo, cantiere | sì |
| Email con allegati | `email-ai-estrai-allegato`, poi ogni allegato come sopra | come sopra | dipende |

**Più fonti insieme** sono la regola, non l'eccezione: preventivo + contratto + offerta
della ditta. Ogni lettore produce **frammenti** dello stesso piano (vedi 5.1) e la bozza
li fonde. Quando due fonti dicono cose diverse, Silvio non sceglie da solo: mostra ⚠ con
le due cifre e la fonte di ognuna, e un pulsante per tenere l'una o l'altra. Ordine di
fiducia predefinito: contratto firmato > preventivo firmato > computo > offerta > testo
libero > stima di Silvio.

### 3.4 Le regole della fluidità

1. **Mai uno schermo d'attesa.** Le regole riempiono in meno di un secondo quello che
   sanno; i file si leggono in parallelo, e ogni area si riempie appena il suo pezzo è
   pronto, con un breve evidenziato. L'utente può già correggere mentre il resto arriva.
2. **Ogni valore dice da dove viene.** La ⓘ apre «preventivo PR-0142, riga 3» o
   «contratto, pagina 4: “penale di 100 € per giorno di ritardo”». Toccandola si vede il
   punto del documento. È ciò che fa fidare.
3. **Si corregge in tre modi, tutti equivalenti:** toccando il valore, scrivendo in chat
   («sposta tutto di una settimana»), parlando. La chat non è obbligatoria.
4. **Le domande sono pulsanti** ([Inizio lun 9?] [Sì] [Scegli data]), al massimo una alla
   volta, e solo per i ❓ veri.
5. **Ogni modifica si annulla** (Cmd+Z e «annulla» in chat), e quelle fatte dalla chat
   restano evidenziate finché non le guardi.
6. **La bozza si salva da sola.** Chiudi, perdi la rete, passi dal telefono al computer:
   la ritrovi com'era («Riprendi la commessa Rossi»). Scade dopo 30 giorni.
7. **Il costo si vede prima.** Le fonti a regole costano zero; prima di una lettura AI
   compare la stima («0,03 €»), e il saldo dei crediti si controlla.
8. **Crea è un clic solo.** «Controlla» apre l'elenco di cosa nascerà, raggruppato per
   area; «Crea» lo fa in una transazione. Dopo, «Annulla tutto quello che ha fatto Silvio»
   finché nessuno ci ha lavorato sopra.
9. **Niente lavoro perso a metà:** se una lettura fallisce, la fonte resta con «Riprova» e
   il resto della commessa va avanti; un errore del provider passa da `segnalaErroreAI`.

### 3.5 Dopo «Crea»

- tutto il 🟢 è nella commessa (una transazione, tutto o niente);
- i 🟡 accettati nel popup entrano insieme; quelli rimandati restano attaccati alla
  commessa, nel suo menu Silvio;
- i 🔴 sono bozze pronte con il loro pulsante d'invio;
- **le fonti restano allegate alla commessa** (Documenti), così chiunque ritrova da dove
  vengono i numeri;
- la commessa si apre con la striscia «Silvio ha preparato 41 cose, ne aspettano 3».

---

## 4. «Azienda che va in automatico»: l'autonomia si regola

Il livello di ogni azione non è fisso nel codice: lo decide il titolare, entro dei limiti.

**Impostazioni → Automazioni AI → Cosa fa Silvio da solo.** Ogni azione ha tre scelte:
«Fai da solo», «Chiedimi», «Mai».
- **Promuovibili a «da solo»**:
  - prenotare i mezzi interni;
  - assegnare la squadra abituale;
  - proporre e poi confermare gli ODA sotto una soglia in € (es. 500 €);
  - spostare le fasi dipendenti quando una slitta;
  - mandare l'avvio lavori al cliente se nessuno lo ferma entro N ore.
- **Mai promuovibili**:
  - firma dei contratti;
  - emissione fatture e SDI;
  - pagamenti;
  - modifica dell'importo contrattuale;
  - cancellazioni;
  - invio di dati a fornitori nuovi.

**Il pilota automatico dopo la nascita.** La commessa nasce con il suo «piano di volo»: le
cose che Silvio farà da solo nelle settimane seguenti, scritte e visibili. Esempi:
- 3 giorni prima di ogni fase controlla persone, mezzi, materiali e DURC delle ditte;
- a fine fase propone il SAL;
- il venerdì prepara il resoconto settimanale per il cliente.

Gira con i cron che esistono (`silvio-trigger-tick`, il brief), e rispetta i livelli
scelti dal titolare.

**Misura.** Una scheda «Quanto lavora Silvio» mostra:
- le variabili compilate da Silvio sul totale;
- le proposte accettate, rifiutate e scadute;
- le correzioni fatte dagli umani dopo, cioè dove Silvio sbaglia;
- le ore d'ufficio risparmiate, stimate.

Senza questa scheda non sappiamo se l'automatico funziona.

---

## 5. Come è fatto sotto

**Un registro delle variabili, scritto una volta.** In `shared/silvio-commessa/registro.ts` ogni
variabile della sezione 2 ha:
- l'area;
- la colonna o la tabella;
- la fonte;
- la regola di compilazione;
- il livello predefinito;
- il controllo «è compilata bene?».

Lo stesso registro alimenta:
- il popup, con le 14 aree e i loro stati;
- `quadro_commessa`, con l'elenco «da_sistemare» che viene da qui;
- gli avvisi del pilota automatico;
- la scheda di misura;
- i test, che controllano che ogni colonna nuova di `orders` sia nel registro (altrimenti
  il test fallisce).

È il pezzo che rende «considera ogni variabile» vero nel tempo: una colonna nuova non
può restare invisibile a Silvio.

**Tre strati, l'AI solo nel mezzo.**
1. **Regole** (`shared/commessaDaPreventivo.ts`): dal preventivo firmato compila senza AI
   identità, cliente, cantiere, economia, pagamenti, fasi e date, costi e scadenze.
   Riusa quello che già esiste:
   - `create_order_atomic`;
   - `commessaDaComputo`;
   - `commessa_pianifica_fasi`;
   - le rate agganciate agli eventi;
   - le funzioni di `economiaFasi` e `ditteLavori`.
2. **AI** (`silvio-commessa`, edge function): solo per i buchi, cioè fasi e durate da una
   descrizione libera, la lettura di PDF e piantine, la squadra quando i dati non bastano.
   Restituisce JSON a schema validato e non scrive nulla.
3. **Applicazione** (RPC `commessa_crea_con_silvio(piano jsonb)`): una transazione,
   permessi `can_edit_orders`, `SECURITY DEFINER` chiusa ad anon. Salva in un registro che
   cosa ha creato, per l'annullamento.

**Le proposte 🟡** usano `ai_action_proposals` col suo `batch_id` (uno per commessa),
`user_edited_payload` e l'annullamento che ci sono già, e lo stesso motore delle conferme
della chat (`executeToolWithRouting`). Una sola infrastruttura per chat e popup.

**Autonomia**: una tabella `silvio_autonomia (company_id, azione, livello, soglia_eur)`
più un elenco nel codice delle azioni mai promuovibili, controllato anche dentro le RPC.
Non basta nasconderle nell'interfaccia.

**Il piano di volo**: righe in `tasks`, di categoria Silvio e con `order_id`, e in
`scadenze` previsionali. Niente tabelle nuove: si vedono già nelle pagine di oggi.

### 5.1 Un piano solo, tanti frammenti

Il cuore è un tipo condiviso, `shared/silvio-commessa/piano.ts` (TypeScript senza
dipendenze, usato da browser, edge function e test; fusione in `fondi.ts`):

- `PianoCommessa`: le 14 aree del registro, ogni valore con `{ valore, fonte, fiducia,
  stato: fatto | proposta | manca | attenzione }`;
- `Frammento`: quello che un lettore restituisce (`{ fonte, aree parziali }`);
- `fondi(piano, frammento)`: funzione pura che unisce, rispetta l'ordine di fiducia e
  produce i conflitti ⚠ invece di sovrascrivere;
- `applica(piano, modifica)`: le modifiche della chat e quelle a mano passano di qui,
  con la storia per l'annulla.

Tutto deterministico e coperto da test: l'AI produce frammenti, non tocca il piano.

### 5.2 La bozza salvata

Tabella `commessa_bozze (id, company_id, created_by, piano jsonb, fonti jsonb,
storia jsonb, order_id, scade_il)` con RLS per azienda e autore. I file caricati vanno nello
storage della bozza e passano alla commessa quando nasce. Il popup scrive la bozza a ogni
modifica (con un attimo di attesa, non a ogni tasto).

### 5.3 Le letture in parallelo, senza flusso continuo

Niente streaming da tenere aperto: il browser lancia **una chiamata per fonte** (in
parallelo, al massimo 3 insieme) e ogni risposta è un `Frammento` che si fonde appena
arriva. Le letture lunghe (un contratto di 40 pagine) usano `serveConMetricheRapida`:
rispondono subito con un id e la bozza si aggiorna quando finiscono (Realtime sulla riga
di `commessa_bozze`, o un controllo ogni 2 secondi). Così un telefono che perde la rete
non perde la lettura.

### 5.4 La chat lavora sulla bozza

La chat del popup è `silvio-chat` con un contesto «bozza di commessa» e pochi strumenti
che modificano solo il piano: `cambia_valore`, `sposta_date`, `aggiungi_fase`,
`togli`, `scegli_fonte` (per i conflitti), `spiega` (da dove viene un valore). Nessuno
scrive nel database: restituiscono una modifica, che passa da `applica`. Le risposte
sono brevi e arrivano con la modifica già visibile a destra.

---

## 6. Fasi e lotti di sviluppo

Ogni lotto finisce con: typecheck mirato, lint, test, `build:fast`, prova su Demo Azienda 2,
pubblicazione e localhost di Florin allineato. Ogni fase si accende **prima su Demo 2, poi
su 2 aziende pilota, poi per tutti**, con un interruttore per azienda
(`resolve_company_feature`) che la spegne in un clic.

Ogni fase ha **un numero che dice se ha funzionato**, misurato sulle aziende reali
(non sulle demo). Il punto di partenza è quello della sezione 1.

### Fase 0 — Fondamenta e misura (1,5 sessioni)

| Lotto | Cosa | Fatto quando |
|---|---|---|
| **0.1** | Registro delle variabili (`registro.ts`), `PianoCommessa`, `fondi`, `applica`, con i test | ogni colonna di `orders` è classificata; fusione e conflitti provati su casi scritti |
| **0.2** | **Punteggio di completezza** di una commessa, calcolato dal registro (0–100, con l'elenco di cosa manca), e la query di partenza | per le 465 commesse aperte esce il punteggio; media e distribuzione scritte qui |
| **0.3** | Registro delle correzioni `silvio_correzioni` (valore proposto da Silvio, valore tenuto, area, fonte) | ogni modifica fatta nel popup lascia una riga: è la misura della qualità di Silvio e la materia prima per farlo imparare (fase 6) |

**Numero**: nessuno, è la base. Senza 0.2 e 0.3 le fasi dopo non si possono giudicare.

**Fatto il 31/10/2026** (ramo `claude/scm-fase0-747b69`, solo in locale):
- `shared/silvio-commessa/registro.ts`: 60 variabili nelle 14 aree (56 colonne di `orders`, il resto tabelle collegate), ognuna con colonne o
  tabella, fonti, livello e controllo «è compilata?»; le 18 colonne di `orders` che Silvio
  non compila stanno in `COLONNE_IGNORATE` col motivo (tecniche, cestino, consuntivo:
  pagamenti incassati e avanzamento). Il test `silvioCommessaRegistro` legge le colonne
  dai tipi generati e fallisce se una colonna non ha posto.
- `shared/silvio-commessa/fondi.ts`: `fondi`, `applica`, `annulla`. Il nome del file
  del registro e del piano non è quello scritto in 5 e 5.1 (`commessaVariabili.ts`,
  `pianoCommessa.ts`): tutto sta in `shared/silvio-commessa/`, niente zod per ora.
- `shared/silvio-commessa/completezza.ts`: punteggio sulla commessa vera, sulla bozza e
  in SQL, dallo stesso registro.
- Migrazione `20281106090000_silvio_correzioni.sql` (provata in una transazione
  annullata con un utente di Demo 2: scrive sulla sua azienda; rifiuta commessa di
  un'altra azienda, scrittura a nome d'altri, chiave d'un'altra area, modifiche, anon)
  e `src/lib/silvio-commessa/correzioni.ts`. **Non applicata**: va applicata con
  `apply_migration` e riallineata prima del push.

**Punto di partenza misurato il 31/10/2026** (aziende reali, escluse quelle con «demo»
nel nome; commesse non cancellate e non `completato`: **426 commesse in 11 aziende**.
Le 465 della sezione 1 contavano anche le 39 completate). Peso totale 42 punti su 30
variabili; le altre hanno peso 0 (sempre compilate, derivate, o valide solo per alcune
commesse: bonus, ditte, mezzi, POS).

| | |
|---|---|
| **Media** | **32,4 / 100** |
| Mediana | 33 |
| Minimo – massimo | 17 – 64 |

| Punteggio | 10–19 | 20–29 | 30–39 | 40–49 | 50–59 | 60–69 | 70+ |
|---|---|---|---|---|---|---|---|
| Commesse | 8 | 79 | **327** | 4 | 4 | 4 | 0 |

Il 97 % delle commesse sta sotto 40: hanno l'anagrafica e l'importo, e quasi niente
del resto. Compilate, per variabile (% delle 426):

| Area | Variabile | % | | Area | Variabile | % |
|---|---|---|---|---|---|---|
| identità | numero, titolo | 100 | | fasi | fasi | 2,8 |
| identità | tipo di lavoro | 0,2 | | fasi | date delle fasi | 1,6 |
| identità | descrizione lavori | 0 | | fasi | inizio lavori | 4,0 |
| identità | sede | 0,2 | | fasi | fine lavori | 2,3 |
| cliente | cliente collegato | 96,0 | | fasi | consegna prevista | 22,8 |
| cliente | nome, contatto, indirizzo | 92–95 | | persone | responsabile | 77,2 |
| cantiere | indirizzo del cantiere | 3,1 | | persone | capomastro | 0 |
| cantiere | posizione sulla mappa | 0,7 | | persone | squadra | 2,8 |
| economia | importo > 0 | 88,3 | | costi | costi previsti | 0 |
| economia | IVA | 99,8 | | sicurezza | adempimenti | 0 |
| economia | righe | 1,2 | | SAL e scadenze | scadenze previsionali | 0 |
| pagamenti | modalità | 100 | | comunicazione | prossima azione | 0 |
| pagamenti | rate | 3,8 | | comunicazione | canale, attività | 0,7–1,6 |

Da notare: l'indirizzo del **cantiere** c'è nel 3 % dei casi, quello del cliente nel 92 %
(Silvio può proporre il secondo come primo, 🟡). Il SAL non si usa: 0 righe in `sal` e
`appalto_sal`, 1 in `sal_records` (decisione 6 della sezione 7: la proposta regge).

La query si rigenera dal registro (`sqlPunteggio()`, `sqlCompilata()` di
`completezza.ts`), con il filtro qui sopra; solo SELECT.

### Fase 1 — Crea la commessa da qualsiasi documento (5,5 sessioni) · prima pubblicazione

| Lotto | Cosa | Fatto quando |
|---|---|---|
| **1.1** | Lettori a regole che esistono già, come frammenti: preventivo firmato (classico e 8 moduli), computo (nativo, XPWE, PriMus) | da 3 preventivi e 1 computo di Demo 2 esce il piano che farebbe l'ufficio |
| **1.2** | **Un lettore unico** per tutto il resto (`silvio-commessa`): contratto, capitolato, PDF qualsiasi, foto, testo libero. Una sola chiamata con lo schema di `PianoCommessa` e la citazione della fonte per ogni valore, non un modo per tipo di file. Sopra c'è `pdfExtraction` per il testo e la visione per le immagini | su 8 documenti d'esempio (inventati: il repo è pubblico) i valori giusti con la pagina; costo medio scritto |
| **1.3** | **Modelli per tipo di lavoro** quando il documento non dice fasi e durate: bagno, tetto, fotovoltaico, serramenti, impianti, ristrutturazione, presi dai cronoprogrammi dei preventivatori | «bagno 6 mq» dà fasi e durate sensate anche senza documento, marcate come stima |
| **1.4** | `commessa_bozze` (migrazione) e RPC `commessa_crea_con_silvio`, con l'annullamento | tutto o niente; «Annulla» toglie pulito; un'altra azienda non vede niente |
| **1.5** | Il popup: fonti, aree che si riempiono, ⓘ della fonte, modifica a mano, annulla, bozza che si riprende, «Controlla» e «Crea» | dal telefono, da un PDF di contratto alla commessa in meno di 2 minuti |

**Numero**: commesse nuove con fasi datate, rate e inizio, dal 3 % di oggi a più della metà.

**Lotti 1.1 e 1.3 fatti il 31/10/2026** (ramo `claude/scm-fase1a-234f2e`, solo in locale, nessuna migrazione):
- `src/lib/silvio-commessa/lettori/`: funzioni pure `frammentoDaPreventivo` (classico, con
  computo, 8 preventivatori edili), `frammentoDaComputo` e `frammentoDaFileComputo` (bozza
  nativa, XPWE, PDF di PriMus), `frammentoDaCommessa` (fonte `persona`, per la fase 2);
  letture sottili in `daDatabase.ts`. Il conto di `useQuotePrefill` è stato spostato in
  `src/lib/preventivi/prefillPreventivo.ts` e lo usano tutti e due.
- `piano.ts`: aggiunti i tipi facoltativi degli elenchi (`FaseDelPiano` con `giorno_inizio`,
  `giorni`, `sottofasi`; `RataDelPiano` con `trigger_evento`; `CostoDelPiano`). Le variabili
  con più colonne hanno per valore l'oggetto delle colonne trovate.
- `shared/silvio-commessa/modelliLavoro.ts`: 10 modelli (bagno, tetto, fotovoltaico,
  serramenti, elettrico, termoidraulica, climatizzazione, pavimenti, piscina,
  ristrutturazione) dalle fasi tipiche dei preventivatori; `frammentoDalModello`,
  `frammentoDalTesto`, `riconosciTipoLavoro`, `misuraDalTesto`, `dateDelleFasi`.
- Su dati d'esempio, un lettore da solo porta il piano a 40–57/100 (contro 32,4 di oggi);
  preventivo + computo 67. La prova sulle colonne vere (solo SELECT) le ha trovate tutte.
- Resta per la 1.4: collegare il cliente del gestionale (`customer_id`) dal contatto CRM
  del preventivo (`contact_id`), e scrivere `sottofasi` e `costi.previsti` con le RPC esistenti.

### Fase 2 — Completa le commesse che ci sono (2,5 sessioni)

| Lotto | Cosa | Fatto quando |
|---|---|---|
| **2.1** | **«Completa con Silvio»** su una commessa esistente: lo stesso popup, che parte dai valori della commessa (fonte più fidata di tutte: quello che ha scritto una persona non si tocca) e propone solo quello che manca, anche dai documenti già allegati | su una commessa vuota di Demo 2, fasi, date, rate e scadenze in un minuto, senza cambiare niente di già scritto |
| **2.2** | RPC `commessa_completa_con_silvio`: solo aggiunte, mai sovrascritture, con l'annullamento | provato su una commessa con dati a metà: i dati vecchi restano identici |
| **2.3** | **«Da completare»**: elenco delle commesse aperte ordinate per urgenza (inizio vicino, importo), col punteggio, e «Completa le prossime 5» una dopo l'altra | si completano 5 commesse di fila senza tornare all'elenco |

**Numero**: commesse aperte con fasi datate, da 7 su 465 a 100 entro un mese dall'accensione.

### Fase 3 — Conversazione e più fonti insieme (3 sessioni)

| Lotto | Cosa | Fatto quando |
|---|---|---|
| **3.1** | La chat sulla bozza (`cambia_valore`, `sposta_date`, `aggiungi_fase`, `togli`, `scegli_fonte`, `spiega`) e il vocale | «sposta tutto di una settimana e togli la ditta» cambia la bozza in una risposta, e si annulla |
| **3.2** | Più fonti insieme: conflitti ⚠ con le due cifre, ordine di fiducia, ⓘ che apre il documento al punto giusto | preventivo + contratto + offerta della ditta danno una commessa sola, con i conflitti risolti in un tocco |
| **3.3** | Si entra da tutte le porte: email con allegati, contratto in `contratti_documents`, chat e WhatsApp | «crea la commessa da questa email» apre il popup con gli allegati già letti |

**Numero**: quota di valori proposti da Silvio che l'utente tiene così (da `silvio_correzioni`), sopra l'85 %.

### Fase 4 — Persone, ditte, mezzi, acquisti (3 sessioni)

| Lotto | Cosa | Fatto quando |
|---|---|---|
| **4.1** | Proposte 🟡 nel popup: squadra, ditte e costi, mezzi, ODA (strumenti della fase 2 di `silvio-commessa-piano.md`) | accettate nel popup entrano; rimandate restano sulla commessa |
| **4.2** | **Disponibilità vere**: una persona già impegnata in un'altra commessa nelle stesse date, un mezzo occupato, una ditta senza DURC valido diventano ⚠, non proposte | nessuna proposta mette la stessa squadra in due cantieri lo stesso giorno |
| **4.3** | Bozze 🔴: contratto della ditta, ODA con la data d'ordine calcolata sui tempi di consegna, messaggio d'avvio al cliente, POS e DUVRI | pronte con il loro pulsante d'invio; nessuna parte da sola |

**Numero**: commesse aperte con le persone assegnate, da 12 su 465 a più della metà delle nuove.

### Fase 5 — Pilota automatico (3 sessioni)

| Lotto | Cosa | Fatto quando |
|---|---|---|
| **5.1** | Autonomia regolabile (`silvio_autonomia`) e la pagina in Impostazioni | un'azione promossa non chiede più; le vietate restano vietate anche via API |
| **5.2** | Calendario vero: festivi, chiusure aziendali (agosto), meteo per le fasi all'aperto; adempimenti prima di partire (CILA o SCIA, notifica preliminare quando serve, cartello, suolo pubblico) come scadenze | le date saltano Ferragosto; il tetto di novembre ha l'avviso meteo |
| **5.3** | Piano di volo: 3 giorni prima di ogni fase il controllo di persone, mezzi, materiali e DURC, con l'azione pronta; a fine fase la proposta del SAL | arriva il controllo con l'azione da confermare |
| **5.4** | Scheda «Quanto lavora Silvio»: punteggio di completezza, correzioni, tempo risparmiato, costo AI | numeri veri dopo 2 settimane d'uso |

### Fase 6 — La commessa che vive (da stimare dopo la fase 3)

Varianti ed extra in corso d'opera (importo, fasi, rate e preventivo integrativo da
firmare); ritardi che spostano a catena fasi, mezzi, ordini e rate; margine vero contro
previsto con l'avviso appena scende sotto soglia; chiusura (fine lavori, conformità,
svincolo delle ritenute, saldo, garanzie, recensione, fascicolo); e Silvio che impara:
durate e costi delle commesse chiuse e le correzioni di `silvio_correzioni` diventano i
modelli dell'azienda, al posto di quelli generici del lotto 1.3.

In totale circa 18,5 sessioni fino alla fase 5. **Fase 0 + fase 1 (7 sessioni) sono la
prima pubblicazione**; la fase 2 viene subito dopo perché tocca le 465 commesse che ci sono.

---

## 7. Decisioni da prendere

1. **Soglia di margine predefinita**: propongo il 15 %, modificabile per azienda.
2. **Cosa è «da solo» fin dall'inizio** per le aziende nuove: propongo solo il 🟢 della
   tabella. Le promozioni le decide il titolare.
3. **Messaggio d'avvio al cliente**: resta 🔴 (lo invii tu), oppure può diventare
   «parte da solo dopo 24 ore se non lo fermi»?
4. **Lettura dei documenti con l'AI** (lotto 1.2): contratti e capitolati contengono dati
   dei clienti; passano dal router AI come le fatture ricevute. Va bene così?
5. **Le 2 aziende pilota** per le fasi 1 e 2: le sceglie Florin (servono aziende che aprono
   commesse ogni settimana e hanno documenti da caricare).
6. **Il SAL**: tre sistemi in uso (`sal`, `sal_records` con le rate, `appalto_sal`).
   Propongo il piano dei SAL nelle rate (`order_installments`) e l'emissione in `sal`. Lo
   confermo contando l'uso reale nel lotto 0.1.

---

## 8. Trappole note

- **Una sola strada di scrittura.** Silvio scrive con le stesse RPC delle pagine
  (`create_order_atomic`, `commessa_pianifica_fasi`, `salva_piano_mezzo`,
  `commessa_assegna_subappaltatore`), mai con insert paralleli.
- **`_shared/` non ripubblica le edge function**: dopo una modifica lì va toccato
  l'`index.ts` delle funzioni che la usano.
- **Credito AI**: il popup mostra il costo prima di partire e controlla il saldo. Gli
  errori del provider passano da `segnalaErroreAI`.
- **Repository pubblico**: nessun dato di clienti veri nei test e nei modelli; le prove si
  fanno su Demo 2.
- **Migrazioni**: idempotenti, applicate con `apply_migration` e riallineate (CLAUDE.md).
- **Quello che scrive una persona vince sempre.** Completare una commessa vuol dire
  aggiungere, mai sovrascrivere: un test lo prova su una commessa con dati a metà.
- **Un interruttore per azienda** per ogni fase: se qualcosa va storto si spegne lì,
  senza un deploy.

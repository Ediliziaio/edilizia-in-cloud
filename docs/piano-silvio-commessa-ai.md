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

**Come passano i file** (lotto 1.4): restano in `silvio-uploads/<azienda>/<utente>/commessa-…`
finché la bozza è una bozza, elencati in `commessa_bozze.fonti`. Dopo «Crea» o «Completa»
`allegaFonti` (`src/lib/silvio-commessa/bozze.ts`) li copia in `order-attachments`, con lo
stesso percorso della pagina Nuova commessa (`orders/<commessa>/…`), e li registra con la RPC
`commessa_bozza_allega`: entrano così nel registro dell'annullamento, che li toglie dallo
storage insieme al resto. Un file che non si copia non ferma la commessa: il popup lo
mostra con «Riprova», e l'originale resta nella bozza.

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

**Lotto 1.2 fatto il 31/10/2026** (ramo `claude/scm-fase1b-32e01f`, solo in locale, nessuna migrazione, funzione non pubblicata):
- `supabase/functions/silvio-commessa`: un file (silvio-uploads, `<azienda>/<utente>/commessa-…`) o un testo → una sola
  chiamata ad `aiRouterComplete` (task `silvio_commessa_lettura`) → `Frammento`. PDF da `pdfExtraction` (OCR al massimo
  6 pagine), foto e piantine con la visione. Pagamento controllato prima del download, crediti dal router (402).
  Risposta sincrona con tetti (60.000 caratteri, 45 s di lettura): un id da interrogare servirà con `commessa_bozze` (1.4).
- `shared/silvio-commessa/letturaAI.ts`: prompt e `frammentoDaRispostaAI`. Ogni valore ha `dove` e `citazione`; la
  citazione si cerca nel testo e la pagina la dice il testo; cifre e date devono comparire nella citazione; senza prova
  il valore resta in `proposta` a fiducia 0,3. Risposte malformate → frammento vuoto con avviso.
- Registro: nuova variabile `economia.condizioni_contratto` (penali, ritenuta, anticipo, termini di pagamento,
  subappalto, garanzia, CIG, CUP, con la fonte di ogni campo), peso 0, sul contratto della commessa.
- `shared/silvio-commessa/riconoscitore.ts` (XPWE e PriMus → lettori dei computi; offerte → `rdo-ai-estrai-offerta`;
  il resto → `silvio-commessa`) e `src/lib/silvio-commessa/leggiDocumento.ts` (carica, riconosce, legge; testo con
  ripiego sul modello se l'AI non risponde).
- Decisione della fase 1A: fasi con i nomi ma senza tempi prendono le durate del modello (`durateDalModello`) come
  proposta, nel lettore del preventivo e in quello AI. Nessun conflitto.
- Costo stimato con la configurazione predefinita del router (gpt-4o-mini, fascia t2_vision): circa 0,01 € addebitati
  per un contratto di 10 pagine, 0,005 € per una foto o un testo, più circa 0,005 € per ogni pagina scansionata (OCR).

**Lotti 1.4 e 2.2 fatti il 31/10/2026** (ramo `claude/scm-fase1c-672ca8`, solo in locale; migrazione **non applicata**):
- Migrazione `20281106100000_commessa_bozze_silvio.sql` (richiede `20281106090000`): tabelle `commessa_bozze` (RLS: ognuno
  le proprie, nell'azienda dove ha `can_edit_orders`; stato, scadenza e commessa nata le scrivono solo le RPC; la scadenza
  si sposta a 30 giorni dall'ultima modifica) e `commessa_bozze_scritture` (il registro dell'annullamento, solo lettura per
  l'autore); la chiave esterna `silvio_correzioni.bozza_id`; RPC `commessa_crea_con_silvio`, `commessa_completa_con_silvio`,
  `commessa_bozza_allega`, `commessa_annulla_silvio` (chiuse ad anon, `set search_path = ''`, `lock_timeout` 5 s).
- **La scrittura**: il piano lo traduce una funzione pura, `scritturaDalPiano` (`src/lib/silvio-commessa/scrittura.ts`), che
  il client salva nella bozza insieme al piano. Le RPC leggono quella, la controllano (colonne ammesse, che un test confronta
  con la migrazione; id della stessa azienda) e la scrivono. Il piano serve alle RPC solo per i conflitti. Entrano i valori
  «fatto» e le proposte 🟢/❓; le 🟡 e 🔴 solo accettate. La stessa scrittura è l'elenco del «Controlla» (`escluse` col motivo).
- **Una sola strada**: `create_order_atomic`, o `crea_commessa_preventivo_atomic` se c'è il preventivo d'origine; poi le colonne
  fuori whitelist (come CreateOrder), `aggiungi_fasi_commessa` (fasi e sottofasi che mancano, per nome),
  `commessa_pianifica_fasi` (date solo alle fasi senza), voci previste in `order_work_phase_voci` (costo unitario in
  `costo_materiali`, origine preventivo o computo), `order_rate_sostituisci` solo su una commessa senza rate. Il codice della
  commessa, se manca, da `prossimo_numero_commessa`. La quantità non intera delle righe con `rigaConQuantitaIntera`, spostata
  da CreateOrder in `src/lib/orders/quantitaIntera.ts`.
- **Cliente**: quello scelto, o il profilo cliente col `marketing_contact_id` del contatto del preventivo, o un solo cliente con
  la stessa email o lo stesso nome (anche invertito). Se non c'è, «Crea» si ferma: «Manca il cliente: sceglilo o crealo».
- **Condizioni del contratto**: una riga `contratti_documents` (bozza, `generated_by = 'silvio'`) con numero, durata, penale al
  giorno e garanzia nelle colonne che ci sono, e l'oggetto intero in `ai_generated_raw.condizioni_silvio`. Niente colonne nuove.
- **Scadenze previsionali**: non si scrivono: il previsionale di cassa legge già le rate, e le conterebbe due volte.
- **Completare**: solo colonne vuote (null o testo vuoto: uno 0 scritto resta), fasi che mancano, date alle fasi senza, rate e
  contratto solo se non ci sono; il cliente solo se la commessa non ce l'ha.
- **Annullare**: il registro ha ogni riga nata nella transazione di Silvio (anche dai trigger: `created_at`/`changed_at =
  now()`, tabelle trovate dalle chiavi esterne) e ogni colonna riempita col valore di prima. Si rifiuta se una riga di Silvio
  è stata modificata dopo, se una riga nuova punta a una riga di Silvio (rapportino, costo, fattura, allegato), o se una
  colonna non ha più il valore di Silvio. Una commessa nata da Silvio sparisce del tutto; la bozza torna «bozza».
- Client `src/lib/silvio-commessa/bozze.ts`: `creaBozza`, `salvaBozza`, `salvataggioConAttesa` (solo l'ultima versione,
  mai due salvataggi insieme, riprova dopo un errore di rete), `bozzeDaRiprendere`, `leggiBozza`, `creaCommessa`,
  `completaCommessa`, `allegaFonti`, `annullaSilvio`, `messaggioErrore` (italiano).
- **Prove** in transazioni annullate su Demo 2 (vedi le note della sessione): crea → commessa con cliente (trovato dal nome
  invertito), codice DEMO2-0004, fasi datate, sottofasi, voce prevista, 2 rate con evento, riga, contratto con CIG, 12 righe
  nel registro; annulla → 13 righe tolte, tutto a zero, file da togliere restituito; ricrea dalla stessa bozza; un costo su
  una fase di Silvio → annullamento rifiutato; completa su DEMO2-0003 → aggiunti tipo di lavoro, indirizzo, 2 fasi, voce,
  contratto, nessun valore vecchio cambiato, rate identiche; una colonna cambiata dopo → rifiutato; annulla → commessa
  identica a prima. Conflitto aperto, utente d'un'altra azienda, dipendente senza permesso, anon: rifiutati.
- **Resta da sapere in produzione**: una funzione che scrive sulla commessa *dopo* la transazione (un'automazione via
  pg_net) farebbe rifiutare l'annullamento come «lavorata». È il lato sicuro; se succede, si escludono quelle tabelle.

**Lotto 1.5 fatto il 31/10/2026** (ramo `claude/scm-fase1d-3e2765`, solo in locale; migrazione **non applicata**):
- Il popup «Crea con Silvio» in `src/components/silvio-commessa/`: tre colonne da 1024 px (Fonti · Chat · La commessa),
  tre schede sul telefono con la barra «N voci pronte · M aspettano te · costo AI» e [Controlla] [Crea] sempre visibili;
  a schermo intero sul telefono, finestra grande sul computer.
- **Fonti**: trascinare i file, scegliere un preventivo o un computo da un elenco con ricerca (dentro il popup, non in una
  tendina: nei Dialog Radix il focus si perde), testo libero e vocale. Le letture a regole partono subito; quelle con l'AI
  mostrano la stima e aspettano «Leggi». Al massimo 3 letture insieme; errore con «Riprova»; avvisi del lettore sulla
  fonte; l'offerta di una ditta resta «da collegare».
- **La commessa**: le 14 aree nell'ordine del registro con ✓ ✋ ❓ ⚠, l'evidenziato quando un valore arriva, la ⓘ con
  fonte, posizione e citazione, la modifica a mano (sempre `applica`), i conflitti con le due cifre e «Tieni questo», le
  proposte 🟡 con «Va bene», Cmd+Z sulla storia della bozza; in alto completezza, margine previsto e fine lavori. Le ❓
  compaiono solo per quello che Silvio sa già scrivere.
- **Chat**: i messaggi di Silvio e una domanda alla volta come pulsanti (conflitto, cliente, inizio lavori: la data mette
  le date alle fasi, importo, cantiere, proposte). Il campo per scrivere c'è, spento: arriva con la fase 3.
- **Crea**: spento finché `prontaPerScrivere` dice qualcosa o una lettura è in corso; «Manca il cliente» apre la scelta
  (Select dei clienti o CreateCustomerDialog precompilato). Dopo: la commessa si apre; se un allegato non si copia, resta
  la schermata con «Riprova». Le correzioni vanno in `silvio_correzioni` (proposto = il piano senza la storia).
- **Striscia** su OrderDetail: «Silvio ha preparato N cose» con «Annulla tutto»; i rifiuti diventano parole («un costo»).
- **Bozza**: salvataggio automatico (si crea al primo cambiamento) e «Riprendi la commessa …» all'apertura senza fonti.
- **Ingressi**: Nuova commessa (testata) e preventivo accettato senza commessa («Trasforma in commessa con Silvio»), dietro
  la chiave `silvio_crea_commessa` (migrazione `20281106110000`, da applicare dopo la 1C): spenta per tutti, accesa per
  Demo 2 con un override. Il controllo non usa il passe-partout di demo e super admin.
- Test: `src/test/ui/silvioCommessaPopup.test.tsx` (6) e `src/test/logic/silvioCommessaPresentazione.test.ts` (5).
- Guardato a 1280 e 390 px con un'anteprima senza login: corretti un pulsante che usciva dalla colonna Fonti, la testata
  del telefono su tre righe e le ❓ di variabili che Silvio non scrive ancora.

### Fase 2 — Completa le commesse che ci sono (2,5 sessioni)

| Lotto | Cosa | Fatto quando |
|---|---|---|
| **2.1** | **«Completa con Silvio»** su una commessa esistente: lo stesso popup, che parte dai valori della commessa (fonte più fidata di tutte: quello che ha scritto una persona non si tocca) e propone solo quello che manca, anche dai documenti già allegati | su una commessa vuota di Demo 2, fasi, date, rate e scadenze in un minuto, senza cambiare niente di già scritto |
| **2.2** | RPC `commessa_completa_con_silvio`: solo aggiunte, mai sovrascritture, con l'annullamento | provato su una commessa con dati a metà: i dati vecchi restano identici |
| **2.3** | **«Da completare»**: elenco delle commesse aperte ordinate per urgenza (inizio vicino, importo), col punteggio, e «Completa le prossime 5» una dopo l'altra | si completano 5 commesse di fila senza tornare all'elenco |

**Numero**: commesse aperte con fasi datate, da 7 su 465 a 100 entro un mese dall'accensione.

**Lotti 2.1 e 2.3 fatti il 31/10/2026** (ramo `claude/scm-fase2-d5c0b9`, solo in locale; migrazione **non applicata**):
- **«Completa con Silvio»**: lo stesso popup con `orderId`. Parte da `leggiFrammentiCommessa` (fonte `persona` con l'id
  della commessa) e, se la commessa non ha fasi ma si capisce il lavoro da tipo, titolo o descrizione, dal modello per tipo
  di lavoro con la misura dei testi e l'inizio della commessa (`frammentiPerCompletare`). Quello che la commessa ha già
  (`giaNellaCommessa`) è chiuso: niente matita, 🔒, un'area tutta scritta si raccoglie in una riga «già nella commessa»;
  il riduttore rifiuta comunque ogni modifica che lo tocca (`modificaBloccata`), le date di inizio non ridatano fasi che la
  commessa ha già, e la scrittura lo lascia fuori (righe e venditore in «completa» restano nelle escluse col motivo).
  «Completa» resta spento finché non c'è niente da aggiungere. In testa «Completa al 26 % → 40 %».
- **Documenti della commessa** (`order_attachments`) in cima alle Fonti: solo quelli che Silvio sa leggere, ognuno con
  «Leggi · ~0,01 €»; il tocco è il via. Il file si scarica nel browser e passa dal lettore di sempre (si ricarica in
  silvio-uploads), e dopo «Completa» non si ricopia tra i documenti.
- La sola lettura della commessa non crea una bozza (niente bozze vuote a ogni apertura); `bozzeDaRiprendere` ha il filtro
  `{ modo, orderId }`: Nuova commessa riprende le «crea», la commessa le sue «completa» («Riprendi da lì», che rilegge la
  commessa di adesso sopra la bozza).
- **Ingressi**: sulla pagina della commessa la riga «Completa al 34 % · manca: fasi, rate e inizio lavori · [Completa con
  Silvio]» (`CompletaConSilvio`, sotto la striscia di Silvio); nelle Commesse la scheda **«Da completare»** (`?tab=da_completare`).
  Tutto dietro `silvio_crea_commessa`, solo per chi può modificare le commesse.
- **«Da completare»**: la funzione `commesse_da_completare(p_company_id, p_order_id, p_limite)` (migrazione
  `20281106120000`): punteggio e cosa manca con le espressioni di `sqlPunteggio()`/`sqlMancano()` (un test controlla che
  siano identiche), ordine per data più vicina a oggi (inizio, altrimenti consegna), poi importo; al massimo 200 righe col
  totale. SECURITY DEFINER con i controlli dentro: sessione, azienda in cui si lavora, `can_edit_orders`, `can_see_order`
  per riga (chi vede solo le assegnate vede solo quelle), importo solo con `can_view_order_amounts`; chiusa ad anon.
  Provata in transazioni annullate su Demo 2: 178 commesse in 67 ms; dipendente senza permesso, altra azienda e anon
  rifiutati; «solo assegnate» senza importi → 2 righe, importi nulli.
- **«Completa le prossime 5»**: apre il popup sulla prima («2 di 5» nel titolo), «Completa e vai alla prossima» e «Salta»
  passano alla successiva senza tornare all'elenco; alla fine «4 commesse completate, 1 saltata» e l'elenco si rilegge.
- Test: `silvioCommessaDaCompletare` (14, logica e migrazione) e `silvioCommessaCompleta` (6, interfaccia).
- Guardato a 1280 e 390 px con l'anteprima senza login: corretti l'elenco sul telefono (colonne sovrapposte), il titolo del
  popup troncato sul telefono, «9800 €» senza punto delle migliaia; raccolte le aree già tutte scritte.

### Fase 3 — Conversazione e più fonti insieme (3 sessioni)

| Lotto | Cosa | Fatto quando |
|---|---|---|
| **3.1** | La chat sulla bozza (`cambia_valore`, `sposta_date`, `aggiungi_fase`, `togli`, `scegli_fonte`, `spiega`) e il vocale | «sposta tutto di una settimana e togli la ditta» cambia la bozza in una risposta, e si annulla |
| **3.2** | Più fonti insieme: conflitti ⚠ con le due cifre, ordine di fiducia, ⓘ che apre il documento al punto giusto | preventivo + contratto + offerta della ditta danno una commessa sola, con i conflitti risolti in un tocco |
| **3.3** | Si entra da tutte le porte: email con allegati, contratto in `contratti_documents`, chat e WhatsApp | «crea la commessa da questa email» apre il popup con gli allegati già letti |

**Numero**: quota di valori proposti da Silvio che l'utente tiene così (da `silvio_correzioni`), sopra l'85 %.

**Lotti 3.1, 3.2 e 3.3 fatti il 31/10/2026** (ramo `claude/scm-fase3-939f33`, solo in locale; migrazioni **non applicate**):
- **La chat sulla bozza** (`shared/silvio-commessa/chat.ts`): i sei strumenti della sezione 5.4 sono funzioni pure che
  restituiscono `Modifica` per `applica`; il riduttore le applica insieme (un `gruppo`: un annulla le toglie tutte). Il
  testo della risposta lo compone il codice dalla modifica fatta («Ho spostato le date avanti di 5 giorni lavorativi (1
  settimana). Ho tolto «Ditte».»), non il modello. Quello che la chat cambia resta segnato a destra («cambiato in chat»)
  finché non lo tocchi; «Vedi» lo mostra, «Annulla» e Cmd+Z lo tolgono, «annulla» in chat si fa senza AI. I valori della
  commessa (`giaNellaCommessa`) si rifiutano col motivo, con lo stesso `modificaBloccata` del riduttore (ora nel motore).
- **Dove vive**: un modo `chat` della funzione `silvio-commessa`, non un contesto di `silvio-chat`. Gli strumenti non
  scrivono nel database e non passano dalle conferme di `executeToolWithRouting`: in `silvio-chat` (9.000 righe di
  strumenti condivisi, su cui lavorano altre sessioni) sarebbero stati un contesto in più nel prompt e nell'instradamento
  per sei funzioni pure. La funzione restituisce gli strumenti scelti; il browser li traduce sulla bozza che ha davanti.
- **Costo e crediti**: prima di ogni chiamata AI del popup (lettura, chat, dettatura) il saldo (`company_credit_pool` +
  omaggio, `calls_blocked`); se non basta non parte niente e il messaggio resta nel campo. Il router ricontrolla (402).
  Stima accanto al campo (≈0,003 € a messaggio, ≈0,03 € a dettatura). Gli errori del provider li segnala il router.
- **Vocale**: dettatura col microfono accanto al campo (`useDettatura`, MediaRecorder → `trascrizione-audio`, come il
  preventivatore), il testo va nel campo da rileggere.
- **Più fonti e la ⓘ**: tre fonti (preventivo + contratto + offerta) danno i conflitti giusti (importo, costi; non il
  cliente che dicono uguale), ognuno risolto con «Tieni questo». La ⓘ di un valore letto da un documento (e quella di
  ogni candidato in conflitto) apre `VisoreFonte`: pdf.js come l'anteprima dei preventivi, alla pagina del «dove», con
  i pezzi di testo della citazione evidenziati; le foto come immagine.
- **Le porte**: «Fanne una commessa · N allegati · ~0,03 €» sotto gli allegati di un'email (letti dove stanno);
  «Completa la commessa da questo contratto» nel dialogo del contratto AI (lettore a regole di `contratti_documents`,
  senza costo); il link `/azienda/ordini/nuovo?silvio=1&fonte=…` apre il popup con le fonti, e lo strumento
  `commessa_da_documento` di Silvio (chat e WhatsApp) risponde con quel link e gli allegati del messaggio. Nessun
  messaggio parte da solo; dal link le letture AI aspettano «Leggi».
- **Niente più copie orfane**: un documento della commessa o un allegato di un'email si legge dove sta. La funzione
  riceve l'id della riga, la legge col client di chi chiama (la RLS decide) e prende il percorso da lì; solo dopo scarica
  con la chiave di servizio. Scelto rispetto al «cancella dopo la lettura», che lascia la copia se la pagina si chiude a
  metà e ricarica 20 MB dal telefono.
- **Fasi senza date**: la commessa che ha fasi senza date riceve le date dal modello del lavoro (durate per parola in
  comune, in sequenza dall'inizio lavori) o dal cronoprogramma di un preventivo, per nome, in `fasi.date_fasi` come
  proposta 🟡; «Va bene» la mette in `scrittura.date_fasi` e `_silvio_aggiungi` la passa a `commessa_pianifica_fasi`
  (solo fasi senza date). «Sposta» in completa sposta la proposta, non le fasi della commessa.
- Test: `silvioCommessaChat` (22), `silvioCommessaFunzioneChat` (7), `silvioCommessaChat.test.tsx` (8). Guardato a
  1280 e 390 px con l'anteprima senza login: corretta la colonna della chat che sbordava in basso dell'altezza del titolo.

### Fase 4 — Persone, ditte, mezzi, acquisti (3 sessioni)

| Lotto | Cosa | Fatto quando |
|---|---|---|
| **4.1** | Proposte 🟡 nel popup: squadra, ditte e costi, mezzi, ODA (strumenti della fase 2 di `silvio-commessa-piano.md`) | accettate nel popup entrano; rimandate restano sulla commessa |
| **4.2** | **Disponibilità vere**: una persona già impegnata in un'altra commessa nelle stesse date, un mezzo occupato, una ditta senza DURC valido diventano ⚠, non proposte | nessuna proposta mette la stessa squadra in due cantieri lo stesso giorno |
| **4.3** | Bozze 🔴: contratto della ditta, ODA con la data d'ordine calcolata sui tempi di consegna, messaggio d'avvio al cliente, POS e DUVRI | pronte con il loro pulsante d'invio; nessuna parte da sola |

**Numero**: commesse aperte con le persone assegnate, da 12 su 465 a più della metà delle nuove.

**Lotti 4.1, 4.2 e 4.3 fatti l'1/11/2026** (ramo `claude/scm-fase4-ad2d8b`, solo in locale; migrazioni **non applicate**):
- **Un motore solo** (`shared/silvio-commessa/risorse.ts`): `proposteRisorse(piano, contesto)` legge le fasi della bozza
  (in «completa» anche le date proposte alle fasi senza date) e i dati veri dell'azienda, e restituisce un `Frammento`
  con fonte `modello`: squadra, capomastro, ditte col costo previsto della fase (le voci, o `costi.previsti`), mezzi,
  ordini al fornitore abituale, e le bozze. Passa da `fondi` come ogni lettore; si rifà da solo quando cambiano fasi
  e date, e non tocca quello che la persona ha accettato o scritto, né quello che viene da una fonte più fidata.
  Gli strumenti «gialli» di `docs/silvio-commessa-piano.md` (fase 2) non esistono ancora: si riusano le funzioni pure
  che c'erano (`dittaProposta`, ora con `paroleFase` e `somiglianzaFasi` in `shared/silvio-commessa/somiglianza.ts`,
  re-esportate da `ditteLavori.ts`) e le RPC delle pagine.
- **Chi**: le persone sono i dipendenti (`order_employees.employee_id` → `employees`) che hanno fatto più fasi con un
  nome simile; il capomastro è il più frequente fra le altre commesse, solo se è nello staff di `useCompanyStaffUsers`
  (mai `profiles` grezzo). Ditte dallo storico di `order_external_teams`, mezzi dai piani `mezzi_piani_cantiere` delle
  fasi simili, fornitori dalle righe degli ordini passati.
- **Disponibilità vere (4.2)**: una persona già su un'altra commessa nelle stesse date (date della fase, o della
  commessa) o assente (`hr_assenze`); un mezzo prenotato (`mezzi_piani_cantiere`, `mezzi_allocazioni`, anche a
  quantità), in officina o fuori servizio; una ditta senza subappaltatore collegato, senza DURC, con DURC irregolare,
  scaduto o che scade prima della fine della fase (`subappaltatori_documenti` e `subappaltatori_sicurezza.durc_scadenza`),
  o con altri documenti scaduti. Chi non va non si propone: si prende il prossimo; se non c'è, resta il migliore con
  ⚠ e il perché, e la scrittura lo lascia fuori col motivo. Un test controlla che nessuna proposta metta la stessa
  persona in due cantieri lo stesso giorno. `salva_piano_mezzo` ricontrolla i mezzi alla scrittura.
- **Bozze 🔴 (4.3)**: contratto di subappalto in bozza per ogni ditta che entra (Allegato A dalle voci delle sue
  fasi, a corpo se non ne ha); ordini in stato «bozza» con la data d'ordine = consegna (inizio fase) − tempi di
  consegna del fornitore (`suppliers.lead_time_days`), e l'avviso se andava ordinato prima di oggi; promemoria del POS
  e (con ditte) di DUVRI/PSC 5 giorni lavorativi prima dell'inizio; il messaggio d'avvio al cliente come testo, in
  un'attività della commessa. Niente parte: `sent_at` resta vuoto, nessuna email o WhatsApp.
- **Offerte «da collegare»** (rimaste dalla fase 3): sulla fonte si sceglie la richiesta d'offerta aperta, la legge
  `rdo-ai-estrai-offerta` (stima ~0,03 € e saldo controllato prima), e diventa l'ordine in bozza a quel fornitore coi
  prezzi (sconto compreso), le quantità della richiesta e i giorni di consegna dell'offerta. Gli altri ordini proposti
  restano anche tenendo l'offerta.
- **Allegati delle email**: dopo «Crea» o «Completa» un allegato di un'email letto nel popup finisce tra i documenti
  della commessa: lo copia `silvio-commessa` (modo `allega`) e lo registra con `commessa_bozza_allega`, quindi
  l'annullamento lo toglie.
- **Scrittura**: `scritturaDalPiano` ha `squadra`, `ditte`, `mezzi`, `oda`, `contratti`, `promemoria`; le scrive
  `_silvio_aggiungi_risorse` (migrazione `20281106130000`), chiamata da `_silvio_aggiungi` dopo le fasi, per nome di
  fase, solo aggiunte. Provata il 1/11 in una transazione annullata su Demo 2 insieme alle migrazioni della fase 1–3
  (compresa la modifica della fase 3 alle date proposte, mai provata prima): tutto entra, il secondo mezzo sovrapposto
  torna in `non_prenotati`, l'annullamento toglie tutto (15 righe), non resta niente.
- **Date in ora italiana**: `oggiInItalia` (`en-CA`, Europe/Rome) in `shared/silvio-commessa/date.ts`; l'urgenza
  della fase 2 (`commesse_da_completare` e `oggiIso`) non usa più `current_date` in UTC.
- Test: `silvioCommessaRisorse` (19), `silvioCommessaRisorse.test.tsx` (2). Guardato a 1280 e 390 px: corretto il
  nome della persona che sul telefono si riduceva a «⚠ …».

### Fase 5 — Pilota automatico (3 sessioni)

| Lotto | Cosa | Fatto quando |
|---|---|---|
| **5.1** | Autonomia regolabile (`silvio_autonomia`) e la pagina in Impostazioni | un'azione promossa non chiede più; le vietate restano vietate anche via API |
| **5.2** | Calendario vero: festivi, chiusure aziendali (agosto), meteo per le fasi all'aperto; adempimenti prima di partire (CILA o SCIA, notifica preliminare quando serve, cartello, suolo pubblico) come scadenze | le date saltano Ferragosto; il tetto di novembre ha l'avviso meteo |
| **5.3** | Piano di volo: 3 giorni prima di ogni fase il controllo di persone, mezzi, materiali e DURC, con l'azione pronta; a fine fase la proposta del SAL | arriva il controllo con l'azione da confermare |
| **5.4** | Scheda «Quanto lavora Silvio»: punteggio di completezza, correzioni, tempo risparmiato, costo AI | numeri veri dopo 2 settimane d'uso |

**Lotti 5.1, 5.2, 5.3 e 5.4 fatti l'1/11/2026** (ramo `claude/scm-fase5-ea8686`, solo in locale; migrazioni **non applicate**, cron **non acceso**):
- **5.1 Autonomia** (`shared/silvio-commessa/autonomia.ts`): 9 azioni con tre livelli, «Mai» (`vietata`), «Chiede», «Da solo».
  Promuovibili a «Da solo»: squadra e capomastro, mezzi interni, ordini in bozza (solo coi prezzi e sotto una soglia in €),
  promemoria e scadenze prima di partire. Fermi a «Chiede»: ditte (la ditta riceve l'avviso in app), contratti delle ditte,
  messaggio d'avvio al cliente (decisione 3 ancora aperta), controllo prima della fase, proposta del SAL. Sempre della persona,
  senza scelta: firma, fatture e SDI, pagamenti, importo del contratto, cancellazioni, fornitori nuovi (`SEMPRE_TU`).
  Predefinito «Chiede» per tutti: una riga che manca vale «Chiede».
  - Il livello sostituisce quello del registro per le variabili delle azioni: anche gli adempimenti (🟢 nel registro) aspettano il «Va bene».
    «Da solo» entra senza «Va bene» e il popup lo dice («Silvio lo fa da solo: l'hai scelto in Impostazioni»); «Mai» non si propone e,
    se arriva lo stesso, resta fuori dalla scrittura anche accettato.
  - **Il controllo vero sta nel database**: `_silvio_bozza` (100000, modificata) passa la scrittura da `_silvio_scrittura_permessa`, che
    toglie squadra (e `capomastro_user_id`), mezzi, ordini, ditte, contratti, promemoria e adempimenti delle azioni vietate, e lo scrive
    in `tolte_autonomia`. Vale per «Crea», «Completa» e per chi chiama le RPC a mano. `silvio_autonomia_salva` rifiuta i livelli oltre il
    massimo e le azioni fuori catalogo; la tabella ha un vincolo con lo stesso controllo, e nessun GRANT ai client.
  - Pagina **Impostazioni → Silvio e le commesse** (`/azienda/impostazioni/silvio-commesse`, `SettingsSilvioCommesse`): una sezione sola,
    una riga per azione col selettore a tre, la soglia degli ordini, la riga «Sempre tu», il calendario di cantiere. Si apre con «Vedi
    impostazioni commesse», si cambia con «Modifica». Non è nel menu (dietro `silvio_crea_commessa`): ci si arriva dalla scheda
    «Quanto lavora Silvio». Diversa da «Cosa fa Silvio da solo» (`ai-automazioni`), che governa le azioni della chat.
- **5.2 Calendario vero** (`shared/silvio-commessa/calendario.ts`): domeniche, sabato (salvo che l'azienda lo lavori), feste nazionali con
  Pasqua e Pasquetta calcolate, patrono (scritto in impostazioni, o dedotto dalla città del cantiere fra 36 capoluoghi: la città dopo il
  CAP o dopo l'ultima virgola, mai «Via Roma»), chiusura estiva configurabile (anche a cavallo d'anno) e le festività di Personale
  (`hr_festivita`). `spostaGiorniLavorativi` salta le feste nazionali anche senza calendario dell'azienda; il piano porta
  `calendario` (lo rimette il popup a ogni apertura) e lo usano «sposta», `dateDelleFasi`, la chat e le scadenze dei promemoria.
  I lettori a regole (preventivo, computo) datano ancora con le sole feste nazionali.
  - **Meteo** (`partenza.ts`): regola stagionale, nessun servizio meteo. Coperture, facciate e cappotti, scavi, esterni nei mesi a rischio
    (freddo nov–feb, pioggia in ott e mar, caldo per i tetti in lug–ago) → `fasi.avvisi_meteo` (variabile nuova del registro, peso 0,
    si mostra e non si scrive). Il tetto di novembre ha l'avviso; il bagno no.
  - **Adempimenti prima di partire** → `sicurezza.adempimenti` → `adempimenti_sicurezza` della commessa, con la scadenza in giorni
    lavorativi prima dell'inizio: CILA o SCIA (lavori che toccano l'edificio; non serramenti, FV, impianti, pavimenti), cartello di
    cantiere, notifica preliminare (art. 99 D.Lgs. 81/2008: con almeno una ditta, o oltre 200 uomini-giorno stimati con 2 persone per
    fase se la squadra non c'è), suolo pubblico (ponteggi, cassoni, gru). Li scrive `_silvio_aggiungi_risorse` (130000, modificata);
    l'annullamento li toglie (tabella con `order_id` e `created_at`).
- **5.3 Piano di volo** (`shared/silvio-commessa/pianoVolo.ts`, funzione `silvio-piano-volo`):
  - 1–3 giorni lavorativi prima di ogni fase, `controlloFase`: persone assegnate ancora libere (assenze, altre commesse) o nessuna
    assegnata, mezzi prenotati liberi e in servizio, ordini della commessa partiti e in tempo (bozza, senza data, consegna dopo
    l'inizio), DURC e documenti delle ditte per tutta la fase, meteo. Riusa `personaOccupata`, `mezzoOccupato`, `documentiDitta` della
    fase 4 sullo stesso contesto: `leggiContestoRisorse` è passata in `shared/silvio-commessa/contestoRisorse.ts` (il browser la
    chiama da `src/lib/silvio-commessa/risorse.ts`). Ogni problema ha, se c'è, l'azione pronta: assegnare chi è libero, prenotare
    il mezzo usato di solito, un'attività («Manda l'ordine…», «Sollecita…», «Chiedi il DURC…»).
  - Il giorno dopo la fine di una fase, `propostaSal`: solo se la commessa ha rate a SAL (`trigger_evento = 'sal_numero'`); importo
    della rata di quel SAL, altrimenti l'avanzamento in giorni delle fasi per l'imponibile meno i SAL fatti.
  - Le proposte vanno in **`silvio_piano_volo`** (tabella nuova, una riga per fase e tipo) e non in `ai_action_proposals`: quella la
    leggono sette schermate e la esegue `silvio-execute-action`, che queste azioni non conosce. Si vedono sulla commessa
    (`PianoDiVoloCommessa`, sotto la striscia di Silvio): le azioni spuntate, «Fai» → `silvio_volo_conferma` (con i permessi di chi
    tocca, ricontrolla l'autonomia, ogni azione che non va è saltata col motivo), «Non serve» → `silvio_volo_scarta`. Il SAL nasce in
    `sal` in bozza (`milestone_phase_end`, `auto_ai`): l'emissione resta alla persona. Una campanella (`notifications`, tipo
    `silvio_piano_volo`, che non manda push) al responsabile e al capomastro. Nessuna email, WhatsApp o chiamata AI.
  - «Da solo» nel piano di volo non esegue ancora niente: il giro gira senza utente, e scrivere con la chiave di servizio
    salterebbe i permessi (`salva_piano_mezzo` vuole un utente). Arriva le proposte, sempre. Vedi la Fase 6.
- **5.4 Quanto lavora Silvio**: scheda nelle Commesse (`?tab=silvio_lavora`, `QuantoLavoraSilvio`, dietro `silvio_crea_commessa`, per chi
  modifica le commesse). RPC `silvio_quanto_lavora(azienda, dal, al, pagina, per_pagina)` (142000), ultimi 90 giorni: commesse create e
  completate, punteggio di completezza di oggi di quelle commesse (`_silvio_punteggio`, l'espressione di `sqlPunteggio()`: un test la
  confronta), proposte tenute così e corrette (`silvio_correzioni`, con le aree più corrette), voci scritte (registro
  dell'annullamento), costo AI addebitato (`ai_call_ledger`, task `silvio_commessa_lettura` e `silvio_commessa_chat`), piano di volo per
  stato, e l'elenco delle commesse a pagine (50 al massimo). Il tempo risparmiato è l'unica stima, con la regola accanto: 2 minuti a
  voce (`MINUTI_PER_VOCE`). Senza dati: zero e «ancora nessun dato», la quota tenuta «—» e mai 100 %.
- **Prova** (1/11, una transazione con `raise` finale, niente scritto): 090000 (tabella), le tabelle e `_silvio_bozza` della 100000,
  130000, 140000, 141000, 142000, con l'md5 di ogni funzione uguale ai file. Titolare di Demo 2: legge 9 azioni tutte «chiede»;
  salva squadra vietata, mezzi e ordini da soli (soglia 500), chiusura 10/08–23/08 e patrono 07/12; «ditte da sola» rifiutata, «firma»
  rifiutata, insert diretto nella tabella rifiutato; dipendente senza «Modifica impostazioni commesse»: salvataggio rifiutato, lettura
  sì. Una bozza con squadra, POS e due adempimenti su ORD-DEM-SR02: `_silvio_bozza` toglie la squadra (`tolte_autonomia: [squadra]`),
  `_silvio_aggiungi_risorse` scrive 0 persone, 1 promemoria, 2 adempimenti con la scadenza. Piano di volo: `silvio_volo_registra` due
  volte = la stessa riga; il titolare la vede; la conferma fa l'attività e il SAL in bozza (123,45 €) e salta «assegna» («nelle
  impostazioni Silvio non assegna le persone»); la seconda conferma è rifiutata. `silvio_quanto_lavora`: 1 completata, punteggio 86,
  2 voci, 1 correzione in «fasi», costo 0, piano di volo 1 confermata. Anon: le RPC e la tabella rifiutate.
  Trovato e corretto nella prova: `text[] || 'squadra'` va scritto `'squadra'::text` (Postgres lo leggeva come un array).
- Test: `silvioCommessaAutonomia` (15), `silvioCommessaCalendario` (14), `silvioCommessaPianoVolo` (14), `silvioCommessaQuantoLavora`
  (4), `silvioCommessaPilota.test.tsx` (5).

**Al push della fase 5** (dopo le migrazioni delle fasi 0–4, nell'ordine; riallineare ogni versione come da CLAUDE.md):
1. `20281106100000_commessa_bozze_silvio.sql` — MODIFICATA anche qui: `_silvio_bozza` filtra la scrittura (per nome, solo se esiste).
2. `20281106130000_silvio_risorse_commessa.sql` — MODIFICATA: gli adempimenti in `adempimenti_sicurezza`.
3. **NUOVA** `20281106140000_silvio_autonomia.sql`: `silvio_autonomia`, `silvio_calendario`, `_silvio_azioni_autonomia`,
   `_silvio_livello_ammesso`, `_silvio_livello`, `_silvio_scrittura_permessa`, `silvio_autonomia_leggi`, `silvio_autonomia_salva`.
4. **NUOVA** `20281106141000_silvio_piano_volo.sql`: `silvio_piano_volo` (RLS per commessa visibile), `_silvio_volo`,
   `silvio_volo_conferma`, `silvio_volo_scarta`, `silvio_volo_registra` e `silvio_volo_scadute` (solo service role).
5. **NUOVA** `20281106142000_silvio_quanto_lavora.sql`: `_silvio_punteggio`, `silvio_quanto_lavora`.
Nessuna è una bonifica: tabelle e funzioni nuove, nessuna riga esistente toccata.

**Funzioni edge da ripubblicare**: `silvio-piano-volo` (nuova, `verify_jwt = false` in config.toml) e `silvio-commessa` (importa
`chat.ts` → `fondi.ts` → `calendario.ts`, e il registro cambiato; il commento del suo `index.ts` è toccato apposta). Nessun file di
`supabase/functions/_shared/` toccato. `_shared/silvioTools.ts` importa solo `ingressi.ts`, non cambiato.

**Cron da accendere**, dopo il deploy di `silvio-piano-volo` e una prova `{"anteprima": true, "company_id": "<Demo 2>"}`:
`supabase/migrations-pending/20281106142500_silvio_piano_volo_cron.sql` (alle 6:20 di Roma, attesa 15 secondi, segreto `cron_secret`
dal Vault). Va spostato in `supabase/migrations` solo allora: una migrazione nella cartella va in produzione al primo push.

**Resta per la Fase 6**:
- «Da solo» nel piano di volo: eseguire le azioni promosse senza un utente, con un permesso di servizio per azienda che non salti i
  controlli di `salva_piano_mezzo`; e «spostare le fasi dipendenti quando una slitta» (promuovibile nel piano, sezione 4), che vuole
  i ritardi della Fase 6.
- Il messaggio d'avvio «parte da solo dopo N ore se non lo fermi» (decisione 3): oggi resta «Chiede» e non si manda mai.
- I lettori a regole (preventivo, computo) datano con le sole feste nazionali: passargli il calendario dell'azienda.
- La notifica preliminare usa 2 persone a fase quando la squadra non c'è: con le ore vere dei rapportini delle commesse chiuse la
  stima degli uomini-giorno diventa dell'azienda.
- Il costo AI della scheda conta lettura e chat del popup; dettatura (`trascrizione-audio`) e offerte (`rdo-ai-estrai-offerta`) hanno
  task di altre pagine e non si distinguono ancora.
- Il resoconto settimanale per il cliente del venerdì (sezione 4) non è nel piano di volo: è un messaggio al cliente, da decidere con
  la decisione 3.

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

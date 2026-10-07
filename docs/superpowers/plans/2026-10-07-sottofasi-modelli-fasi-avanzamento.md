# Fasi di lavoro: sottofasi, modelli per azienda, cantiere e avanzamento — piano di sviluppo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni azienda decide come si misura l'avanzamento dei suoi cantieri, e chi sta in cantiere (capocantiere, caposquadra, operaio, ditta) e l'ufficio lavorano sullo stesso numero. Una fase si divide in **sottofasi** che ne determinano la percentuale; i **modelli di fasi** sono **dell'azienda** (gli otto predefiniti diventano suoi, modificabili ed eliminabili) e si scelgono dal bottone «Scegli le fasi»; l'avanzamento che ne esce (fase → commessa → SAL) è uno solo, spiegabile, e vale per **ogni strada** con cui arriva: app di cantiere, rapportino, ufficio, assistente.

**Architecture:**
- **Il database è la fonte.** Una fase con sottofasi *deriva* da esse: un trigger `BEFORE UPDATE` su `order_work_phases` riscrive percentuale, stato e chiusura dal calcolo, qualunque cosa il client abbia scritto (un'app vecchia, l'approvazione di un rapportino scritto prima, una chiamata diretta); dopo ogni spunta un secondo trigger riallinea la fase. Una fase senza sottofasi non cambia di una virgola.
- **Sottofasi** in una tabella figlia `order_work_subphases` **senza** `company_id` né `order_id`: azienda e commessa sono quelle della fase (nessuna copia che diventi stantia), e la RLS le fa seguire la fase, quindi la commessa (la regola del 25/09: «le righe figlie seguono la commessa»).
- **Modelli** in tre tabelle (modello → fasi → sottofasi), scritte solo da RPC atomiche. I modelli di partenza non sono più una lista fissa: la prima volta che l'azienda apre la pagina dei modelli le vengono consegnati, e da lì sono modelli come gli altri. Fino ad allora «Scegli le fasi» offre gli stessi 8 di oggi.
- **Cantiere.** Le tre strade con cui oggi arriva l'avanzamento restano (Avanzamento lavori subito; rapportino del capo all'approvazione; ufficio) e le sottofasi si innestano in tutte e tre. L'applicazione **all'approvazione** passa dal database (trigger sul rapportino, come già fa il costo delle ore): vale anche per l'assistente Silvio e per ogni chiamata, e il codice di approvazione del browser non si tocca. L'ufficio vede, prima di approvare, quali fasi cambiano.
- **Regole per azienda** (`company_fasi_settings`): chi può spuntare dal cantiere (tutti / chi fa la fase / solo i capi) e come pesare le fasi nella media della commessa (alla pari / per durata / per venduto).
- La logica sta in moduli puri testati; ogni migrazione è stata **provata a secco sulla produzione** (transazione annullata) prima di entrare nel piano.

**Tech Stack:** React 18 + TypeScript, TanStack Query, Supabase (Postgres, RLS, trigger e RPC `SECURITY DEFINER`), Tailwind + shadcn/ui, Vitest + Testing Library.

**Regole del progetto da rispettare** (CLAUDE.md e memoria di progetto):
- Lavoro **solo in locale** (worktree `eic-ui`, branch `traccia-ui`): niente push, mai `supabase db push`.
- Le migrazioni toccano la produzione: si applicano con il tool MCP `apply_migration` e si riallinea la versione (CLAUDE.md, punti 1-4), **solo dopo l'OK dell'utente** e dopo una prova a secco. Un file in `supabase/migrations/` va in produzione al primo push: **prima di ogni push va applicato e riallineato**.
- Versioni `2028…`, da verificare libere con `ls supabase/migrations/<versione>_*.sql`: `20281007130000` (sottofasi), `20281007140000` (modelli), `20281007141000` (avanzamento all'approvazione), `20281007143000` (chi spunta), `20281007150000` (peso nella media). Sono in ordine di dipendenza: non si applicano fuori ordine.
- Funzione nuova: `REVOKE ALL … FROM PUBLIC, anon` + `GRANT EXECUTE` esplicito a chi deve usarla; le funzioni di trigger non hanno bisogno di `EXECUTE`. **Attenzione:** una funzione chiamata *da dentro* un trigger `INVOKER` (la guardia delle sottofasi gira con i diritti di chi spunta) deve essere eseguibile da `authenticated`.
- Regola delle righe figlie (20280926023000): una riga di una commessa la vede chi vede la commessa e la modifica chi può modificare le commesse e ha quella commessa tra le sue (`can_see_order`). Le sottofasi la ereditano dalla fase.
- Due guardiani leggono le migrazioni nuove: niente `<>`/`!=` per confrontare l'azienda con `get_my_company_id()`/`get_effective_company_id()`, niente `'company_admin'` nudo in una policy. Qui si usa `=` / `IS DISTINCT FROM` e `has_permission*`.
- Il trigger `trg_fase_campi_protetti` (altra sessione, 20281006150000) lascia al cantiere solo `status, percentuale, foto_urls, completata_il, completata_da, updated_at` su `order_work_phases`; le scritture derivate passano da funzioni `SECURITY DEFINER` (il trigger lascia passare chi non è `authenticated`/`anon`). **Nessuna colonna nuova su `order_work_phases`.**
- L'avanzamento di una fase si legge **sempre** con `avanzamentoFase()` (`src/lib/orders/cronoprogramma.ts`), mai dalla `percentuale` grezza.
- Il guardiano `src/test/logic/faseCampiProtetti.test.ts` (altra sessione, non ancora committato) ammette **tre soli file** che scrivono `order_work_phases` (`OrdineRapportiniCampo.tsx`, `useOrderWorkPhases.ts`, `CampoAvanzamento.tsx`) e legge il letterale `const patch: Record<string, unknown>` dell'approvazione: **questo piano non tocca quei tre punti** e non ne aggiunge un quarto. Di quel guardiano si ritocca una sola attesa (Task 10, Step 3): «Scegli le fasi» non inserisce più le fasi dal client ma da una RPC che prende l'azienda dalla commessa, e il conto degli inserimenti diretti passa da due a uno.
- Telefono: scheda di commessa e dialog «Fasi di lavoro» restano com'erano (le sottofasi stanno nella fase aperta); la pagina di impostazioni è solo da tablet/computer (`HIDDEN_ON_MOBILE`). Nell'app di cantiere (pensata per il telefono): caselle da 44 px, niente spazio bianco in più.
- Italiano semplice nei testi; niente gergo («RPC», «trigger» non compaiono nell'interfaccia). Mai «checklist» (nel cantiere è la sicurezza giornaliera) né «passi» (sono i passi del flusso di lavoro): si dice **fasi** e **sottofasi**.
- Typecheck a cricchetto: nessun errore nuovo (tsconfig ristretto nella radice, con `src/vite-env.d.ts` e `src/test/setup.ts`; memoria `reference_typecheck_mirato`). Le tabelle nuove non sono nei tipi generati: cast localizzati `supabase as any` con commento.

---

## 0. Come ho capito le richieste

1. **«Ogni fase potrebbe avere sotto varie sottofasi che determinano lo stato avanzamento della fase.»** Una fase ha una lista di passi (sottofasi). Quando ne ha, l'avanzamento della fase è la parte di lavoro (pesata) già fatta. Segnare una sottofase aggiorna la fase e, a cascata, la commessa.
2. **«Ogni azienda quando crea una commessa e clicca "Scegli le fasi" sceglie da template; ogni azienda dovrebbe impostare nelle Impostazioni i suoi template.»** Il bottone sta nella scheda **Lavorazioni** della commessa (`GuidaCantiere` quando è vuota, «Aggiungi fasi» altrimenti); `CreateOrder` non ha un passo sulle fasi.
3. **«I modelli: più puoi toglierli, intendo gli 8, e modificali.»** I modelli non sono una lista fissa uguale per tutti: gli 8 di oggi (58 nomi di fasi, nel codice) diventano **dell'azienda**, che li cambia, li toglie e ne aggiunge. (Nella prima versione del piano erano di sola lettura, da «duplicare»: era troppo poco.)
4. **«Rianalizza tutto il sistema e il collegamento con l'area dell'operaio, capocantiere ecc. che gestisce le cose.»** Ho letto l'app di cantiere, il database (trigger, funzioni, RLS), l'ufficio, e i consumatori fuori da questi (assistente Silvio, MCP, automazioni, portale, PDF), e controllato i numeri sul database vero. Il risultato è la §0.bis, e ha cambiato il piano.
5. **«Sviluppa per bene un piano.»** Più la proposta che hai approvato (peso nella media, SAL «meno precedenti»). L'ordine di rilascio è in §5.

**Come la proposta di prima si ritrova qui:**

| Nella proposta | Nel piano |
|---|---|
| «Passi pesati» come metodo di avanzamento | **Sono le sottofasi** (M1, M3). |
| Metodo di avanzamento scelto per azienda e per fase | **Non serve un interruttore**: una fase con sottofasi deriva da esse, una senza resta dichiarata come oggi. |
| «Fatto / non fatto» esplicito | Una fase con **una sola sottofase**, o il cerchio già presente in «Avanzamento lavori». |
| Peso nella media (uguale / venduto / costo) | **M4**: alla pari / per durata / per venduto (il costo previsto non c'è: solo il 12% delle assegnazioni ha una fase). |
| SAL «meno precedenti» | **M5**, dopo la tua conferma. |
| Quantità eseguite con unità di misura, SAL «a misura» | **Fuori piano**: non esistono né l'unità né la quantità eseguita nel database (§5, domanda 6). |

## 0.bis Il collegamento con il cantiere: com'è oggi, cosa cambia, cosa ho trovato

### I numeri veri (produzione, 07/10/2026)

L'app di cantiere è agli inizi, e questo pesa sulle scelte: **11 commesse su 598** hanno persone di cantiere, **2** hanno un capocantiere, gli utenti di cantiere sono **5** (3 operai, 2 ditte); 7 squadre interne, 11 righe «squadra su una fase»; **40 fasi su 99** hanno almeno una persona o ditta; **nessuna azienda ha scelto regole** in «Rapportini e presenze» (tutte usano i valori di partenza); 113 rapportini, 105 approvati, di cui 90 dichiarano una fase (una sola, sempre). Quindi: i default devono essere **identici a oggi**, e le scelte semplici.

### Chi è chi (fatti letti nel codice)

- **Ufficio.** «Ordini e Commesse» (`can_edit_orders`) crea e modifica fasi, assegna persone, ditte e squadre alle fasi, approva i rapportini (con ruolo admin/staff). `can_edit_operai` gestisce squadre e note. Il **capocantiere** si nomina in «Squadra e mezzi» (`AppCantiere`), solo fra chi ha già un accesso come dipendente; il **caposquadra** non è un ruolo di commessa: è il responsabile di una squadra legata alla commessa.
- **Accesso al cantiere.** Una persona messa su una fase vede la commessa nell'app *per i giorni della fase* (il database tiene allineate le righe di accesso a date e fasi); una fase senza date, o nessuna fase, dà accesso per tutta la commessa. Le sottofasi non hanno date né persone: **non toccano gli accessi**.
- **I flag di ruolo dell'app** (`campo_mio_ruolo` + `CampoRapportino`): `capocantiere`, `esisteCapo`, `caposquadra`; `puoDichiararePercentuali` = capocantiere, **oppure** nessun capo sulla commessa; l'operaio «semplice» = c'è un capo e io non lo sono.

### Le tre strade con cui l'avanzamento arriva oggi

| Strada | Chi | Cosa scrive | Quando vale |
|---|---|---|---|
| **Avanzamento lavori** | operaio, caposquadra, capo, ditta | vede **tutte** le fasi delle sue commesse (non c'è un filtro «la mia fase»: il commento nel codice dice «nessun gate applicativo»); chiude la fase (100, `completata_da/il`) o la riapre (**50%**); foto | **subito** |
| **Rapportino** | il capocantiere (o chiunque se non c'è un capo) con lo slider; l'operaio tocca solo «su cosa ho lavorato» | `campo_rapportini.fasi_lavorate = [{ phase_id, percentuale }]`; la voce serve anche ad attribuire le ore (solo se la voce è UNA) e ai giorni reali del Cronoprogramma | **all'approvazione** dell'ufficio: `max(attuale, dichiarata)`, solo in salita, ≥100 chiude |
| **Ufficio** | `can_edit_orders` | rettifica la %, cambia stato, chiude | subito |

La commessa è la **media semplice** delle fasi (trigger), ma la % di fase/commessa si calcola in **quattro punti indipendenti** (rollup nel database, semaforo dei tempi `order_schedule_health`, `avanzamentoFase/avanzamentoComplessivo` in TypeScript, e un calcolo proprio in `OrderDetail.tsx`) e in due punti si legge la % grezza (`OrderWorkPhases:940`, `CampoLavoroDetail:867`).

### Cosa vede ciascuno nell'app di cantiere

`/campo` (home, rapportini da inviare), «Oggi» (per cantiere: «Fai: i nomi delle **mie** fasi», solo fasi con date che coprono il giorno e assegnate a me, alla mia squadra o alla mia ditta), «Lavori» (calendario di cantieri con la % di *commessa*), `/lavoro/:id` (la scheda: **fasi in sola lettura** con % e i segni «Tu»/squadra, note dell'ufficio, «Chiudi giornata»), `/avanzamento`, il rapportino. **Non c'è un elenco spuntabile**, **non ci sono avvisi di fase** per gli operai (assegnazione, date, chiusura), **né una coda offline** per Avanzamento e rapportino (il vocale sì, solo per se stesso).

### Cosa cambia per ciascun ruolo

| Ruolo | Oggi | Con il piano |
|---|---|---|
| **Ufficio** | crea le fasi, assegna chi le fa, rettifica la %; approva il rapportino senza vedere quali fasi cambieranno | divide le fasi in sottofasi (a mano, da un modello, da una commessa riuscita); dove ci sono sottofasi la % non si rettifica a mano; **in approvazione vede cosa cambia** («Impianto elettrico 33% → 67%, spunte: Cavi, Quadro») |
| **Capocantiere** | dichiara una % con lo slider nel rapportino | **spunta le sottofasi** nel rapportino (valgono all'approvazione) e in Avanzamento; la sua scheda mostra «x di y sottofasi» |
| **Caposquadra** | come l'operaio; nel rapportino la % solo se non c'è un capo | spunta in Avanzamento secondo la regola dell'azienda; nel rapportino solo se non c'è un capo (come oggi) |
| **Operaio** | chiude le fasi in Avanzamento; nel rapportino tocca le fasi per le ore | spunta in Avanzamento secondo la regola dell'azienda (**di partenza: come oggi, tutti**); vede «x di y sottofasi» nella scheda |
| **Ditta / subappaltatore** | come l'operaio | come l'operaio; con la regola «chi fa quella fase» spunta solo le sue |
| **Cliente** | non vede fasi né % (il portale mostra gli stati ordine); gli assistenti AI gli dicono la % di *commessa* | invariato: la % di commessa che gli dicono segue le sottofasi |
| **Silvio / WhatsApp** | approvare un rapportino da lì **non applica l'avanzamento** (lo fa solo il browser) | l'avanzamento si applica dal database: vale per ogni via |

### Cosa ho trovato, e come il piano lo gestisce

| # | Trovato | Gravità | Nel piano |
|---|---|---|---|
| 1 | La prima bozza dava alle sottofasi una RLS «per azienda»: uno staff con «Solo i propri» avrebbe letto e modificato le sottofasi di commesse non sue (e, via ricalcolo, cambiato la % delle loro fasi). | alta | **M1:** le sottofasi seguono la fase (`exists` sulla fase, `can_see_order` per chi scrive). |
| 2 | `order_id` copiato sulle sottofasi diventava stantio se una fase cambia commessa (il database lo permette a chi ha `can_edit_orders`). | media | **M1:** niente copia: la commessa si legge dalla fase. |
| 3 | «% scritta e poi riscritta»: un'app di cantiere vecchia (si aggiorna a giorni), l'approvazione di un rapportino scritto prima, una chiamata diretta scrivono `percentuale`/`stato` di una fase che deriva da sottofasi; il valore sbagliato resterebbe fino alla spunta dopo. | alta | **M1:** il trigger `BEFORE UPDATE` riscrive dal calcolo (provato: 24 controlli). |
| 4 | Approvare un rapportino con Silvio (o con una chiamata) cambia lo stato ma **non applica l'avanzamento**: lo applica solo il browser. Oggi 15 rapportini su 105 sono stati approvati così, **nessuno** dichiarava fasi: nessun danno finora, ma la trappola c'è. | media | **M3 / T15:** trigger sul rapportino (stessa condizione di quello del costo ore). |
| 5 | Il dialogo «Controlla e approva il rapportino» mostra persone, ore e costi, **non** le fasi che l'approvazione fa avanzare: le spunte passerebbero alla cieca. | media | **M3 / T18:** blocco «Avanzamento che passa in commessa». |
| 6 | La % si calcola in quattro punti diversi; con un peso diverso dalla media i numeri divergerebbero (e `OrderDetail` alimenta economia, esposizione e alert di scostamento SAL). | media | **M4 / T24:** con un peso diverso da «alla pari» tutte e tre le schermate leggono la % del database; con «alla pari» non cambia un numero. |
| 7 | In Avanzamento ogni assegnato può chiudere **qualunque** fase. Per le sottofasi serve una scelta, per azienda. | scelta | **M4 / T21-22:** regola «chi spunta», valida nel database. |
| 8 | La scheda del cantiere (`/lavoro/:id`) mostra solo la % delle fasi; «Oggi» solo i nomi. | bassa | **M3 / T19:** «x di y sottofasi» nella scheda. «Oggi» resta fuori (serve estendere `campo_mia_giornata`). |
| 9 | Nessuna coda offline per Avanzamento e rapportino. In cantiere con poco segnale una spunta può fallire. | nota | Fuori piano (limite già esistente); l'errore si legge e si riprova. |
| 10 | Ogni spunta cambia `orders.percentuale_avanzamento`, e a catena: `orders.version`+1 (un salvataggio aperto in `EditOrder` può dare 40001), flussi «commessa aggiornata», log attività, WhatsApp al cliente a 50/75/100%, evento «fase completata» (senza dedup). Non peggiora il quadro (oggi succede con lo slider), ma succede **più spesso**. | nota | Scritto qui; nessuna modifica. |
| 11 | «Fase» ha sei significati nel codice, e la pagina «Stati ordine» si descrive come «fasi di lavorazione degli ordini». | nota | Nell'interfaccia: **fasi di lavoro**, **sottofasi**; mai «checklist» (cantiere: sicurezza) né «passi» (flusso). |

**Trovati e non toccati** (altri argomenti, da sapere): `OrdinePDF` legge `sal.percentuale_avanzamento`, colonna che `sal_records` non ha (stampa sempre «—»); `cg_get_marginalita_commesse` tratta la % come 0–1 mentre vale 0–100 (Silvio la legge male); la maturazione delle rate «al SAL n°» legge `public.sal` mentre la schermata scrive `sal_records` (riguarda M5); il modello email T24 usa variabili (`fase.nome`) che il payload non porta; una ditta con solo un contratto di subappalto non ha accesso alle fasi; i rapportini nati da WhatsApp restano `bozza` (l'ufficio non li vede e fanno tacere i promemoria); il connettore MCP ha **54** strumenti, non 37, e nessuno tocca le fasi.

## 1. Decisioni di progetto

| # | Decisione | Perché | Scartato |
|---|---|---|---|
| 1 | Una fase con sottofasi **deriva** da esse; senza, resta dichiarata (slider / chiusura). | Nessuna migrazione dei dati: 18 commesse su 598 hanno fasi e restano come sono. | Un «metodo di avanzamento» scelto a mano su ogni fase. |
| 2 | Sottofase = **fatta / non fatta** + **peso** intero 1–100 (default 1). | Il 92% delle fasi reali è 0 o 100: la checklist dà le percentuali intermedie. | Percentuale per sottofase (due livelli di slider). Quantità eseguite: fuori piano. |
| 3 | **Il database riscrive** percentuale, stato e chiusura di una fase con sottofasi (trigger `BEFORE UPDATE`) e le riallinea dopo ogni spunta; il client mostra, non decide. | Un'app vecchia o una chiamata diretta non lasciano mai una fase incoerente. Il calcolo sta in **un solo** punto (`fase_avanzamento_derivato`). | Solo controlli disabilitati nella schermata. |
| 4 | Le sottofasi **non hanno** `company_id` né `order_id`: la fase le porta con sé. | Nessuna copia stantia; la RLS le fa seguire la commessa; il backup le prende dalla fase madre (provato: `admin_backup_tabelle_scoperte()` vuota). | Colonne copiate con un trigger di sincronizzazione sulle fasi. |
| 5 | Dal cantiere si scrive solo `fatta` (ora e persona le mette il database). | Come il 06/10 per le fasi. | Una policy sola. |
| 6 | **I modelli sono dell'azienda.** Tre tabelle chiuse in scrittura + RPC atomiche; gli 8 di partenza le vengono consegnati la prima volta che apre la pagina (una volta sola; «Ripristina i predefiniti» rimette quelli che mancano). Fino ad allora «Scegli le fasi» offre gli stessi 8 di oggi (dopo i modelli che l'azienda avesse già salvato da una commessa, senza ripetere quelli con lo stesso nome). | È quello che hai chiesto; nessun cambiamento per chi non entra nelle impostazioni; nessun seed da mantenere in ogni azienda. | Modelli base di sola lettura da «duplicare» (prima versione). Seed in tutte le aziende. |
| 7 | «Scegli le fasi» applica con una RPC (`aggiungi_fasi_commessa`): fasi e sottofasi in un colpo solo. | Il permesso in un punto; il guardiano `faseCampiProtetti` resta vero. | Due INSERT dal client. |
| 8 | **L'avanzamento dichiarato si applica all'approvazione dal database** (trigger su `campo_rapportini`), e il browser dell'ufficio continua a fare la stessa cosa (innocuo: stesso risultato). | Vale per Silvio e per ogni chiamata; non si tocca il codice dell'approvazione né il guardiano. | Spostare/riscrivere il codice del browser. |
| 9 | **Chi spunta** per azienda: `tutti` (come oggi, di partenza), `chi_la_fa`, `capi` — valida nel database. | Il cantiere è agli inizi e ogni azienda lavora a modo suo; la regola riusa `campo_mio_ruolo` e `campo_mie_fasi`. | Una regola fissa; una regola solo nella schermata. |
| 10 | **Peso nella media** per azienda: `uguale` (default), `durata`, `venduto`, con ricaduta su `uguale` se mancano i dati. Il numero lo calcola **solo il database**: con un peso diverso da «alla pari» le tre schermate lo leggono da lì; con «alla pari» (il default) tengono il calcolo di oggi, decimali compresi, e non parte nessuna lettura in più. Non c'è un secondo calcolo dei pesi in TypeScript. | Oggi 0 fasi hanno il venduto e 81 su 99 hanno le date. Un solo numero ovunque, e per chi non sceglie niente non cambia un decimale. | Replicare i pesi nel client (diverge se manca il permesso sugli importi); leggere sempre il numero del database (cambierebbe i decimali della proiezione del margine per tutti). |
| 11 | SAL: «meno SAL precedenti» (netto da fatturare). «A misura» **solo dopo la tua decisione**. | Tocca soldi e un PDF per il cliente. | — |

## 2. Modello dati

```
orders ─< order_work_phases (percentuale, status, importo_venduto, …)                       ← colonne invariate
              └─< order_work_subphases (name, position, peso, fatta, fatta_il, fatta_da)    [NUOVA, senza company_id/order_id]
campo_rapportini.fasi_lavorate = [ { phase_id, percentuale, sottofasi_fatte?: uuid[] } ]      (jsonb: una chiave in più, nessun DDL)

companies ─┬─< work_phase_templates (name, hint, position)                                  [NUOVA]
           │         └─< work_phase_template_phases (name, position)                         [NUOVA]
           │                   └─< work_phase_template_subphases (name, position, peso)      [NUOVA]
           └─1 company_fasi_settings (modelli_inizializzati, chi_spunta, peso_media)         [NUOVA, colonne aggiunte per tappa]
```

## 3. Regole di calcolo dopo il piano

| Situazione | Percentuale della fase | Stato della fase |
|---|---|---|
| Fase **senza** sottofasi | dichiarata (slider, rettifica, chiusura): **come oggi** | come oggi |
| Fase **con** sottofasi | `round(100 × peso fatto / peso totale)` — la scrive il database, qualunque cosa si provi a scrivere | `100%` → `completata` (con `completata_il` e `completata_da`); `>0%` → `in_corso`; `0%` → l'ufficio sceglie tra `da_iniziare` e `in_corso`, e una fase chiusa si riapre `in_corso` |
| Si riapre una sottofase (o se ne aggiunge una non fatta) a una fase `completata` | ricalcolata, `<100%` | torna `in_corso`, chiusura svuotata |
| Si toglie l'ultima sottofase | resta l'ultimo valore | invariato: la fase torna «dichiarata» |
| **Approvazione di un rapportino** (qualunque via) | le voci con `sottofasi_fatte` segnano quelle sottofasi «fatte»; una voce senza spunte su una fase con sottofasi non fa niente; le altre: `max(attuale, dichiarata)`, solo in salita | ≥100 chiude; >0 apre |
| Commessa | media semplice delle fasi (`uguale`); pesata per `durata`/`venduto` dalla M4 | — |

La fase `completata` conta 100 anche con `percentuale` a 0 (`avanzamentoFase`).

## 4. File

| File | Cosa | Tappa |
|---|---|---|
| Crea `src/lib/orders/sottofasi.ts` | Avanzamento da sottofasi, specchio dello stato di una fase, raggruppo per fase, voci del rapportino con le spunte, messaggio d'errore leggibile | M1, M3 |
| Crea `supabase/migrations/20281007130000_sottofasi_commessa.sql` | Tabella, calcolo unico, trigger che riscrive la fase, ricalcolo, guardia, RLS | M1 |
| Crea `src/hooks/useSottofasi.ts`, `src/components/orders/SottofasiFase.tsx` | Lettura e scritture; la checklist nella fase aperta | M1 |
| Modifica `src/lib/orders/refreshWorkQueries.ts`, `src/components/orders/OrderWorkPhases.tsx` | Chiavi da aggiornare; sottofasi nella fase; fase derivata: stato e «Rettifica» spenti | M1 |
| Crea `src/lib/orders/modelliFasi.ts`, `src/hooks/useModelliFasi.ts` | Modelli dell'azienda e di partenza, bozze, validazione, riordino; lettura/scrittura | M2 |
| Crea `supabase/migrations/20281007140000_modelli_fasi_azienda.sql` | Tre tabelle dei modelli, `company_fasi_settings`, 5 RPC | M2 |
| Crea `src/components/orders/ModelliFasiPicker.tsx`, `SalvaFasiComeModello.tsx`; modifica `OrderWorkPhases.tsx`, `useOrderWorkPhases.ts` | «Parti da un modello» con i modelli dell'azienda; «Salva come modello»; `applyTemplate` chiama la RPC | M2 |
| Crea `src/pages/azienda/settings/SettingsModelliFasi.tsx`, `src/components/settings/ModelliFasiConfig.tsx`, `ModelloFasiEditor.tsx`; modifica la registrazione (`companyRoutes.tsx`, `CompanyLayout.tsx`, `SettingsLayout.tsx`, `SettingsSearch.tsx`, `pianoImpostazioni.ts`, `SettingsMobileHub.tsx`) | Pagina «Modelli di fasi» (dalla M4: «Fasi e avanzamento») | M2, M4 |
| Crea `supabase/migrations/20281007141000_rapportino_applica_avanzamento.sql` | L'avanzamento dichiarato si applica all'approvazione, dal database | M3 |
| Modifica `src/pages/campo/CampoAvanzamento.tsx`, `CampoRapportino.tsx`; crea `src/components/campo/SottofasiRapportino.tsx` | Checklist in Avanzamento e nel rapportino del capo | M3 |
| Crea `src/lib/orders/anteprimaAvanzamento.ts`, `src/components/orders/AvanzamentoDaApprovare.tsx`; modifica `LaborApprovalDialog.tsx` | «Avanzamento che passa in commessa» nell'approvazione | M3 |
| Crea `src/components/campo/SottofasiContate.tsx`; modifica `CampoLavoroDetail.tsx` | «x di y sottofasi» nella scheda del cantiere | M3 |
| Crea `supabase/migrations/20281007143000_chi_spunta_sottofasi.sql`, `src/lib/orders/chiSpunta.ts`, `src/hooks/useChiSpunta.ts`, `src/components/settings/ChiSpuntaConfig.tsx` | Regola «chi può spuntare» | M4 |
| Crea `supabase/migrations/20281007150000_peso_media_avanzamento.sql`, `src/lib/orders/avanzamentoCommessa.ts`, `src/hooks/usePesoMediaFasi.ts`, `useAvanzamentoCommessa.ts`, `src/components/settings/AvanzamentoCommessaConfig.tsx`; modifica `OrderWorkPhases.tsx`, `CronoprogrammaCommessa.tsx`, `OrderDetail.tsx`, `refreshWorkQueries.ts` | Peso nella media; con un peso diverso da «alla pari» la % si legge dal database ovunque | M4 |
| Crea `src/lib/orders/salNetto.ts` e `supabase/functions/_shared/salNetto.ts`; modifica `SalTab.tsx`, `generate-sal-pdf/index.ts` | «Meno SAL precedenti» | M5 (dopo l'OK) |
| Test nuovi | uno per modulo, migrazione e componente (vedi ogni task), più `sottofasiCantiere.test.ts` (chi scrive le sottofasi) | tutte |
| Test da ritoccare | `orderWorkPlanning.test.tsx`, `commessaTelefono.test.tsx` (finti dei nuovi hook), `campoRapportinoRegole.test.tsx` (fasi e sottofasi nel harness), il test del dialogo di approvazione (finto del nuovo componente); si **lanciano** `faseCampiProtetti.test.ts`, `impostazioniDelPiano.test.tsx` e tutta la suite `src/test/logic` (i guardiani delle migrazioni) | tutte |

## 5. Ordine di rilascio

| Tappa | Cosa ottiene l'azienda | Migrazione | Da sola è utile perché |
|---|---|---|---|
| **M1 — Sottofasi** (ufficio) | In ogni fase l'ufficio aggiunge le sottofasi e le segna; la percentuale della fase e della commessa si calcola da sola, e nessun client la può sporcare. | `20281007130000` | È il cuore dell'idea; funziona già dalla scheda di commessa. |
| **M2 — Modelli dell'azienda** | Impostazioni → «Modelli di fasi»: gli 8 modelli sono suoi, li cambia, li toglie, ne crea; «Scegli le fasi» offre i suoi, con le sottofasi; «Salva come modello» da una commessa riuscita. | `20281007140000` | Risolve il secondo punto della tua richiesta. |
| **M3 — Dal cantiere e all'approvazione** | Il capocantiere spunta nel rapportino, l'operaio in Avanzamento; l'approvazione (anche da Silvio) applica l'avanzamento; l'ufficio vede cosa cambia prima di approvare; la scheda del cantiere mostra «x di y sottofasi». | `20281007141000` | Chiude il giro con chi sta in cantiere. |
| **M4 — Regole dell'azienda** | **Chi può spuntare** (tutti / chi fa la fase / solo i capi) e **come pesare le fasi** nella commessa (alla pari / durata / venduto); la percentuale è la stessa ovunque. | `20281007143000`, `20281007150000` | Ogni azienda mantiene il suo modo di lavorare. |
| **M5 — SAL netto** | Il verbale mostra «maturato − già fatturato = da fatturare ora». | da decidere | Solo dopo il tuo OK sulla definizione di «già maturato». |

**Già verificato il 07/10/2026** (senza applicare niente):
- L'SQL delle **cinque migrazioni** e le loro prove (Task 3, 9, 15, 21, 23) sono stati lanciati su produzione, sull'azienda demo, **dentro una transazione annullata** (una `execute_sql` è una transazione sola: l'ho controllato con una tabella di prova, che non è rimasta). Tutti i controlli passano: percentuale e stato riscritti dal database anche se un client scrive altro; permessi di un operaio assegnato, di un amministratore e di un utente di un'altra azienda; l'approvazione che applica sottofasi e percentuali e salta le voci rotte; la regola «chi spunta» in tutte e tre le forme; con «alla pari» **nessuna commessa vera cambia numero**; il backup non lascia tabelle scoperte.
- La prova ha trovato **due difetti miei** prima di scrivere codice: la regola «chi spunta» veniva letta con i diritti dell'operaio (che non può leggere le impostazioni), e la prima bozza delle sottofasi aveva una RLS sbagliata per lo staff «Solo i propri».
- **Tutto il codice del piano** (i file nuovi e le modifiche a quelli esistenti) è stato applicato, come scritto qui, in una copia pulita del repository: i 30 file di test nuovi o toccati passano (277 casi); la suite completa `logic` + `ui` ha **gli stessi 28 casi rossi di prima** (10 file che non c'entrano, elencati nella verifica finale) e **nessuno nuovo**, guardiani delle migrazioni compresi; il controllo dei tipi non peggiora nessun file e i file nuovi sono puliti; `deno check` della funzione del PDF passa. La copia è stata cancellata: nel repo restano il piano e due commit di riparazione (qui sotto).
- **Due riparazioni a lavori miei di oggi** che il controllo ha trovato (commit locali, non pushati): `1e41c3313`, i test `orderWorkPlanning` e `commessaTelefono` erano rossi (25 casi) dal mio commit `32dc3a3aa` (l'alert di scostamento SAL); `1f596a6d8`, un errore di tipo in `SalTab` (commit `2ef6b16bc`) che il cricchetto dei tipi avrebbe contato. Un solo ritocco al lavoro di **un'altra sessione**, descritto nel Task 10: il suo guardiano `faseCampiProtetti.test.ts` conta due inserimenti diretti di fasi e ora ne resta uno.
- Nel registro delle migrazioni di produzione c'è già `20281006170000`, non presente in questo branch (viene da un'altra sessione): non confligge con le versioni di questo piano.

**Decisioni che mi servono** (le prime non bloccano M1–M3):
1. **OK per applicare le migrazioni in produzione**, una alla volta, ognuna preceduta dalla prova a secco (già verde).
2. `20281007120000_campo_regole_ore_proprie.sql` (rapportini «ore proprie») è ancora **solo un file**: senza applicarla, scegliere quell'opzione dà «Scelta non valida». Va applicata prima del prossimo push.
3. **Approvazioni di Silvio:** oggi non applicano l'avanzamento; con la M3 lo applicano (è il comportamento di sempre per l'ufficio). Va bene?
4. **Chi spunta, di partenza:** `tutti` (come oggi). Confermi, o per le nuove aziende preferisci `chi_la_fa`?
5. Semaforo margine: tenere le soglie fisse 30/20 o passare alla soglia configurata (`marginalita_soglia_perc`)? Cambierebbe i colori per tutti.
6. SAL «a misura» (quantità eseguita × prezzo unitario): serve, o i contratti sono tutti «a corpo»? (richiede unità di misura e quantità nelle voci).
7. SAL: «già maturato» = SAL emessi/approvati/firmati con numero minore (bozze escluse), netto negativo = «Rettifica». Va bene?
8. Approvazione ufficio obbligatoria sulle ore (le ore non approvate non devono pesare sui costi?); fatturazione a SAL (quale rata/fattura); SAL per i subappaltatori.

---

# Tappa M1 — Sottofasi (database + ufficio)

### Task 1: logica pura delle sottofasi

**Files:**
- Create: `src/lib/orders/sottofasi.ts`
- Test: `src/test/logic/sottofasi.test.ts`

- [ ] **Step 1: scrivi i test che falliscono**

```ts
// src/test/logic/sottofasi.test.ts
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import {
  avanzamentoDaSottofasi,
  faseHaSottofasi,
  messaggioErrore,
  riepilogoSottofasi,
  sottofaseDaRiga,
  sottofasiPerFase,
  statoFaseDaAvanzamento,
} from "@/lib/orders/sottofasi";

const s = (peso: number, fatta: boolean) => ({ peso, fatta });

describe("avanzamentoDaSottofasi", () => {
  it("senza sottofasi non c'è un avanzamento derivato", () => {
    expect(avanzamentoDaSottofasi([])).toBeNull();
  });
  it("pesi uguali: parte fatta sul totale", () => {
    expect(avanzamentoDaSottofasi([s(1, true), s(1, false), s(1, false), s(1, false)])).toBe(25);
  });
  it("pesi diversi: conta il peso, non il numero", () => {
    expect(avanzamentoDaSottofasi([s(3, true), s(1, false)])).toBe(75);
  });
  it("arrotonda come il database: 1/8 = 12,5 → 13", () => {
    expect(avanzamentoDaSottofasi(Array.from({ length: 8 }, (_, i) => s(1, i === 0)))).toBe(13);
  });
  it("tutte fatte 100, nessuna 0", () => {
    expect(avanzamentoDaSottofasi([s(2, true), s(5, true)])).toBe(100);
    expect(avanzamentoDaSottofasi([s(2, false)])).toBe(0);
  });
  it("un peso non valido conta 1", () => {
    expect(avanzamentoDaSottofasi([s(0, true), s(-4, false)])).toBe(50);
  });
});

describe("statoFaseDaAvanzamento (specchio di fase_avanzamento_derivato)", () => {
  it.each([
    // [stato di prima, %, stato che si prova a scrivere, stato che resta]
    ["da_iniziare", 0, "da_iniziare", "da_iniziare"],
    ["in_corso", 0, "in_corso", "in_corso"],
    ["completata", 0, "completata", "in_corso"],      // una fase chiusa con sottofasi da fare si riapre
    ["in_corso", 0, "da_iniziare", "da_iniziare"],    // a 0% l'ufficio sceglie lo stato
    ["da_iniziare", 0, "in_corso", "in_corso"],
    ["da_iniziare", 0, "completata", "da_iniziare"],  // non si chiude da sola
    ["in_corso", 40, "da_iniziare", "in_corso"],      // sopra lo 0% decide il calcolo
    ["completata", 80, "completata", "in_corso"],
    ["da_iniziare", 100, "da_iniziare", "completata"],
    ["completata", 100, "completata", "completata"],
  ] as const)("era %s, %s%%, si prova a scrivere %s → %s", (precedente, percentuale, proposto, atteso) => {
    expect(statoFaseDaAvanzamento(precedente, percentuale, proposto)).toBe(atteso);
  });
  it("senza uno stato proposto vale quello di prima", () => {
    expect(statoFaseDaAvanzamento("completata", 50)).toBe("in_corso");
    expect(statoFaseDaAvanzamento("in_corso", 0)).toBe("in_corso");
  });
});

describe("riepilogoSottofasi e faseHaSottofasi", () => {
  it("conta fatte e totali", () => {
    expect(riepilogoSottofasi([{ fatta: true }, { fatta: false }, { fatta: true }])).toEqual({ fatte: 2, totale: 3 });
    expect(riepilogoSottofasi([])).toEqual({ fatte: 0, totale: 0 });
  });
  it("una fase deriva dalle sottofasi solo se ne ha almeno una", () => {
    expect(faseHaSottofasi(undefined)).toBe(false);
    expect(faseHaSottofasi([])).toBe(false);
    expect(faseHaSottofasi([{}])).toBe(true);
  });
});

describe("sottofasiPerFase", () => {
  it("raggruppa per fase e ordina per posizione", () => {
    const m = sottofasiPerFase([
      { id: "c", phase_id: "p1", position: 2 },
      { id: "a", phase_id: "p1", position: 0 },
      { id: "x", phase_id: "p2", position: 0 },
      { id: "b", phase_id: "p1", position: 1 },
    ]);
    expect(m.get("p1")!.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(m.get("p2")!.map((r) => r.id)).toEqual(["x"]);
    expect(m.get("p3")).toBeUndefined();
  });
});

describe("sottofaseDaRiga", () => {
  it("normalizza una riga del database e ignora l'incorporato della fase", () => {
    expect(sottofaseDaRiga({ id: "s1", phase_id: "p1", name: "Tracce", position: 2, peso: 3, fatta: true, fatta_il: "2026-10-07T08:00:00Z", fase: { order_id: "o1" } })).toEqual({
      id: "s1", phase_id: "p1", name: "Tracce", position: 2, peso: 3, fatta: true, fatta_il: "2026-10-07T08:00:00Z",
    });
  });
  it("riempie i vuoti: peso 1, non fatta", () => {
    expect(sottofaseDaRiga({ id: "s1", phase_id: "p1" })).toEqual({
      id: "s1", phase_id: "p1", name: "", position: 0, peso: 1, fatta: false, fatta_il: null,
    });
  });
});

describe("messaggioErrore", () => {
  it("legge il messaggio di un errore di Supabase (un oggetto, non un Error)", () => {
    expect(messaggioErrore({ code: "42501", message: "Le sottofasi le spunta il capocantiere." })).toBe("Le sottofasi le spunta il capocantiere.");
  });
  it("legge anche un Error e una stringa", () => {
    expect(messaggioErrore(new Error("Rete assente"))).toBe("Rete assente");
    expect(messaggioErrore("Boom")).toBe("Boom");
  });
  it("senza messaggio usa quello di riserva", () => {
    expect(messaggioErrore(null)).toBe("Operazione non riuscita. Riprova.");
    expect(messaggioErrore({ message: "  " }, "Non riesco a salvare")).toBe("Non riesco a salvare");
  });
});

describe("refreshWorkQueries", () => {
  it("aggiorna anche le sottofasi della commessa", () => {
    const qc = new QueryClient();
    const spia = vi.spyOn(qc, "invalidateQueries");
    refreshWorkQueries(qc, "o1");
    expect(spia).toHaveBeenCalledWith({ queryKey: ["order_work_subphases", "o1"] });
    expect(spia).toHaveBeenCalledWith({ queryKey: ["campo-sottofasi"] });
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/logic/sottofasi.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/orders/sottofasi"`.

- [ ] **Step 3: scrivi il modulo**

```ts
// src/lib/orders/sottofasi.ts
/**
 * Sottofasi di una fase di lavoro (07/10/2026).
 *
 * Una fase che ha sottofasi ne deriva l'avanzamento: la parte di peso già
 * fatta. Il calcolo vero lo fa il database (fase_avanzamento_derivato, applicato
 * da un trigger a ogni scrittura della fase); qui c'è lo specchio, per mostrare
 * l'anteprima e per tenere le regole scritte e provate in un posto solo.
 * Modulo puro: nessun React, nessun Supabase.
 */
import type { PhaseStatus } from "@/hooks/useOrderWorkPhases";

export interface Sottofase {
  id: string;
  phase_id: string;
  name: string;
  position: number;
  /** Intero 1–100: quanto pesa nel calcolo della fase. */
  peso: number;
  fatta: boolean;
  fatta_il: string | null;
}

const pesoValido = (peso: number): number => (Number.isFinite(peso) && peso >= 1 ? peso : 1);

/** Avanzamento 0–100 di una fase dalle sue sottofasi; `null` se non ne ha. */
export function avanzamentoDaSottofasi(sottofasi: ReadonlyArray<Pick<Sottofase, "peso" | "fatta">>): number | null {
  if (sottofasi.length === 0) return null;
  let totale = 0;
  let fatto = 0;
  for (const s of sottofasi) {
    const peso = pesoValido(s.peso);
    totale += peso;
    if (s.fatta) fatto += peso;
  }
  return Math.round((100 * fatto) / totale);
}

/**
 * Lo stato in cui il database lascia una fase con sottofasi: sopra lo 0% decide
 * il calcolo (100 chiude, il resto è «in corso»); a 0% l'ufficio sceglie tra «da
 * iniziare» e «in corso», e una fase che era chiusa si riapre.
 */
export function statoFaseDaAvanzamento(
  precedente: PhaseStatus,
  percentuale: number,
  proposto: PhaseStatus = precedente,
): PhaseStatus {
  if (percentuale >= 100) return "completata";
  if (percentuale > 0) return "in_corso";
  if (proposto === "da_iniziare" || proposto === "in_corso") return proposto;
  return precedente === "completata" ? "in_corso" : precedente;
}

export function faseHaSottofasi(sottofasi: ReadonlyArray<unknown> | undefined): boolean {
  return (sottofasi?.length ?? 0) > 0;
}

export function riepilogoSottofasi(sottofasi: ReadonlyArray<Pick<Sottofase, "fatta">>): { fatte: number; totale: number } {
  return { fatte: sottofasi.filter((s) => s.fatta).length, totale: sottofasi.length };
}

export function sottofasiPerFase<T extends Pick<Sottofase, "phase_id" | "position">>(righe: ReadonlyArray<T>): Map<string, T[]> {
  const mappa = new Map<string, T[]>();
  for (const riga of righe) {
    const lista = mappa.get(riga.phase_id);
    if (lista) lista.push(riga);
    else mappa.set(riga.phase_id, [riga]);
  }
  for (const lista of mappa.values()) lista.sort((a, b) => a.position - b.position);
  return mappa;
}

export function sottofaseDaRiga(r: Record<string, unknown>): Sottofase {
  return {
    id: String(r.id),
    phase_id: String(r.phase_id),
    name: typeof r.name === "string" ? r.name : "",
    position: Number(r.position) || 0,
    peso: pesoValido(Number(r.peso)),
    fatta: r.fatta === true,
    fatta_il: typeof r.fatta_il === "string" ? r.fatta_il : null,
  };
}

/**
 * Il messaggio di un errore da mostrare. Gli errori di Supabase sono oggetti
 * semplici, non `Error`: senza questo il testo scritto dal database («Le
 * sottofasi le spunta il capocantiere.») si perderebbe dietro un generico.
 */
export function messaggioErrore(e: unknown, predefinito = "Operazione non riuscita. Riprova."): string {
  const m = typeof e === "string" ? e : (e as { message?: unknown } | null)?.message;
  return typeof m === "string" && m.trim() ? m : predefinito;
}
```

- [ ] **Step 4: aggiungi le chiavi a `refreshWorkQueries`**

In `src/lib/orders/refreshWorkQueries.ts` aggiungi `"order_work_subphases"` alla fine di `orderKeys` e `"campo-sottofasi"` alla fine di `sharedKeys`:

```ts
    "campo-rapportini-ordine", "campo-rapportino-gia-oggi", "campo-lavoro-rapportino-oggi",
    "order_work_subphases",
  ];
  const sharedKeys = [
    // …le chiavi che ci sono già restano…
    "campo-rapportini-sospesi", "campo-assignments", "campo-lavori-full", "campo-rapportini-da-compilare", "campo-labor-review",
    "campo-sottofasi",
  ];
```

- [ ] **Step 5: lancia i test, devono passare**

Run: `npx vitest run src/test/logic/sottofasi.test.ts`
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add src/lib/orders/sottofasi.ts src/lib/orders/refreshWorkQueries.ts src/test/logic/sottofasi.test.ts
git commit -m "Sottofasi: logica pura dell'avanzamento di una fase dalle sue sottofasi"
```

### Task 2: la migrazione delle sottofasi (file + test sul testo)

**Files:**
- Create: `supabase/migrations/20281007130000_sottofasi_commessa.sql`
- Test: `src/test/logic/sottofasiMigrazione.test.ts`

- [ ] **Step 1: verifica che la versione sia libera**

Run: `ls supabase/migrations/20281007130000_*.sql`
Expected: `ls: … No such file or directory`.

- [ ] **Step 2: scrivi il test sul testo della migrazione (fallisce: il file non c'è)**

```ts
// src/test/logic/sottofasiMigrazione.test.ts
/**
 * Sottofasi della commessa (07/10/2026): cosa tiene ferma la migrazione.
 * Il comportamento vero si prova sul database (Task 3); qui si impedisce che
 * un ritocco al file tolga una protezione senza che nessuno se ne accorga.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007130000_sottofasi_commessa.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = (nome: string) => codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`))![0];

describe("migrazione sottofasi_commessa", () => {
  it("è rilanciabile e non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toMatch(/create table if not exists public\.order_work_subphases/);
    expect(codice).toMatch(/drop trigger if exists trg_sottofasi_guardia/);
    expect(codice).toMatch(/drop policy if exists sottofasi_lettura/);
  });

  it("le sottofasi non copiano azienda e commessa: seguono la fase", () => {
    const tabella = codice.match(/create table if not exists public\.order_work_subphases \([\s\S]*?\n\);/)![0];
    expect(tabella).not.toMatch(/company_id|order_id/);
    expect(tabella).toMatch(/phase_id uuid not null references public\.order_work_phases\(id\) on delete cascade/);
  });

  it("non aggiunge colonne né vincoli a order_work_phases", () => {
    expect(codice).not.toMatch(/alter table public\.order_work_phases/i);
  });

  it("il calcolo sta in un solo posto e il trigger sulla fase lo applica a ogni scrittura", () => {
    expect(codice).toMatch(/create or replace function public\.fase_avanzamento_derivato/);
    expect(funzione("fase_deriva_da_sottofasi")).toContain("public.fase_avanzamento_derivato(");
    expect(funzione("ricalcola_fase_da_sottofasi")).toContain("public.fase_avanzamento_derivato(");
    expect(codice).toMatch(/create trigger trg_fase_deriva_da_sottofasi\s+before update on public\.order_work_phases\s+for each row/);
  });

  it("la guardia guarda current_user (INVOKER); il calcolo e il ricalcolo scrivono come proprietario (DEFINER)", () => {
    const guardia = funzione("sottofase_guardia");
    expect(guardia).not.toMatch(/security definer/i);
    expect(guardia).toMatch(/current_user not in \('authenticated', 'anon'\)/);
    for (const f of ["fase_avanzamento_derivato", "fase_deriva_da_sottofasi", "ricalcola_fase_da_sottofasi", "trg_sottofasi_ricalcola"]) {
      expect(funzione(f), f).toMatch(/security definer\s+set search_path = public/);
    }
  });

  it("dal cantiere cambiano solo fatta, fatta_il, fatta_da e updated_at", () => {
    expect(codice).toMatch(/v_cantiere constant text\[\] := array\['fatta', 'fatta_il', 'fatta_da', 'updated_at'\];/);
  });

  it("la regola dello stato è quella del piano", () => {
    const calcolo = funzione("fase_avanzamento_derivato");
    expect(calcolo).toMatch(/when p\.pct >= 100 then 'completata'/);
    expect(calcolo).toMatch(/when p\.pct > 0 then 'in_corso'/);
    expect(calcolo).toMatch(/when p_status_proposto in \('da_iniziare', 'in_corso'\) then p_status_proposto/);
    expect(calcolo).toMatch(/when p_status_precedente = 'completata' then 'in_corso'/);
  });

  it("RLS: le sottofasi seguono la fase; scrive l'ufficio con la commessa tra le proprie; il cantiere solo aggiorna", () => {
    expect(codice).toMatch(/alter table public\.order_work_subphases enable row level security;/);
    expect(codice).toMatch(/revoke all on public\.order_work_subphases from anon;/);
    const policy = [...codice.matchAll(/create policy (\w+) on public\.order_work_subphases\s+(?:as restrictive\s+)?for (\w+) to authenticated([\s\S]*?\);)\n/g)]
      .map(([, nome, comando, testo]) => ({ nome, comando, testo }));
    expect(policy.map((p) => `${p.nome}:${p.comando}`).sort()).toEqual([
      "blocco_utente_bloccato:all", "sottofasi_lettura:select", "sottofasi_segna_cantiere:update", "sottofasi_ufficio:all",
    ]);
    const ufficio = policy.find((p) => p.nome === "sottofasi_ufficio")!;
    expect(ufficio.testo).toContain("'can_edit_orders'");
    expect(ufficio.testo.match(/public\.can_see_order\(o\.id, o\.assigned_to, o\.destination_warehouse_id\)/g)).toHaveLength(2);
    expect(policy.find((p) => p.nome === "sottofasi_lettura")!.testo).toContain("from public.order_work_phases f where f.id = order_work_subphases.phase_id");
  });

  it("le funzioni nuove non sono eseguibili da nessuno", () => {
    for (const f of ["fase_avanzamento_derivato(uuid, text, text)", "fase_deriva_da_sottofasi()", "ricalcola_fase_da_sottofasi(uuid)", "trg_sottofasi_ricalcola()", "sottofase_guardia()"]) {
      expect(codice).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
    }
  });

  it("rispetta i guardiani delle migrazioni nuove", () => {
    expect(codice).not.toMatch(/(<>|!=)\s*(public\.)?(get_my_company_id|get_effective_company_id)\(\)/);
    expect(codice).not.toContain("'company_admin'");
  });
});
```

- [ ] **Step 3: lancia il test, deve fallire**

Run: `npx vitest run src/test/logic/sottofasiMigrazione.test.ts`
Expected: FAIL — `ENOENT … 20281007130000_sottofasi_commessa.sql`.

- [ ] **Step 4: scrivi la migrazione**

```sql
-- Sottofasi della commessa: i passi di una fase, che ne determinano l'avanzamento (07/10/2026).
--
-- Oggi l'avanzamento di una fase è una percentuale dichiarata (uno slider a passi
-- di 5 nel rapportino, valido all'approvazione dell'ufficio) e il 92% delle fasi
-- reali è 0 oppure 100. Una fase come «Impianto elettrico» si fa in più passi
-- (tracce, cavi, frutti, quadro, collaudo): con le sottofasi la percentuale la
-- calcola il database, da quanti passi sono fatti, ciascuno col suo peso.
--
-- Cosa fa.
--   · order_work_subphases: una riga per sottofase. NON ha company_id né order_id:
--     azienda e commessa sono quelle della fase, e seguirla è automatico anche
--     se la fase cambia commessa (nessuna copia che diventi stantia).
--   · fase_avanzamento_derivato: l'UNICO posto dove si calcola percentuale e stato
--     di una fase dalle sue sottofasi.
--   · fase_deriva_da_sottofasi (BEFORE UPDATE su order_work_phases): per una fase
--     con sottofasi riscrive percentuale, stato e chiusura dal calcolo, QUALUNQUE
--     cosa il client abbia scritto (un'app vecchia, l'approvazione di un rapportino
--     scritto prima, una chiamata diretta): il database è la fonte, non la schermata.
--     Una fase senza sottofasi non cambia di una virgola.
--   · ricalcola_fase_da_sottofasi + trg_sottofasi_ricalcola (AFTER sulle sottofasi):
--     dopo ogni spunta, inserimento o cancellazione la fase si riallinea.
--   · trg_sottofasi_guardia (BEFORE INSERT/UPDATE, INVOKER: guarda current_user):
--     per chi non ha «Ordini e Commesse» nell'azienda della commessa, cioè
--     l'operaio o la ditta assegnati, si cambia solo se la sottofase è fatta; ora e
--     persona le scrive il database.
--   · RLS: le sottofasi seguono la loro FASE, e quindi la commessa (regola del
--     25/09, 20280926023000): le vede chi vede la fase, le modifica chi può
--     modificare le fasi e ha la commessa tra le sue (can_see_order); chi è
--     assegnato al cantiere può solo aggiornarle (spuntarle).
--
-- Tutto gira come proprietario (SECURITY DEFINER) dove deve scrivere la fase, quindi
-- passa da trg_fase_campi_protetti (20281006150000), che lascia passare chi non è
-- authenticated/anon. Nessuna colonna di order_work_phases cambia e nessun dato
-- viene toccato: una fase senza sottofasi si comporta esattamente come prima.

set local lock_timeout = '3s';

create table if not exists public.order_work_subphases (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.order_work_phases(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  position integer not null default 0,
  peso integer not null default 1 check (peso between 1 and 100),
  fatta boolean not null default false,
  fatta_il timestamptz,
  fatta_da uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_work_subphases_fatta_coerente check (fatta or (fatta_il is null and fatta_da is null))
);

create index if not exists order_work_subphases_fase_idx on public.order_work_subphases (phase_id, position);

-- ---------------------------------------------------------------------------
-- Il calcolo: percentuale e stato di una fase dalle sue sottofasi
--   · senza sottofasi: derivata = false, il resto non conta
--   · con sottofasi: % = parte di peso fatto; 100 → completata; >0 → in corso;
--     a 0% l'ufficio sceglie tra da_iniziare e in_corso, e una fase che era
--     completata si riapre in_corso
-- ---------------------------------------------------------------------------
create or replace function public.fase_avanzamento_derivato(p_phase_id uuid, p_status_proposto text, p_status_precedente text)
returns table (derivata boolean, percentuale integer, stato text)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select coalesce(sum(peso), 0)::integer as tot, coalesce(sum(peso) filter (where fatta), 0)::integer as fatto
      from public.order_work_subphases
     where phase_id = p_phase_id
  ), p as (
    select tot, case when tot > 0 then round(100.0 * fatto / tot)::integer end as pct from t
  )
  select p.tot > 0,
         p.pct,
         case when p.tot = 0 then null
              when p.pct >= 100 then 'completata'
              when p.pct > 0 then 'in_corso'
              when p_status_proposto in ('da_iniziare', 'in_corso') then p_status_proposto
              when p_status_precedente = 'completata' then 'in_corso'
              else p_status_precedente end
    from p;
$$;

-- ---------------------------------------------------------------------------
-- BEFORE UPDATE sulla fase: con sottofasi, percentuale e stato sono quelli del calcolo
-- ---------------------------------------------------------------------------
create or replace function public.fase_deriva_da_sottofasi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  select * into d from public.fase_avanzamento_derivato(new.id, new.status, old.status);
  if not d.derivata then
    return new;
  end if;
  new.percentuale := d.percentuale;
  new.status := d.stato;
  if d.stato = 'completata' then
    new.completata_il := coalesce(new.completata_il, old.completata_il, now());
    new.completata_da := coalesce(new.completata_da, old.completata_da, (select auth.uid()));
  else
    new.completata_il := null;
    new.completata_da := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fase_deriva_da_sottofasi on public.order_work_phases;
create trigger trg_fase_deriva_da_sottofasi
  before update on public.order_work_phases
  for each row execute function public.fase_deriva_da_sottofasi();

-- ---------------------------------------------------------------------------
-- Dopo una spunta, un inserimento o una cancellazione: la fase si riallinea
-- ---------------------------------------------------------------------------
create or replace function public.ricalcola_fase_da_sottofasi(p_phase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.order_work_phases%rowtype;
  d record;
begin
  select * into f from public.order_work_phases where id = p_phase_id for update;
  if not found then
    return;   -- la fase non c'è più (si sta cancellando)
  end if;
  select * into d from public.fase_avanzamento_derivato(p_phase_id, f.status, f.status);
  if not d.derivata then
    return;   -- senza sottofasi la fase resta com'è: percentuale dichiarata
  end if;
  if f.percentuale is not distinct from d.percentuale
     and f.status is not distinct from d.stato
     and ((d.stato = 'completata') = (f.completata_il is not null)) then
    return;   -- già allineata: niente scritture inutili
  end if;
  -- L'UPDATE fa scattare fase_deriva_da_sottofasi, che scrive percentuale, stato e chiusura.
  update public.order_work_phases
     set percentuale = d.percentuale, status = d.stato, updated_at = now()
   where id = p_phase_id;
end;
$$;

create or replace function public.trg_sottofasi_ricalcola()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ricalcola_fase_da_sottofasi(coalesce(new.phase_id, old.phase_id));
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Guardia: ora e persona dal database, cantiere limitato a «spuntare»
-- ---------------------------------------------------------------------------
create or replace function public.sottofase_guardia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  -- Le colonne che cambia il cantiere: spuntare una sottofase.
  v_cantiere constant text[] := array['fatta', 'fatta_il', 'fatta_da', 'updated_at'];
  v_azienda uuid;
begin
  -- L'azienda è quella della fase.
  select f.company_id into v_azienda
    from public.order_work_phases f
   where f.id = new.phase_id;
  if v_azienda is null then
    raise exception 'La fase non esiste.' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.phase_id is distinct from old.phase_id then
    raise exception 'Una sottofase non cambia fase.' using errcode = '42501';
  end if;

  -- Chi l'ha segnata e quando: lo scrive il database, non il client.
  if tg_op = 'INSERT' or new.fatta is distinct from old.fatta then
    new.fatta_il := case when new.fatta then now() end;
    new.fatta_da := case when new.fatta then v_utente end;
  end if;
  new.updated_at := now();

  -- Solo le richieste degli utenti. Le funzioni SECURITY DEFINER, il service
  -- role, i cron e le migrazioni passano.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if public.has_permission_for_company(v_utente, 'can_edit_orders', v_azienda) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Le sottofasi le crea chi ha il permesso «Ordini e Commesse».'
      using errcode = '42501';
  end if;

  -- Dal cantiere cambia solo se la sottofase è fatta.
  if (to_jsonb(new) - v_cantiere) = (to_jsonb(old) - v_cantiere) then
    return new;
  end if;

  raise exception 'Dal cantiere si segna solo se una sottofase è fatta: il resto lo cambia chi ha il permesso «Ordini e Commesse».'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_sottofasi_guardia on public.order_work_subphases;
create trigger trg_sottofasi_guardia
  before insert or update on public.order_work_subphases
  for each row execute function public.sottofase_guardia();

drop trigger if exists trg_sottofasi_ricalcola on public.order_work_subphases;
create trigger trg_sottofasi_ricalcola
  after insert or delete or update of fatta, peso on public.order_work_subphases
  for each row execute function public.trg_sottofasi_ricalcola();

revoke all on function public.fase_avanzamento_derivato(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fase_deriva_da_sottofasi() from public, anon, authenticated;
revoke all on function public.ricalcola_fase_da_sottofasi(uuid) from public, anon, authenticated;
revoke all on function public.trg_sottofasi_ricalcola() from public, anon, authenticated;
revoke all on function public.sottofase_guardia() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: le sottofasi seguono la loro fase (e quindi la commessa)
-- ---------------------------------------------------------------------------
alter table public.order_work_subphases enable row level security;
revoke all on public.order_work_subphases from anon;

-- Legge chi legge la fase: la sottoquery applica a chi legge la RLS di order_work_phases.
drop policy if exists sottofasi_lettura on public.order_work_subphases;
create policy sottofasi_lettura on public.order_work_subphases
  for select to authenticated
  using (exists (select 1 from public.order_work_phases f where f.id = order_work_subphases.phase_id));

-- Scrive l'ufficio, come per le fasi: «Ordini e Commesse» e la commessa tra le proprie (can_see_order).
drop policy if exists sottofasi_ufficio on public.order_work_subphases;
create policy sottofasi_ufficio on public.order_work_subphases
  for all to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and exists (select 1 from public.order_work_phases f
                  join public.orders o on o.id = f.order_id
                 where f.id = order_work_subphases.phase_id
                   and public.get_order_company_id(f.order_id) = (select public.get_user_company_id((select auth.uid())))
                   and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))
  )
  with check (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and exists (select 1 from public.order_work_phases f
                  join public.orders o on o.id = f.order_id
                 where f.id = order_work_subphases.phase_id
                   and public.get_order_company_id(f.order_id) = (select public.get_user_company_id((select auth.uid())))
                   and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))
  );

-- Il cantiere aggiorna (spunta): chi è assegnato alla commessa. Le colonne le limita trg_sottofasi_guardia.
drop policy if exists sottofasi_segna_cantiere on public.order_work_subphases;
create policy sottofasi_segna_cantiere on public.order_work_subphases
  for update to authenticated
  using (
    exists (select 1 from public.order_work_phases f
             where f.id = order_work_subphases.phase_id
               and (exists (select 1 from public.order_campo_assignments oca
                             where oca.order_id = f.order_id and oca.user_id = (select auth.uid()))
                    or public.order_has_employee_for_user(f.order_id, (select auth.uid()))))
  )
  with check (
    exists (select 1 from public.order_work_phases f
             where f.id = order_work_subphases.phase_id
               and (exists (select 1 from public.order_campo_assignments oca
                             where oca.order_id = f.order_id and oca.user_id = (select auth.uid()))
                    or public.order_has_employee_for_user(f.order_id, (select auth.uid()))))
  );

drop policy if exists blocco_utente_bloccato on public.order_work_subphases;
create policy blocco_utente_bloccato on public.order_work_subphases
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
```

- [ ] **Step 5: lancia il test sul testo, deve passare**

Run: `npx vitest run src/test/logic/sottofasiMigrazione.test.ts`
Expected: PASS (9 casi).

- [ ] **Step 6: commit locale**

La migrazione resta **non applicata** fino al Task 3 (CLAUDE.md: un file in `supabase/migrations/` va in produzione al primo push, quindi **prima di ogni push va applicata e riallineata**).

```bash
git add supabase/migrations/20281007130000_sottofasi_commessa.sql src/test/logic/sottofasiMigrazione.test.ts
git commit -m "Sottofasi: tabella, calcolo unico, trigger che riscrive la fase, guardia e RLS (migrazione non ancora applicata)"
```

### Task 3: prova SQL a secco, poi applicazione (serve l'OK per la seconda parte)

**Files:** nessuno (si usa il tool MCP `execute_sql`, poi `apply_migration`).

- [ ] **Step 1: prova a secco — migrazione e verifiche nella stessa chiamata, annullata alla fine**

Una chiamata `execute_sql` è una transazione sola: il `raise exception` finale annulla tutto, DDL compreso, e **nulla resta in produzione** (controllato con una tabella di prova). Si manda in una sola `query`: il contenuto **intero** di `20281007130000_sottofasi_commessa.sql`, seguito da questo blocco.

```sql
do $prova$
declare
  v_azienda uuid;
  v_ordine uuid;
  v_fase uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid;
  v_pct integer; v_stato text; v_il timestamptz; v_n integer;
  v_lavoratore uuid; v_altro uuid; v_ufficio uuid;
begin
  select p.company_id into v_azienda
    from public.profiles p join auth.users u on u.id = p.id
   where u.email = 'demo@azienda.srl';

  -- Un lavoratore del cantiere (assegnato, senza «Ordini e Commesse») e la sua commessa.
  select a.user_id, a.order_id into v_lavoratore, v_ordine
    from public.order_campo_assignments a
    join public.orders o on o.id = a.order_id
   where o.company_id = v_azienda and o.deleted_at is null and a.user_id is not null
     and not public.has_permission_for_company(a.user_id, 'can_edit_orders', o.company_id)
   limit 1;
  if v_ordine is null then
    select o.id into v_ordine from public.orders o
     where o.company_id = v_azienda and o.deleted_at is null order by o.created_at limit 1;
  end if;
  if v_ordine is null then raise exception 'PROVA SALTATA: la demo non ha commesse'; end if;

  insert into public.order_work_phases (company_id, order_id, name, position)
  values (v_azienda, v_ordine, 'PROVA sottofasi', 999) returning id into v_fase;

  insert into public.order_work_subphases (phase_id, name, position, peso) values (v_fase, 'a', 0, 1) returning id into v_s1;
  insert into public.order_work_subphases (phase_id, name, position, peso) values (v_fase, 'b', 1, 1) returning id into v_s2;
  insert into public.order_work_subphases (phase_id, name, position, peso) values (v_fase, 'c', 2, 2) returning id into v_s3;

  -- 1. appena create: 0%, da_iniziare
  select percentuale, status into v_pct, v_stato from public.order_work_phases where id = v_fase;
  if v_pct <> 0 or v_stato <> 'da_iniziare' then raise exception 'KO 1: % % (atteso 0 da_iniziare)', v_pct, v_stato; end if;

  -- 2. una sottofase di peso 1 su 4 → 25%, in corso; ora e persona le scrive il database
  update public.order_work_subphases set fatta = true where id = v_s1;
  select percentuale, status into v_pct, v_stato from public.order_work_phases where id = v_fase;
  if v_pct <> 25 or v_stato <> 'in_corso' then raise exception 'KO 2: % % (atteso 25 in_corso)', v_pct, v_stato; end if;
  if (select fatta_il from public.order_work_subphases where id = v_s1) is null then raise exception 'KO 3: fatta_il vuota'; end if;

  -- 3. tutte fatte → 100%, completata, con il giorno di chiusura
  update public.order_work_subphases set fatta = true where phase_id = v_fase;
  select percentuale, status, completata_il into v_pct, v_stato, v_il from public.order_work_phases where id = v_fase;
  if v_pct <> 100 or v_stato <> 'completata' or v_il is null then raise exception 'KO 4: % % %', v_pct, v_stato, v_il; end if;

  -- 4. riapro la sottofase di peso 2 → 50%, la fase si riapre e perde il giorno di chiusura
  update public.order_work_subphases set fatta = false where id = v_s3;
  select percentuale, status, completata_il into v_pct, v_stato, v_il from public.order_work_phases where id = v_fase;
  if v_pct <> 50 or v_stato <> 'in_corso' or v_il is not null then raise exception 'KO 5: % % %', v_pct, v_stato, v_il; end if;

  -- 5. aggiungo una sottofase di peso 2 a una fase quasi chiusa → 67%
  update public.order_work_subphases set fatta = true where id = v_s3;
  insert into public.order_work_subphases (phase_id, name, position, peso) values (v_fase, 'd', 3, 2);
  select percentuale, status into v_pct, v_stato from public.order_work_phases where id = v_fase;
  if v_pct <> 67 or v_stato <> 'in_corso' then raise exception 'KO 6: % % (atteso 67 in_corso)', v_pct, v_stato; end if;

  -- 6. la commessa segue (media delle sue fasi)
  if (select percentuale_avanzamento from public.orders where id = v_ordine) is distinct from
     (select round(avg(case when status = 'completata' then 100 else least(100, greatest(coalesce(percentuale, 0), 0)) end))::int
        from public.order_work_phases where order_id = v_ordine) then
    raise exception 'KO 7: la commessa non segue le fasi';
  end if;

  -- 7. IL DATABASE È LA FONTE: una scrittura diretta su una fase con sottofasi viene riscritta
  update public.order_work_phases set status = 'completata', percentuale = 100 where id = v_fase;
  select percentuale, status, completata_il into v_pct, v_stato, v_il from public.order_work_phases where id = v_fase;
  if v_pct <> 67 or v_stato <> 'in_corso' or v_il is not null then raise exception 'KO 8: scrittura diretta passata (% % %)', v_pct, v_stato, v_il; end if;
  update public.order_work_phases set status = 'da_iniziare', percentuale = 5 where id = v_fase;
  select percentuale, status into v_pct, v_stato from public.order_work_phases where id = v_fase;
  if v_pct <> 67 or v_stato <> 'in_corso' then raise exception 'KO 9: scrittura diretta passata (% %)', v_pct, v_stato; end if;
  -- e cambiare altro (il nome) non sposta niente
  update public.order_work_phases set name = 'PROVA sottofasi 2' where id = v_fase;
  select percentuale, status into v_pct, v_stato from public.order_work_phases where id = v_fase;
  if v_pct <> 67 or v_stato <> 'in_corso' then raise exception 'KO 10: rinominare ha spostato la fase (% %)', v_pct, v_stato; end if;

  -- 8. tolgo tutte le sottofasi: la fase tiene l'ultimo valore e torna «dichiarata»
  delete from public.order_work_subphases where phase_id = v_fase;
  select percentuale, status into v_pct, v_stato from public.order_work_phases where id = v_fase;
  if v_pct <> 67 or v_stato <> 'in_corso' then raise exception 'KO 11: % % (atteso: tiene l''ultimo valore)', v_pct, v_stato; end if;
  update public.order_work_phases set percentuale = 80 where id = v_fase;
  select percentuale into v_pct from public.order_work_phases where id = v_fase;
  if v_pct <> 80 then raise exception 'KO 12: senza sottofasi la fase non è tornata libera (%)', v_pct; end if;

  -- 9. a 0% l'ufficio sceglie lo stato; non si chiude da solo
  insert into public.order_work_subphases (phase_id, name, position, peso) values (v_fase, 'x', 0, 1) returning id into v_s1;
  insert into public.order_work_subphases (phase_id, name, position, peso) values (v_fase, 'y', 1, 1) returning id into v_s2;
  select percentuale, status into v_pct, v_stato from public.order_work_phases where id = v_fase;
  if v_pct <> 0 then raise exception 'KO 13: con due sottofasi da fare la fase è a % (atteso 0)', v_pct; end if;
  update public.order_work_phases set status = 'da_iniziare' where id = v_fase;
  select status into v_stato from public.order_work_phases where id = v_fase;
  if v_stato <> 'da_iniziare' then raise exception 'KO 14: a 0%% l''ufficio non riesce a scegliere lo stato (%)', v_stato; end if;
  update public.order_work_phases set status = 'completata' where id = v_fase;
  select status into v_stato from public.order_work_phases where id = v_fase;
  if v_stato <> 'da_iniziare' then raise exception 'KO 15: a 0%% la fase si è chiusa da sola (%)', v_stato; end if;

  if v_lavoratore is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_lavoratore, 'role', 'authenticated')::text, true);
    set local role authenticated;

    -- il lavoratore assegnato vede le sottofasi della sua commessa, e può segnarle
    select count(*) into v_n from public.order_work_subphases where phase_id = v_fase;
    if v_n <> 2 then raise exception 'KO 16: il lavoratore vede % sottofasi, attese 2', v_n; end if;
    update public.order_work_subphases set fatta = true where id = v_s1;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'KO 17: il lavoratore assegnato non riesce a segnare'; end if;

    begin
      update public.order_work_subphases set name = 'rinominata' where id = v_s1;
      raise exception 'KO 18: il lavoratore ha rinominato una sottofase';
    exception when sqlstate '42501' then null;
    end;

    begin
      insert into public.order_work_subphases (phase_id, name) values (v_fase, 'z');
      raise exception 'KO 19: il lavoratore ha creato una sottofase';
    exception when sqlstate '42501' then null;
    end;

    delete from public.order_work_subphases where id = v_s2;
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception 'KO 20: il lavoratore ha cancellato una sottofase'; end if;

    -- una vecchia app che chiude la fase a mano: il cantiere può scrivere lo stato, ma il database lo riscrive
    update public.order_work_phases set status = 'completata', percentuale = 100 where id = v_fase;
    reset role;
    select percentuale, status into v_pct, v_stato from public.order_work_phases where id = v_fase;
    if v_pct <> 50 or v_stato <> 'in_corso' then raise exception 'KO 21: dopo la spunta e la chiusura a mano: % % (atteso 50 in_corso)', v_pct, v_stato; end if;
  end if;

  -- Un utente di un'altra azienda non vede niente.
  select p.id into v_altro from public.profiles p
   where p.company_id is not null and p.company_id <> v_azienda
     and not exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'super_admin'::public.app_role)
   limit 1;
  if v_altro is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_altro, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.order_work_subphases where phase_id = v_fase;
    reset role;
    if v_n <> 0 then raise exception 'KO 22: un utente di un''altra azienda vede % sottofasi', v_n; end if;
  end if;

  -- L'ufficio (amministratore dell'azienda) aggiunge, rinomina, toglie.
  select ur.user_id into v_ufficio from public.user_roles ur join public.profiles p on p.id = ur.user_id
   where p.company_id = v_azienda and ur.role = 'company_admin'::public.app_role limit 1;
  if v_ufficio is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_ufficio, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.order_work_subphases (phase_id, name, position, peso) values (v_fase, 'ufficio', 5, 3);
    update public.order_work_subphases set name = 'ufficio 2' where phase_id = v_fase and name = 'ufficio';
    delete from public.order_work_subphases where phase_id = v_fase and name = 'ufficio 2';
    reset role;
  end if;

  -- Cancellare una fase con sottofasi non dà errori e si porta via le sottofasi.
  delete from public.order_work_phases where id = v_fase;
  select count(*) into v_n from public.order_work_subphases where phase_id = v_fase;
  if v_n <> 0 then raise exception 'KO 23: dopo aver cancellato la fase restano % sottofasi', v_n; end if;

  -- Il backup non lascia scoperta la tabella nuova (CLAUDE.md, «Backup e ripristino»).
  select count(*) into v_n from public.admin_backup_tabelle_scoperte();
  if v_n <> 0 then raise exception 'KO 24: il backup lascia % tabelle scoperte', v_n; end if;

  raise exception 'PROVA OK — annullata di proposito, niente è stato salvato (lavoratore: %, altra azienda: %, ufficio: %)',
    (v_lavoratore is not null), (v_altro is not null), (v_ufficio is not null);
end
$prova$;
```

Expected: l'errore `PROVA OK — annullata di proposito, niente è stato salvato (lavoratore: true, altra azienda: true, ufficio: true)`. Un `KO n` indica la regola che non regge: si corregge il file SQL e si ripete. Se uno dei tre ruoli risulta `false`, quella parte della prova è saltata: scegli un'altra commessa/azienda e ripeti prima di applicare.

- [ ] **Step 2: chiedi l'OK e applica**

Con l'OK dell'utente, tool MCP `apply_migration` con `name: "sottofasi_commessa"` e `query` = contenuto del file. Poi, **subito**, riallinea la versione (CLAUDE.md, punto 3):

```sql
update supabase_migrations.schema_migrations
   set version = '20281007130000'
 where name = 'sottofasi_commessa' and left(version, 4) = '2026';
```

- [ ] **Step 3: verifica dopo l'applicazione**

```sql
-- 1 riga: la versione del file
select version, name from supabase_migrations.schema_migrations where version = '20281007130000';
-- 0 righe: le funzioni nuove non sono eseguibili da anon né authenticated
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('fase_avanzamento_derivato', 'fase_deriva_da_sottofasi', 'ricalcola_fase_da_sottofasi', 'trg_sottofasi_ricalcola', 'sottofase_guardia')
   and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
-- 0 righe: il backup copre la tabella nuova (CLAUDE.md, «Backup e ripristino»)
select * from public.admin_backup_tabelle_scoperte();
```

Una nota di cronaca: la creazione di una tabella scrive una riga `rls_missing` in `system_health_metrics` (l'event trigger `check_new_table_rls` scatta al `CREATE TABLE`, prima che la migrazione accenda la RLS): è rumore atteso, ce ne sono già 2.587 di migrazioni precedenti.

### Task 4: l'hook delle sottofasi

**Files:**
- Create: `src/hooks/useSottofasi.ts`

- [ ] **Step 1: scrivi l'hook** (sottile: la logica sta in `sottofasi.ts`, già provata)

```ts
// src/hooks/useSottofasi.ts
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { messaggioErrore, sottofaseDaRiga, sottofasiPerFase, type Sottofase } from "@/lib/orders/sottofasi";

// La tabella non è ancora nei tipi generati: cast localizzato, come useOrderWorkPhases.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Le sottofasi di una commessa e i comandi per cambiarle. */
export function useSottofasi(orderId: string | null | undefined) {
  const qc = useQueryClient();
  // Cambiare una sottofase cambia la fase (e la commessa): si aggiorna tutto il giro.
  const aggiorna = () => refreshWorkQueries(qc, orderId);
  const onError = (e: unknown) => toast.error(messaggioErrore(e));

  const query = useQuery({
    queryKey: ["order_work_subphases", orderId],
    enabled: !!orderId,
    staleTime: 30_000,
    queryFn: async (): Promise<Sottofase[]> => {
      // Le sottofasi non hanno la commessa: si filtra per quella della loro fase.
      const { data, error } = await db
        .from("order_work_subphases")
        .select("id, phase_id, name, position, peso, fatta, fatta_il, fase:order_work_phases!inner(order_id)")
        .eq("fase.order_id", orderId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(sottofaseDaRiga);
    },
  });

  const perFase = useMemo(() => sottofasiPerFase(query.data ?? []), [query.data]);

  const segna = useMutation({
    mutationFn: async ({ id, fatta }: { id: string; fatta: boolean }) => {
      const { error } = await db.from("order_work_subphases").update({ fatta }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  const aggiungi = useMutation({
    mutationFn: async ({ phaseId, nome }: { phaseId: string; nome: string }) => {
      const { error } = await db.from("order_work_subphases").insert({
        phase_id: phaseId, name: nome, position: (perFase.get(phaseId) ?? []).length,
      });
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  const rinomina = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await db.from("order_work_subphases").update({ name: nome }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("order_work_subphases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  return { sottofasi: query.data ?? [], perFase, isLoading: query.isLoading, isError: query.isError, segna, aggiungi, rinomina, elimina };
}
```

- [ ] **Step 2: typecheck mirato** sul file nuovo (memoria `reference_typecheck_mirato`).
Expected: nessun errore.

- [ ] **Step 3: commit**

```bash
git add src/hooks/useSottofasi.ts
git commit -m "Sottofasi: hook per leggere e cambiare le sottofasi di una commessa"
```

### Task 5: il componente «Sottofasi» della fase

**Files:**
- Create: `src/components/orders/SottofasiFase.tsx`
- Test: `src/test/ui/sottofasiFase.test.tsx`

- [ ] **Step 1: scrivi i test che falliscono**

```tsx
// src/test/ui/sottofasiFase.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SottofasiFase } from "@/components/orders/SottofasiFase";
import type { Sottofase } from "@/lib/orders/sottofasi";

const riga = (patch: Partial<Sottofase> = {}): Sottofase => ({
  id: "s1", phase_id: "p1", name: "Tracce", position: 0, peso: 1, fatta: false, fatta_il: null, ...patch,
});
const azioni = () => ({ onSegna: vi.fn(), onAggiungi: vi.fn(), onRinomina: vi.fn(), onElimina: vi.fn() });
afterEach(cleanup);

describe("SottofasiFase", () => {
  it("dice quante sono fatte e la percentuale che ne deriva", () => {
    render(
      <SottofasiFase
        nomeFase="Impianto" puoModificare puoSegnare {...azioni()}
        sottofasi={[riga({ fatta: true }), riga({ id: "s2", name: "Cavi" }), riga({ id: "s3", name: "Quadro" })]}
      />,
    );
    expect(screen.getByText("1 di 3 · 33%")).toBeInTheDocument();
    expect(screen.getByText("L'avanzamento di questa fase si calcola dalle sottofasi fatte.")).toBeInTheDocument();
  });

  it("segna e toglie la spunta", () => {
    const a = azioni();
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[riga(), riga({ id: "s2", name: "Cavi", fatta: true })]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Tracce: da fare" }));
    expect(a.onSegna).toHaveBeenCalledWith("s1", true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cavi: fatta" }));
    expect(a.onSegna).toHaveBeenCalledWith("s2", false);
  });

  it("senza sottofasi l'ufficio vede solo un invito discreto, e la fase resta com'era", () => {
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...azioni()} sottofasi={[]} />);
    expect(screen.getByRole("button", { name: "Dividi in sottofasi" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Aggiungi una sottofase a Impianto")).not.toBeInTheDocument();
    expect(screen.queryByText(/L'avanzamento di questa fase si calcola/)).not.toBeInTheDocument();
  });

  it("aggiunge con il nome ripulito, e non aggiunge un nome vuoto", () => {
    const a = azioni();
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Dividi in sottofasi" }));
    const bottone = screen.getByRole("button", { name: "Aggiungi" });
    expect(bottone).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Aggiungi una sottofase a Impianto"), { target: { value: "  Cavi  " } });
    fireEvent.click(bottone);
    expect(a.onAggiungi).toHaveBeenCalledWith("Cavi");
  });

  it("una fase già avviata avvisa, prima di dividerla, che l'avanzamento ripartirà dalle sottofasi", () => {
    render(<SottofasiFase nomeFase="Impianto" avviata={{ percentuale: 60, chiusa: false }} puoModificare puoSegnare {...azioni()} sottofasi={[]} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dividi in sottofasi" }));
    expect(screen.getByRole("note")).toHaveTextContent("già al 60%");
    expect(screen.getByRole("note")).toHaveTextContent("segna subito quelle già completate");
  });

  it("una fase chiusa avvisa che aggiungere sottofasi da fare la riapre", () => {
    render(<SottofasiFase nomeFase="Impianto" avviata={{ percentuale: 100, chiusa: true }} puoModificare puoSegnare {...azioni()} sottofasi={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Dividi in sottofasi" }));
    expect(screen.getByRole("note")).toHaveTextContent("la riapri");
  });

  it("una fase non avviata non avvisa", () => {
    render(<SottofasiFase nomeFase="Impianto" avviata={null} puoModificare puoSegnare {...azioni()} sottofasi={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Dividi in sottofasi" }));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("rinomina con Invio e toglie dal cestino", () => {
    const a = azioni();
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[riga()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Rinomina Tracce" }));
    const campo = screen.getByLabelText("Nome della sottofase Tracce");
    fireEvent.change(campo, { target: { value: "Tracce e scassi" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(a.onRinomina).toHaveBeenCalledWith("s1", "Tracce e scassi");
    fireEvent.click(screen.getByRole("button", { name: "Elimina Tracce" }));
    expect(a.onElimina).toHaveBeenCalledWith("s1");
  });

  it("senza il permesso di modificare non ci sono comandi per aggiungere, rinominare o togliere", () => {
    render(<SottofasiFase nomeFase="Impianto" puoModificare={false} puoSegnare {...azioni()} sottofasi={[riga()]} />);
    expect(screen.queryByLabelText("Aggiungi una sottofase a Impianto")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rinomina Tracce" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elimina Tracce" })).not.toBeInTheDocument();
  });

  it("senza il permesso di segnare le caselle sono spente", () => {
    render(<SottofasiFase nomeFase="Impianto" puoModificare={false} puoSegnare={false} {...azioni()} sottofasi={[riga()]} />);
    expect(screen.getByRole("checkbox", { name: "Tracce: da fare" })).toBeDisabled();
  });

  it("senza sottofasi e in sola lettura non compare niente", () => {
    const { container } = render(<SottofasiFase nomeFase="Impianto" puoModificare={false} puoSegnare={false} {...azioni()} sottofasi={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/ui/sottofasiFase.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/orders/SottofasiFase"`.

- [ ] **Step 3: scrivi il componente**

```tsx
// src/components/orders/SottofasiFase.tsx
import { useState } from "react";
import { ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { avanzamentoDaSottofasi, riepilogoSottofasi, type Sottofase } from "@/lib/orders/sottofasi";

interface SottofasiFaseProps {
  nomeFase: string;
  sottofasi: Sottofase[];
  /** Se la fase è già avviata (o chiusa) e non ha ancora sottofasi: l'avanzamento che ha adesso. */
  avviata?: { percentuale: number; chiusa: boolean } | null;
  /** L'ufficio aggiunge, rinomina e toglie. */
  puoModificare: boolean;
  /** Spuntare: l'ufficio, o chi lavora sul cantiere. */
  puoSegnare: boolean;
  onSegna: (id: string, fatta: boolean) => void;
  onAggiungi: (nome: string) => void;
  onRinomina: (id: string, nome: string) => void;
  onElimina: (id: string) => void;
  className?: string;
}

/** I passi di una fase: spuntati, ne decidono l'avanzamento. */
export function SottofasiFase({
  nomeFase, sottofasi, avviata, puoModificare, puoSegnare, onSegna, onAggiungi, onRinomina, onElimina, className,
}: SottofasiFaseProps) {
  const [nuova, setNuova] = useState("");
  const [aperta, setAperta] = useState(false);
  const [inModifica, setInModifica] = useState<string | null>(null);
  const [bozza, setBozza] = useState("");
  const { fatte, totale } = riepilogoSottofasi(sottofasi);

  if (totale === 0 && !puoModificare) return null;

  // Una fase senza sottofasi resta com'era: solo un invito discreto a dividerla.
  if (totale === 0 && !aperta) {
    return (
      <Button type="button" variant="ghost" size="sm" className={cn("h-8 w-fit px-2 text-xs text-muted-foreground", className)} onClick={() => setAperta(true)}>
        <ListChecks className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Dividi in sottofasi
      </Button>
    );
  }

  const aggiungi = () => {
    const nome = nuova.trim();
    if (!nome) return;
    onAggiungi(nome);
    setNuova("");
  };

  const conferma = (s: Sottofase) => {
    const nome = bozza.trim();
    setInModifica(null);
    if (nome && nome !== s.name) onRinomina(s.id, nome);
  };

  return (
    <section aria-label={`Sottofasi di ${nomeFase}`} className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />Sottofasi
        </h4>
        {totale > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {fatte} di {totale} · {avanzamentoDaSottofasi(sottofasi)}%
          </span>
        )}
      </div>
      {totale > 0 && (
        <p className="text-xs text-muted-foreground">L'avanzamento di questa fase si calcola dalle sottofasi fatte.</p>
      )}
      {totale === 0 && avviata && (
        <p role="note" className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          {avviata.chiusa
            ? "Questa fase è chiusa. Aggiungendo sottofasi da fare la riapri, finché non sono tutte fatte."
            : `Questa fase è già al ${avviata.percentuale}%. Dividendola in sottofasi, l'avanzamento si calcola da quelle fatte: segna subito quelle già completate.`}
        </p>
      )}
      <ul className="space-y-0.5">
        {sottofasi.map((s) => (
          <li key={s.id} className="flex min-h-9 items-center gap-2 rounded-md px-1">
            <Checkbox
              checked={s.fatta}
              disabled={!puoSegnare}
              onCheckedChange={(v) => onSegna(s.id, v === true)}
              aria-label={`${s.name}: ${s.fatta ? "fatta" : "da fare"}`}
            />
            {inModifica === s.id ? (
              <Input
                autoFocus
                value={bozza}
                aria-label={`Nome della sottofase ${s.name}`}
                onChange={(e) => setBozza(e.target.value)}
                onBlur={() => conferma(s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); conferma(s); }
                  else if (e.key === "Escape") setInModifica(null);
                }}
                className="h-8 min-w-0 flex-1 text-sm"
              />
            ) : (
              <span className={cn("min-w-0 flex-1 break-words text-sm", s.fatta && "text-muted-foreground line-through")}>{s.name}</span>
            )}
            {puoModificare && inModifica !== s.id && (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label={`Rinomina ${s.name}`}
                  onClick={() => { setBozza(s.name); setInModifica(s.id); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" aria-label={`Elimina ${s.name}`} onClick={() => onElimina(s.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      {puoModificare && (
        <div className="flex items-center gap-2">
          <Input
            value={nuova}
            onChange={(e) => setNuova(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(); } }}
            placeholder="Aggiungi una sottofase"
            aria-label={`Aggiungi una sottofase a ${nomeFase}`}
            className="h-8 min-w-0 flex-1 text-sm"
          />
          <Button size="sm" variant="outline" onClick={aggiungi} disabled={!nuova.trim()}>
            <Plus className="mr-1 h-4 w-4" />Aggiungi
          </Button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: lancia i test, devono passare**

Run: `npx vitest run src/test/ui/sottofasiFase.test.tsx`
Expected: PASS (11 casi).

- [ ] **Step 5: commit**

```bash
git add src/components/orders/SottofasiFase.tsx src/test/ui/sottofasiFase.test.tsx
git commit -m "Sottofasi: la checklist della fase, con spunta, aggiunta, rinomina, cestino e un avviso per le fasi già avviate"
```

### Task 6: le sottofasi dentro la fase aperta

**Files:**
- Modify: `src/components/orders/OrderWorkPhases.tsx` (importazioni; il `<PhaseCard …/>` a ~riga 633; `PhaseCardProps` a ~747; il corpo della fase a ~1171-1214; il bottone «%» a ~1051; `tendinaStato` a ~900)
- Modify: `src/test/ui/orderWorkPlanning.test.tsx`, `src/test/ui/commessaTelefono.test.tsx` (mock del nuovo hook)
- Test: `src/test/ui/orderWorkPlanning.test.tsx` (un caso nuovo)

- [ ] **Step 1: aggiorna i mock dei due test che montano `OrderWorkPhases`**

Quei test sostituiscono `@tanstack/react-query` con un finto che ha solo `useQuery`: il nuovo hook, che usa `useMutation`, va finto a sua volta.

**Nota sullo stato di partenza.** I due file erano **rossi (25 casi)** dal commit `32dc3a3aa`: l'alert di scostamento SAL, montato in `OrderWorkPhases`, legge le soglie con react-query e col finto `useQuery → []` cadeva su `cfg.salScostamento`. Dal commit `1e41c3313` hanno già il finto `vi.mock("@/components/orders/AlertScostamentoSal", () => ({ AlertScostamentoSal: (): null => null }));` (il tipo di ritorno esplicito serve al controllo dei tipi). Se parti da un albero senza quel commit, aggiungilo prima di tutto: senza, nessuno dei casi seguenti può passare.

In **entrambi** i file, accanto agli altri `vi.mock(...)`:

```tsx
vi.mock("@/hooks/useSottofasi", () => ({
  useSottofasi: () => ({
    sottofasi: [] as unknown[], perFase: new Map(), isLoading: false, isError: false,
    segna: { mutate: state.segnaSottofase }, aggiungi: { mutate: state.aggiungiSottofase },
    rinomina: { mutate: vi.fn() }, elimina: { mutate: vi.fn() },
  }),
}));
```

e nello `state` hoisted aggiungi `segnaSottofase: vi.fn(), aggiungiSottofase: vi.fn(),` (accanto a `addPhase: vi.fn()`). Per fare un caso con sottofasi vere, in `orderWorkPlanning.test.tsx` rendi la mappa leggibile dallo `state`:

```tsx
// nello state hoisted:  sottofasiPerFase: new Map<string, unknown[]>(),
// nel mock:             perFase: state.sottofasiPerFase,
```

- [ ] **Step 2: scrivi il caso che fallisce** (in `orderWorkPlanning.test.tsx`, nel `describe` principale)

```tsx
  it("una fase con sottofasi mostra la checklist e non si corregge a mano", () => {
    state.sottofasiPerFase = new Map([["p1", [
      { id: "s1", phase_id: "p1", name: "Tracce", position: 0, peso: 1, fatta: true, fatta_il: null },
      { id: "s2", phase_id: "p1", name: "Cavi", position: 1, peso: 1, fatta: false, fatta_il: null },
    ]]]);
    // la fase «in corso» si apre da sola: la checklist è già visibile
    draw();
    expect(screen.getByText("1 di 2 · 50%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cavi: da fare" }));
    expect(state.segnaSottofase).toHaveBeenCalledWith({ id: "s2", fatta: true });
    // la percentuale non si corregge a mano: la decidono le sottofasi
    expect(screen.getByRole("button", { name: /Avanzamento Opere murarie/ })).toBeDisabled();
  });
```
e nel `beforeEach` aggiungi `state.sottofasiPerFase = new Map();`.

Run: `npx vitest run src/test/ui/orderWorkPlanning.test.tsx`
Expected: FAIL — il caso nuovo (nessuna checklist nella fase).

- [ ] **Step 3: importazioni e hook in `OrderWorkPhases`**

In cima a `src/components/orders/OrderWorkPhases.tsx`, con le altre importazioni:

```tsx
import { useSottofasi } from "@/hooks/useSottofasi";
import { SottofasiFase } from "./SottofasiFase";
import { faseHaSottofasi, type Sottofase } from "@/lib/orders/sottofasi";
```

Nel componente `OrderWorkPhases`, accanto a `const { phases, … } = useOrderWorkPhases(orderId)`:

```tsx
  const { perFase: sottofasiDi, segna: segnaSottofase, aggiungi: aggiungiSottofase, rinomina: rinominaSottofase, elimina: eliminaSottofase } = useSottofasi(orderId);
```

Nel `<PhaseCard …/>` (~riga 633), dopo `fasiOpzioni={phaseOptions}`:

```tsx
                sottofasi={sottofasiDi.get(phase.id) ?? []}
                azioniSottofasi={{
                  onSegna: (id, fatta) => segnaSottofase.mutate({ id, fatta }),
                  onAggiungi: (nome) => aggiungiSottofase.mutate({ phaseId: phase.id, nome }),
                  onRinomina: (id, nome) => rinominaSottofase.mutate({ id, nome }),
                  onElimina: (id) => eliminaSottofase.mutate(id),
                }}
```

In `PhaseCardProps` (~riga 747), dopo `fasiOpzioni`:

```tsx
  /** Le sottofasi della fase: se ce ne sono, la percentuale ne deriva. */
  sottofasi: Sottofase[];
  azioniSottofasi: {
    onSegna: (id: string, fatta: boolean) => void;
    onAggiungi: (nome: string) => void;
    onRinomina: (id: string, nome: string) => void;
    onElimina: (id: string) => void;
  };
```

e nella lista dei parametri di `function PhaseCard({ … })` aggiungi `sottofasi, azioniSottofasi,`.

- [ ] **Step 4: la fase derivata non si corregge a mano**

Dentro `PhaseCard`, vicino a `const actualPct = …` (~riga 940):

```tsx
  // Con le sottofasi la percentuale e lo stato li calcola il database: a mano
  // verrebbero riscritti alla prossima spunta.
  const derivata = faseHaSottofasi(sottofasi);
```

Nel bottone «%» (~riga 1051) cambia `disabled` e `title`:

```tsx
                    disabled={!canEditOrders || derivata}
                    // …gli altri attributi del bottone restano…
                    title={derivata ? "Si calcola dalle sottofasi" : "Correggi l'avanzamento della fase"}
```

In `tendinaStato` (~riga 900) spegni la tendina:

```tsx
    <Select value={phase.status} disabled={derivata} onValueChange={(v) => onUpdatePhase({ status: v as PhaseStatus })}>
```

- [ ] **Step 5: monta la checklist nel corpo della fase**

Nel corpo aperto (`<CardContent id={`phase-body-${phase.id}`} …>`, ~riga 1171), subito **dopo** il blocco «Quando» (chiude con `</div>` prima del commento `{/* ── Economia: venduto, … ── */}`, ~riga 1214) e prima di quel commento:

```tsx
              {/* ── Sottofasi: i passi che decidono l'avanzamento ── */}
              <SottofasiFase
                nomeFase={phase.name}
                sottofasi={sottofasi}
                // Una fase già avviata (o chiusa) che si divide in sottofasi riparte da quelle fatte: si avvisa.
                avviata={phase.status !== "da_iniziare" || phase.percentuale > 0 ? { percentuale: actualPct, chiusa: phase.status === "completata" } : null}
                puoModificare={canEditOrders}
                puoSegnare={canEditOrders}
                {...azioniSottofasi}
              />
```

- [ ] **Step 6: lancia i test della scheda, devono passare**

Run: `npx vitest run src/test/ui/orderWorkPlanning.test.tsx src/test/ui/commessaTelefono.test.tsx`
Expected: PASS (caso nuovo compreso; gli altri invariati).

- [ ] **Step 7: tutta la suite UI e logica, per trovare altri mock rotti**

Run: `npx vitest run src/test/ui src/test/logic`
Expected: PASS, salvo i **28 casi già rossi prima di questo lavoro**, in 10 file che non lo riguardano (logica: `salesSelectorTemplates`, `fotovoltaicoPdfTemplate`, `tettiTemplateModules`, `prenotazioneCollegataCrm`, `imapRicezione`, `flussiCampiFantasma`, `faseVendutoSoloConImporti`, `documentiFiscaliColPermesso`, `automazioniModelloWhatsApp`; UI: `serramentiLocalModules`) (verificati il 07/10/2026 sull'albero di partenza). Qualunque altro test che monta `OrderWorkPhases` e finge `@tanstack/react-query` riceve lo stesso `vi.mock("@/hooks/useSottofasi", …)` del Step 1.

- [ ] **Step 8: verifica a occhio**

`preview_start` col dev server, apri una commessa con fasi → Lavorazioni → apri una fase: «Sottofasi» (con il campo «Aggiungi una sottofase»), aggiungi tre sottofasi, spuntane una: la fase passa a «In corso» e la percentuale a 33%. Controlla anche a 375 px: la scheda resta una riga e le sottofasi compaiono solo da aperta. Dopo aver applicato la migrazione (Task 3).

- [ ] **Step 9: commit**

```bash
git add src/components/orders/OrderWorkPhases.tsx src/test/ui/orderWorkPlanning.test.tsx src/test/ui/commessaTelefono.test.tsx
git commit -m "Fasi: le sottofasi nella fase aperta; con le sottofasi la percentuale non si corregge a mano"
```

---

# Tappa M2 — Modelli di fasi dell'azienda

### Task 7: logica pura dei modelli

**Files:**
- Create: `src/lib/orders/modelliFasi.ts`
- Test: `src/test/logic/modelliFasi.test.ts`

Gli 8 modelli di oggi restano dove sono (`PHASE_TEMPLATES` in `src/hooks/useOrderWorkPhases.ts`: i due test esistenti li fingono da lì) ma cambiano ruolo: sono i **modelli di partenza**, che un'azienda fa suoi la prima volta. Qui si importa solo il **tipo**.

- [ ] **Step 1: scrivi i test che falliscono**

```ts
// src/test/logic/modelliFasi.test.ts
import { describe, expect, it } from "vitest";
import type { PhaseTemplate } from "@/hooks/useOrderWorkPhases";
import {
  assemblaModelli, bozzaDaModello, bozzaVuota, eModelloDiPartenza, fasiPerCommessa, modelliDaOffrire,
  modelliDiPartenzaMancanti, modelliPerInizializzare, modelloDiPartenza, rimuovi, sostituisci, sposta,
  totaleSottofasi, validaBozza,
  type BozzaModello, type FaseModello, type ModelloFasi,
} from "@/lib/orders/modelliFasi";

const partenza: PhaseTemplate[] = [
  { key: "bagno", label: "Bagno", hint: "Rifacimento bagno", phases: ["Demolizioni", "Impianti"] },
  { key: "tetto", label: "Tetto", hint: "Copertura", phases: ["Ponteggio"] },
];
const mio: ModelloFasi = {
  id: "m1", origine: "azienda", nome: "Impianti completi", descrizione: "",
  fasi: [
    { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
    { nome: "Collaudo", sottofasi: [] },
  ],
};

describe("modelli di partenza", () => {
  it("un modello di partenza è un modello senza sottofasi, con id «partenza:<chiave>»", () => {
    expect(modelloDiPartenza(partenza[0])).toEqual({
      id: "partenza:bagno", origine: "partenza", nome: "Bagno", descrizione: "Rifacimento bagno",
      fasi: [{ nome: "Demolizioni", sottofasi: [] }, { nome: "Impianti", sottofasi: [] }],
    });
    expect(eModelloDiPartenza("partenza:bagno")).toBe(true);
    expect(eModelloDiPartenza("m1")).toBe(false);
  });
  it("quello che si manda al server per darli all'azienda: nome, descrizione, fasi (senza id)", () => {
    expect(modelliPerInizializzare(partenza)).toEqual([
      { nome: "Bagno", descrizione: "Rifacimento bagno", fasi: [{ nome: "Demolizioni", sottofasi: [] }, { nome: "Impianti", sottofasi: [] }] },
      { nome: "Tetto", descrizione: "Copertura", fasi: [{ nome: "Ponteggio", sottofasi: [] }] },
    ]);
  });
});

describe("modelliDaOffrire", () => {
  it("finché l'azienda non li ha fatti suoi: quelli di partenza, uguali a quelli di sempre", () => {
    expect(modelliDaOffrire(false, [], partenza).map((m) => m.id)).toEqual(["partenza:bagno", "partenza:tetto"]);
  });
  it("se ha già salvato un modello suo prima: i suoi per primi, e quelli di partenza con lo stesso nome non si ripetono", () => {
    const suo: ModelloFasi = { ...mio, id: "a", nome: " bagno " };
    expect(modelliDaOffrire(false, [mio, suo], partenza).map((m) => m.id)).toEqual(["m1", "a", "partenza:tetto"]);
  });
  it("dopo: solo i suoi", () => {
    expect(modelliDaOffrire(true, [mio], partenza).map((m) => m.id)).toEqual(["m1"]);
  });
  it("anche se li ha tolti tutti: non tornano quelli di partenza", () => {
    expect(modelliDaOffrire(true, [], partenza)).toEqual([]);
  });
});

describe("modelliDiPartenzaMancanti", () => {
  it("conta quelli di partenza che l'azienda non ha (più), senza badare a maiuscole e spazi", () => {
    const suoi: ModelloFasi[] = [{ ...mio, id: "a", nome: " bagno " }];
    expect(modelliDiPartenzaMancanti(partenza, suoi)).toBe(1);
    expect(modelliDiPartenzaMancanti(partenza, [])).toBe(2);
    expect(modelliDiPartenzaMancanti(partenza, [{ ...mio, nome: "Bagno" }, { ...mio, id: "b", nome: "Tetto" }])).toBe(0);
  });
});

describe("totaleSottofasi", () => {
  it("somma le sottofasi di tutte le fasi", () => {
    expect(totaleSottofasi(mio)).toBe(2);
    expect(totaleSottofasi(modelloDiPartenza(partenza[0]))).toBe(0);
  });
});

describe("assemblaModelli", () => {
  it("compone l'albero dalle tre tabelle e rispetta le posizioni", () => {
    const m = assemblaModelli(
      [{ id: "m2", name: "B", hint: null, position: 1 }, { id: "m1", name: "A", hint: "uno", position: 0 }],
      [{ id: "f2", template_id: "m1", name: "Seconda", position: 1 }, { id: "f1", template_id: "m1", name: "Prima", position: 0 }],
      [{ id: "s2", template_phase_id: "f1", name: "Poi", position: 1, peso: 2 }, { id: "s1", template_phase_id: "f1", name: "Prima", position: 0, peso: 1 }],
    );
    expect(m.map((x) => x.id)).toEqual(["m1", "m2"]);
    expect(m[0]).toEqual({
      id: "m1", origine: "azienda", nome: "A", descrizione: "uno",
      fasi: [
        { nome: "Prima", sottofasi: [{ nome: "Prima", peso: 1 }, { nome: "Poi", peso: 2 }] },
        { nome: "Seconda", sottofasi: [] },
      ],
    });
    expect(m[1].fasi).toEqual([]);
    expect(m[1].descrizione).toBe("");
  });
});

describe("bozze", () => {
  it("una copia è una bozza nuova, «Copia di …», con fasi e sottofasi che non sono condivise", () => {
    const copia = bozzaDaModello(mio, true);
    expect(copia.id).toBeNull();
    expect(copia.nome).toBe("Copia di Impianti completi");
    copia.fasi[0].sottofasi[0].nome = "cambiato";
    expect(mio.fasi[0].sottofasi[0].nome).toBe("Tracce");
  });
  it("il nome di una copia non supera i 80 caratteri", () => {
    expect(bozzaDaModello({ ...mio, nome: "x".repeat(80) }, true).nome).toHaveLength(80);
  });
  it("modificare un modello esistente ne tiene l'id", () => {
    expect(bozzaDaModello(mio, false)).toMatchObject({ id: "m1", nome: "Impianti completi" });
  });
  it("la bozza vuota ha una fase vuota da riempire", () => {
    expect(bozzaVuota()).toEqual({ id: null, nome: "", descrizione: "", fasi: [{ nome: "", sottofasi: [] }] });
  });
});

describe("validaBozza", () => {
  const ok = (patch: Partial<BozzaModello> = {}): BozzaModello => ({
    id: null, nome: "Mio", descrizione: "", fasi: [{ nome: "Demolizioni", sottofasi: [] }], ...patch,
  });
  it("senza nome non passa", () => {
    expect(validaBozza(ok({ nome: "   " }))).toEqual({ ok: false, errore: "Dai un nome al modello." });
  });
  it("senza nemmeno una fase con un nome non passa", () => {
    expect(validaBozza(ok({ fasi: [{ nome: "  ", sottofasi: [] }] }))).toEqual({ ok: false, errore: "Un modello ha almeno una fase, con un nome." });
  });
  it("ripulisce: spazi, voci vuote, peso intero tra 1 e 100, descrizione vuota → null", () => {
    const esito = validaBozza(ok({
      nome: "  Mio  ", descrizione: "   ",
      fasi: [
        { nome: " Elettrico ", sottofasi: [{ nome: " Tracce ", peso: 2.6 }, { nome: " ", peso: 5 }, { nome: "Cavi", peso: 0 }, { nome: "Quadro", peso: 500 }] },
        { nome: "", sottofasi: [{ nome: "orfana", peso: 1 }] },
      ],
    }));
    expect(esito).toEqual({
      ok: true,
      payload: {
        id: null, nome: "Mio", descrizione: null,
        fasi: [{ nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 3 }, { nome: "Cavi", peso: 1 }, { nome: "Quadro", peso: 100 }] }],
      },
    });
  });
  it("rifiuta nomi troppo lunghi e troppe fasi o sottofasi", () => {
    expect(validaBozza(ok({ nome: "x".repeat(81) })).ok).toBe(false);
    expect(validaBozza(ok({ fasi: [{ nome: "y".repeat(161), sottofasi: [] }] })).ok).toBe(false);
    expect(validaBozza(ok({ fasi: Array.from({ length: 61 }, (_, i): FaseModello => ({ nome: `F${i}`, sottofasi: [] })) })).ok).toBe(false);
    expect(validaBozza(ok({ fasi: [{ nome: "F", sottofasi: Array.from({ length: 41 }, (_, i) => ({ nome: `S${i}`, peso: 1 })) }] })).ok).toBe(false);
  });
  it("tiene l'id di un modello che si sta modificando", () => {
    const esito = validaBozza(ok({ id: "m1" }));
    expect(esito.ok && esito.payload.id).toBe("m1");
  });
});

describe("fasiPerCommessa", () => {
  it("è quello che arriva a «aggiungi_fasi_commessa»: nomi e pesi interi, senza i campi del modello", () => {
    expect(fasiPerCommessa(mio)).toEqual([
      { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
      { nome: "Collaudo", sottofasi: [] },
    ]);
  });
});

describe("riordino", () => {
  it("sposta su e giù senza uscire dai bordi e senza toccare l'originale", () => {
    const l = ["a", "b", "c"];
    expect(sposta(l, 1, -1)).toEqual(["b", "a", "c"]);
    expect(sposta(l, 1, 1)).toEqual(["a", "c", "b"]);
    expect(sposta(l, 0, -1)).toEqual(["a", "b", "c"]);
    expect(sposta(l, 2, 1)).toEqual(["a", "b", "c"]);
    expect(l).toEqual(["a", "b", "c"]);
  });
  it("sostituisce e rimuove senza toccare l'originale", () => {
    const l = [{ n: "a" }, { n: "b" }];
    expect(sostituisci(l, 1, { n: "z" })).toEqual([{ n: "a" }, { n: "z" }]);
    expect(rimuovi(l, 0)).toEqual([{ n: "b" }]);
    expect(l).toEqual([{ n: "a" }, { n: "b" }]);
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/logic/modelliFasi.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/orders/modelliFasi"`.

- [ ] **Step 3: scrivi il modulo**

```ts
// src/lib/orders/modelliFasi.ts
/**
 * Modelli di fasi (07/10/2026): quelli dell'azienda, con le sottofasi, e i
 * modelli di partenza (gli 8 che l'azienda fa suoi la prima volta).
 * Modulo puro: nessun React, nessun Supabase.
 */
import type { PhaseTemplate } from "@/hooks/useOrderWorkPhases";

export interface SottofaseModello { nome: string; peso: number }
export interface FaseModello { nome: string; sottofasi: SottofaseModello[] }
export type OrigineModello = "azienda" | "partenza";

export interface ModelloFasi {
  /** uuid del modello dell'azienda; i modelli di partenza non ancora suoi hanno «partenza:<chiave>». */
  id: string;
  origine: OrigineModello;
  nome: string;
  descrizione: string;
  fasi: FaseModello[];
}

export const PREFISSO_PARTENZA = "partenza:";
export const MAX_FASI_MODELLO = 60;
export const MAX_SOTTOFASI_FASE = 40;
export const MAX_NOME_MODELLO = 80;
export const MAX_NOME_VOCE = 160;

export const eModelloDiPartenza = (id: string): boolean => id.startsWith(PREFISSO_PARTENZA);

export function modelloDiPartenza(t: PhaseTemplate): ModelloFasi {
  return {
    id: `${PREFISSO_PARTENZA}${t.key}`, origine: "partenza", nome: t.label, descrizione: t.hint,
    fasi: t.phases.map((nome): FaseModello => ({ nome, sottofasi: [] })),
  };
}

/**
 * I modelli che «Scegli le fasi» e la pagina delle impostazioni mostrano: quelli
 * dell'azienda se li ha già fatti suoi (anche se li ha tolti tutti); finché non
 * lo ha fatto, quelli di partenza, uguali a quelli di sempre, dopo gli eventuali
 * modelli che ha già salvato lei (senza ripetere quelli con lo stesso nome).
 */
export function modelliDaOffrire(
  inizializzati: boolean,
  azienda: ReadonlyArray<ModelloFasi>,
  partenza: ReadonlyArray<PhaseTemplate>,
): ModelloFasi[] {
  if (inizializzati) return [...azienda];
  const nomi = new Set(azienda.map((m) => m.nome.trim().toLowerCase()));
  return [...azienda, ...partenza.filter((t) => !nomi.has(t.label.trim().toLowerCase())).map(modelloDiPartenza)];
}

/** Cosa si manda a inizializza_modelli_fasi per darli all'azienda. */
export interface ModelloPerServer { nome: string; descrizione: string; fasi: FaseModello[] }
export function modelliPerInizializzare(partenza: ReadonlyArray<PhaseTemplate>): ModelloPerServer[] {
  return partenza.map((t) => ({
    nome: t.label, descrizione: t.hint,
    fasi: t.phases.map((nome): FaseModello => ({ nome, sottofasi: [] })),
  }));
}

/** Quanti modelli di partenza l'azienda non ha (più), per nome: serve a «Ripristina i predefiniti». */
export function modelliDiPartenzaMancanti(partenza: ReadonlyArray<PhaseTemplate>, azienda: ReadonlyArray<ModelloFasi>): number {
  const nomi = new Set(azienda.map((m) => m.nome.trim().toLowerCase()));
  return partenza.filter((t) => !nomi.has(t.label.trim().toLowerCase())).length;
}

export const totaleSottofasi = (m: Pick<ModelloFasi, "fasi">): number =>
  m.fasi.reduce((n, f) => n + f.sottofasi.length, 0);

// ── dalle tre tabelle all'albero ────────────────────────────────────────────
export interface RigaModello { id: string; name: string; hint: string | null; position: number }
export interface RigaFaseModello { id: string; template_id: string; name: string; position: number }
export interface RigaSottofaseModello { id: string; template_phase_id: string; name: string; position: number; peso: number }

export function assemblaModelli(
  modelli: ReadonlyArray<RigaModello>,
  fasi: ReadonlyArray<RigaFaseModello>,
  sottofasi: ReadonlyArray<RigaSottofaseModello>,
): ModelloFasi[] {
  const perPosizione = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  const sottoPerFase = new Map<string, RigaSottofaseModello[]>();
  for (const s of sottofasi) sottoPerFase.set(s.template_phase_id, [...(sottoPerFase.get(s.template_phase_id) ?? []), s]);
  const fasiPerModello = new Map<string, RigaFaseModello[]>();
  for (const f of fasi) fasiPerModello.set(f.template_id, [...(fasiPerModello.get(f.template_id) ?? []), f]);
  return [...modelli].sort(perPosizione).map((m): ModelloFasi => ({
    id: m.id, origine: "azienda", nome: m.name, descrizione: m.hint ?? "",
    fasi: [...(fasiPerModello.get(m.id) ?? [])].sort(perPosizione).map((f) => ({
      nome: f.name,
      sottofasi: [...(sottoPerFase.get(f.id) ?? [])].sort(perPosizione).map((s) => ({ nome: s.name, peso: s.peso })),
    })),
  }));
}

// ── bozza e validazione (l'editor lavora su una bozza) ──────────────────────
export interface BozzaModello { id: string | null; nome: string; descrizione: string; fasi: FaseModello[] }
export interface PayloadModello { id: string | null; nome: string; descrizione: string | null; fasi: FaseModello[] }
export type EsitoBozza = { ok: true; payload: PayloadModello } | { ok: false; errore: string };

export const bozzaVuota = (): BozzaModello => ({ id: null, nome: "", descrizione: "", fasi: [{ nome: "", sottofasi: [] }] });

/** Duplicare un modello dà una bozza nuova, «Copia di …»; modificarlo ne tiene l'id. */
export function bozzaDaModello(m: ModelloFasi, comeCopia: boolean): BozzaModello {
  return {
    id: comeCopia ? null : m.id,
    nome: comeCopia ? `Copia di ${m.nome}`.slice(0, MAX_NOME_MODELLO) : m.nome,
    descrizione: m.descrizione,
    fasi: m.fasi.map((f) => ({ nome: f.nome, sottofasi: f.sottofasi.map((s) => ({ ...s })) })),
  };
}

const pesoIntero = (peso: number): number =>
  Math.min(100, Math.max(1, Math.round(Number.isFinite(peso) ? peso : 1)));

export function validaBozza(b: BozzaModello): EsitoBozza {
  const nome = b.nome.trim();
  if (!nome) return { ok: false, errore: "Dai un nome al modello." };
  if (nome.length > MAX_NOME_MODELLO) return { ok: false, errore: `Il nome è troppo lungo (massimo ${MAX_NOME_MODELLO} caratteri).` };
  const fasi = b.fasi
    .map((f) => ({
      nome: f.nome.trim(),
      sottofasi: f.sottofasi.map((s) => ({ nome: s.nome.trim(), peso: pesoIntero(s.peso) })).filter((s) => s.nome),
    }))
    .filter((f) => f.nome);
  if (fasi.length === 0) return { ok: false, errore: "Un modello ha almeno una fase, con un nome." };
  if (fasi.length > MAX_FASI_MODELLO) return { ok: false, errore: `Troppe fasi: al massimo ${MAX_FASI_MODELLO}.` };
  if (fasi.some((f) => f.nome.length > MAX_NOME_VOCE || f.sottofasi.some((s) => s.nome.length > MAX_NOME_VOCE))) {
    return { ok: false, errore: `Un nome di fase o di sottofase è troppo lungo (massimo ${MAX_NOME_VOCE} caratteri).` };
  }
  if (fasi.some((f) => f.sottofasi.length > MAX_SOTTOFASI_FASE)) {
    return { ok: false, errore: `Troppe sottofasi in una fase: al massimo ${MAX_SOTTOFASI_FASE}.` };
  }
  return { ok: true, payload: { id: b.id, nome, descrizione: b.descrizione.trim() || null, fasi } };
}

/** Quello che arriva a «aggiungi_fasi_commessa» per un modello scelto. */
export function fasiPerCommessa(m: Pick<ModelloFasi, "fasi">): FaseModello[] {
  return m.fasi.map((f) => ({ nome: f.nome, sottofasi: f.sottofasi.map((s) => ({ nome: s.nome, peso: pesoIntero(s.peso) })) }));
}

// ── riordino, senza toccare l'originale ─────────────────────────────────────
export function sposta<T>(lista: ReadonlyArray<T>, indice: number, verso: -1 | 1): T[] {
  const j = indice + verso;
  if (indice < 0 || indice >= lista.length || j < 0 || j >= lista.length) return [...lista];
  const copia = [...lista];
  [copia[indice], copia[j]] = [copia[j], copia[indice]];
  return copia;
}
export const sostituisci = <T,>(lista: ReadonlyArray<T>, indice: number, patch: Partial<T>): T[] =>
  lista.map((x, i) => (i === indice ? { ...x, ...patch } : x));
export const rimuovi = <T,>(lista: ReadonlyArray<T>, indice: number): T[] => lista.filter((_, i) => i !== indice);
```

- [ ] **Step 4: lancia i test, devono passare**

Run: `npx vitest run src/test/logic/modelliFasi.test.ts`
Expected: PASS (tutti i casi).

- [ ] **Step 5: commit**

```bash
git add src/lib/orders/modelliFasi.ts src/test/logic/modelliFasi.test.ts
git commit -m "Modelli di fasi: logica pura (modelli dell'azienda e di partenza, bozze, validazione, riordino)"
```

### Task 8: la migrazione dei modelli

**Files:**
- Create: `supabase/migrations/20281007140000_modelli_fasi_azienda.sql`
- Test: `src/test/logic/modelliFasiMigrazione.test.ts`

- [ ] **Step 1: verifica che la versione sia libera**

Run: `ls supabase/migrations/20281007140000_*.sql`
Expected: `No such file or directory`.

- [ ] **Step 2: scrivi il test sul testo (fallisce: il file non c'è)**

```ts
// src/test/logic/modelliFasiMigrazione.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007140000_modelli_fasi_azienda.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = (nome: string) => codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`))![0];
const RPC = [
  "salva_modello_fasi(uuid, jsonb)",
  "elimina_modello_fasi(uuid, uuid)",
  "salva_commessa_come_modello(uuid, text)",
  "inizializza_modelli_fasi(uuid, jsonb, boolean)",
  "aggiungi_fasi_commessa(uuid, jsonb)",
];

describe("migrazione modelli_fasi_azienda", () => {
  it("è rilanciabile e non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    for (const t of ["work_phase_templates", "work_phase_template_phases", "work_phase_template_subphases", "company_fasi_settings"]) {
      expect(codice).toContain(`create table if not exists public.${t}`);
      expect(codice).toContain(`alter table public.${t} enable row level security;`);
    }
  });

  it("le tabelle sono chiuse in scrittura: ai client resta la lettura (più il blocco degli utenti bloccati)", () => {
    expect(codice).toMatch(/revoke all on public\.work_phase_templates[^;]*from anon, authenticated;/);
    expect(codice).toMatch(/grant select on public\.work_phase_templates[^;]*to authenticated;/);
    const policy = [...codice.matchAll(/create policy (\w+) on public\.(\w+)\s+(?:as restrictive\s+)?for (\w+) to authenticated/g)];
    expect(policy.length).toBeGreaterThanOrEqual(8);
    // Nessuna policy permette di scrivere: solo lettura, più il blocco restrittivo degli utenti bloccati.
    expect(policy.filter((m) => m[1] !== "blocco_utente_bloccato" && m[3] !== "select")).toEqual([]);
  });

  it("le RPC sono SECURITY DEFINER con search_path fisso, chiuse ad anon e aperte ad authenticated", () => {
    for (const f of RPC) {
      expect(codice).toContain(`revoke all on function public.${f} from public, anon;`);
      expect(codice).toContain(`grant execute on function public.${f} to authenticated;`);
    }
    expect(codice.match(/security definer\s+set search_path = public/g) ?? []).toHaveLength(RPC.length);
  });

  it("i modelli si scrivono col permesso delle impostazioni, le fasi in commessa con «Ordini e Commesse» dell'azienda della COMMESSA", () => {
    expect(codice.match(/'can_edit_settings_orders'/g)!.length).toBeGreaterThanOrEqual(4);
    const aggiungi = funzione("aggiungi_fasi_commessa");
    expect(aggiungi).toMatch(/v_azienda uuid := public\.get_order_company_id\(p_order_id\);/);
    expect(aggiungi).toMatch(/has_permission_for_company\(auth\.uid\(\), 'can_edit_orders', v_azienda\)/);
    expect(aggiungi).not.toMatch(/has_permission\(/);
  });

  it("le sottofasi di una commessa si scrivono senza azienda né commessa: le porta la fase", () => {
    expect(funzione("aggiungi_fasi_commessa")).toMatch(/insert into public\.order_work_subphases \(phase_id, name, position, peso\)/);
  });

  it("i modelli di partenza: una volta sola, serializzati dal blocco della riga, rifiutati a chi non può", () => {
    const f = funzione("inizializza_modelli_fasi");
    expect(f).toMatch(/select modelli_inizializzati into v_gia from public\.company_fasi_settings where company_id = p_company_id for update;/);
    expect(f).toMatch(/if v_gia and not p_solo_mancanti then\s+return 0;/);
    expect(f).toContain("'can_edit_settings_orders'");
    expect(f).toMatch(/exception when unique_violation then null;/);
  });

  it("il nome di un modello è unico nell'azienda, senza badare a maiuscole e spazi", () => {
    expect(codice).toMatch(/create unique index if not exists work_phase_templates_nome_uk on public\.work_phase_templates \(company_id, lower\(btrim\(name\)\)\);/);
  });

  it("non tocca order_work_phases (nessuna colonna, nessun trigger)", () => {
    expect(codice).not.toMatch(/alter table public\.order_work_phases/i);
    expect(codice).not.toMatch(/trigger[^;]*on public\.order_work_phases/i);
  });

  it("rispetta i guardiani delle migrazioni nuove", () => {
    expect(codice).not.toMatch(/(<>|!=)\s*(public\.)?(get_my_company_id|get_effective_company_id)\(\)/);
    expect(codice).not.toContain("'company_admin'");
  });
});
```

- [ ] **Step 3: lancia il test, deve fallire**

Run: `npx vitest run src/test/logic/modelliFasiMigrazione.test.ts`
Expected: FAIL — `ENOENT … 20281007140000_modelli_fasi_azienda.sql`.

- [ ] **Step 4: scrivi la migrazione**

```sql
-- Modelli di fasi per azienda (07/10/2026).
--
-- «Scegli le fasi» offriva otto modelli scritti nel codice, uguali per tutte le
-- aziende, che creavano solo i nomi delle fasi. Ora ogni azienda ha i SUOI
-- modelli, con le sottofasi, e li cambia, li toglie e ne aggiunge nelle
-- Impostazioni. Gli otto di partenza non sono più fissi: la prima volta che
-- l'azienda apre la pagina dei modelli diventano suoi (inizializza_modelli_fasi),
-- e da lì sono modelli come gli altri: modificabili ed eliminabili.
--
-- Cosa c'è.
--   · work_phase_templates → work_phase_template_phases → work_phase_template_subphases:
--     il modello è un albero. Le tabelle sono CHIUSE in scrittura: si scrivono
--     solo con le RPC qui sotto, che salvano tutto l'albero o niente (stesso
--     schema di campo_regole_azienda). Si leggono con la RLS.
--   · company_fasi_settings: una riga per azienda. Per ora, se i modelli di partenza
--     sono già stati portati tra i suoi; poi vi si aggiungono le regole dell'azienda.
--   · salva_modello_fasi, elimina_modello_fasi, salva_commessa_come_modello,
--     inizializza_modelli_fasi: permesso can_edit_settings_orders nell'azienda passata.
--   · aggiungi_fasi_commessa: crea fasi E sottofasi in una commessa in un colpo
--     solo (permesso can_edit_orders nell'azienda della COMMESSA).
--
-- Additiva: tabelle e funzioni nuove, nessun dato esistente cambia. Dipende dalla
-- migrazione delle sottofasi (order_work_subphases).

set local lock_timeout = '3s';

create table if not exists public.work_phase_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  hint text check (hint is null or length(hint) <= 200),
  position integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists work_phase_templates_nome_uk on public.work_phase_templates (company_id, lower(btrim(name)));
create index if not exists work_phase_templates_azienda_idx on public.work_phase_templates (company_id, position);

create table if not exists public.work_phase_template_phases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null references public.work_phase_templates(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  position integer not null default 0
);
create index if not exists work_phase_template_phases_modello_idx on public.work_phase_template_phases (template_id, position);
create index if not exists work_phase_template_phases_azienda_idx on public.work_phase_template_phases (company_id);

create table if not exists public.work_phase_template_subphases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_phase_id uuid not null references public.work_phase_template_phases(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  position integer not null default 0,
  peso integer not null default 1 check (peso between 1 and 100)
);
create index if not exists work_phase_template_subphases_fase_idx on public.work_phase_template_subphases (template_phase_id, position);
create index if not exists work_phase_template_subphases_azienda_idx on public.work_phase_template_subphases (company_id);

create table if not exists public.company_fasi_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  modelli_inizializzati boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: solo lettura per i client; si scrive con le RPC
-- ---------------------------------------------------------------------------
alter table public.work_phase_templates enable row level security;
alter table public.work_phase_template_phases enable row level security;
alter table public.work_phase_template_subphases enable row level security;
alter table public.company_fasi_settings enable row level security;

revoke all on public.work_phase_templates, public.work_phase_template_phases,
              public.work_phase_template_subphases, public.company_fasi_settings from anon, authenticated;
grant select on public.work_phase_templates, public.work_phase_template_phases,
                public.work_phase_template_subphases, public.company_fasi_settings to authenticated;

drop policy if exists modelli_fasi_lettura on public.work_phase_templates;
create policy modelli_fasi_lettura on public.work_phase_templates for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

drop policy if exists modelli_fasi_fasi_lettura on public.work_phase_template_phases;
create policy modelli_fasi_fasi_lettura on public.work_phase_template_phases for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

drop policy if exists modelli_fasi_sottofasi_lettura on public.work_phase_template_subphases;
create policy modelli_fasi_sottofasi_lettura on public.work_phase_template_subphases for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

drop policy if exists fasi_impostazioni_lettura on public.company_fasi_settings;
create policy fasi_impostazioni_lettura on public.company_fasi_settings for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

drop policy if exists blocco_utente_bloccato on public.work_phase_templates;
create policy blocco_utente_bloccato on public.work_phase_templates as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists blocco_utente_bloccato on public.work_phase_template_phases;
create policy blocco_utente_bloccato on public.work_phase_template_phases as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists blocco_utente_bloccato on public.work_phase_template_subphases;
create policy blocco_utente_bloccato on public.work_phase_template_subphases as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists blocco_utente_bloccato on public.company_fasi_settings;
create policy blocco_utente_bloccato on public.company_fasi_settings as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- ---------------------------------------------------------------------------
-- salva_modello_fasi: crea o riscrive tutto l'albero di un modello
--   p_modello = { id?, nome, descrizione?, fasi: [ { nome, sottofasi: [ { nome, peso } ] } ] }
-- ---------------------------------------------------------------------------
create or replace function public.salva_modello_fasi(p_company_id uuid, p_modello jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_modello->>'id', '')::uuid;
  v_nome text := btrim(coalesce(p_modello->>'nome', ''));
  v_desc text := nullif(btrim(coalesce(p_modello->>'descrizione', '')), '');
  v_fase jsonb;
  v_sotto jsonb;
  v_fase_id uuid;
  v_pos integer := 0;
  v_pos_sotto integer;
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di modificare i modelli di fasi.' using errcode = '42501';
  end if;
  if v_nome = '' or length(v_nome) > 80 then
    raise exception 'Dai un nome al modello (massimo 80 caratteri).' using errcode = '22023';
  end if;
  if jsonb_typeof(p_modello->'fasi') is distinct from 'array' or jsonb_array_length(p_modello->'fasi') = 0 then
    raise exception 'Un modello ha almeno una fase.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_modello->'fasi') > 60 then
    raise exception 'Troppe fasi: al massimo 60.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.work_phase_templates (company_id, name, hint, position)
    values (p_company_id, v_nome, v_desc,
            coalesce((select max(position) + 1 from public.work_phase_templates where company_id = p_company_id), 0))
    returning id into v_id;
  else
    update public.work_phase_templates
       set name = v_nome, hint = v_desc, updated_at = now()
     where id = v_id and company_id = p_company_id;
    if not found then
      raise exception 'Modello non trovato.' using errcode = 'P0002';
    end if;
    -- Si riscrive tutto l'albero: i modelli sono piccoli e nessuno ne tiene l'id delle fasi.
    delete from public.work_phase_template_phases where template_id = v_id;
  end if;

  for v_fase in select value from jsonb_array_elements(p_modello->'fasi') loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = '';
    insert into public.work_phase_template_phases (company_id, template_id, name, position)
    values (p_company_id, v_id, left(btrim(v_fase->>'nome'), 160), v_pos)
    returning id into v_fase_id;
    v_pos := v_pos + 1;
    v_pos_sotto := 0;
    if jsonb_typeof(v_fase->'sottofasi') = 'array' then
      for v_sotto in select value from jsonb_array_elements(v_fase->'sottofasi') loop
        continue when btrim(coalesce(v_sotto->>'nome', '')) = '';
        insert into public.work_phase_template_subphases (company_id, template_phase_id, name, position, peso)
        values (p_company_id, v_fase_id, left(btrim(v_sotto->>'nome'), 160), v_pos_sotto,
                least(100, greatest(1, round(coalesce(nullif(v_sotto->>'peso', '')::numeric, 1))::integer)));
        v_pos_sotto := v_pos_sotto + 1;
      end loop;
    end if;
  end loop;

  if v_pos = 0 then
    raise exception 'Un modello ha almeno una fase con un nome.' using errcode = '22023';
  end if;
  return v_id;
end;
$$;

create or replace function public.elimina_modello_fasi(p_company_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di modificare i modelli di fasi.' using errcode = '42501';
  end if;
  delete from public.work_phase_templates where id = p_id and company_id = p_company_id;
end;
$$;

-- Le fasi (e sottofasi) di una commessa diventano un modello dell'azienda.
create or replace function public.salva_commessa_come_modello(p_order_id uuid, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_fasi jsonb;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', v_azienda)
     or not public.has_permission_for_company(auth.uid(), 'can_view_orders', v_azienda) then
    raise exception 'Non hai il permesso di salvare questo modello.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'nome', f.name,
             'sottofasi', coalesce((select jsonb_agg(jsonb_build_object('nome', s.name, 'peso', s.peso) order by s.position, s.created_at)
                                      from public.order_work_subphases s where s.phase_id = f.id), '[]'::jsonb))
           order by f.position, f.created_at), '[]'::jsonb)
    into v_fasi
    from public.order_work_phases f
   where f.order_id = p_order_id;

  return public.salva_modello_fasi(v_azienda, jsonb_build_object('nome', p_nome, 'descrizione', null, 'fasi', v_fasi));
end;
$$;

-- I modelli di partenza (quelli che il client ha nel codice) diventano modelli dell'azienda.
--   p_modelli = [ { nome, descrizione?, fasi: [ { nome, sottofasi: [] } ] } ]
-- La prima volta li porta tutti; poi non fa più niente, a meno che si chieda di
-- rimettere quelli che mancano (p_solo_mancanti): per nome, senza toccare gli altri.
create or replace function public.inizializza_modelli_fasi(p_company_id uuid, p_modelli jsonb, p_solo_mancanti boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gia boolean;
  v_modello jsonb;
  v_nome text;
  v_aggiunti integer := 0;
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di modificare i modelli di fasi.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_modelli) is distinct from 'array' or jsonb_array_length(p_modelli) > 40 then
    raise exception 'Elenco di modelli non valido.' using errcode = '22023';
  end if;

  insert into public.company_fasi_settings (company_id) values (p_company_id) on conflict (company_id) do nothing;
  -- Il blocco serializza due amministratori che aprono la pagina insieme: il secondo trova già fatto.
  select modelli_inizializzati into v_gia from public.company_fasi_settings where company_id = p_company_id for update;
  if v_gia and not p_solo_mancanti then
    return 0;
  end if;

  for v_modello in select value from jsonb_array_elements(p_modelli) loop
    v_nome := btrim(coalesce(v_modello->>'nome', ''));
    continue when v_nome = '';
    continue when exists (select 1 from public.work_phase_templates t
                           where t.company_id = p_company_id and lower(btrim(t.name)) = lower(v_nome));
    begin
      perform public.salva_modello_fasi(p_company_id, v_modello - 'id');
      v_aggiunti := v_aggiunti + 1;
    exception when unique_violation then null;
    end;
  end loop;

  update public.company_fasi_settings set modelli_inizializzati = true, updated_at = now() where company_id = p_company_id;
  return v_aggiunti;
end;
$$;

-- Fasi e sottofasi in una commessa, in un colpo solo.
--   p_fasi = [ { nome, sottofasi: [ { nome, peso } ] } ]
create or replace function public.aggiungi_fasi_commessa(p_order_id uuid, p_fasi jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_fase jsonb;
  v_sotto jsonb;
  v_fase_id uuid;
  v_base integer;
  v_aggiunte integer := 0;
  v_pos_sotto integer;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di aggiungere fasi a questa commessa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_fasi) is distinct from 'array' or jsonb_array_length(p_fasi) = 0 then
    raise exception 'Nessuna fase da aggiungere.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_fasi) > 60 then
    raise exception 'Troppe fasi in una volta: al massimo 60.' using errcode = '22023';
  end if;

  select coalesce(max(position) + 1, 0) into v_base from public.order_work_phases where order_id = p_order_id;

  for v_fase in select value from jsonb_array_elements(p_fasi) loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = '';
    insert into public.order_work_phases (company_id, order_id, name, position)
    values (v_azienda, p_order_id, left(btrim(v_fase->>'nome'), 160), v_base + v_aggiunte)
    returning id into v_fase_id;
    v_aggiunte := v_aggiunte + 1;
    v_pos_sotto := 0;
    if jsonb_typeof(v_fase->'sottofasi') = 'array' then
      for v_sotto in select value from jsonb_array_elements(v_fase->'sottofasi') loop
        continue when btrim(coalesce(v_sotto->>'nome', '')) = '';
        insert into public.order_work_subphases (phase_id, name, position, peso)
        values (v_fase_id, left(btrim(v_sotto->>'nome'), 160), v_pos_sotto,
                least(100, greatest(1, round(coalesce(nullif(v_sotto->>'peso', '')::numeric, 1))::integer)));
        v_pos_sotto := v_pos_sotto + 1;
      end loop;
    end if;
  end loop;

  if v_aggiunte = 0 then
    raise exception 'Nessuna fase con un nome da aggiungere.' using errcode = '22023';
  end if;
  return v_aggiunte;
end;
$$;

revoke all on function public.salva_modello_fasi(uuid, jsonb) from public, anon;
grant execute on function public.salva_modello_fasi(uuid, jsonb) to authenticated;
revoke all on function public.elimina_modello_fasi(uuid, uuid) from public, anon;
grant execute on function public.elimina_modello_fasi(uuid, uuid) to authenticated;
revoke all on function public.salva_commessa_come_modello(uuid, text) from public, anon;
grant execute on function public.salva_commessa_come_modello(uuid, text) to authenticated;
revoke all on function public.inizializza_modelli_fasi(uuid, jsonb, boolean) from public, anon;
grant execute on function public.inizializza_modelli_fasi(uuid, jsonb, boolean) to authenticated;
revoke all on function public.aggiungi_fasi_commessa(uuid, jsonb) from public, anon;
grant execute on function public.aggiungi_fasi_commessa(uuid, jsonb) to authenticated;
```

- [ ] **Step 5: lancia il test sul testo, deve passare**

Run: `npx vitest run src/test/logic/modelliFasiMigrazione.test.ts`
Expected: PASS (9 casi).

- [ ] **Step 6: commit locale (migrazione non ancora applicata)**

```bash
git add supabase/migrations/20281007140000_modelli_fasi_azienda.sql src/test/logic/modelliFasiMigrazione.test.ts
git commit -m "Modelli di fasi: tabelle, RLS e RPC atomiche, con i modelli di partenza che diventano dell'azienda (migrazione non ancora applicata)"
```

### Task 9: prova SQL a secco, poi applicazione (serve l'OK per la seconda parte)

- [ ] **Step 1: prova a secco** — una sola `execute_sql`: il contenuto **intero** di `20281007130000_sottofasi_commessa.sql` (se non è ancora applicata) e di `20281007140000_modelli_fasi_azienda.sql`, poi questo blocco, che annulla tutto alla fine.

```sql
do $prova$
declare
  v_azienda uuid; v_admin uuid; v_lavoratore uuid; v_altro uuid; v_ordine uuid;
  v_mod uuid; v_copia uuid; v_n integer; v_fase uuid; v_flag boolean;
  v_partenza jsonb := jsonb_build_array(
    jsonb_build_object('nome', 'PROVA Bagno', 'descrizione', 'Rifacimento bagno', 'fasi', jsonb_build_array(
      jsonb_build_object('nome', 'Demolizioni', 'sottofasi', '[]'::jsonb), jsonb_build_object('nome', 'Impianti', 'sottofasi', '[]'::jsonb))),
    jsonb_build_object('nome', 'PROVA Tetto', 'descrizione', 'Copertura', 'fasi', jsonb_build_array(
      jsonb_build_object('nome', 'Ponteggio', 'sottofasi', '[]'::jsonb))),
    jsonb_build_object('nome', '  ', 'fasi', jsonb_build_array(jsonb_build_object('nome', 'x'))));
begin
  select p.company_id into v_azienda
    from public.profiles p join auth.users u on u.id = p.id where u.email = 'demo@azienda.srl';
  select ur.user_id into v_admin from public.user_roles ur join public.profiles p on p.id = ur.user_id
   where p.company_id = v_azienda and ur.role = 'company_admin'::public.app_role limit 1;
  select o.id into v_ordine from public.orders o
   where o.company_id = v_azienda and o.deleted_at is null order by o.created_at limit 1;
  select a.user_id into v_lavoratore from public.order_campo_assignments a
    join public.orders o on o.id = a.order_id
   where o.company_id = v_azienda and a.user_id is not null
     and not public.has_permission_for_company(a.user_id, 'can_edit_orders', o.company_id)
     and not public.has_permission_for_company(a.user_id, 'can_edit_settings_orders', o.company_id) limit 1;
  select p.id into v_altro from public.profiles p
   where p.company_id is not null and p.company_id <> v_azienda
     and not exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'super_admin'::public.app_role)
   limit 1;
  if v_admin is null or v_ordine is null then
    raise exception 'PROVA SALTATA: serve un amministratore e una commessa nella demo';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. i modelli di partenza diventano dell'azienda: la prima volta tutti (il nome vuoto si scarta)
  v_n := public.inizializza_modelli_fasi(v_azienda, v_partenza);
  if v_n <> 2 then raise exception 'KO 1: modelli portati %, attesi 2', v_n; end if;
  select modelli_inizializzati into v_flag from public.company_fasi_settings where company_id = v_azienda;
  if not coalesce(v_flag, false) then raise exception 'KO 2: la bandiera «inizializzati» non è accesa'; end if;
  -- la seconda volta non fa niente, nemmeno se cambia l'elenco
  v_n := public.inizializza_modelli_fasi(v_azienda, v_partenza);
  if v_n <> 0 then raise exception 'KO 3: la seconda inizializzazione ha portato % modelli', v_n; end if;

  -- 2. sono modelli come gli altri: si cambiano e si tolgono
  select id into v_mod from public.work_phase_templates where company_id = v_azienda and name = 'PROVA Bagno';
  v_mod := public.salva_modello_fasi(v_azienda, jsonb_build_object('id', v_mod, 'nome', 'PROVA Bagno', 'descrizione', 'cambiato', 'fasi', jsonb_build_array(
    jsonb_build_object('nome', 'Impianto elettrico', 'sottofasi', jsonb_build_array(
      jsonb_build_object('nome', 'Tracce', 'peso', 2), jsonb_build_object('nome', 'Cavi', 'peso', 3), jsonb_build_object('nome', '  ', 'peso', 1))),
    jsonb_build_object('nome', 'Collaudo', 'sottofasi', '[]'::jsonb),
    jsonb_build_object('nome', ' ', 'sottofasi', '[]'::jsonb))));
  select count(*) into v_n from public.work_phase_template_phases where template_id = v_mod;
  if v_n <> 2 then raise exception 'KO 4: fasi salvate %, attese 2 (il nome vuoto si scarta)', v_n; end if;
  select count(*) into v_n from public.work_phase_template_subphases s
    join public.work_phase_template_phases f on f.id = s.template_phase_id where f.template_id = v_mod;
  if v_n <> 2 then raise exception 'KO 5: sottofasi salvate %, attese 2', v_n; end if;

  perform public.elimina_modello_fasi(v_azienda, (select id from public.work_phase_templates where company_id = v_azienda and name = 'PROVA Tetto'));
  select count(*) into v_n from public.work_phase_templates where company_id = v_azienda and name = 'PROVA Tetto';
  if v_n <> 0 then raise exception 'KO 6: il modello di partenza eliminato c''è ancora'; end if;
  -- tolto, non torna da solo: l'inizializzazione ormai è fatta
  v_n := public.inizializza_modelli_fasi(v_azienda, v_partenza);
  if v_n <> 0 then raise exception 'KO 7: un modello eliminato è tornato da solo (%)', v_n; end if;
  -- «rimetti i predefiniti»: solo quelli che mancano, senza toccare gli altri
  v_n := public.inizializza_modelli_fasi(v_azienda, v_partenza, true);
  if v_n <> 1 then raise exception 'KO 8: rimessi % modelli, atteso solo quello mancante', v_n; end if;
  if (select descrizione from (select hint as descrizione from public.work_phase_templates where company_id = v_azienda and name = 'PROVA Bagno') x) <> 'cambiato' then
    raise exception 'KO 9: il modello cambiato è stato riscritto';
  end if;

  -- 3. lo applico alla commessa: fasi in coda, sottofasi collegate alla fase, fase a 0%
  v_n := public.aggiungi_fasi_commessa(v_ordine, jsonb_build_array(
    jsonb_build_object('nome', 'PROVA A', 'sottofasi', jsonb_build_array(
      jsonb_build_object('nome', 's1', 'peso', 1), jsonb_build_object('nome', 's2', 'peso', 3))),
    jsonb_build_object('nome', 'PROVA B', 'sottofasi', '[]'::jsonb)));
  if v_n <> 2 then raise exception 'KO 10: fasi aggiunte %, attese 2', v_n; end if;
  select id into v_fase from public.order_work_phases where order_id = v_ordine and name = 'PROVA A';
  select count(*) into v_n from public.order_work_subphases where phase_id = v_fase;
  if v_n <> 2 then raise exception 'KO 11: sottofasi della fase %, attese 2', v_n; end if;
  if (select percentuale from public.order_work_phases where id = v_fase) <> 0 then raise exception 'KO 12: la fase nuova non parte da 0'; end if;
  if (select position from public.order_work_phases where id = v_fase) >=
     (select position from public.order_work_phases where order_id = v_ordine and name = 'PROVA B') then
    raise exception 'KO 13: le fasi non sono in ordine';
  end if;

  -- 4. «Salva come modello» dalla commessa porta con sé le sottofasi
  v_copia := public.salva_commessa_come_modello(v_ordine, 'PROVA copia');
  select count(*) into v_n from public.work_phase_template_subphases s
    join public.work_phase_template_phases f on f.id = s.template_phase_id
   where f.template_id = v_copia and f.name = 'PROVA A';
  if v_n <> 2 then raise exception 'KO 14: sottofasi della copia %, attese 2', v_n; end if;

  -- 5. nome doppio (senza badare a maiuscole e spazi): rifiutato
  begin
    perform public.salva_modello_fasi(v_azienda, jsonb_build_object('nome', ' prova COPIA ',
      'fasi', jsonb_build_array(jsonb_build_object('nome', 'x'))));
    raise exception 'KO 15: nome doppio accettato';
  exception when unique_violation then null;
  end;

  reset role;

  -- 6. un lavoratore (senza permessi) non scrive modelli, non li inizializza, non aggiunge fasi
  if v_lavoratore is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_lavoratore, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.salva_modello_fasi(v_azienda, jsonb_build_object('nome', 'x', 'fasi', jsonb_build_array(jsonb_build_object('nome', 'y'))));
      raise exception 'KO 16: il lavoratore ha salvato un modello';
    exception when sqlstate '42501' then null;
    end;
    begin
      perform public.inizializza_modelli_fasi(v_azienda, v_partenza, true);
      raise exception 'KO 17: il lavoratore ha inizializzato i modelli';
    exception when sqlstate '42501' then null;
    end;
    begin
      perform public.aggiungi_fasi_commessa(v_ordine, jsonb_build_array(jsonb_build_object('nome', 'z')));
      raise exception 'KO 18: il lavoratore ha aggiunto fasi';
    exception when sqlstate '42501' then null;
    end;
    reset role;
  end if;

  -- 7. un utente di un'altra azienda non vede i modelli e non tocca la commessa
  if v_altro is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_altro, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.work_phase_templates where company_id = v_azienda;
    if v_n <> 0 then raise exception 'KO 19: un''altra azienda vede % modelli', v_n; end if;
    begin
      perform public.aggiungi_fasi_commessa(v_ordine, jsonb_build_array(jsonb_build_object('nome', 'z')));
      raise exception 'KO 20: un''altra azienda ha aggiunto fasi';
    exception when sqlstate '42501' then null;
    end;
    reset role;
  end if;

  -- 8. il backup copre le tabelle nuove
  select count(*) into v_n from public.admin_backup_tabelle_scoperte();
  if v_n <> 0 then raise exception 'KO 21: il backup lascia % tabelle scoperte', v_n; end if;

  raise exception 'PROVA OK — annullata di proposito, niente è stato salvato (lavoratore: %, altra azienda: %)',
    (v_lavoratore is not null), (v_altro is not null);
end
$prova$;
```

Expected: `PROVA OK — annullata di proposito …`. Un `KO n` dice la regola che non regge.

- [ ] **Step 2: chiedi l'OK e applica** (dopo la migrazione delle sottofasi): `apply_migration` con `name: "modelli_fasi_azienda"` e il contenuto del file; poi

```sql
update supabase_migrations.schema_migrations
   set version = '20281007140000'
 where name = 'modelli_fasi_azienda' and left(version, 4) = '2026';
```

- [ ] **Step 3: verifica**

```sql
select version, name from supabase_migrations.schema_migrations where version = '20281007140000';   -- 1 riga
select * from public.admin_backup_tabelle_scoperte();                                               -- 0 righe
-- 5 righe, tutte con anon = false e authenticated = true
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as authenticated
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('salva_modello_fasi', 'elimina_modello_fasi', 'salva_commessa_come_modello', 'inizializza_modelli_fasi', 'aggiungi_fasi_commessa');
```

### Task 10: l'hook dei modelli e «Scegli le fasi» che usa la RPC

**Files:**
- Create: `src/hooks/useModelliFasi.ts`
- Modify: `src/hooks/useOrderWorkPhases.ts` (`applyTemplate`, ~riga 417)

- [ ] **Step 1: scrivi l'hook**

```ts
// src/hooks/useModelliFasi.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { assemblaModelli, type ModelloFasi, type ModelloPerServer, type PayloadModello } from "@/lib/orders/modelliFasi";

// Le tabelle non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface ModelliAzienda {
  modelli: ModelloFasi[];
  /** I modelli di partenza sono già stati fatti suoi dall'azienda. */
  inizializzati: boolean;
  /** La lettura è andata a buon fine (le tabelle ci sono): senza, si offrono i modelli di partenza e non si tenta nulla. */
  disponibile: boolean;
}
const NESSUNO: ModelliAzienda = { modelli: [], inizializzati: false, disponibile: false };

export const chiaveModelliFasi = (companyId: string | undefined) => ["modelli-fasi", companyId] as const;

/** Messaggi in italiano per gli errori che l'utente può causare. */
export function messaggioModello(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "23505") return "Esiste già un modello con questo nome.";
  if (err?.code === "42501") return "Non hai il permesso di modificare i modelli di fasi.";
  return err?.message || "Operazione non riuscita. Riprova.";
}

/** I modelli di fasi dell'azienda. */
export function useModelliFasi() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chiaveModelliFasi(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<ModelliAzienda> => {
      // Se la lettura fallisce (tabelle non ancora create, rete) si offrono i soli modelli di partenza.
      try {
        const [m, f, s, impostazioni] = await Promise.all([
          db.from("work_phase_templates").select("id, name, hint, position").eq("company_id", companyId!).order("position"),
          db.from("work_phase_template_phases").select("id, template_id, name, position").eq("company_id", companyId!).order("position"),
          db.from("work_phase_template_subphases").select("id, template_phase_id, name, position, peso").eq("company_id", companyId!).order("position"),
          db.from("company_fasi_settings").select("modelli_inizializzati").eq("company_id", companyId!).maybeSingle(),
        ]);
        for (const r of [m, f, s, impostazioni]) if (r.error) throw r.error;
        return {
          modelli: assemblaModelli(m.data ?? [], f.data ?? [], s.data ?? []),
          inizializzati: Boolean(impostazioni.data?.modelli_inizializzati),
          disponibile: true,
        };
      } catch {
        return NESSUNO;
      }
    },
  });

  const riparti = () => qc.invalidateQueries({ queryKey: chiaveModelliFasi(companyId) });
  const onError = (e: unknown) => toast.error(messaggioModello(e));

  const salva = useMutation({
    mutationFn: async (modello: PayloadModello): Promise<string> => {
      const { data, error } = await db.rpc("salva_modello_fasi", { p_company_id: companyId, p_modello: modello });
      if (error) throw error;
      return data as string;
    },
    onSuccess: riparti,
    onError,
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("elimina_modello_fasi", { p_company_id: companyId, p_id: id });
      if (error) throw error;
    },
    onSuccess: riparti,
    onError,
  });

  // I modelli di partenza diventano dell'azienda (una volta), o si rimettono quelli che mancano.
  const inizializza = useMutation({
    mutationFn: async ({ modelli, soloMancanti }: { modelli: ModelloPerServer[]; soloMancanti: boolean }): Promise<number> => {
      const { data, error } = await db.rpc("inizializza_modelli_fasi", {
        p_company_id: companyId, p_modelli: modelli, p_solo_mancanti: soloMancanti,
      });
      if (error) throw error;
      return Number(data) || 0;
    },
    onSuccess: riparti,
    onError,
  });

  return {
    modelli: query.data?.modelli ?? NESSUNO.modelli,
    inizializzati: query.data?.inizializzati ?? false,
    disponibile: query.data?.disponibile ?? false,
    isLoading: query.isLoading,
    salva, elimina, inizializza,
  };
}
```

- [ ] **Step 2: `applyTemplate` chiama la RPC**

In `src/hooks/useOrderWorkPhases.ts` aggiungi l'importazione del tipo, con le altre:

```ts
import type { FaseModello } from "@/lib/orders/modelliFasi";
```

e sostituisci `applyTemplate` (oggi un `insert` di soli nomi):

```ts
  const applyTemplate = useMutation({
    // Fasi e sottofasi in un colpo solo, dal server (aggiungi_fasi_commessa): il
    // permesso si controlla là e un modello non resta a metà.
    mutationFn: async (fasi: FaseModello[]) => {
      const { error } = await db.rpc("aggiungi_fasi_commessa", { p_order_id: orderId, p_fasi: fasi });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError,
  });
```

- [ ] **Step 3: il guardiano delle scritture, con un'attesa da aggiornare**

Run: `npx vitest run src/test/logic/faseCampiProtetti.test.ts`
Expected: **un solo caso rosso**, «l'ufficio crea le fasi nell'azienda in cui lavora…»: conta due punti che scrivono `company_id: companyId, order_id: orderId` nell'hook (`addPhase` e il vecchio `applyTemplate`), e ora ne resta uno, perché `applyTemplate` passa da `aggiungi_fasi_commessa`, che **prende l'azienda dalla commessa** (`get_order_company_id`) invece di riceverla dal client: è più sicuro, non meno. Gli altri casi restano verdi: `useOrderWorkPhases.ts` scrive ancora `order_work_phases` (`addPhase`, `updatePhase`, `deletePhase`) e nessun file nuovo si è aggiunto.

Il file è dell'altra sessione (se non è ancora committato, il ritocco va dove sta): in quel caso, cambia le due righe dell'attesa così

```ts
    expect(hook).toContain("const companyId = effectiveCompany?.id;");
    // addPhase inserisce da sé, nell'azienda in cui lavora; applyTemplate passa da
    // aggiungi_fasi_commessa, che prende l'azienda dalla commessa e non la riceve dal client.
    expect(hook.match(/company_id: companyId, order_id: orderId/g)).toHaveLength(1);
    expect(hook).toContain('db.rpc("aggiungi_fasi_commessa", { p_order_id: orderId, p_fasi: fasi })');
```

e rilancia: PASS. Chi dei due lavori entra per secondo ritocca quest'attesa.

- [ ] **Step 4: typecheck mirato** su `useModelliFasi.ts` e `useOrderWorkPhases.ts`. Expected: nessun errore nuovo.

- [ ] **Step 5: commit**

```bash
git add src/hooks/useModelliFasi.ts src/hooks/useOrderWorkPhases.ts
# (e src/test/logic/faseCampiProtetti.test.ts, solo se è già tracciato: altrimenti è dell'altra sessione e non entra nel mio commit)
git commit -m "Modelli di fasi: hook per i modelli dell'azienda; «Scegli le fasi» crea fasi e sottofasi dal server"
```

### Task 11: «Scegli le fasi» offre i modelli dell'azienda

**Files:**
- Create: `src/components/orders/ModelliFasiPicker.tsx`
- Modify: `src/components/orders/OrderWorkPhases.tsx` (stato e dialog a ~righe 269-300 e 352-410)
- Modify: `src/test/ui/orderWorkPlanning.test.tsx`, `src/test/ui/commessaTelefono.test.tsx` (mock di `useModelliFasi`)
- Test: `src/test/ui/modelliFasiPicker.test.tsx`

Per chi non ha ancora fatto suoi i modelli il dialog **resta identico** (stessa etichetta «Parti da un modello», stessi pulsanti, gli stessi 8 modelli); dopo, offre i suoi.

- [ ] **Step 1: scrivi i test che falliscono**

```tsx
// src/test/ui/modelliFasiPicker.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelliFasiPicker } from "@/components/orders/ModelliFasiPicker";
import type { ModelloFasi } from "@/lib/orders/modelliFasi";

const state = vi.hoisted(() => ({ modelli: [] as unknown[], inizializzati: false }));
vi.mock("@/hooks/useModelliFasi", () => ({ useModelliFasi: () => ({ modelli: state.modelli, inizializzati: state.inizializzati }) }));
vi.mock("@/hooks/useOrderWorkPhases", () => ({
  PHASE_TEMPLATES: [
    { key: "bagno", label: "Bagno", hint: "Rifacimento bagno", phases: ["Demolizioni", "Impianti"] },
    { key: "tetto", label: "Tetto", hint: "Copertura", phases: ["Ponteggio"] },
  ],
}));

const mio: ModelloFasi = {
  id: "m1", origine: "azienda", nome: "Impianti completi", descrizione: "Elettrico e idraulico",
  fasi: [
    { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
    { nome: "Collaudo", sottofasi: [] },
  ],
};
beforeEach(() => { state.modelli = []; state.inizializzati = false; });
afterEach(cleanup);

describe("ModelliFasiPicker", () => {
  it("finché l'azienda non li ha fatti suoi è quello di sempre: «Parti da un modello» e gli stessi modelli", () => {
    render(<ModelliFasiPicker onApplica={vi.fn()} inCorso={false} />);
    expect(screen.getByText("Parti da un modello")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bagno" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tetto" })).toBeInTheDocument();
  });

  it("un modello salvato prima di aver fatto suoi quelli di partenza compare insieme a loro", () => {
    state.modelli = [mio];
    render(<ModelliFasiPicker onApplica={vi.fn()} inCorso={false} />);
    expect(screen.getByRole("button", { name: "Impianti completi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bagno" })).toBeInTheDocument();
  });

  it("dopo: offre i modelli dell'azienda, e non più quelli di partenza", () => {
    state.modelli = [mio]; state.inizializzati = true;
    render(<ModelliFasiPicker onApplica={vi.fn()} inCorso={false} />);
    expect(screen.getByRole("button", { name: "Impianti completi" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bagno" })).not.toBeInTheDocument();
  });

  it("se l'azienda li ha tolti tutti: non tornano quelli di partenza, e c'è un invito a prepararli", () => {
    state.inizializzati = true;
    render(<ModelliFasiPicker onApplica={vi.fn()} inCorso={false} />);
    expect(screen.queryByRole("button", { name: "Bagno" })).not.toBeInTheDocument();
    expect(screen.getByText(/Non hai modelli/)).toBeInTheDocument();
  });

  it("sceglie un modello, ne mostra fasi e sottofasi, e non applica finché non si preme", () => {
    state.modelli = [mio]; state.inizializzati = true;
    const onApplica = vi.fn();
    render(<ModelliFasiPicker onApplica={onApplica} inCorso={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Impianti completi" }));
    expect(screen.getByText(/Elettrico e idraulico · 2 fasi · 2 sottofasi/)).toBeInTheDocument();
    expect(onApplica).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi le 2 fasi" }));
    expect(onApplica).toHaveBeenCalledWith(
      [
        { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
        { nome: "Collaudo", sottofasi: [] },
      ],
      expect.objectContaining({ id: "m1" }),
    );
  });

  it("un modello di partenza si applica con le sole fasi", () => {
    const onApplica = vi.fn();
    render(<ModelliFasiPicker onApplica={onApplica} inCorso={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Bagno" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi le 2 fasi" }));
    expect(onApplica).toHaveBeenCalledWith(
      [{ nome: "Demolizioni", sottofasi: [] }, { nome: "Impianti", sottofasi: [] }],
      expect.objectContaining({ id: "partenza:bagno" }),
    );
  });

  it("mentre salva il pulsante è spento", () => {
    render(<ModelliFasiPicker onApplica={vi.fn()} inCorso />);
    fireEvent.click(screen.getByRole("button", { name: "Bagno" }));
    expect(screen.getByRole("button", { name: "Aggiungi le 2 fasi" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/ui/modelliFasiPicker.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/orders/ModelliFasiPicker"`.

- [ ] **Step 3: scrivi il componente**

```tsx
// src/components/orders/ModelliFasiPicker.tsx
import { useState } from "react";
import { ListPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PHASE_TEMPLATES } from "@/hooks/useOrderWorkPhases";
import { useModelliFasi } from "@/hooks/useModelliFasi";
import { fasiPerCommessa, modelliDaOffrire, totaleSottofasi, type FaseModello, type ModelloFasi } from "@/lib/orders/modelliFasi";

interface ModelliFasiPickerProps {
  /** Aggiunge alla commessa le fasi (e sottofasi) del modello scelto. */
  onApplica: (fasi: FaseModello[], modello: ModelloFasi) => void;
  inCorso: boolean;
}

const TITOLO = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

/** «Parti da un modello»: i modelli dell'azienda (con le sottofasi); finché non sono suoi, gli stessi di sempre. */
export function ModelliFasiPicker({ onApplica, inCorso }: ModelliFasiPickerProps) {
  const { modelli, inizializzati } = useModelliFasi();
  const elenco = modelliDaOffrire(inizializzati, modelli, PHASE_TEMPLATES);
  const [sceltoId, setSceltoId] = useState<string | null>(null);
  const scelto = elenco.find((m) => m.id === sceltoId) ?? null;
  const nSotto = scelto ? totaleSottofasi(scelto) : 0;

  return (
    <div className="space-y-2">
      <Label className={TITOLO}>Parti da un modello</Label>
      {elenco.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Non hai modelli: preparali in Impostazioni → Modelli di fasi, oppure scrivi le fasi una alla volta qui sotto.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {elenco.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSceltoId((k) => (k === m.id ? null : m.id))}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                sceltoId === m.id ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {m.nome}
            </button>
          ))}
        </div>
      )}

      {scelto && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            {[scelto.descrizione, `${scelto.fasi.length} fasi`, nSotto > 0 ? `${nSotto} sottofasi` : null].filter(Boolean).join(" · ")}
          </p>
          <div className="flex flex-wrap gap-1">
            {scelto.fasi.map((f, i) => (
              <span
                key={i}
                title={f.sottofasi.map((s) => s.nome).join(", ") || undefined}
                className="rounded border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
              >
                {i + 1}. {f.nome}{f.sottofasi.length > 0 ? ` (${f.sottofasi.length})` : ""}
              </span>
            ))}
          </div>
          <Button size="sm" className="w-full" disabled={inCorso} onClick={() => onApplica(fasiPerCommessa(scelto), scelto)}>
            {inCorso ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ListPlus className="mr-1 h-4 w-4" />}
            Aggiungi le {scelto.fasi.length} fasi
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: lancia i test del picker, devono passare**

Run: `npx vitest run src/test/ui/modelliFasiPicker.test.tsx`
Expected: PASS (6 casi).

- [ ] **Step 5: il dialog di `OrderWorkPhases` usa il picker**

In `src/components/orders/OrderWorkPhases.tsx`:

1. Togli `PHASE_TEMPLATES,` dall'importazione da `@/hooks/useOrderWorkPhases` (~riga 46) e aggiungi:

```tsx
import { ModelliFasiPicker } from "./ModelliFasiPicker";
```

2. Elimina lo stato e la funzione che il picker sostituisce (~righe 271-272 e 294-301): `selectedTemplateKey`, `selectedTemplate`, `handleApplyTemplate`; `closePhaseDialog` diventa:

```tsx
  const closePhaseDialog = () => {
    setNewPhaseOpen(false);
    setNewPhaseName("");
  };
```

3. Nel dialog sostituisci l'intero blocco `{/* Modelli di fasi per tipo di lavoro */} <div className="space-y-2"> … </div>` (da «Parti da un modello» fino al bottone «Aggiungi le N fasi», ~righe 352-410) con:

```tsx
                  {/* Modelli di fasi: quelli dell'azienda (con le sottofasi); finché non sono suoi, gli stessi di sempre */}
                  <ModelliFasiPicker
                    inCorso={applyTemplate.isPending}
                    onApplica={(fasi) =>
                      applyTemplate.mutate(fasi, {
                        onSuccess: () => {
                          toast.success(`${fasi.length} fasi aggiunte`);
                          closePhaseDialog();
                        },
                      })
                    }
                  />
```

- [ ] **Step 6: i due test esistenti ricevono il finto del nuovo hook**

In `src/test/ui/orderWorkPlanning.test.tsx` e `src/test/ui/commessaTelefono.test.tsx`, accanto agli altri `vi.mock(...)`:

```tsx
vi.mock("@/hooks/useModelliFasi", () => ({ useModelliFasi: () => ({ modelli: [] as unknown[], inizializzati: false }) }));
```

Il caso «conserva creazione manuale e modelli senza salvataggi all'apertura» deve restare verde senza altre modifiche: `PHASE_TEMPLATES` è ancora quello finto dell'hook (`Intervento semplice`) e il pulsante è ancora «Aggiungi le 2 fasi».

- [ ] **Step 7: lancia i test della scheda e il guardiano**

Run: `npx vitest run src/test/ui/orderWorkPlanning.test.tsx src/test/ui/commessaTelefono.test.tsx src/test/logic/faseCampiProtetti.test.ts`
Expected: PASS.

- [ ] **Step 8: commit**

```bash
git add src/components/orders/ModelliFasiPicker.tsx src/components/orders/OrderWorkPhases.tsx src/test/ui/modelliFasiPicker.test.tsx src/test/ui/orderWorkPlanning.test.tsx src/test/ui/commessaTelefono.test.tsx
git commit -m "Scegli le fasi: i modelli dell'azienda, con le sottofasi (gli stessi di sempre finché non sono suoi)"
```

### Task 12: la pagina «Modelli di fasi» nelle Impostazioni (registrazione)

**Files:**
- Create: `src/pages/azienda/settings/SettingsModelliFasi.tsx`
- Modify: `src/routes/companyRoutes.tsx` (importazione ~riga 157, rotta ~riga 1271)
- Modify: `src/components/layouts/CompanyLayout.tsx` (voce di menu a ~riga 851; importazione dell'icona)
- Modify: `src/components/layouts/SettingsLayout.tsx` (`SECTION_MAP` ~riga 37)
- Modify: `src/components/layouts/SettingsSearch.tsx` (~riga 85)
- Modify: `src/lib/impostazioni/pianoImpostazioni.ts` (`REQUISITI_IMPOSTAZIONI`, ~riga 41)
- Modify: `src/pages/azienda/settings/SettingsMobileHub.tsx` (voce ~riga 68 e `HIDDEN_ON_MOBILE` ~riga 131)

Il componente `ModelliFasiConfig` arriva al Task 13: qui si registra la pagina con un segnaposto minimo, così ogni test di registrazione si può lanciare subito. (Il segnaposto vive solo fino al Task 13: non finisce in nessun commit separato.)

- [ ] **Step 1: la rotta, e il test che deve fallire**

In `src/routes/companyRoutes.tsx`, con le altre importazioni lazy (~riga 157):

```tsx
const SettingsModelliFasi = lazy(() => import("@/pages/azienda/settings/SettingsModelliFasi"));
```

e dopo la rotta `rapportini-cantiere` (~riga 1271):

```tsx
          <Route path="modelli-fasi" element={withCompanyPermission("canViewSettingsOrders", <SettingsModelliFasi />)} />
```

Crea la pagina con un contenuto provvisorio:

```tsx
// src/pages/azienda/settings/SettingsModelliFasi.tsx
// Gating gestito da withCompanyPermission("canViewSettingsOrders") in companyRoutes.tsx
export default function SettingsModelliFasi() {
  return <div>Modelli di fasi</div>;
}
```

Run: `npx vitest run src/test/ui/impostazioniDelPiano.test.tsx`
Expected: FAIL — la rotta `modelli-fasi` non è classificata né per piano né «per tutti i piani».

- [ ] **Step 2: classifica la pagina per piano**

In `src/lib/impostazioni/pianoImpostazioni.ts`, dopo `"rapportini-cantiere": { moduli: ["orders"] },`:

```ts
  "modelli-fasi": { moduli: ["orders"] },
```

Run: `npx vitest run src/test/ui/impostazioniDelPiano.test.tsx`
Expected: PASS.

- [ ] **Step 3: menu, titolo, ricerca, hub del telefono**

`src/components/layouts/CompanyLayout.tsx`, nel gruppo «Cantieri & Costi», subito dopo «Rapportini e presenze» (~riga 851); aggiungi `ListChecks` all'importazione da `lucide-react` se non c'è:

```tsx
        { to: "/azienda/impostazioni/modelli-fasi", label: "Modelli di fasi", icon: <ListChecks className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsOrders },
```

`src/components/layouts/SettingsLayout.tsx`, in `SECTION_MAP` dopo `"rapportini-cantiere"`:

```ts
  "modelli-fasi":         { title: "Modelli di fasi",          description: "Le fasi che scegli quando apri una commessa, con le sottofasi che ne misurano l'avanzamento" },
```

`src/components/layouts/SettingsSearch.tsx`, dopo la voce «Rapportini e presenze»:

```ts
  { group: "Ordini", title: "Modelli di fasi", url: "/azienda/impostazioni/modelli-fasi", keywords: ["fasi", "modello", "template", "sottofasi", "avanzamento", "commessa", "cantiere", "lavorazioni"] },
```

`src/pages/azienda/settings/SettingsMobileHub.tsx`: nella sezione «Cantieri & Costi», dopo «Rapportini e presenze» (importa `ListChecks` da `lucide-react`):

```ts
      { to: "/azienda/impostazioni/modelli-fasi", label: "Modelli di fasi", icon: ListChecks, iconColor: "text-orange-600" },
```

e in `HIDDEN_ON_MOBILE`, dopo la riga di `rapportini-cantiere`:

```ts
  "/azienda/impostazioni/modelli-fasi",       // Modelli di fasi (si preparano una volta, al computer)
```

- [ ] **Step 4: lancia i test delle impostazioni**

Run: `npx vitest run src/test/ui/impostazioniDelPiano.test.tsx` e i test che nominano il menu delle impostazioni (`git grep -l "SettingsMobileHub\|SettingsSearch\|buildSettingsGroups" -- src/test`).
Expected: PASS.

(Il commit di questo task è quello del Task 13, insieme al componente vero.)

### Task 13: la pagina dei modelli — l'azienda li cambia, li duplica, li elimina

**Files:**
- Create: `src/components/settings/ModelloFasiEditor.tsx`
- Create: `src/components/settings/ModelliFasiConfig.tsx`
- Modify: `src/pages/azienda/settings/SettingsModelliFasi.tsx`
- Test: `src/test/ui/modelliFasiConfig.test.tsx`

Qui si realizza la richiesta: gli otto modelli **sono dell'azienda**. La prima volta che chi può modificare le impostazioni apre la pagina, gli otto di partenza diventano suoi (`inizializza_modelli_fasi`, una volta sola); da lì ogni modello si modifica, si duplica, si elimina, e se ne crea quanti se ne vuole. «Ripristina i predefiniti» rimette quelli di partenza che l'azienda non ha più, senza toccare gli altri. Chi non può modificare vede l'elenco e basta.

- [ ] **Step 1: scrivi i test che falliscono**

```tsx
// src/test/ui/modelliFasiConfig.test.tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModelliFasiConfig from "@/components/settings/ModelliFasiConfig";
import type { ModelloFasi, ModelloPerServer } from "@/lib/orders/modelliFasi";

const state = vi.hoisted(() => ({
  modelli: [] as unknown[], inizializzati: true, disponibile: true, isLoading: false, puoModificare: true, inizializzaErrore: false,
  salva: vi.fn(), elimina: vi.fn(), inizializza: vi.fn(), successo: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: state.successo, error: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.puoModificare ? "company_admin" : "staff" }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsOrders: false }) }));
vi.mock("@/hooks/useOrderWorkPhases", () => ({
  PHASE_TEMPLATES: [
    { key: "bagno", label: "Bagno", hint: "Rifacimento bagno", phases: ["Demolizioni", "Impianti"] },
    { key: "tetto", label: "Tetto", hint: "Copertura", phases: ["Ponteggio"] },
  ],
}));
vi.mock("@/hooks/useModelliFasi", () => ({
  useModelliFasi: () => ({
    modelli: state.modelli, inizializzati: state.inizializzati, disponibile: state.disponibile, isLoading: state.isLoading,
    salva: { mutate: state.salva, isPending: false },
    elimina: { mutate: state.elimina, isPending: false },
    inizializza: { mutate: state.inizializza, isPending: false, isError: state.inizializzaErrore },
  }),
}));

const PARTENZA_PER_SERVER: ModelloPerServer[] = [
  { nome: "Bagno", descrizione: "Rifacimento bagno", fasi: [{ nome: "Demolizioni", sottofasi: [] }, { nome: "Impianti", sottofasi: [] }] },
  { nome: "Tetto", descrizione: "Copertura", fasi: [{ nome: "Ponteggio", sottofasi: [] }] },
];
const mio: ModelloFasi = {
  id: "m1", origine: "azienda", nome: "Impianti completi", descrizione: "",
  fasi: [
    { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
    { nome: "Collaudo", sottofasi: [] },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { modelli: [], inizializzati: true, disponibile: true, isLoading: false, puoModificare: true, inizializzaErrore: false });
});
afterEach(cleanup);

describe("la prima volta: i modelli di partenza diventano dell'azienda", () => {
  beforeEach(() => { state.inizializzati = false; });

  it("chi può modificare li porta tra i suoi, una volta sola", () => {
    const { rerender } = render(<ModelliFasiConfig />);
    expect(state.inizializza).toHaveBeenCalledTimes(1);
    expect(state.inizializza).toHaveBeenCalledWith({ modelli: PARTENZA_PER_SERVER, soloMancanti: false });
    rerender(<ModelliFasiConfig />);
    expect(state.inizializza).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Preparo i tuoi modelli/)).toBeInTheDocument();
  });

  it("nel frattempo si vedono, senza comandi sui singoli modelli", () => {
    render(<ModelliFasiConfig />);
    expect(screen.getByText("Bagno")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifica Bagno" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elimina Bagno" })).not.toBeInTheDocument();
  });

  it("chi non può modificare non li prepara: li vede e basta", () => {
    state.puoModificare = false;
    render(<ModelliFasiConfig />);
    expect(state.inizializza).not.toHaveBeenCalled();
    expect(screen.getByText("Bagno")).toBeInTheDocument();
    expect(screen.getByText(/Sono i modelli di partenza/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuovo modello" })).not.toBeInTheDocument();
  });

  it("non parte mentre carica, né se i modelli non si leggono", () => {
    state.isLoading = true;
    const { rerender } = render(<ModelliFasiConfig />);
    expect(state.inizializza).not.toHaveBeenCalled();
    state.isLoading = false; state.disponibile = false;
    rerender(<ModelliFasiConfig />);
    expect(state.inizializza).not.toHaveBeenCalled();
    expect(screen.getByText(/Non riesco a leggere i modelli/)).toBeInTheDocument();
  });

  it("se la preparazione fallisce lo dice e si può riprovare", () => {
    state.inizializzaErrore = true;
    render(<ModelliFasiConfig />);
    state.inizializza.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.inizializza).toHaveBeenCalledWith({ modelli: PARTENZA_PER_SERVER, soloMancanti: false });
  });
});

describe("con i modelli dell'azienda", () => {
  it("elenca i modelli con fasi e sottofasi, e non rifà niente", () => {
    state.modelli = [mio];
    render(<ModelliFasiConfig />);
    expect(screen.getByText("Impianti completi")).toBeInTheDocument();
    expect(screen.getByText("2 fasi · 2 sottofasi")).toBeInTheDocument();
    expect(state.inizializza).not.toHaveBeenCalled();
  });

  it("«Modifica» apre l'editor con il modello com'è, e salva con il suo id", () => {
    state.modelli = [mio];
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Modifica Impianti completi" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByLabelText("Nome del modello")).toHaveValue("Impianti completi");
    expect(within(dialogo).getByLabelText("Nome sottofase 1.2")).toHaveValue("Cavi");
    fireEvent.change(within(dialogo).getByLabelText("Peso sottofase 1.2"), { target: { value: "5" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).toHaveBeenCalledWith(
      {
        id: "m1", nome: "Impianti completi", descrizione: null,
        fasi: [{ nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 5 }] }, { nome: "Collaudo", sottofasi: [] }],
      },
      expect.any(Object),
    );
  });

  it("«Duplica» apre una copia: «Copia di …», senza id, con fasi e sottofasi", () => {
    state.modelli = [mio];
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Duplica Impianti completi" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByLabelText("Nome del modello")).toHaveValue("Copia di Impianti completi");
    expect(within(dialogo).getByLabelText("Nome fase 1")).toHaveValue("Elettrico");
    expect(within(dialogo).getByLabelText("Nome sottofase 1.1")).toHaveValue("Tracce");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).toHaveBeenCalledWith(expect.objectContaining({ id: null, nome: "Copia di Impianti completi" }), expect.any(Object));
  });

  it("un modello nuovo: aggiunge una sottofase col suo peso e salva il payload ripulito", () => {
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Nome del modello"), { target: { value: "  Solo elettrico " } });
    fireEvent.change(within(dialogo).getByLabelText("Nome fase 1"), { target: { value: "Impianto elettrico" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Aggiungi sottofase alla fase 1" }));
    fireEvent.change(within(dialogo).getByLabelText("Nome sottofase 1.1"), { target: { value: "Tracce" } });
    fireEvent.change(within(dialogo).getByLabelText("Peso sottofase 1.1"), { target: { value: "3" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).toHaveBeenCalledWith(
      { id: null, nome: "Solo elettrico", descrizione: null, fasi: [{ nome: "Impianto elettrico", sottofasi: [{ nome: "Tracce", peso: 3 }] }] },
      expect.any(Object),
    );
  });

  it("un modello senza nome non si salva", () => {
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).not.toHaveBeenCalled();
  });

  it("si riordinano le fasi", () => {
    state.modelli = [mio];
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Duplica Impianti completi" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Sposta giù fase 1" }));
    expect(within(dialogo).getByLabelText("Nome fase 1")).toHaveValue("Collaudo");
    expect(within(dialogo).getByLabelText("Nome fase 2")).toHaveValue("Elettrico");
  });

  it("eliminare chiede conferma e poi elimina", () => {
    state.modelli = [mio];
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Elimina Impianti completi" }));
    expect(state.elimina).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Elimina il modello" }));
    expect(state.elimina).toHaveBeenCalledWith("m1");
  });

  it("senza nessun modello c'è l'invito a crearne o a rimettere quelli di partenza", () => {
    render(<ModelliFasiConfig />);
    expect(screen.getByText(/Non hai modelli/)).toBeInTheDocument();
    expect(screen.getByText("Ti mancano 2 modelli di partenza.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ripristina i predefiniti" })).toBeInTheDocument();
  });

  it("«Ripristina i predefiniti» rimette solo quelli che mancano (il server li riconosce dal nome)", () => {
    state.modelli = [{ ...mio, id: "a", nome: "Bagno" }];
    render(<ModelliFasiConfig />);
    expect(screen.getByText("Ti manca 1 modello di partenza.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ripristina i predefiniti" }));
    expect(state.inizializza).toHaveBeenCalledWith({ modelli: PARTENZA_PER_SERVER, soloMancanti: true }, expect.any(Object));
  });

  it("se ha già tutti quelli di partenza non propone il ripristino", () => {
    state.modelli = [{ ...mio, id: "a", nome: "Bagno" }, { ...mio, id: "b", nome: "tetto " }];
    render(<ModelliFasiConfig />);
    expect(screen.queryByRole("button", { name: "Ripristina i predefiniti" })).not.toBeInTheDocument();
  });

  it("chi non può modificare vede l'elenco ma nessun comando", () => {
    state.puoModificare = false; state.modelli = [mio];
    render(<ModelliFasiConfig />);
    expect(screen.getByText("Impianti completi")).toBeInTheDocument();
    for (const nome of ["Nuovo modello", "Modifica Impianti completi", "Duplica Impianti completi", "Elimina Impianti completi", "Ripristina i predefiniti"]) {
      expect(screen.queryByRole("button", { name: nome })).not.toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/ui/modelliFasiConfig.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/settings/ModelliFasiConfig"`.

- [ ] **Step 3: l'editor**

```tsx
// src/components/settings/ModelloFasiEditor.tsx
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  rimuovi, sostituisci, sposta, validaBozza,
  type BozzaModello, type FaseModello, type PayloadModello, type SottofaseModello,
} from "@/lib/orders/modelliFasi";

interface ModelloFasiEditorProps {
  aperto: boolean;
  bozzaIniziale: BozzaModello | null;
  salvataggio: boolean;
  onChiudi: () => void;
  onSalva: (payload: PayloadModello) => void;
}

function Comandi({ etichetta, indice, totale, onSu, onGiu, onElimina, eliminaDisabilitato }: {
  etichetta: string; indice: number; totale: number; onSu: () => void; onGiu: () => void; onElimina: () => void; eliminaDisabilitato?: boolean;
}) {
  return (
    <>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Sposta su ${etichetta}`} disabled={indice === 0} onClick={onSu}>
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Sposta giù ${etichetta}`} disabled={indice === totale - 1} onClick={onGiu}>
        <ArrowDown className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-rose-600" aria-label={`Elimina ${etichetta}`} disabled={eliminaDisabilitato} onClick={onElimina}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </>
  );
}

/** Si monta solo da aperto: ogni apertura riparte dalla sua bozza, senza un effetto che la ricopi. */
export default function ModelloFasiEditor({ aperto, bozzaIniziale, ...resto }: ModelloFasiEditorProps) {
  if (!aperto || !bozzaIniziale) return null;
  return <EditorAperto bozzaIniziale={bozzaIniziale} {...resto} />;
}

function EditorAperto({ bozzaIniziale, salvataggio, onChiudi, onSalva }: Omit<ModelloFasiEditorProps, "aperto" | "bozzaIniziale"> & { bozzaIniziale: BozzaModello }) {
  const [bozza, setBozza] = useState<BozzaModello>(bozzaIniziale);
  const fasi = bozza.fasi;
  const cambiaFasi = (nuove: FaseModello[]) => setBozza({ ...bozza, fasi: nuove });
  const cambiaFase = (i: number, patch: Partial<FaseModello>) => cambiaFasi(sostituisci(fasi, i, patch));
  const cambiaSotto = (i: number, nuove: SottofaseModello[]) => cambiaFase(i, { sottofasi: nuove });

  const salva = () => {
    const esito = validaBozza(bozza);
    // Con strictNullChecks spento `!esito.ok` non restringe il tipo: si confronta con false.
    if (esito.ok === false) { toast.error(esito.errore); return; }
    onSalva(esito.payload);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{bozza.id ? "Modifica il modello" : "Nuovo modello di fasi"}</DialogTitle>
          <DialogDescription>
            Le fasi che compaiono quando scegli questo modello in una commessa. Le sottofasi misurano l'avanzamento della fase: più pesano, più contano.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="modello-nome">Nome del modello</Label>
              <Input id="modello-nome" value={bozza.nome} maxLength={80} onChange={(e) => setBozza({ ...bozza, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modello-desc">A cosa serve (facoltativo)</Label>
              <Input id="modello-desc" value={bozza.descrizione} maxLength={200} onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })} />
            </div>
          </div>

          <ol className="space-y-3">
            {fasi.map((fase, i) => (
              <li key={i} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <Input
                    value={fase.nome} maxLength={160} placeholder="Nome della fase" aria-label={`Nome fase ${i + 1}`}
                    onChange={(e) => cambiaFase(i, { nome: e.target.value })} className="h-9 min-w-0 flex-1"
                  />
                  <Comandi
                    etichetta={`fase ${i + 1}`} indice={i} totale={fasi.length} eliminaDisabilitato={fasi.length === 1}
                    onSu={() => cambiaFasi(sposta(fasi, i, -1))} onGiu={() => cambiaFasi(sposta(fasi, i, 1))} onElimina={() => cambiaFasi(rimuovi(fasi, i))}
                  />
                </div>
                <ul className="ml-6 mt-2 space-y-1.5">
                  {fase.sottofasi.map((s, j) => (
                    <li key={j} className="flex items-center gap-1.5">
                      <Input
                        value={s.nome} maxLength={160} placeholder="Sottofase" aria-label={`Nome sottofase ${i + 1}.${j + 1}`}
                        onChange={(e) => cambiaSotto(i, sostituisci(fase.sottofasi, j, { nome: e.target.value }))} className="h-8 min-w-0 flex-1 text-sm"
                      />
                      <Input
                        type="number" min={1} max={100} value={s.peso} aria-label={`Peso sottofase ${i + 1}.${j + 1}`}
                        title="Quanto pesa nell'avanzamento della fase"
                        onChange={(e) => cambiaSotto(i, sostituisci(fase.sottofasi, j, { peso: Number(e.target.value) }))} className="h-8 w-16 shrink-0 text-sm"
                      />
                      <Comandi
                        etichetta={`sottofase ${i + 1}.${j + 1}`} indice={j} totale={fase.sottofasi.length}
                        onSu={() => cambiaSotto(i, sposta(fase.sottofasi, j, -1))} onGiu={() => cambiaSotto(i, sposta(fase.sottofasi, j, 1))}
                        onElimina={() => cambiaSotto(i, rimuovi(fase.sottofasi, j))}
                      />
                    </li>
                  ))}
                </ul>
                <Button
                  type="button" variant="ghost" size="sm" className="ml-5 mt-1.5 h-8 text-xs" aria-label={`Aggiungi sottofase alla fase ${i + 1}`}
                  onClick={() => cambiaSotto(i, [...fase.sottofasi, { nome: "", peso: 1 }])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />Sottofase
                </Button>
              </li>
            ))}
          </ol>
          <Button type="button" variant="outline" size="sm" onClick={() => cambiaFasi([...fasi, { nome: "", sottofasi: [] }])}>
            <Plus className="mr-1 h-4 w-4" />Aggiungi fase
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>Annulla</Button>
          <Button onClick={salva} disabled={salvataggio}>Salva modello</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: la pagina**

```tsx
// src/components/settings/ModelliFasiConfig.tsx
import { useEffect, useRef, useState } from "react";
import { Copy, ListChecks, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { PHASE_TEMPLATES } from "@/hooks/useOrderWorkPhases";
import { useModelliFasi } from "@/hooks/useModelliFasi";
import {
  bozzaDaModello, bozzaVuota, modelliDaOffrire, modelliDiPartenzaMancanti, modelliPerInizializzare, totaleSottofasi,
  type BozzaModello, type ModelloFasi,
} from "@/lib/orders/modelliFasi";
import ModelloFasiEditor from "./ModelloFasiEditor";

const dettaglio = (m: ModelloFasi): string => {
  const sotto = totaleSottofasi(m);
  return [m.descrizione, `${m.fasi.length} fasi`, sotto > 0 ? `${sotto} sottofasi` : null].filter(Boolean).join(" · ");
};

const testoMancanti = (n: number): string => (n === 1 ? "Ti manca 1 modello di partenza." : `Ti mancano ${n} modelli di partenza.`);
const AVVISO = "rounded-lg border border-dashed p-4 text-sm text-muted-foreground";

export default function ModelliFasiConfig() {
  const { role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders;
  const { modelli, inizializzati, disponibile, isLoading, salva, elimina, inizializza } = useModelliFasi();
  const [bozza, setBozza] = useState<BozzaModello | null>(null);
  const [daEliminare, setDaEliminare] = useState<ModelloFasi | null>(null);

  // La prima volta, chi può modificare porta i modelli di partenza tra i suoi: da lì sono come gli altri.
  const preparaModelli = inizializza.mutate;
  const avviata = useRef(false);
  useEffect(() => {
    if (avviata.current || isLoading || !disponibile || inizializzati || !puoModificare) return;
    avviata.current = true;
    preparaModelli({ modelli: modelliPerInizializzare(PHASE_TEMPLATES), soloMancanti: false });
  }, [isLoading, disponibile, inizializzati, puoModificare, preparaModelli]);

  const elenco = modelliDaOffrire(inizializzati, modelli, PHASE_TEMPLATES);
  const mancanti = inizializzati ? modelliDiPartenzaMancanti(PHASE_TEMPLATES, modelli) : 0;
  const preparazione = disponibile && !inizializzati && puoModificare;
  const puoAgire = puoModificare && disponibile;

  const ripristina = () =>
    inizializza.mutate(
      { modelli: modelliPerInizializzare(PHASE_TEMPLATES), soloMancanti: true },
      { onSuccess: (n) => toast.success(n === 1 ? "1 modello rimesso" : `${n} modelli rimessi`) },
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4" />I modelli di fasi</CardTitle>
            <CardDescription>
              Sono i tuoi: quando apri una commessa e premi «Scegli le fasi» trovi questi. Cambiali, duplicali, eliminali, creane di nuovi.
              Ogni fase può avere sottofasi: spuntandole, la fase avanza da sola. Le commesse già avviate non cambiano.
            </CardDescription>
          </div>
          {puoAgire && (
            <Button size="sm" onClick={() => setBozza(bozzaVuota())}><Plus className="mr-1 h-4 w-4" />Nuovo modello</Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {!isLoading && !disponibile && <p className={AVVISO}>Non riesco a leggere i modelli in questo momento. Riprova tra poco.</p>}
          {preparazione && !inizializza.isError && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Preparo i tuoi modelli…</p>
          )}
          {preparazione && inizializza.isError && (
            <div className={`${AVVISO} flex items-center justify-between gap-3`}>
              <span>Non sono riuscito a preparare i modelli.</span>
              <Button size="sm" variant="outline" onClick={() => preparaModelli({ modelli: modelliPerInizializzare(PHASE_TEMPLATES), soloMancanti: false })}>Riprova</Button>
            </div>
          )}
          {disponibile && !inizializzati && !puoModificare && (
            <p className={AVVISO}>Sono i modelli di partenza. Chi gestisce le impostazioni delle commesse li potrà fare suoi e cambiarli.</p>
          )}

          {elenco.length === 0 ? (
            <p className={AVVISO}>
              Non hai modelli. Creane uno con «Nuovo modello», oppure rimetti quelli di partenza. Puoi anche salvare le fasi di una commessa già fatta:
              «Aggiungi fasi» → «Salva come modello».
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {elenco.map((m) => (
                <li key={m.id} className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">{dettaglio(m)}</p>
                  </div>
                  {puoAgire && m.origine === "azienda" && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Modifica ${m.nome}`} onClick={() => setBozza(bozzaDaModello(m, false))}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Duplica ${m.nome}`} onClick={() => setBozza(bozzaDaModello(m, true))}><Copy className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" aria-label={`Elimina ${m.nome}`} onClick={() => setDaEliminare(m)}><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {puoAgire && mancanti > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3">
              <p className="text-xs text-muted-foreground">{testoMancanti(mancanti)}</p>
              <Button size="sm" variant="outline" disabled={inizializza.isPending} onClick={ripristina}>
                <RotateCcw className="mr-1 h-4 w-4" />Ripristina i predefiniti
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ModelloFasiEditor
        aperto={bozza !== null}
        bozzaIniziale={bozza}
        salvataggio={salva.isPending}
        onChiudi={() => setBozza(null)}
        onSalva={(payload) => salva.mutate(payload, { onSuccess: () => setBozza(null) })}
      />

      <AlertDialog open={daEliminare !== null} onOpenChange={(o) => { if (!o) setDaEliminare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare «{daEliminare?.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Le commesse che hanno già usato questo modello restano come sono: cambia solo l'elenco. Se era uno dei modelli di partenza,
              puoi rimetterlo con «Ripristina i predefiniti».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (daEliminare) elimina.mutate(daEliminare.id); setDaEliminare(null); }}>Elimina il modello</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

e la pagina vera (sostituisce il segnaposto del Task 12):

```tsx
// src/pages/azienda/settings/SettingsModelliFasi.tsx
// Gating gestito da withCompanyPermission("canViewSettingsOrders") in companyRoutes.tsx
import ModelliFasiConfig from "@/components/settings/ModelliFasiConfig";

export default function SettingsModelliFasi() {
  return <ModelliFasiConfig />;
}
```

- [ ] **Step 5: lancia i test, devono passare**

Run: `npx vitest run src/test/ui/modelliFasiConfig.test.tsx src/test/ui/impostazioniDelPiano.test.tsx`
Expected: PASS.

Il pulsante «Elimina Impianti completi» (nella riga) e «Elimina il modello» (nella conferma) hanno nomi diversi: nessuna ambiguità. L'editor si monta solo quando `bozza !== null` (`aperto` e `bozzaIniziale` sono la stessa cosa): ogni apertura riparte dalla sua bozza.

- [ ] **Step 6: verifica a occhio** (dopo aver applicato la migrazione del Task 9)

`preview_start`, apri `/azienda/impostazioni/modelli-fasi` da computer, con l'azienda demo:
- la prima volta compare per un attimo «Preparo i tuoi modelli…» e poi gli otto modelli, ognuno con «Modifica», «Duplica», «Elimina»;
- elimina «Bagno», poi «Ripristina i predefiniti»: ritorna **solo** «Bagno» (gli altri non si duplicano);
- modifica «Ristrutturazione completa»: aggiungi due sottofasi alla prima fase, salva; apri una commessa vuota → «Scegli le fasi»: il modello c'è, con «(2)» accanto alla prima fase, e «Aggiungi le N fasi» crea fasi e sottofasi;
- sul telefono (375 px) la voce **non** compare nell'hub.

Quello che si crea in produzione per la prova (un modello, le sue fasi) si toglie dalla pagina stessa («Elimina»); non lasciare modelli di prova nell'azienda demo.

- [ ] **Step 7: commit (include il Task 12)**

```bash
git add src/components/settings src/pages/azienda/settings/SettingsModelliFasi.tsx src/pages/azienda/settings/SettingsMobileHub.tsx src/routes/companyRoutes.tsx src/components/layouts/CompanyLayout.tsx src/components/layouts/SettingsLayout.tsx src/components/layouts/SettingsSearch.tsx src/lib/impostazioni/pianoImpostazioni.ts src/test/ui/modelliFasiConfig.test.tsx
git commit -m "Impostazioni: i modelli di fasi sono dell'azienda (si cambiano, si duplicano, si eliminano; con sottofasi)"
```

### Task 14: «Salva queste fasi come modello» dalla commessa

**Files:**
- Create: `src/components/orders/SalvaFasiComeModello.tsx`
- Modify: `src/components/orders/OrderWorkPhases.tsx` (nel dialog «Fasi di lavoro», sotto il picker)
- Test: `src/test/ui/salvaFasiComeModello.test.tsx`

Il blocco compare solo a chi ha il permesso delle impostazioni, solo se la commessa ha già delle fasi, e **non da telefono** (si prepara una volta, al computer). Il modello salvato è subito dell'azienda e compare in «Scegli le fasi» (anche se l'azienda non ha ancora aperto la pagina dei modelli: il picker mostra i suoi insieme a quelli di partenza).

- [ ] **Step 1: scrivi i test che falliscono**

```tsx
// src/test/ui/salvaFasiComeModello.test.tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SalvaFasiComeModello } from "@/components/orders/SalvaFasiComeModello";

const state = vi.hoisted(() => ({ rpc: vi.fn(), successo: vi.fn(), errore: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: state.successo, error: state.errore } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => state.rpc(...a) } }));

const disegna = (props: Partial<Parameters<typeof SalvaFasiComeModello>[0]> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SalvaFasiComeModello orderId="order" numeroFasi={3} {...props} />
    </QueryClientProvider>,
  );
beforeEach(() => { vi.clearAllMocks(); state.rpc.mockResolvedValue({ data: "nuovo-modello", error: null }); });
afterEach(cleanup);

describe("SalvaFasiComeModello", () => {
  it("senza fasi non compare", () => {
    const { container } = disegna({ numeroFasi: 0 });
    expect(container).toBeEmptyDOMElement();
  });

  it("senza nome il pulsante è spento; col nome salva e lo dice", async () => {
    disegna();
    const salva = screen.getByRole("button", { name: "Salva come modello" });
    expect(salva).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome del nuovo modello"), { target: { value: "  Bagno chiavi in mano " } });
    fireEvent.click(salva);
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("salva_commessa_come_modello", { p_order_id: "order", p_nome: "Bagno chiavi in mano" }));
    await waitFor(() => expect(state.successo).toHaveBeenCalled());
  });

  it("se il nome esiste già lo dice con parole semplici", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
    disegna();
    fireEvent.change(screen.getByLabelText("Nome del nuovo modello"), { target: { value: "Bagno" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva come modello" }));
    await waitFor(() => expect(state.errore).toHaveBeenCalledWith("Esiste già un modello con questo nome."));
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/ui/salvaFasiComeModello.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/orders/SalvaFasiComeModello"`.

- [ ] **Step 3: scrivi il componente**

```tsx
// src/components/orders/SalvaFasiComeModello.tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { chiaveModelliFasi, messaggioModello } from "@/hooks/useModelliFasi";

// La RPC non è ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Le fasi (e sottofasi) di questa commessa diventano un modello dell'azienda. */
export function SalvaFasiComeModello({ orderId, numeroFasi, className }: { orderId: string; numeroFasi: number; className?: string }) {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const [nome, setNome] = useState("");

  const salva = useMutation({
    mutationFn: async (nomeModello: string) => {
      const { error } = await db.rpc("salva_commessa_come_modello", { p_order_id: orderId, p_nome: nomeModello });
      if (error) throw error;
    },
    onSuccess: (_dati, nomeModello) => {
      toast.success(`Modello «${nomeModello}» salvato`, { description: "Lo trovi in Impostazioni → Modelli di fasi." });
      setNome("");
      void qc.invalidateQueries({ queryKey: chiaveModelliFasi(effectiveCompany?.id) });
    },
    onError: (e) => toast.error(messaggioModello(e)),
  });

  if (numeroFasi === 0) return null;
  const nomePulito = nome.trim();

  return (
    <div className={className}>
      <Label htmlFor="nome-nuovo-modello" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Usa queste {numeroFasi} fasi anche in altre commesse
      </Label>
      <div className="mt-1.5 flex items-center gap-2">
        <Input id="nome-nuovo-modello" aria-label="Nome del nuovo modello" value={nome} maxLength={80} placeholder="Nome del modello" onChange={(e) => setNome(e.target.value)} className="h-9 min-w-0 flex-1" />
        <Button size="sm" variant="outline" disabled={!nomePulito || salva.isPending} onClick={() => salva.mutate(nomePulito)}>
          {salva.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <BookmarkPlus className="mr-1 h-4 w-4" />}
          Salva come modello
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: lancia i test, devono passare**

Run: `npx vitest run src/test/ui/salvaFasiComeModello.test.tsx`
Expected: PASS (3 casi).

- [ ] **Step 5: monta il blocco nel dialog «Fasi di lavoro»**

In `src/components/orders/OrderWorkPhases.tsx`, importa:

```tsx
import { SalvaFasiComeModello } from "./SalvaFasiComeModello";
```

e dentro il dialog, **dopo** il blocco della singola fase manuale (l'ultimo `<div className="space-y-2">` prima di `</div>` che chiude `<div className="space-y-4">`), aggiungi:

```tsx
                  {/* Un modello dalle fasi di questa commessa: solo da computer e solo a chi gestisce le impostazioni */}
                  {puoModelli && phases.length > 0 && !isMobile && (
                    <>
                      <Separator />
                      <SalvaFasiComeModello orderId={orderId} numeroFasi={phases.length} />
                    </>
                  )}
```

Nel componente principale `OrderWorkPhases` (la riga `const { canEditOrders, canViewCosts, canEditOperai, canViewOrderAmounts, canViewMargins } = usePermissions();`, ~riga 149) aggiungi `canEditSettingsOrders` alla destrutturazione, e subito sotto:

```tsx
  const { role } = useAuth();
  const puoModelli = role === "company_admin" || role === "super_admin" || !!canEditSettingsOrders;
```

(`useAuth`, `useIsMobile` e `Separator` sono già importati nel file; `isMobile` è definito nel componente principale, riga ~258.) Nei due test che fingono `usePermissions` e `useAuth` il blocco non compare (`canEditSettingsOrders` e `role` mancano), quindi non servono altri mock; se un test non finge `useAuth`, aggiungi `vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));`.

- [ ] **Step 6: lancia i test della scheda**

Run: `npx vitest run src/test/ui/orderWorkPlanning.test.tsx src/test/ui/commessaTelefono.test.tsx src/test/ui/salvaFasiComeModello.test.tsx`
Expected: PASS.

- [ ] **Step 7: commit**

```bash
git add src/components/orders/SalvaFasiComeModello.tsx src/components/orders/OrderWorkPhases.tsx src/test/ui/salvaFasiComeModello.test.tsx
git commit -m "Fasi: «Salva come modello» dalle fasi di una commessa (solo computer, solo impostazioni)"
```

---

# Tappa M3 — Dal cantiere e all'approvazione

Tre strade, come per la percentuale di oggi, ma ora **un solo punto decide** (il database):
- **«Avanzamento lavori»** (`CampoAvanzamento`, operaio o subappaltatore): la spunta vale subito, come oggi la chiusura della fase.
- **Rapportino del capocantiere** (`CampoRapportino`): le spunte viaggiano nel rapportino (`fasi_lavorate[].sottofasi_fatte`, una chiave in più dentro la stessa voce, mai voci in più) e diventano «fatte» **quando il rapportino è approvato**, come oggi la percentuale.
- **L'approvazione**, da qualunque strada arrivi (l'ufficio dal browser, Silvio da WhatsApp o dal web, una chiamata diretta): la applica il trigger del Task 15. Il codice di approvazione del browser (`OrdineRapportiniCampo.tsx`, ciclo a ~righe 155-196) **non si tocca**: continua a fare la sua parte e ripeterla è innocuo (stesso risultato), e il guardiano `faseCampiProtetti.test.ts` legge proprio quel letterale `const patch: Record<string, unknown>`.

Chi segna: lo stesso di oggi per la percentuale (`puoDichiararePercentuali = isCapocantiere || !esisteCapo`), più la regola dell'azienda «chi può spuntare» (M4: di partenza `tutti`, come oggi). All'approvazione `fatta_il` è il momento dell'approvazione.

### Task 15: l'approvazione applica l'avanzamento, dal database

**Files:**
- Create: `supabase/migrations/20281007141000_rapportino_applica_avanzamento.sql`
- Test: `src/test/logic/rapportinoApplicaAvanzamentoMigrazione.test.ts`

Oggi l'avanzamento dichiarato lo applica solo il browser dell'ufficio. Un rapportino approvato da Silvio (WhatsApp o web) cambia stato e basta: le percentuali restano dove sono. In produzione nessuno dei 15 rapportini approvati così dichiara fasi, quindi non è ancora successo: ma è la stessa trappola delle ore, che il database già risolve «per ogni strada» (`fn_rapportino_costo_manodopera`, stessa condizione di scatto).

- [ ] **Step 1: verifica che la versione sia libera**

Run: `ls supabase/migrations/20281007141000_*.sql`
Expected: `No such file or directory`.

- [ ] **Step 2: scrivi il test sul testo (fallisce: il file non c'è)**

```ts
// src/test/logic/rapportinoApplicaAvanzamentoMigrazione.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007141000_rapportino_applica_avanzamento.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = codice.match(/create or replace function public\.fn_rapportino_applica_avanzamento\(\)[\s\S]*?\n\$\$;/)![0];

describe("migrazione rapportino_applica_avanzamento", () => {
  it("non aspetta i lock e non cambia lo schema", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).not.toMatch(/create table|alter table/i);
  });

  it("scatta solo al passaggio ad «approvato», come il costo della manodopera", () => {
    expect(codice).toMatch(/create trigger trg_rapportino_applica_avanzamento\s+after update of stato on public\.campo_rapportini/);
    expect(funzione).toMatch(/if not \(new\.stato = 'approvato' and old\.stato is distinct from 'approvato'\) then\s+return new;/);
  });

  it("lavora solo sulle fasi di QUESTA commessa", () => {
    expect(funzione).toMatch(/where id = v_fase and order_id = new\.order_id;/);
  });

  it("una voce rotta si salta da sola e non ferma l'approvazione", () => {
    expect(funzione).toMatch(/exception when others then\s+raise warning/);
  });

  it("le sottofasi si segnano solo «fatte»; per una fase con sottofasi non si applica una percentuale", () => {
    expect(funzione).toMatch(/set fatta = true/);
    expect(funzione).not.toMatch(/set fatta = false/);
    expect(funzione).toMatch(/continue when exists \(select 1 from public\.order_work_subphases s where s\.phase_id = v_fase\);/);
  });

  it("una fase libera sale e non scende (GREATEST), e si scrivono solo percentuale e stato", () => {
    expect(funzione).toMatch(/greatest\(coalesce\(f\.percentuale, 0\), v_dichiarata\)/);
    const aggiornamento = funzione.match(/update public\.order_work_phases\s+set ([^;]+?)\s+where id = v_fase;/)![1];
    expect(aggiornamento).toBe("percentuale = v_nuova, status = v_stato, updated_at = now()");
  });

  it("la funzione è chiusa: la usa solo il trigger", () => {
    expect(funzione).toMatch(/security definer\s+set search_path = public/);
    expect(codice).toContain("revoke all on function public.fn_rapportino_applica_avanzamento() from public, anon, authenticated;");
  });
});
```

- [ ] **Step 3: lancia il test, deve fallire**

Run: `npx vitest run src/test/logic/rapportinoApplicaAvanzamentoMigrazione.test.ts`
Expected: FAIL — `ENOENT … 20281007141000_rapportino_applica_avanzamento.sql`.

- [ ] **Step 4: scrivi la migrazione**

```sql
-- L'avanzamento dichiarato in un rapportino si applica all'approvazione, DAL DATABASE (07/10/2026).
--
-- Oggi l'applicazione la fa solo il browser dell'ufficio (OrdineRapportiniCampo:
-- per ogni fase dichiarata nuova = max(attuale, dichiarata), ≥100 chiude). Un rapportino
-- approvato per un'altra strada (l'assistente Silvio via WhatsApp o web, una chiamata
-- diretta) cambia stato e basta: le percentuali restano dov'erano. In produzione oggi
-- nessuno dei 15 rapportini approvati così dichiara fasi, quindi non è ancora successo
-- niente; ma è la stessa trappola delle ore, che il database risolve già «per OGNI
-- strada» (fn_rapportino_costo_manodopera).
--
-- Cosa fa. Quando un rapportino passa a «approvato» (la stessa condizione del costo):
--   · per una fase che il rapportino dichiara con le sottofasi spuntate
--     (fasi_lavorate[].sottofasi_fatte): le segna «fatte» (la fase si ricalcola da sola);
--   · per una fase con sottofasi senza spunte (un rapportino scritto prima): niente, la
--     percentuale la decidono le sottofasi;
--   · per le altre fasi: la regola di sempre, solo in salita, ≥100 chiude, >0 apre.
-- Le voci che non riguardano questa commessa o non si leggono si saltano una per una:
-- un errore qui NON ferma l'approvazione (resta un avviso nel registro del database).
-- Il browser dell'ufficio continua a fare la sua parte: ripetere la stessa regola è
-- innocuo (stesso risultato), e così la migrazione non tocca il codice dell'approvazione.

set local lock_timeout = '3s';

create or replace function public.fn_rapportino_applica_avanzamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_fase uuid;
  f public.order_work_phases%rowtype;
  v_dichiarata integer;
  v_nuova integer;
  v_stato text;
begin
  if not (new.stato = 'approvato' and old.stato is distinct from 'approvato') then
    return new;
  end if;
  if jsonb_typeof(new.fasi_lavorate) is distinct from 'array' then
    return new;
  end if;

  for v in select value from jsonb_array_elements(new.fasi_lavorate) loop
    begin
      v_fase := (v->>'phase_id')::uuid;
      select * into f from public.order_work_phases where id = v_fase and order_id = new.order_id;
      continue when not found;

      if jsonb_typeof(v->'sottofasi_fatte') = 'array' then
        -- Le spunte del capocantiere diventano «fatte»; la fase si ricalcola da sola.
        update public.order_work_subphases s
           set fatta = true
         where s.phase_id = v_fase and not s.fatta
           and s.id::text in (select lower(x) from jsonb_array_elements_text(v->'sottofasi_fatte') as t(x));
        continue;
      end if;

      -- Fase con sottofasi (anche in un rapportino scritto prima): la percentuale la decidono loro.
      continue when exists (select 1 from public.order_work_subphases s where s.phase_id = v_fase);

      v_dichiarata := least(100, greatest(0, round(coalesce(nullif(v->>'percentuale', '')::numeric, 0))))::integer;
      v_nuova := greatest(coalesce(f.percentuale, 0), v_dichiarata);
      v_stato := case when v_nuova >= 100 then 'completata'
                      when v_nuova > 0 and f.status <> 'completata' then 'in_corso'
                      else f.status end;
      if v_nuova is distinct from f.percentuale or v_stato is distinct from f.status then
        update public.order_work_phases
           set percentuale = v_nuova, status = v_stato, updated_at = now()
         where id = v_fase;
      end if;
    exception when others then
      raise warning 'fn_rapportino_applica_avanzamento (rapportino %): %', new.id, sqlerrm;
    end;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_rapportino_applica_avanzamento on public.campo_rapportini;
create trigger trg_rapportino_applica_avanzamento
  after update of stato on public.campo_rapportini
  for each row execute function public.fn_rapportino_applica_avanzamento();

revoke all on function public.fn_rapportino_applica_avanzamento() from public, anon, authenticated;
```

- [ ] **Step 5: lancia il test sul testo, deve passare**

Run: `npx vitest run src/test/logic/rapportinoApplicaAvanzamentoMigrazione.test.ts`
Expected: PASS (7 casi).

- [ ] **Step 6: commit locale (migrazione non ancora applicata)**

```bash
git add supabase/migrations/20281007141000_rapportino_applica_avanzamento.sql src/test/logic/rapportinoApplicaAvanzamentoMigrazione.test.ts
git commit -m "Rapportini: l'avanzamento dichiarato si applica all'approvazione dal database, per ogni strada (migrazione non ancora applicata)"
```

- [ ] **Step 7: prova SQL a secco** — una sola `execute_sql`: il contenuto **intero** di `20281007130000_sottofasi_commessa.sql` (se non è ancora applicata), di `20281007141000_rapportino_applica_avanzamento.sql`, poi questo blocco, che annulla tutto alla fine. Scrive su un rapportino «inviato» dell'azienda demo e lo riporta com'era perché tutto finisce in un `raise exception`.

```sql
do $prova$
declare
  v_azienda uuid; v_rapp uuid; v_ordine uuid; v_altro_ordine uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid;
  s21 uuid; s22 uuid; s23 uuid; s31 uuid;
  v_pct integer; v_stato text; v_n integer;
begin
  select p.company_id into v_azienda
    from public.profiles p join auth.users u on u.id = p.id where u.email = 'demo@azienda.srl';
  -- un rapportino «inviato» della demo, e una commessa diversa per provare che le voci altrui si saltano
  select r.id, r.order_id into v_rapp, v_ordine
    from public.campo_rapportini r where r.company_id = v_azienda and r.stato = 'inviato' order by r.data_lavoro limit 1;
  if v_rapp is null then raise exception 'PROVA SALTATA: la demo non ha rapportini inviati'; end if;
  select o.id into v_altro_ordine from public.orders o
   where o.company_id = v_azienda and o.deleted_at is null and o.id <> v_ordine order by o.created_at limit 1;

  -- P1 libera (20%, in corso); P2 con tre sottofasi; P3 con sottofasi ma voce «vecchia» (solo %); P4 libera, sarà chiusa;
  -- P5 libera con voce 0%; P6 in un'altra commessa
  insert into public.order_work_phases (company_id, order_id, name, position, status, percentuale) values (v_azienda, v_ordine, 'PROVA p1', 901, 'in_corso', 20) returning id into p1;
  insert into public.order_work_phases (company_id, order_id, name, position) values (v_azienda, v_ordine, 'PROVA p2', 902) returning id into p2;
  insert into public.order_work_phases (company_id, order_id, name, position) values (v_azienda, v_ordine, 'PROVA p3', 903) returning id into p3;
  insert into public.order_work_phases (company_id, order_id, name, position, status, percentuale) values (v_azienda, v_ordine, 'PROVA p4', 904, 'in_corso', 50) returning id into p4;
  insert into public.order_work_phases (company_id, order_id, name, position, status, percentuale) values (v_azienda, v_ordine, 'PROVA p5', 905, 'in_corso', 70) returning id into p5;
  insert into public.order_work_phases (company_id, order_id, name, position, status, percentuale) values (v_azienda, v_altro_ordine, 'PROVA p6', 906, 'in_corso', 10) returning id into p6;
  insert into public.order_work_subphases (phase_id, name, position) values (p2, 'a', 0) returning id into s21;
  insert into public.order_work_subphases (phase_id, name, position) values (p2, 'b', 1) returning id into s22;
  insert into public.order_work_subphases (phase_id, name, position) values (p2, 'c', 2) returning id into s23;
  insert into public.order_work_subphases (phase_id, name, position) values (p3, 'x', 0) returning id into s31;

  -- il rapportino dichiara tutto questo (ore a zero: qui non si prova il costo della manodopera)
  update public.campo_rapportini set ore_lavorate = 0, ore_straordinario = 0, presenze = '[]'::jsonb,
     fasi_lavorate = jsonb_build_array(
       jsonb_build_object('phase_id', p1, 'percentuale', 60),
       jsonb_build_object('phase_id', p2, 'percentuale', 67, 'sottofasi_fatte', jsonb_build_array(s22::text, s23::text)),
       jsonb_build_object('phase_id', p3, 'percentuale', 90),
       jsonb_build_object('phase_id', p4, 'percentuale', 100),
       jsonb_build_object('phase_id', p5, 'percentuale', 30),
       jsonb_build_object('phase_id', p6, 'percentuale', 100),
       jsonb_build_object('phase_id', gen_random_uuid(), 'percentuale', 50),
       jsonb_build_object('phase_id', 'non-un-uuid', 'percentuale', 50),
       jsonb_build_object('phase_id', p1, 'percentuale', 'abc'))
   where id = v_rapp;

  -- finché non è approvato non cambia niente
  select percentuale into v_pct from public.order_work_phases where id = p1;
  if v_pct <> 20 then raise exception 'KO 1: prima dell''approvazione p1 è già a %', v_pct; end if;

  update public.campo_rapportini set stato = 'approvato', approvato = true where id = v_rapp;

  select percentuale, status into v_pct, v_stato from public.order_work_phases where id = p1;
  if v_pct <> 60 or v_stato <> 'in_corso' then raise exception 'KO 2: p1 % % (atteso 60 in_corso)', v_pct, v_stato; end if;

  -- P2: due sottofasi su tre diventano fatte → 67%
  select count(*) into v_n from public.order_work_subphases where phase_id = p2 and fatta;
  if v_n <> 2 then raise exception 'KO 3: sottofasi di p2 fatte %, attese 2', v_n; end if;
  select percentuale, status into v_pct, v_stato from public.order_work_phases where id = p2;
  if v_pct <> 67 or v_stato <> 'in_corso' then raise exception 'KO 4: p2 % % (atteso 67 in_corso)', v_pct, v_stato; end if;

  -- P3: ha sottofasi e la voce porta solo una %: la % non si applica
  select percentuale into v_pct from public.order_work_phases where id = p3;
  if v_pct <> 0 then raise exception 'KO 5: p3 (con sottofasi) ha preso la % dichiarata (%)', v_pct; end if;

  -- P4: 100 chiude
  select percentuale, status into v_pct, v_stato from public.order_work_phases where id = p4;
  if v_pct <> 100 or v_stato <> 'completata' then raise exception 'KO 6: p4 % % (atteso 100 completata)', v_pct, v_stato; end if;

  -- P5: solo in salita (70 resta 70, la voce dice 30)
  select percentuale into v_pct from public.order_work_phases where id = p5;
  if v_pct <> 70 then raise exception 'KO 7: p5 è scesa a %', v_pct; end if;

  -- P6: un'altra commessa non si tocca
  if v_altro_ordine is not null then
    select percentuale into v_pct from public.order_work_phases where id = p6;
    if v_pct <> 10 then raise exception 'KO 8: la fase di un''altra commessa è passata a %', v_pct; end if;
  end if;

  -- le voci rotte (id inesistente, non un uuid, % non numerica) non hanno fermato l'approvazione né le altre voci
  if (select stato from public.campo_rapportini where id = v_rapp) <> 'approvato' then raise exception 'KO 9: l''approvazione non è andata a buon fine'; end if;

  -- un rapportino senza fasi, o con fasi_lavorate che non è un elenco, si approva senza errori
  update public.campo_rapportini set stato = 'inviato', approvato = false, fasi_lavorate = '{}'::jsonb where id = v_rapp;
  update public.campo_rapportini set stato = 'approvato', approvato = true where id = v_rapp;
  update public.campo_rapportini set stato = 'inviato', approvato = false, fasi_lavorate = '[]'::jsonb where id = v_rapp;
  update public.campo_rapportini set stato = 'approvato', approvato = true where id = v_rapp;

  raise exception 'PROVA OK — annullata di proposito, niente è stato salvato (altra commessa: %)', (v_altro_ordine is not null);
end
$prova$;
```

Expected: `PROVA OK — annullata di proposito …`. Se la demo non ha rapportini inviati: `PROVA SALTATA` (si prova su un'altra azienda di prova, mai su dati veri).

- [ ] **Step 8: chiedi l'OK e applica** (dopo la migrazione delle sottofasi): `apply_migration` con `name: "rapportino_applica_avanzamento"` e il contenuto del file; poi

```sql
update supabase_migrations.schema_migrations
   set version = '20281007141000'
 where name = 'rapportino_applica_avanzamento' and left(version, 4) = '2026';
```

- [ ] **Step 9: verifica**

```sql
select version, name from supabase_migrations.schema_migrations where version = '20281007141000';   -- 1 riga
select tgname from pg_trigger where tgname = 'trg_rapportino_applica_avanzamento' and not tgisinternal;   -- 1 riga
select has_function_privilege('authenticated', 'public.fn_rapportino_applica_avanzamento()', 'execute') as authenticated,
       has_function_privilege('anon', 'public.fn_rapportino_applica_avanzamento()', 'execute') as anon;   -- false, false
```

### Task 16: «Avanzamento lavori» con le sottofasi

**Files:**
- Modify: `src/pages/campo/CampoAvanzamento.tsx`
- Test: `src/test/ui/campoAvanzamentoSottofasi.test.tsx`

- [ ] **Step 1: scrivi i test che falliscono**

```tsx
// src/test/ui/campoAvanzamentoSottofasi.test.tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoAvanzamento from "@/pages/campo/CampoAvanzamento";

const dati = vi.hoisted(() => ({
  fasi: [] as Array<Record<string, unknown>>,
  sottofasi: [] as Array<Record<string, unknown>>,
  scritture: [] as Array<{ tabella: string; patch: Record<string, unknown>; id: unknown }>,
  rifiuto: null as { message: string } | null,
  errore: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: dati.errore } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, profile: { company_id: "c1" } }) }));
vi.mock("@/components/common/ImgRiservata", () => ({ ImgRiservata: (): null => null }));
vi.mock("@/lib/storage/fileRiservati", () => ({ linkFileRiservato: async (u: string) => u }));
vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (tabella: string) => {
    const righe = () =>
      tabella === "order_work_phases" ? dati.fasi
      : tabella === "order_work_subphases" ? dati.sottofasi
      : tabella === "orders" ? [{ id: "o1", order_code: "C-1", description: "Bagno", indirizzo_lavori: "Via Roma 1" }]
      : [];
    // Lettura: l'oggetto si può «attendere» a ogni passo della catena.
    const lettura: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: righe(), error: null }).then(ok, ko),
    };
    for (const metodo of ["select", "eq", "in", "order"]) lettura[metodo] = () => lettura;
    return {
      ...lettura,
      update: (patch: Record<string, unknown>) => ({
        eq: (_colonna: string, id: unknown) => { dati.scritture.push({ tabella, patch, id }); return Promise.resolve({ error: dati.rifiuto }); },
      }),
    };
  };
  return { supabase: { from: costruisci, storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } };
});

const fase = (patch: Record<string, unknown>) => ({
  id: "f1", order_id: "o1", name: "Impianto elettrico", position: 0, status: "in_corso", percentuale: 33,
  notes: null as string | null, foto_urls: [] as string[], completata_il: null as string | null, ...patch,
});
const sotto = (patch: Record<string, unknown>) => ({
  id: "s1", phase_id: "f1", name: "Tracce", position: 0, peso: 1, fatta: false, fatta_il: null as string | null, ...patch,
});
const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CampoAvanzamento />
    </QueryClientProvider>,
  );
beforeEach(() => { dati.fasi = []; dati.sottofasi = []; dati.scritture = []; dati.rifiuto = null; dati.errore.mockClear(); });
afterEach(cleanup);

describe("Avanzamento lavori con le sottofasi", () => {
  it("una fase con sottofasi mostra la checklist: spuntare scrive solo «fatta» sulla sottofase", async () => {
    dati.fasi = [fase({})];
    dati.sottofasi = [sotto({ fatta: true }), sotto({ id: "s2", name: "Cavi", position: 1 }), sotto({ id: "s3", name: "Quadro", position: 2 })];
    disegna();
    expect(await screen.findByText("Impianto elettrico")).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "Tracce: fatta" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cavi: da fare" }));
    await waitFor(() => expect(dati.scritture).toContainEqual({ tabella: "order_work_subphases", patch: { fatta: true }, id: "s2" }));
    expect(dati.scritture.some((s) => s.tabella === "order_work_phases")).toBe(false);
  });

  it("la fase con sottofasi non si chiude con un tocco: la chiudono le sottofasi", async () => {
    dati.fasi = [fase({})];
    dati.sottofasi = [sotto({})];
    disegna();
    const cerchio = await screen.findByRole("button", { name: "Impianto elettrico: si completa spuntando le sottofasi" });
    expect(cerchio).toBeDisabled();
  });

  it("se la regola dell'azienda non te lo permette, vedi la frase del database (non un errore generico)", async () => {
    dati.fasi = [fase({})];
    dati.sottofasi = [sotto({})];
    dati.rifiuto = { message: "Le sottofasi le spunta il capocantiere." };
    disegna();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Tracce: da fare" }));
    await waitFor(() => expect(dati.errore).toHaveBeenCalledWith("Le sottofasi le spunta il capocantiere."));
  });

  it("una fase senza sottofasi si chiude come prima", async () => {
    dati.fasi = [fase({ id: "f2", name: "Opere murarie" })];
    disegna();
    fireEvent.click(await screen.findByRole("button", { name: "Segna Opere murarie come completata" }));
    await waitFor(() => expect(dati.scritture).toContainEqual({
      tabella: "order_work_phases",
      patch: expect.objectContaining({ status: "completata", percentuale: 100 }),
      id: "f2",
    }));
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/ui/campoAvanzamentoSottofasi.test.tsx`
Expected: FAIL — nessuna checklist (la pagina non conosce le sottofasi).

- [ ] **Step 3: importazioni e cast** in `src/pages/campo/CampoAvanzamento.tsx`

Con le altre importazioni:

```tsx
import { Checkbox } from "@/components/ui/checkbox";
import { faseHaSottofasi, messaggioErrore, sottofaseDaRiga, sottofasiPerFase, type Sottofase } from "@/lib/orders/sottofasi";
```

Dopo `const MAX_PHOTO_MB = 10;`:

```tsx
// La tabella delle sottofasi non è ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
```

- [ ] **Step 4: lettura e scrittura delle sottofasi** (dopo `cantieriQuery`, prima di `const gruppi`)

```tsx
  // Le sottofasi dei MIEI cantieri: non hanno l'azienda, si filtra per quella della
  // loro fase (la RLS è la stessa delle fasi). Se la lettura fallisce (tabella non
  // ancora creata) le fasi restano come sempre.
  const sottofasiQuery = useQuery({
    queryKey: ["campo-sottofasi", companyId, user?.id],
    queryFn: async (): Promise<Sottofase[]> => {
      const { data, error } = await db
        .from("order_work_subphases")
        .select("id, phase_id, name, position, peso, fatta, fatta_il, fase:order_work_phases!inner(company_id)")
        .eq("fase.company_id", companyId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(sottofaseDaRiga);
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 30_000,
    retry: false,
  });
  const sottofasiDi = useMemo(() => sottofasiPerFase(sottofasiQuery.data ?? []), [sottofasiQuery.data]);

  const segnaSottofase = useMutation({
    mutationFn: async ({ id, fatta }: { id: string; fatta: boolean }) => {
      const { error } = await db.from("order_work_subphases").update({ fatta }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      // La fase si ricalcola nel database: si rileggono le sottofasi e le fasi.
      queryClient.invalidateQueries({ queryKey: ["campo-sottofasi"] });
      queryClient.invalidateQueries({ queryKey: ["campo-avanzamento-fasi"] });
    },
    // Il database dice da sé perché no («Le sottofasi le spunta il capocantiere.»).
    onError: (err: unknown) => toast.error(messaggioErrore(err, "Non riesco a salvare la sottofase")),
  });
```

- [ ] **Step 5: la scheda della fase** — nel `.map((fase) => { … })` delle fasi, dopo `const busy = …`:

```tsx
                const sotto = sottofasiDi.get(fase.id) ?? [];
                const derivata = faseHaSottofasi(sotto);
```

Il cerchio della fase si spegne se la fase deriva dalle sottofasi:

```tsx
                      <button
                        type="button"
                        onClick={() => toggleFase.mutate(fase)}
                        disabled={toggleFase.isPending || derivata}
                        aria-label={
                          derivata
                            ? `${fase.name}: si completa spuntando le sottofasi`
                            : done ? `Riapri la fase ${fase.name}` : `Segna ${fase.name} come completata`
                        }
                        className="mt-0.5 shrink-0"
                      >
```

La checklist sta sotto le etichette di stato, prima delle foto (`{foto.length > 0 && (` della fase):

```tsx
                        {derivata && (
                          <ul className="mt-2 space-y-0.5" aria-label={`Sottofasi di ${fase.name}`}>
                            {sotto.map((s) => (
                              <li key={s.id}>
                                <label className="flex min-h-11 items-center gap-2.5 text-sm">
                                  <Checkbox
                                    checked={s.fatta}
                                    disabled={segnaSottofase.isPending}
                                    onCheckedChange={(v) => segnaSottofase.mutate({ id: s.id, fatta: v === true })}
                                    aria-label={`${s.name}: ${s.fatta ? "fatta" : "da fare"}`}
                                  />
                                  <span className={cn(s.fatta && "text-muted-foreground line-through")}>{s.name}</span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        )}
```

(Aggiungi `useMemo` all'importazione da `react` se manca.)

- [ ] **Step 6: lancia i test, devono passare**

Run: `npx vitest run src/test/ui/campoAvanzamentoSottofasi.test.tsx`
Expected: PASS (4 casi).

- [ ] **Step 7: verifica a occhio a 375 px** (dopo le migrazioni): nella pagina «Avanzamento lavori» una fase con sottofasi ha le caselle da 44 px di altezza, senza spazio bianco in più; le fasi senza sottofasi sono identiche a prima.

- [ ] **Step 8: commit**

```bash
git add src/pages/campo/CampoAvanzamento.tsx src/test/ui/campoAvanzamentoSottofasi.test.tsx
git commit -m "Avanzamento lavori: le sottofasi si spuntano dal cantiere; la fase con sottofasi si chiude da sola"
```

### Task 17: sottofasi nel rapportino del capocantiere

**Files:**
- Modify: `src/lib/orders/sottofasi.ts` (due funzioni pure)
- Create: `src/components/campo/SottofasiRapportino.tsx`
- Modify: `src/pages/campo/CampoRapportino.tsx`
- Test: `src/test/logic/sottofasi.test.ts` (aggiunte), `src/test/ui/campoRapportinoRegole.test.tsx` (due casi e un ritocco al finto `useQuery`)

**Non** si tocca `OrdineRapportiniCampo.tsx`: l'approvazione la fa il database (Task 15).

- [ ] **Step 1: test delle due funzioni pure (falliscono)** — in coda a `src/test/logic/sottofasi.test.ts`, e aggiungi `fasiLavorateDelRapportino` e `sottofasiSpuntate` all'importazione da `@/lib/orders/sottofasi`:

```ts
describe("fasiLavorateDelRapportino", () => {
  const sotto = new Map([
    ["f1", [
      { id: "s1", peso: 1, fatta: true },
      { id: "s2", peso: 1, fatta: false },
      { id: "s3", peso: 1, fatta: false },
    ]],
  ]);
  it("una fase senza sottofasi resta {phase_id, percentuale}, come oggi", () => {
    expect(fasiLavorateDelRapportino({ f9: 60 }, sotto, ["s2"])).toEqual([{ phase_id: "f9", percentuale: 60 }]);
  });
  it("una fase con sottofasi porta le spunte di questo rapportino e l'avanzamento che ne deriva", () => {
    expect(fasiLavorateDelRapportino({ f1: 33 }, sotto, ["s2"])).toEqual([{ phase_id: "f1", percentuale: 67, sottofasi_fatte: ["s2"] }]);
  });
  it("le sottofasi già fatte non si ripetono, e le spunte di fasi non dichiarate si ignorano", () => {
    expect(fasiLavorateDelRapportino({ f1: 33 }, sotto, ["s1", "s9"])).toEqual([{ phase_id: "f1", percentuale: 33, sottofasi_fatte: [] }]);
  });
  it("senza spunte la voce resta una voce di sottofasi, vuota: all'approvazione non tocca la percentuale", () => {
    expect(fasiLavorateDelRapportino({ f1: 33 }, sotto, [])).toEqual([{ phase_id: "f1", percentuale: 33, sottofasi_fatte: [] }]);
  });
  it("il numero di voci è quello delle fasi dichiarate: le spunte stanno DENTRO la voce (un'attribuzione di costo alla fase vale solo con una voce sola)", () => {
    expect(fasiLavorateDelRapportino({ f1: 33 }, sotto, ["s2", "s3"])).toHaveLength(1);
  });
});

describe("sottofasiSpuntate", () => {
  it("raccoglie gli id spuntati da tutte le voci di un rapportino già salvato", () => {
    expect(sottofasiSpuntate([
      { phase_id: "f1", percentuale: 67, sottofasi_fatte: ["s2", "s3"] },
      { phase_id: "f2", percentuale: 10 },
      { phase_id: "f3", percentuale: 5, sottofasi_fatte: ["s9", 4, null] },
    ])).toEqual(["s2", "s3", "s9"]);
  });
  it("senza un elenco valido non c'è niente", () => {
    expect(sottofasiSpuntate(null)).toEqual([]);
    expect(sottofasiSpuntate("x")).toEqual([]);
    expect(sottofasiSpuntate([null, 3, {}])).toEqual([]);
  });
});
```

Run: `npx vitest run src/test/logic/sottofasi.test.ts` — Expected: FAIL (funzioni mancanti).

- [ ] **Step 2: le due funzioni** — in coda a `src/lib/orders/sottofasi.ts`:

```ts
// `type` e non `interface`: il campo del database è un Json, e un'interfaccia non è assegnabile a una firma d'indice.
export type FaseLavorata = {
  phase_id: string;
  percentuale: number;
  /** Solo per le fasi con sottofasi: quelle spuntate in questo rapportino. */
  sottofasi_fatte?: string[];
};

/**
 * Cosa si scrive in campo_rapportini.fasi_lavorate. Per una fase con sottofasi:
 * le spunte NUOVE di questo rapportino e l'avanzamento che ne deriverebbe (un'anteprima:
 * all'approvazione lo ricalcola il database). Una voce per fase dichiarata, sempre: chi
 * legge le voci senza conoscere le sottofasi (il costo della manodopera attribuito alla
 * fase quando la voce è una sola, il cronoprogramma) vede phase_id e percentuale.
 */
export function fasiLavorateDelRapportino(
  dichiarate: Readonly<Record<string, number>>,
  sottofasi: ReadonlyMap<string, ReadonlyArray<Pick<Sottofase, "id" | "peso" | "fatta">>>,
  spunte: ReadonlyArray<string>,
): FaseLavorata[] {
  return Object.entries(dichiarate).map(([phase_id, percentuale]): FaseLavorata => {
    const delle = sottofasi.get(phase_id) ?? [];
    if (delle.length === 0) return { phase_id, percentuale };
    const nuove = delle.filter((s) => !s.fatta && spunte.includes(s.id)).map((s) => s.id);
    const anteprima = avanzamentoDaSottofasi(delle.map((s) => ({ peso: s.peso, fatta: s.fatta || nuove.includes(s.id) }))) ?? percentuale;
    return { phase_id, percentuale: anteprima, sottofasi_fatte: nuove };
  });
}

/** Gli id delle sottofasi spuntate in un rapportino già salvato (per riaprirlo in modifica). */
export function sottofasiSpuntate(fasiLavorate: unknown): string[] {
  if (!Array.isArray(fasiLavorate)) return [];
  return fasiLavorate.flatMap((voce) => {
    const spunte = (voce as { sottofasi_fatte?: unknown } | null)?.sottofasi_fatte;
    return Array.isArray(spunte) ? spunte.filter((x): x is string => typeof x === "string") : [];
  });
}
```

Run: `npx vitest run src/test/logic/sottofasi.test.ts` — Expected: PASS.

- [ ] **Step 3: il componente del rapportino**

```tsx
// src/components/campo/SottofasiRapportino.tsx
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { avanzamentoDaSottofasi, type Sottofase } from "@/lib/orders/sottofasi";

interface SottofasiRapportinoProps {
  nomeFase: string;
  sottofasi: Sottofase[];
  /** Id delle sottofasi spuntate in questo rapportino. */
  spunte: string[];
  onSpunta: (id: string, spuntata: boolean) => void;
}

/** Nel rapportino del capocantiere: le sottofasi di una fase, al posto dello slider. */
export function SottofasiRapportino({ nomeFase, sottofasi, spunte, onSpunta }: SottofasiRapportinoProps) {
  const fatta = (s: Sottofase) => s.fatta || spunte.includes(s.id);
  const anteprima = avanzamentoDaSottofasi(sottofasi.map((s) => ({ peso: s.peso, fatta: fatta(s) }))) ?? 0;
  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{nomeFase}</p>
        <span className="shrink-0 font-bold text-primary">{anteprima}%</span>
      </div>
      <ul className="space-y-0.5" aria-label={`Sottofasi di ${nomeFase}`}>
        {sottofasi.map((s) => (
          <li key={s.id}>
            <label className="flex min-h-11 items-center gap-2.5 text-sm">
              <Checkbox
                checked={fatta(s)}
                disabled={s.fatta}
                onCheckedChange={(v) => onSpunta(s.id, v === true)}
                aria-label={`${s.name}: ${s.fatta ? "già fatta" : "da fare"}`}
              />
              <span className={cn(fatta(s) && "text-muted-foreground line-through")}>{s.name}</span>
              {s.fatta && <span className="text-[11px] text-muted-foreground">già fatta</span>}
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Le sottofasi risultano fatte quando il rapportino viene approvato.</p>
    </div>
  );
}
```

- [ ] **Step 4: i casi nel harness di `campoRapportinoRegole.test.tsx`** (falliscono finché la pagina non cambia)

Nello `state` hoisted aggiungi `fasi: [] as unknown[], sottofasi: [] as unknown[],`; nel finto `useQuery` cambia la riga `queryKey[0] === "campo-fasi-commessa" ? [] :` in:

```tsx
    queryKey[0] === "campo-fasi-commessa" ? state.fasi :
    queryKey[0] === "campo-sottofasi" ? state.sottofasi :
```

e nel `beforeEach` aggiungi `state.fasi = []; state.sottofasi = [];`. In fondo al file:

```tsx
describe("Le sottofasi nel rapportino del capocantiere", () => {
  const sotto = (patch: Record<string, unknown>) => ({ id: "s1", phase_id: "f1", name: "Tracce", position: 0, peso: 1, fatta: false, fatta_il: null as string | null, ...patch });
  const apri = () => {
    state.role = { isCapocantiere: true, esisteCapo: true };
    state.fasi = [{ id: "f1", name: "Impianto elettrico", status: "in_corso", percentuale: 33 }];
    state.sottofasi = [sotto({ fatta: true }), sotto({ id: "s2", name: "Cavi", position: 1 }), sotto({ id: "s3", name: "Quadro", position: 2 })];
    render(<CampoRapportino />);
    fireEvent.change(ore()!, { target: { value: "8" } });   // le ore del capo: si confermano nel primo passo
    avanti();                                                // le fasi stanno nel secondo (l'ultimo)
    fireEvent.click(screen.getByRole("button", { name: "Impianto elettrico" }));
  };

  it("al posto dello slider c'è la checklist: le già fatte sono ferme, le altre si spuntano e l'anteprima cresce", () => {
    apri();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Tracce: già fatta" })).toBeDisabled();
    expect(screen.getByText("33%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cavi: da fare" }));
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  it("il rapportino porta le spunte, dentro la voce della fase, e l'avanzamento che ne deriva", async () => {
    apri();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cavi: da fare" }));
    invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({
      fasi_lavorate: [{ phase_id: "f1", percentuale: 67, sottofasi_fatte: ["s2"] }],
    })));
  });
});
```

Il rapportino del capocantiere ha **due passi**: nel primo le ore e le presenze (qui le ore vanno confermate: senza, l'invio si ferma con un avviso), nel secondo, l'ultimo, le fasi, i materiali e la descrizione. Per questo il caso scrive le ore, passa avanti e poi invia.

Run: `npx vitest run src/test/ui/campoRapportinoRegole.test.tsx` — Expected: FAIL nei due casi nuovi (la pagina non conosce le sottofasi), gli altri verdi.

- [ ] **Step 5: la pagina `CampoRapportino`**

Importazioni (aggiungi `useMemo` a quella di `react`, riga 15):

```tsx
import { SottofasiRapportino } from "@/components/campo/SottofasiRapportino";
import { fasiLavorateDelRapportino, sottofaseDaRiga, sottofasiPerFase, sottofasiSpuntate, type Sottofase } from "@/lib/orders/sottofasi";
```

Dopo la query `fasiCommessa` (~riga 143, prima di qualunque `return` anticipato):

```tsx
  // Le sottofasi della commessa: il capocantiere le spunta al posto dello slider.
  // Non hanno la commessa: si filtra per quella della loro fase. Se la lettura
  // fallisce (tabella non ancora creata) si lavora come sempre.
  const { data: sottofasiCommessa = [] } = useQuery({
    queryKey: ["campo-sottofasi", "commessa", orderId],
    enabled: !!orderId,
    staleTime: 60_000,
    queryFn: async (): Promise<Sottofase[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("order_work_subphases")
        .select("id, phase_id, name, position, peso, fatta, fatta_il, fase:order_work_phases!inner(order_id)")
        .eq("fase.order_id", orderId)
        .order("position", { ascending: true });
      if (error) return [];
      return ((data ?? []) as Record<string, unknown>[]).map(sottofaseDaRiga);
    },
  });
  const sottofasiDi = useMemo(() => sottofasiPerFase(sottofasiCommessa), [sottofasiCommessa]);
  // Le sottofasi spuntate in QUESTO rapportino (valgono quando viene approvato).
  const [sottofasiSpunte, setSottofasiSpunte] = useState<string[]>([]);
  // Cosa direbbe il rapportino per ogni fase dichiarata, sottofasi comprese (anche per il riepilogo).
  const percentualiFinali = useMemo(
    () => new Map(fasiLavorateDelRapportino(fasiDichiarate, sottofasiDi, sottofasiSpunte).map((v) => [v.phase_id, v.percentuale] as const)),
    [fasiDichiarate, sottofasiDi, sottofasiSpunte],
  );
```

Dove si riapre un rapportino già scritto (~riga 310), dentro lo stesso `if (Array.isArray(r.fasi_lavorate)) { … }` e subito dopo `setFasiDichiarate(…)`:

```tsx
        setSottofasiSpunte(sottofasiSpuntate(r.fasi_lavorate));
```

L'invio (~riga 517) sostituisce

```tsx
      const fasiLavorate = Object.entries(fasiDichiarate).map(([phase_id, percentuale]) => ({
        phase_id,
        percentuale,
      }));
```

con

```tsx
      const fasiLavorate = fasiLavorateDelRapportino(fasiDichiarate, sottofasiDi, sottofasiSpunte);
```

Lo slider per fase (~righe 1032-1073) cambia così: **l'intero blocco** `{puoDichiararePercentuali && fasiDichiarabili.filter(f => f.id in fasiDichiarate).map(fase => ( … ))}` diventa

```tsx
                {puoDichiararePercentuali && fasiDichiarabili.filter(f => f.id in fasiDichiarate).map(fase => {
                  const sotto = sottofasiDi.get(fase.id) ?? [];
                  if (sotto.length > 0) {
                    return (
                      <SottofasiRapportino
                        key={fase.id}
                        nomeFase={fase.name}
                        sottofasi={sotto}
                        spunte={sottofasiSpunte}
                        onSpunta={(id, spuntata) =>
                          setSottofasiSpunte(prev => (spuntata ? [...new Set([...prev, id])] : prev.filter(x => x !== id)))
                        }
                      />
                    );
                  }
                  return (
                    <div key={fase.id} className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="min-w-0 truncate text-sm font-medium text-foreground">{fase.name}</p>
                        <span className="shrink-0 text-primary font-bold">{fasiDichiarate[fase.id]}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={fasiDichiarate[fase.id]}
                        onChange={e =>
                          setFasiDichiarate(prev => ({ ...prev, [fase.id]: Number(e.target.value) }))
                        }
                        className="w-full accent-primary"
                      />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {fase.percentuale > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Avanzamento attuale: {fase.percentuale}%
                          </p>
                        ) : <span />}
                        <button
                          type="button"
                          onClick={() =>
                            setFasiDichiarate(prev => ({
                              ...prev,
                              [fase.id]: prev[fase.id] === 100 ? fase.percentuale : 100,
                            }))
                          }
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            fasiDichiarate[fase.id] === 100
                              ? "border-green-500 bg-green-500/10 text-green-600"
                              : "border-border bg-muted text-muted-foreground"
                          }`}
                        >
                          {fasiDichiarate[fase.id] === 100 ? "✓ Fase completata" : "Segna completata"}
                        </button>
                      </div>
                    </div>
                  );
                })}
```

(Lo slider e il pulsante «Segna completata» sono quelli di oggi, identici: cambiano solo l'indentazione e il `return`.)

Il riepilogo prima dell'invio (~riga 1476) legge la percentuale che il rapportino porterebbe, non quella dello stato:

```tsx
                  {fasiCommessa.filter(f => f.id in fasiDichiarate).map(f => {
                    const finale = percentualiFinali.get(f.id) ?? fasiDichiarate[f.id];
                    return (
                      <p key={f.id} className="text-sm text-foreground">
                        {f.name}{" "}
                        <span className="font-semibold text-primary">
                          {!puoDichiararePercentuali ? workDay === today ? "· lavorata oggi" : "· lavorata nella giornata" : finale === 100 ? "✓ completata" : `→ ${finale}%`}
                        </span>
                      </p>
                    );
                  })}
```

Run: `npx vitest run src/test/ui/campoRapportinoRegole.test.tsx` — Expected: PASS (anche i casi nuovi).

- [ ] **Step 6: lancia i guardiani e le suite**

Run: `npx vitest run src/test/logic/faseCampiProtetti.test.ts src/test/logic/sottofasi.test.ts src/test/ui/campoRapportinoRegole.test.tsx src/test/ui/campoRapportinoMaterials.test.tsx`
Expected: PASS (`OrdineRapportiniCampo.tsx` non è stato toccato).

- [ ] **Step 7: commit**

```bash
git add src/lib/orders/sottofasi.ts src/components/campo/SottofasiRapportino.tsx src/pages/campo/CampoRapportino.tsx src/test/logic/sottofasi.test.ts src/test/ui/campoRapportinoRegole.test.tsx
git commit -m "Rapportino: il capocantiere spunta le sottofasi, dentro la voce della fase; valgono all'approvazione"
```

### Task 18: «Avanzamento che passa in commessa», prima di approvare

**Files:**
- Create: `src/lib/orders/anteprimaAvanzamento.ts`
- Create: `src/components/orders/AvanzamentoDaApprovare.tsx`
- Modify: `src/components/orders/LaborApprovalDialog.tsx`
- Modify: `src/test/ui/laborApprovalDialog.test.tsx` (finto del nuovo componente)
- Test: `src/test/logic/anteprimaAvanzamento.test.ts`, `src/test/ui/avanzamentoDaApprovare.test.tsx`

Oggi chi approva vede persone, ore e costi: **non vede cosa succede alle fasi**. Con le sottofasi (e con le approvazioni che applicano l'avanzamento da ogni strada) serve dirlo: «Impianto elettrico 33% → 67%, sottofasi fatte: Cavi». L'anteprima ripete la regola del trigger del Task 15 e legge l'avanzamento di oggi con `avanzamentoFase()` (mai la % grezza).

- [ ] **Step 1: scrivi i test della logica (falliscono)**

```ts
// src/test/logic/anteprimaAvanzamento.test.ts
import { describe, expect, it } from "vitest";
import { anteprimaAvanzamento } from "@/lib/orders/anteprimaAvanzamento";

const fase = (id: string, patch: Record<string, unknown> = {}) => ({ id, name: `Fase ${id}`, status: "in_corso", percentuale: 20 as number | null, ...patch });
const sotto = (id: string, phase_id: string, fatta = false, peso = 1) => ({ id, phase_id, name: `Sotto ${id}`, position: 0, peso, fatta, fatta_il: null as string | null });

describe("anteprimaAvanzamento", () => {
  it("una fase libera sale alla percentuale dichiarata, e non scende", () => {
    expect(anteprimaAvanzamento([fase("a")], [], [{ phase_id: "a", percentuale: 60 }])).toEqual([
      { phaseId: "a", nome: "Fase a", prima: 20, dopo: 60, chiude: false, sottofasiNuove: [], dichiarata: 60 },
    ]);
    expect(anteprimaAvanzamento([fase("a", { percentuale: 70 })], [], [{ phase_id: "a", percentuale: 30 }])).toEqual([
      { phaseId: "a", nome: "Fase a", prima: 70, dopo: 70, chiude: false, sottofasiNuove: [], dichiarata: 30 },
    ]);
  });

  it("100 chiude la fase", () => {
    const [riga] = anteprimaAvanzamento([fase("a")], [], [{ phase_id: "a", percentuale: 100 }]);
    expect(riga).toMatchObject({ prima: 20, dopo: 100, chiude: true });
  });

  it("l'avanzamento di oggi è quello vero: una fase chiusa dallo stato con la % a 0 vale 100", () => {
    expect(anteprimaAvanzamento([fase("a", { status: "completata", percentuale: 0 })], [], [{ phase_id: "a", percentuale: 50 }])).toEqual([
      { phaseId: "a", nome: "Fase a", prima: 100, dopo: 100, chiude: false, sottofasiNuove: [], dichiarata: 50 },
    ]);
  });

  it("una voce che non cambia niente non si mostra", () => {
    expect(anteprimaAvanzamento([fase("a")], [], [{ phase_id: "a", percentuale: 20 }])).toEqual([]);
  });

  it("una fase con sottofasi: le spunte diventano fatte e l'avanzamento viene da loro", () => {
    const sottofasi = [sotto("s1", "f", true), sotto("s2", "f"), sotto("s3", "f")];
    expect(anteprimaAvanzamento([fase("f", { percentuale: 33 })], sottofasi, [{ phase_id: "f", percentuale: 99, sottofasi_fatte: ["s2"] }])).toEqual([
      { phaseId: "f", nome: "Fase f", prima: 33, dopo: 67, chiude: false, sottofasiNuove: ["Sotto s2"], dichiarata: null },
    ]);
  });

  it("tutte le sottofasi fatte chiudono la fase; già fatte e id sconosciuti non contano", () => {
    const sottofasi = [sotto("s1", "f", true), sotto("s2", "f")];
    const [riga] = anteprimaAvanzamento([fase("f", { percentuale: 50 })], sottofasi, [{ phase_id: "f", percentuale: 100, sottofasi_fatte: ["s1", "s2", "zzz"] }]);
    expect(riga).toMatchObject({ prima: 50, dopo: 100, chiude: true, sottofasiNuove: ["Sotto s2"] });
  });

  it("un rapportino scritto prima delle sottofasi (solo %) non cambia una fase che ora ne ha", () => {
    expect(anteprimaAvanzamento([fase("f")], [sotto("s1", "f")], [{ phase_id: "f", percentuale: 90 }])).toEqual([]);
    expect(anteprimaAvanzamento([fase("f")], [sotto("s1", "f")], [{ phase_id: "f", percentuale: 90, sottofasi_fatte: [] }])).toEqual([]);
  });

  it("se le sottofasi della voce non ci sono più, vale la percentuale come per una fase libera", () => {
    expect(anteprimaAvanzamento([fase("f")], [], [{ phase_id: "f", percentuale: 60, sottofasi_fatte: ["s1"] }])).toMatchObject([{ prima: 20, dopo: 60 }]);
  });

  it("una fase che non è di questa commessa si salta; una % che non è un numero salta la voce (come fa il database); i valori si limitano a 0–100", () => {
    expect(anteprimaAvanzamento([fase("a")], [], [{ phase_id: "altra", percentuale: 80 }])).toEqual([]);
    expect(anteprimaAvanzamento([fase("a")], [], [{ phase_id: "a", percentuale: "abc" }])).toEqual([]);
    expect(anteprimaAvanzamento([fase("a")], [], [{ phase_id: "a", percentuale: 250 }])[0]).toMatchObject({ dopo: 100, dichiarata: 100 });
  });
});
```

Run: `npx vitest run src/test/logic/anteprimaAvanzamento.test.ts` — Expected: FAIL (`Failed to resolve import "@/lib/orders/anteprimaAvanzamento"`).

- [ ] **Step 2: la logica**

```ts
// src/lib/orders/anteprimaAvanzamento.ts
/**
 * Cosa succede alle fasi quando un rapportino viene approvato (07/10/2026): lo
 * specchio, per l'anteprima, della regola del trigger fn_rapportino_applica_avanzamento.
 * Modulo puro.
 */
import { avanzamentoFase } from "@/lib/orders/cronoprogramma";
import { avanzamentoDaSottofasi, sottofasiPerFase, type Sottofase } from "@/lib/orders/sottofasi";

export interface FaseDellaCommessa { id: string; name: string; status: string; percentuale: number | null }
export interface VoceRapportino { phase_id: string; percentuale?: unknown; sottofasi_fatte?: unknown }

export interface RigaAnteprima {
  phaseId: string;
  nome: string;
  /** Avanzamento di oggi, letto con avanzamentoFase (mai la % grezza). */
  prima: number;
  /** Avanzamento dopo l'approvazione. */
  dopo: number;
  /** La fase passa a completata. */
  chiude: boolean;
  /** Nomi delle sottofasi che diventano fatte. */
  sottofasiNuove: string[];
  /** La percentuale dichiarata dalla voce; `null` se la voce porta sottofasi. */
  dichiarata: number | null;
}

const limita = (n: number): number => Math.min(100, Math.max(0, Math.round(n)));

export function anteprimaAvanzamento(
  fasi: ReadonlyArray<FaseDellaCommessa>,
  sottofasi: ReadonlyArray<Sottofase>,
  voci: ReadonlyArray<VoceRapportino>,
): RigaAnteprima[] {
  const perFase = sottofasiPerFase(sottofasi);
  const righe: RigaAnteprima[] = [];
  for (const voce of voci) {
    const fase = fasi.find((f) => f.id === voce.phase_id);
    if (!fase) continue;   // un'altra commessa, o una fase tolta: il database la salta
    const prima = avanzamentoFase(fase);
    const delle = perFase.get(fase.id) ?? [];
    const spunte = Array.isArray(voce.sottofasi_fatte) ? voce.sottofasi_fatte.filter((x): x is string => typeof x === "string") : null;

    if (spunte && delle.length > 0) {
      const nuove = delle.filter((s) => !s.fatta && spunte.includes(s.id));
      if (nuove.length === 0) continue;   // niente di nuovo: il database non tocca la fase
      const dopo = avanzamentoDaSottofasi(delle.map((s) => ({ peso: s.peso, fatta: s.fatta || nuove.includes(s) }))) ?? prima;
      righe.push({ phaseId: fase.id, nome: fase.name, prima, dopo, chiude: dopo >= 100 && prima < 100, sottofasiNuove: nuove.map((s) => s.name), dichiarata: null });
      continue;
    }
    if (delle.length > 0) continue;   // la decidono le sottofasi: una % dichiarata non cambia niente

    const grezza = voce.percentuale;
    const numero = grezza === undefined || grezza === null || grezza === "" ? 0 : Number(grezza);
    if (!Number.isFinite(numero)) continue;   // non è un numero: il database salta la voce
    const dichiarata = limita(numero);
    const dopo = Math.max(prima, dichiarata);
    if (dopo === prima && dichiarata >= prima) continue;
    righe.push({ phaseId: fase.id, nome: fase.name, prima, dopo, chiude: dopo >= 100 && prima < 100, sottofasiNuove: [], dichiarata });
  }
  return righe;
}
```

Run: `npx vitest run src/test/logic/anteprimaAvanzamento.test.ts` — Expected: PASS (9 casi).

- [ ] **Step 3: scrivi i test del componente (falliscono)**

```tsx
// src/test/ui/avanzamentoDaApprovare.test.tsx
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvanzamentoDaApprovare } from "@/components/orders/AvanzamentoDaApprovare";

const dati = vi.hoisted(() => ({ rapportino: null as unknown, fasi: [] as unknown[], sottofasi: [] as unknown[], chiamate: 0 }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string) => {
    dati.chiamate += 1;
    const righe = () => (tabella === "order_work_phases" ? dati.fasi : tabella === "order_work_subphases" ? dati.sottofasi : []);
    const q: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: righe(), error: null }).then(ok, ko),
      maybeSingle: async () => ({ data: tabella === "campo_rapportini" ? dati.rapportino : null, error: null as null }),
    };
    for (const m of ["select", "eq", "in", "order"]) q[m] = () => q;
    return q;
  };
  return { supabase: { from: catena } };
});

const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AvanzamentoDaApprovare orderId="o1" reportId="r1" />
    </QueryClientProvider>,
  );
const fase = (id: string, patch: Record<string, unknown> = {}) => ({ id, name: `Fase ${id}`, status: "in_corso", percentuale: 20, ...patch });
beforeEach(() => { dati.rapportino = { fasi_lavorate: [] }; dati.fasi = []; dati.sottofasi = []; dati.chiamate = 0; });
afterEach(cleanup);

describe("AvanzamentoDaApprovare", () => {
  it("se il rapportino non dichiara fasi non mostra niente", async () => {
    const { container } = disegna();
    await waitFor(() => expect(dati.chiamate).toBeGreaterThanOrEqual(3));
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("una fase libera: da quanto a quanto, e che si chiude", async () => {
    dati.fasi = [fase("a")];
    dati.rapportino = { fasi_lavorate: [{ phase_id: "a", percentuale: 100 }] };
    disegna();
    expect(await screen.findByText("Avanzamento che passa in commessa")).toBeInTheDocument();
    expect(screen.getByText("Fase a")).toBeInTheDocument();
    expect(screen.getByText("20% → 100%")).toBeInTheDocument();
    expect(screen.getByText("si chiude")).toBeInTheDocument();
  });

  it("una fase con sottofasi: elenca quelle che diventano fatte", async () => {
    dati.fasi = [fase("f", { percentuale: 33 })];
    dati.sottofasi = [
      { id: "s1", phase_id: "f", name: "Tracce", position: 0, peso: 1, fatta: true, fatta_il: null },
      { id: "s2", phase_id: "f", name: "Cavi", position: 1, peso: 1, fatta: false, fatta_il: null },
      { id: "s3", phase_id: "f", name: "Quadro", position: 2, peso: 1, fatta: false, fatta_il: null },
    ];
    dati.rapportino = { fasi_lavorate: [{ phase_id: "f", percentuale: 67, sottofasi_fatte: ["s2"] }] };
    disegna();
    expect(await screen.findByText("33% → 67%")).toBeInTheDocument();
    expect(screen.getByText("Sottofasi fatte: Cavi")).toBeInTheDocument();
  });

  it("se la voce dice meno di oggi lo spiega: l'avanzamento non scende", async () => {
    dati.fasi = [fase("a", { percentuale: 70 })];
    dati.rapportino = { fasi_lavorate: [{ phase_id: "a", percentuale: 30 }] };
    disegna();
    expect(await screen.findByText("Il rapportino dice 30%: l'avanzamento non scende.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: il componente**

```tsx
// src/components/orders/AvanzamentoDaApprovare.tsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { anteprimaAvanzamento, type RigaAnteprima } from "@/lib/orders/anteprimaAvanzamento";
import { sottofaseDaRiga } from "@/lib/orders/sottofasi";

// Le sottofasi non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Nell'approvazione di un rapportino: cosa cambia alle fasi della commessa se si approva. */
export function AvanzamentoDaApprovare({ orderId, reportId }: { orderId: string; reportId: string }) {
  const { data: righe = [] } = useQuery({
    queryKey: ["avanzamento-da-approvare", orderId, reportId],
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<RigaAnteprima[]> => {
      // Un'anteprima: se qualcosa non si legge, non si mostra niente (l'approvazione non cambia).
      try {
        const [rapp, fasi, sotto] = await Promise.all([
          db.from("campo_rapportini").select("fasi_lavorate").eq("id", reportId).eq("order_id", orderId).maybeSingle(),
          db.from("order_work_phases").select("id, name, status, percentuale").eq("order_id", orderId),
          db.from("order_work_subphases")
            .select("id, phase_id, name, position, peso, fatta, fatta_il, fase:order_work_phases!inner(order_id)")
            .eq("fase.order_id", orderId)
            .order("position", { ascending: true }),
        ]);
        if (rapp.error || fasi.error || !Array.isArray(rapp.data?.fasi_lavorate)) return [];
        const sottofasi = sotto.error ? [] : ((sotto.data ?? []) as Record<string, unknown>[]).map(sottofaseDaRiga);
        return anteprimaAvanzamento(fasi.data ?? [], sottofasi, rapp.data.fasi_lavorate);
      } catch {
        return [];
      }
    },
  });
  if (righe.length === 0) return null;

  return (
    <section aria-label="Avanzamento che passa in commessa" className="rounded-xl border p-3">
      <p className="text-sm font-semibold">Avanzamento che passa in commessa</p>
      <ul className="mt-2 space-y-1.5">
        {righe.map((r) => (
          <li key={r.phaseId} className="text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{r.nome}</span>
              <span className="shrink-0 tabular-nums">
                <span>{r.prima}% → {r.dopo}%</span>
                {r.chiude && <span className="ml-2 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold text-green-700">si chiude</span>}
              </span>
            </div>
            {r.sottofasiNuove.length > 0 && <p className="text-xs text-muted-foreground">Sottofasi fatte: {r.sottofasiNuove.join(", ")}</p>}
            {r.dichiarata !== null && r.dichiarata < r.prima && (
              <p className="text-xs text-muted-foreground">Il rapportino dice {r.dichiarata}%: l'avanzamento non scende.</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Vale se approvi. Dopo si cambia dalle fasi della commessa.</p>
    </section>
  );
}
```

- [ ] **Step 5: nel dialogo di approvazione**

In `src/components/orders/LaborApprovalDialog.tsx`, importa il componente:

```tsx
import { AvanzamentoDaApprovare } from "@/components/orders/AvanzamentoDaApprovare";
```

e mettilo subito **prima** del riquadro dei costi, cioè davanti a `{request.showCosts && <div className="rounded-xl bg-muted/50 p-3">`:

```tsx
        <AvanzamentoDaApprovare orderId={request.orderId} reportId={request.reportId} />
```

In `src/test/ui/laborApprovalDialog.test.tsx` quel test fa finto `@tanstack/react-query` (solo `useQuery`, con i dati del controllo): il nuovo componente lo userebbe a sproposito. Aggiungi, accanto agli altri `vi.mock`:

```tsx
vi.mock("@/components/orders/AvanzamentoDaApprovare", () => ({ AvanzamentoDaApprovare: (): null => null }));
```

- [ ] **Step 6: lancia i test**

Run: `npx vitest run src/test/logic/anteprimaAvanzamento.test.ts src/test/ui/avanzamentoDaApprovare.test.tsx src/test/ui/laborApprovalDialog.test.tsx`
Expected: PASS. Poi `git grep -l "LaborApprovalDialog" -- src/test` e lancia anche gli altri file che ne parlano.

- [ ] **Step 7: commit**

```bash
git add src/lib/orders/anteprimaAvanzamento.ts src/components/orders/AvanzamentoDaApprovare.tsx src/components/orders/LaborApprovalDialog.tsx src/test/logic/anteprimaAvanzamento.test.ts src/test/ui/avanzamentoDaApprovare.test.tsx src/test/ui/laborApprovalDialog.test.tsx
git commit -m "Approvazione rapportini: si vede cosa cambia alle fasi (e quali sottofasi diventano fatte) prima di approvare"
```

### Task 19: «x di y sottofasi» nella scheda del cantiere

**Files:**
- Create: `src/components/campo/SottofasiContate.tsx`
- Modify: `src/pages/campo/CampoLavoroDetail.tsx` (query ~riga 421, fase ~riga 870)
- Test: `src/test/ui/sottofasiContate.test.tsx`

La scheda del cantiere (sola lettura) mostra le fasi con la barra: chi è in cantiere deve vedere anche **cosa manca**, senza aprire altro.

- [ ] **Step 1: scrivi i test (falliscono)**

```tsx
// src/test/ui/sottofasiContate.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SottofasiContate } from "@/components/campo/SottofasiContate";

const s = (name: string, fatta: boolean) => ({ name, fatta });
afterEach(cleanup);

describe("SottofasiContate", () => {
  it("senza sottofasi non mostra niente", () => {
    const { container } = render(<SottofasiContate sottofasi={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("dice quante sono fatte e cosa manca", () => {
    render(<SottofasiContate sottofasi={[s("Tracce", true), s("Cavi", false), s("Quadro", false)]} />);
    expect(screen.getByText("1 di 3 sottofasi")).toBeInTheDocument();
    expect(screen.getByText("Mancano: Cavi, Quadro")).toBeInTheDocument();
  });

  it("con molte mancanti ne nomina tre e conta le altre", () => {
    render(<SottofasiContate sottofasi={["a", "b", "c", "d", "e"].map((n) => s(n, false))} />);
    expect(screen.getByText("Mancano: a, b, c e altre 2")).toBeInTheDocument();
  });

  it("tutte fatte: lo dice senza elenco", () => {
    render(<SottofasiContate sottofasi={[s("Tracce", true), s("Cavi", true)]} />);
    expect(screen.getByText("Tutte le 2 sottofasi sono fatte")).toBeInTheDocument();
    expect(screen.queryByText(/Mancano/)).toBeNull();
  });
});
```

- [ ] **Step 2: il componente**

```tsx
// src/components/campo/SottofasiContate.tsx
import { riepilogoSottofasi, type Sottofase } from "@/lib/orders/sottofasi";

const MASSIMO_NOMI = 3;

/** Sotto la barra di una fase, nella scheda del cantiere: quante sottofasi sono fatte e cosa manca. */
export function SottofasiContate({ sottofasi }: { sottofasi: ReadonlyArray<Pick<Sottofase, "name" | "fatta">> }) {
  const { fatte, totale } = riepilogoSottofasi(sottofasi);
  if (totale === 0) return null;
  const mancanti = sottofasi.filter((s) => !s.fatta).map((s) => s.name);
  if (mancanti.length === 0) return <p className="mt-1 text-[11px] text-muted-foreground">Tutte le {totale} sottofasi sono fatte</p>;
  const visibili = mancanti.slice(0, MASSIMO_NOMI).join(", ");
  const altre = mancanti.length - MASSIMO_NOMI;
  return (
    <div className="mt-1 text-[11px] text-muted-foreground">
      <p>{fatte} di {totale} sottofasi</p>
      <p className="truncate">Mancano: {visibili}{altre > 0 ? ` e altre ${altre}` : ""}</p>
    </div>
  );
}
```

Run: `npx vitest run src/test/ui/sottofasiContate.test.tsx` — Expected: PASS (4 casi).

- [ ] **Step 3: nella scheda** — in `src/pages/campo/CampoLavoroDetail.tsx`:

Importazioni, con le altre:

```tsx
import { SottofasiContate } from "@/components/campo/SottofasiContate";
import { sottofaseDaRiga, sottofasiPerFase, type Sottofase } from "@/lib/orders/sottofasi";
```

Dopo la query `fasiCommessa` (~riga 421-443):

```tsx
  // Le sottofasi delle fasi di questo cantiere (sola lettura qui: si spuntano da «Avanzamento lavori» o dal rapportino).
  // Non hanno la commessa: si filtra per quella della loro fase. Se la lettura fallisce si va come sempre.
  const { data: sottofasiLavoro = [] } = useQuery({
    queryKey: ["campo-sottofasi", "lavoro", orderId],
    enabled: !!orderId && activeTab === "descrizione",
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<Sottofase[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("order_work_subphases")
        .select("id, phase_id, name, position, peso, fatta, fatta_il, fase:order_work_phases!inner(order_id)")
        .eq("fase.order_id", orderId)
        .order("position", { ascending: true });
      if (error) return [];
      return ((data ?? []) as Record<string, unknown>[]).map(sottofaseDaRiga);
    },
  });
  const sottofasiDi = useMemo(() => sottofasiPerFase(sottofasiLavoro), [sottofasiLavoro]);
```

Nella scheda della fase, subito dopo la barra di avanzamento (il `<div className="h-1.5 rounded-full bg-muted">…</div>`):

```tsx
                        <SottofasiContate sottofasi={sottofasiDi.get(fase.id) ?? []} />
```

- [ ] **Step 4: lancia i test che nominano la scheda**

Run: `git grep -l "CampoLavoroDetail" -- src/test` e lancia ogni file trovato, più `src/test/ui/sottofasiContate.test.tsx`.
Expected: PASS. (Se un test fa finto `useQuery` con dati fissi, la query nuova risponde `undefined` → `sottofasiLavoro = []` e il blocco non compare: nessun ritocco.)

- [ ] **Step 5: commit**

```bash
git add src/components/campo/SottofasiContate.tsx src/pages/campo/CampoLavoroDetail.tsx src/test/ui/sottofasiContate.test.tsx
git commit -m "Scheda cantiere: «x di y sottofasi» e cosa manca, sotto la barra di ogni fase"
```

### Task 20: il guardiano delle sottofasi

**Files:**
- Create: `src/test/logic/sottofasiCantiere.test.ts`

Il cantiere scrive sulle sottofasi solo `fatta`: lo dice anche il trigger, ma un nuovo punto dell'app che scrivesse altro dovrebbe far rumore **prima** che un operaio veda un errore. E nessun codice dell'app deve applicare le spunte all'approvazione: lo fa il database.

- [ ] **Step 1: scrivi il test**

```ts
// src/test/logic/sottofasiCantiere.test.ts
/**
 * Chi scrive order_work_subphases nell'app (07/10/2026). Il database lascia al
 * cantiere solo «fatta»; qui si tiene ferma la lista dei punti che scrivono, perché
 * uno nuovo vada guardato (ufficio con «Ordini e Commesse», oppure solo `fatta`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const file: string[] = [];
const cammina = (cartella: string) => {
  for (const voce of readdirSync(cartella, { withFileTypes: true })) {
    const percorso = resolve(cartella, voce.name);
    if (voce.isDirectory()) { if (voce.name !== "test" && voce.name !== "node_modules") cammina(percorso); }
    else if (/\.(ts|tsx)$/.test(voce.name)) file.push(percorso);
  }
};
cammina(resolve(process.cwd(), "src"));
const relativo = (p: string) => p.replace(`${process.cwd()}/`, "");
const SCRITTURA = /\.from\(\s*["']order_work_subphases["']\s*\)\s*\.(update|insert|upsert|delete)\(/;

describe("chi scrive le sottofasi", () => {
  it("solo questi file", () => {
    const scrivono = file.filter((p) => SCRITTURA.test(readFileSync(p, "utf8"))).map(relativo).sort();
    expect(scrivono).toEqual([
      "src/hooks/useSottofasi.ts",
      "src/pages/campo/CampoAvanzamento.tsx",
    ]);
  });

  it("l'app di cantiere scrive solo «fatta», e non crea né toglie", () => {
    const pagina = leggi("src/pages/campo/CampoAvanzamento.tsx");
    const scritture = [...pagina.matchAll(/\.from\(\s*["']order_work_subphases["']\s*\)\s*\.update\(([\s\S]*?)\)\s*\.eq\(/g)].map((m) => m[1].trim());
    expect(scritture).toEqual(["{ fatta }"]);
    expect(pagina).not.toMatch(/\.from\(\s*["']order_work_subphases["']\s*\)\s*\.(insert|upsert|delete)\(/);
  });

  it("il rapportino e l'approvazione non scrivono le sottofasi: le spunte le applica il database", () => {
    for (const percorso of [
      "src/pages/campo/CampoRapportino.tsx",
      "src/components/orders/OrdineRapportiniCampo.tsx",
      "src/components/orders/AvanzamentoDaApprovare.tsx",
    ]) {
      expect(leggi(percorso)).not.toMatch(/order_work_subphases["']\s*\)\s*\.(update|insert|upsert|delete)\(/);
    }
  });
});
```

- [ ] **Step 2: lancia il test, deve passare**

Run: `npx vitest run src/test/logic/sottofasiCantiere.test.ts`
Expected: PASS (3 casi). Se un file in più scrive le sottofasi, il primo caso lo dice col suo nome.

- [ ] **Step 3: commit**

```bash
git add src/test/logic/sottofasiCantiere.test.ts
git commit -m "Sottofasi: guardiano dei punti che le scrivono (il cantiere solo «fatta»; le spunte del rapportino le applica il database)"
```

---

# Tappa M4 — Le regole dell'azienda: chi spunta, come si pesano le fasi

Ogni azienda ha il suo modo di lavorare (è il tema di tutta questa sessione: «l'operaio manda le ore, il capocantiere fa il racconto…»). Qui l'azienda sceglie due cose nuove, in **Impostazioni → Fasi e avanzamento**, e il database le fa rispettare:
- **Chi può spuntare le sottofasi** dal cantiere: chiunque lavori sulla commessa (come oggi, di partenza) · chi fa quella fase, o il capocantiere · solo il capocantiere. L'ufficio («Ordini e Commesse») spunta sempre.
- **Come si pesano le fasi nella media della commessa**: alla pari (come oggi, di partenza) · per durata · per importo venduto.

Le due scelte stanno nella stessa tabella (`company_fasi_settings`) e si salvano con la stessa RPC (`fasi_impostazioni_salva`), ma sono **due migrazioni separate**: si possono rilasciare in tempi diversi, e ognuna ha il suo hook, per non dipendere dall'altra.

### Task 21: la regola «chi può spuntare» (migrazione, prova, applicazione)

**Files:**
- Create: `supabase/migrations/20281007143000_chi_spunta_sottofasi.sql`
- Test: `src/test/logic/chiSpuntaMigrazione.test.ts`

La regola vale **nel database**, non solo nella schermata: un'app vecchia (la PWA di un operaio non ancora aggiornata) non la aggira. Riusa le funzioni che l'app di cantiere già chiama: `campo_mio_ruolo` (capocantiere? esiste un capo?) e `campo_mie_fasi` («tu» e «squadra» di ogni fase).

**Un difetto che la prova a secco ha trovato** (e che il test sul testo ora tiene fermo): la guardia gira con i diritti di chi spunta, cioè di un operaio, che la tabella delle impostazioni **non può leggere**. Leggendo la regola dalla tabella la guardia vedeva sempre «nessuna riga» e la regola non scattava mai. Per questo la regola si legge con `fasi_regola_chi_spunta()`, una funzione del proprietario concessa a `authenticated`.

- [ ] **Step 1: verifica che la versione sia libera**

Run: `ls supabase/migrations/20281007143000_*.sql`
Expected: `No such file or directory`.

- [ ] **Step 2: scrivi il test sul testo (fallisce: il file non c'è)**

```ts
// src/test/logic/chiSpuntaMigrazione.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007143000_chi_spunta_sottofasi.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = (nome: string) => codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`))![0];

describe("migrazione chi_spunta_sottofasi", () => {
  it("non aspetta i lock, e di partenza non cambia niente: il default è «tutti»", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toMatch(/add column if not exists chi_spunta text not null default 'tutti'\s+check \(chi_spunta in \('tutti', 'chi_la_fa', 'capi'\)\);/);
  });

  it("la regola si salva con una RPC: permesso delle impostazioni, solo valori noti", () => {
    const f = funzione("fasi_impostazioni_salva");
    expect(f).toContain("'can_edit_settings_orders'");
    expect(f).toMatch(/not in \('tutti', 'chi_la_fa', 'capi'\)/);
    expect(f).toMatch(/errcode = '22023'/);
    expect(codice).toContain("revoke all on function public.fasi_impostazioni_salva(uuid, jsonb) from public, anon;");
    expect(codice).toContain("grant execute on function public.fasi_impostazioni_salva(uuid, jsonb) to authenticated;");
  });

  it("la regola la legge una funzione del proprietario: la guardia gira con i diritti di chi spunta e non vede le impostazioni", () => {
    expect(funzione("fasi_regola_chi_spunta")).toMatch(/security definer\s+set search_path = public/);
    expect(codice).toContain("revoke all on function public.fasi_regola_chi_spunta(uuid) from public, anon;");
    expect(codice).toContain("grant execute on function public.fasi_regola_chi_spunta(uuid) to authenticated;");
  });

  it("la guardia resta a diritti di chi chiama e non ha EXECUTE per nessuno (la usa solo il trigger)", () => {
    const g = funzione("sottofase_guardia");
    expect(g).not.toMatch(/security definer/);
    expect(g).toMatch(/set search_path = ''/);
    expect(codice).toContain("revoke all on function public.sottofase_guardia() from public, anon, authenticated;");
  });

  it("l'ufficio spunta sempre, prima della regola; la regola tocca solo il cambio di «fatta»", () => {
    const g = funzione("sottofase_guardia");
    const ufficio = g.indexOf("has_permission_for_company(v_utente, 'can_edit_orders', v_azienda)");
    const regola = g.indexOf("fasi_regola_chi_spunta(v_azienda)");
    expect(ufficio).toBeGreaterThan(-1);
    expect(regola).toBeGreaterThan(ufficio);
    expect(g).toMatch(/if new\.fatta is distinct from old\.fatta then\s+v_regola := /);
  });

  it("le tre regole, con le frasi che l'operaio leggerà", () => {
    const g = funzione("sottofase_guardia");
    expect(g).toContain("campo_mio_ruolo(v_commessa)");
    expect(g).toContain("campo_mie_fasi(v_commessa)");
    expect(g).toContain("Le sottofasi le spunta il capocantiere.");
    expect(g).toContain("Le sottofasi le spunta chi fa quella fase, o il capocantiere.");
  });

  it("rispetta i guardiani delle migrazioni nuove", () => {
    expect(codice).not.toMatch(/(<>|!=)\s*(public\.)?(get_my_company_id|get_effective_company_id)\(\)/);
    expect(codice).not.toContain("'company_admin'");
  });
});
```

- [ ] **Step 3: lancia il test, deve fallire**

Run: `npx vitest run src/test/logic/chiSpuntaMigrazione.test.ts`
Expected: FAIL — `ENOENT … 20281007143000_chi_spunta_sottofasi.sql`.

- [ ] **Step 4: scrivi la migrazione**

```sql
-- Chi può spuntare le sottofasi dal cantiere: una regola per azienda (07/10/2026).
--
-- Oggi in «Avanzamento lavori» ogni assegnato alla commessa può chiudere QUALUNQUE
-- fase (nessun filtro «la mia fase»; il commento nel codice dice «nessun gate
-- applicativo necessario»), mentre nel rapportino la percentuale la dichiara il
-- capocantiere o, se non c'è, chiunque. Per le sottofasi l'azienda sceglie:
--   · 'tutti'      — chiunque lavori sulla commessa (il comportamento di oggi, il default);
--   · 'chi_la_fa'  — chi è sulla fase (persona, ditta o squadra), il capocantiere,
--                    e chiunque se la commessa non ha capocantiere;
--   · 'capi'       — il capocantiere, e chiunque se la commessa non ha capocantiere.
-- L'ufficio («Ordini e Commesse») spunta sempre. La regola vale nel database, non
-- solo nella schermata: un'app vecchia non la aggira.
-- La regola riusa le funzioni che l'app di cantiere già chiama: campo_mio_ruolo
-- (capocantiere / esiste un capo) e campo_mie_fasi («tu» e «squadra» di ogni fase).

set local lock_timeout = '3s';

alter table public.company_fasi_settings
  add column if not exists chi_spunta text not null default 'tutti'
  check (chi_spunta in ('tutti', 'chi_la_fa', 'capi'));

-- Le regole dell'azienda si scrivono con questa RPC (la tabella è chiusa in scrittura).
--   p_valori: { chi_spunta?: 'tutti' | 'chi_la_fa' | 'capi' }. Le chiavi che non conosce le ignora.
create or replace function public.fasi_impostazioni_salva(p_company_id uuid, p_valori jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  insert into public.company_fasi_settings (company_id) values (p_company_id) on conflict (company_id) do nothing;

  if p_valori ? 'chi_spunta' then
    if (p_valori->>'chi_spunta') not in ('tutti', 'chi_la_fa', 'capi') then
      raise exception 'Scelta non valida.' using errcode = '22023';
    end if;
    update public.company_fasi_settings
       set chi_spunta = p_valori->>'chi_spunta', updated_at = now()
     where company_id = p_company_id;
  end if;
end;
$$;

revoke all on function public.fasi_impostazioni_salva(uuid, jsonb) from public, anon;
grant execute on function public.fasi_impostazioni_salva(uuid, jsonb) to authenticated;

-- La regola dell'azienda, letta con i diritti del proprietario: la guardia scatta con i
-- diritti di chi spunta (un operaio, che la tabella delle impostazioni non la legge) e
-- deve poterla vedere comunque. Restituisce un solo valore dell'elenco, e solo a chi
-- è già dentro il database (non ad anon).
create or replace function public.fasi_regola_chi_spunta(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.chi_spunta from public.company_fasi_settings s where s.company_id = p_company_id), 'tutti');
$$;
revoke all on function public.fasi_regola_chi_spunta(uuid) from public, anon;
grant execute on function public.fasi_regola_chi_spunta(uuid) to authenticated;

-- La guardia delle sottofasi (20281007130000) con la regola in più.
create or replace function public.sottofase_guardia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  -- Le colonne che cambia il cantiere: spuntare una sottofase.
  v_cantiere constant text[] := array['fatta', 'fatta_il', 'fatta_da', 'updated_at'];
  v_azienda uuid;
  v_commessa uuid;
  v_regola text;
  v_ruolo jsonb;
  v_puo boolean;
begin
  -- L'azienda e la commessa sono quelle della fase.
  select f.company_id, f.order_id into v_azienda, v_commessa
    from public.order_work_phases f
   where f.id = new.phase_id;
  if v_azienda is null then
    raise exception 'La fase non esiste.' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.phase_id is distinct from old.phase_id then
    raise exception 'Una sottofase non cambia fase.' using errcode = '42501';
  end if;

  -- Chi l'ha segnata e quando: lo scrive il database, non il client.
  if tg_op = 'INSERT' or new.fatta is distinct from old.fatta then
    new.fatta_il := case when new.fatta then now() end;
    new.fatta_da := case when new.fatta then v_utente end;
  end if;
  new.updated_at := now();

  -- Solo le richieste degli utenti. Le funzioni SECURITY DEFINER, il service
  -- role, i cron e le migrazioni passano.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if public.has_permission_for_company(v_utente, 'can_edit_orders', v_azienda) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Le sottofasi le crea chi ha il permesso «Ordini e Commesse».'
      using errcode = '42501';
  end if;

  -- Dal cantiere cambia solo se la sottofase è fatta…
  if (to_jsonb(new) - v_cantiere) = (to_jsonb(old) - v_cantiere) then
    -- …e solo se la regola dell'azienda lo permette a questa persona.
    if new.fatta is distinct from old.fatta then
      v_regola := public.fasi_regola_chi_spunta(v_azienda);
      if v_regola <> 'tutti' then
        v_ruolo := public.campo_mio_ruolo(v_commessa);
        v_puo := coalesce((v_ruolo->>'capocantiere')::boolean, false)
                 or not coalesce((v_ruolo->>'esiste_capo')::boolean, false);
        if not v_puo and v_regola = 'chi_la_fa' then
          v_puo := exists (select 1 from jsonb_array_elements(public.campo_mie_fasi(v_commessa)) e
                            where (e->>'id')::uuid = new.phase_id
                              and (coalesce((e->>'tu')::boolean, false) or nullif(e->>'squadra', '') is not null));
        end if;
        if not v_puo then
          raise exception '%', case v_regola
              when 'capi' then 'Le sottofasi le spunta il capocantiere.'
              else 'Le sottofasi le spunta chi fa quella fase, o il capocantiere.' end
            using errcode = '42501';
        end if;
      end if;
    end if;
    return new;
  end if;

  raise exception 'Dal cantiere si segna solo se una sottofase è fatta: il resto lo cambia chi ha il permesso «Ordini e Commesse».'
    using errcode = '42501';
end;
$$;

revoke all on function public.sottofase_guardia() from public, anon, authenticated;
```

- [ ] **Step 5: lancia il test sul testo, deve passare**

Run: `npx vitest run src/test/logic/chiSpuntaMigrazione.test.ts`
Expected: PASS (7 casi).

- [ ] **Step 6: commit locale (migrazione non ancora applicata)**

```bash
git add supabase/migrations/20281007143000_chi_spunta_sottofasi.sql src/test/logic/chiSpuntaMigrazione.test.ts
git commit -m "Sottofasi: l'azienda sceglie chi può spuntarle dal cantiere (regola nel database; migrazione non ancora applicata)"
```

- [ ] **Step 7: prova SQL a secco** — una sola `execute_sql`: i file `20281007130000`, `20281007140000` (se non ancora applicati) e **intero** `20281007143000_chi_spunta_sottofasi.sql`, poi questo blocco. Simula un lavoratore dipendente della demo e un amministratore (`set_config('request.jwt.claims', …)` + `set local role authenticated`) e annulla tutto in fondo.

```sql
do $prova$
declare
  v_azienda uuid; v_admin uuid; v_lavoratore uuid; v_ordine uuid; v_dipendente uuid;
  v_fase uuid; s1 uuid; s2 uuid; s3 uuid; s4 uuid; v_n integer;
begin
  select p.company_id into v_azienda
    from public.profiles p join auth.users u on u.id = p.id where u.email = 'demo@azienda.srl';
  select ur.user_id into v_admin from public.user_roles ur join public.profiles p on p.id = ur.user_id
   where p.company_id = v_azienda and ur.role = 'company_admin'::public.app_role limit 1;
  select a.user_id, a.order_id, e.id into v_lavoratore, v_ordine, v_dipendente
    from public.order_campo_assignments a
    join public.orders o on o.id = a.order_id
    join public.employees e on e.user_id = a.user_id and e.company_id = o.company_id
   where o.company_id = v_azienda and o.deleted_at is null
     and not exists (select 1 from public.order_campo_assignments x where x.order_id = a.order_id and x.is_capocantiere)
     and not public.has_permission_for_company(a.user_id, 'can_edit_orders', o.company_id)
   limit 1;
  if v_lavoratore is null or v_admin is null then
    raise exception 'PROVA SALTATA: serve nella demo un lavoratore dipendente assegnato a una commessa senza capocantiere, e un amministratore';
  end if;

  insert into public.order_work_phases (company_id, order_id, name, position) values (v_azienda, v_ordine, 'PROVA regola', 997) returning id into v_fase;
  insert into public.order_work_subphases (phase_id, name, position) values (v_fase, 'a', 0) returning id into s1;
  insert into public.order_work_subphases (phase_id, name, position) values (v_fase, 'b', 1) returning id into s2;
  insert into public.order_work_subphases (phase_id, name, position) values (v_fase, 'c', 2) returning id into s3;
  insert into public.order_work_subphases (phase_id, name, position) values (v_fase, 'd', 3) returning id into s4;

  -- il default è «tutti»: il comportamento di oggi
  perform set_config('request.jwt.claims', json_build_object('sub', v_lavoratore, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.order_work_subphases set fatta = true where id = s1;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'KO 1: con «tutti» il lavoratore non riesce a spuntare'; end if;
  reset role;

  -- regola «capi», ma la commessa non ha un capocantiere: chiunque spunta (come per le percentuali)
  update public.company_fasi_settings set chi_spunta = 'capi' where company_id = v_azienda;
  if not found then insert into public.company_fasi_settings (company_id, chi_spunta) values (v_azienda, 'capi'); end if;
  set local role authenticated;
  update public.order_work_subphases set fatta = true where id = s2;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'KO 2: con «capi» e nessun capocantiere il lavoratore non riesce a spuntare'; end if;
  reset role;

  -- ora la commessa ha un capocantiere (l'amministratore): il lavoratore non spunta più
  insert into public.order_campo_assignments (company_id, order_id, user_id, role_type, is_capocantiere)
  values (v_azienda, v_ordine, v_admin, 'employee', true);
  set local role authenticated;
  begin
    update public.order_work_subphases set fatta = true where id = s3;
    raise exception 'KO 3: con «capi» e un capocantiere il lavoratore ha spuntato';
  exception when sqlstate '42501' then null;
  end;
  reset role;

  -- «chi_la_fa»: il lavoratore non è sulla fase → no; messo sulla fase → sì
  update public.company_fasi_settings set chi_spunta = 'chi_la_fa' where company_id = v_azienda;
  set local role authenticated;
  begin
    update public.order_work_subphases set fatta = true where id = s3;
    raise exception 'KO 4: con «chi_la_fa» un lavoratore non assegnato alla fase ha spuntato';
  exception when sqlstate '42501' then null;
  end;
  reset role;
  insert into public.order_employees (order_id, employee_id, phase_id) values (v_ordine, v_dipendente, v_fase);
  set local role authenticated;
  update public.order_work_subphases set fatta = true where id = s3;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'KO 5: con «chi_la_fa» il lavoratore messo sulla fase non riesce a spuntare'; end if;
  reset role;

  -- l'ufficio spunta sempre, qualunque regola
  update public.company_fasi_settings set chi_spunta = 'capi' where company_id = v_azienda;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.order_work_subphases set fatta = true where id = s4;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'KO 6: l''ufficio non riesce a spuntare con «capi»'; end if;

  -- la regola si salva con la RPC: valori noti sì, sconosciuti no
  perform public.fasi_impostazioni_salva(v_azienda, jsonb_build_object('chi_spunta', 'tutti'));
  if (select chi_spunta from public.company_fasi_settings where company_id = v_azienda) <> 'tutti' then raise exception 'KO 7: la regola non si è salvata'; end if;
  begin
    perform public.fasi_impostazioni_salva(v_azienda, jsonb_build_object('chi_spunta', 'a caso'));
    raise exception 'KO 8: valore sconosciuto accettato';
  exception when sqlstate '22023' then null;
  end;
  reset role;

  -- … e un lavoratore non cambia le regole
  perform set_config('request.jwt.claims', json_build_object('sub', v_lavoratore, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.fasi_impostazioni_salva(v_azienda, jsonb_build_object('chi_spunta', 'tutti'));
    raise exception 'KO 9: il lavoratore ha cambiato la regola';
  exception when sqlstate '42501' then null;
  end;
  reset role;

  raise exception 'PROVA OK — annullata di proposito, niente è stato salvato';
end
$prova$;
```

Expected: `PROVA OK — annullata di proposito …`. Se la demo non ha un lavoratore dipendente assegnato a una commessa senza capocantiere: `PROVA SALTATA` con il motivo (non si prova su dati veri).

- [ ] **Step 8: chiedi l'OK e applica** (dopo le migrazioni delle sottofasi e dei modelli): `apply_migration` con `name: "chi_spunta_sottofasi"` e il contenuto del file; poi

```sql
update supabase_migrations.schema_migrations
   set version = '20281007143000'
 where name = 'chi_spunta_sottofasi' and left(version, 4) = '2026';
```

- [ ] **Step 9: verifica**

```sql
select version, name from supabase_migrations.schema_migrations where version = '20281007143000';   -- 1 riga
select chi_spunta, count(*) from public.company_fasi_settings group by 1;                              -- nessuna riga, o solo 'tutti'
select has_function_privilege('anon', 'public.fasi_regola_chi_spunta(uuid)', 'execute') as anon,
       has_function_privilege('authenticated', 'public.fasi_regola_chi_spunta(uuid)', 'execute') as authenticated;   -- false, true
```

### Task 22: la scheda «Chi può spuntare» e la pagina «Fasi e avanzamento»

**Files:**
- Create: `src/lib/orders/chiSpunta.ts`
- Create: `src/hooks/useChiSpunta.ts`
- Create: `src/components/settings/ChiSpuntaConfig.tsx`
- Modify: `src/pages/azienda/settings/SettingsModelliFasi.tsx` (la pagina compone le schede)
- Modify: `src/components/layouts/CompanyLayout.tsx`, `SettingsLayout.tsx`, `SettingsSearch.tsx`, `src/pages/azienda/settings/SettingsMobileHub.tsx` (la voce diventa «Fasi e avanzamento»)
- Test: `src/test/logic/chiSpunta.test.ts`, `src/test/ui/chiSpuntaConfig.test.tsx`, `src/test/ui/settingsFasiPagina.test.tsx`

- [ ] **Step 1: scrivi i test che falliscono**

```ts
// src/test/logic/chiSpunta.test.ts
import { describe, expect, it } from "vitest";
import { CHI_SPUNTA, chiSpuntaValido } from "@/lib/orders/chiSpunta";

describe("chiSpunta", () => {
  it("le tre scelte, con «chiunque» per prima (il comportamento di oggi)", () => {
    expect(CHI_SPUNTA.map((s) => s.valore)).toEqual(["tutti", "chi_la_fa", "capi"]);
  });
  it("un valore sconosciuto, o assente, vale «tutti»", () => {
    expect(chiSpuntaValido("capi")).toBe("capi");
    expect(chiSpuntaValido("chi_la_fa")).toBe("chi_la_fa");
    expect(chiSpuntaValido("a caso")).toBe("tutti");
    expect(chiSpuntaValido(null)).toBe("tutti");
    expect(chiSpuntaValido(undefined)).toBe("tutti");
  });
});
```

```tsx
// src/test/ui/chiSpuntaConfig.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChiSpuntaConfig from "@/components/settings/ChiSpuntaConfig";

const state = vi.hoisted(() => ({ regola: "tutti", salva: vi.fn() }));
vi.mock("@/hooks/useChiSpunta", () => ({
  useChiSpunta: () => ({ chiSpunta: state.regola, isLoading: false, salva: { mutate: state.salva, isPending: false } }),
}));
beforeEach(() => { vi.clearAllMocks(); state.regola = "tutti"; });
afterEach(cleanup);

describe("ChiSpuntaConfig", () => {
  it("mostra le tre scelte, con quella dell'azienda selezionata", () => {
    state.regola = "chi_la_fa";
    render(<ChiSpuntaConfig puoModificare />);
    expect(screen.getByRole("radio", { name: /Chiunque lavori sulla commessa/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Chi fa quella fase/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Solo il capocantiere/ })).not.toBeChecked();
  });
  it("cambiare scelta salva", () => {
    render(<ChiSpuntaConfig puoModificare />);
    fireEvent.click(screen.getByRole("radio", { name: /Solo il capocantiere/ }));
    expect(state.salva).toHaveBeenCalledWith("capi");
  });
  it("chi non può modificare le vede spente", () => {
    render(<ChiSpuntaConfig puoModificare={false} />);
    expect(screen.getByRole("radio", { name: /Solo il capocantiere/ })).toBeDisabled();
  });
  it("dice che l'ufficio spunta sempre e che la regola vale anche nell'app vecchia", () => {
    render(<ChiSpuntaConfig puoModificare />);
    expect(screen.getByText(/L'ufficio spunta sempre/)).toBeInTheDocument();
  });
});
```

```tsx
// src/test/ui/settingsFasiPagina.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsModelliFasi from "@/pages/azienda/settings/SettingsModelliFasi";

const state = vi.hoisted(() => ({ role: "company_admin" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.role }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsOrders: false }) }));
vi.mock("@/components/settings/ModelliFasiConfig", () => ({ default: () => <div>sezione modelli</div> }));
vi.mock("@/components/settings/ChiSpuntaConfig", () => ({ default: ({ puoModificare }: { puoModificare: boolean }) => <div>sezione chi spunta {String(puoModificare)}</div> }));
afterEach(cleanup);

describe("pagina «Fasi e avanzamento»", () => {
  it("compone le sezioni, e dice alle schede delle regole se si può modificare", () => {
    render(<SettingsModelliFasi />);
    expect(screen.getByText("sezione modelli")).toBeInTheDocument();
    expect(screen.getByText("sezione chi spunta true")).toBeInTheDocument();
  });
  it("chi non è amministratore e non ha il permesso vede le schede in sola lettura", () => {
    state.role = "staff";
    render(<SettingsModelliFasi />);
    expect(screen.getByText("sezione chi spunta false")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/test/logic/chiSpunta.test.ts src/test/ui/chiSpuntaConfig.test.tsx src/test/ui/settingsFasiPagina.test.tsx`
Expected: FAIL (moduli mancanti).

- [ ] **Step 2: la logica e l'hook**

```ts
// src/lib/orders/chiSpunta.ts
/** Chi può spuntare le sottofasi dal cantiere (regola dell'azienda, applicata dal database). Modulo puro. */
export type ChiSpunta = "tutti" | "chi_la_fa" | "capi";

export const CHI_SPUNTA: ReadonlyArray<{ valore: ChiSpunta; etichetta: string; spiegazione: string }> = [
  { valore: "tutti", etichetta: "Chiunque lavori sulla commessa", spiegazione: "Come oggi: chi è assegnato al cantiere può spuntare le sottofasi dall'app." },
  { valore: "chi_la_fa", etichetta: "Chi fa quella fase, o il capocantiere", spiegazione: "Le spunta chi è assegnato a quella fase (la persona, la ditta o la squadra) e il capocantiere." },
  { valore: "capi", etichetta: "Solo il capocantiere", spiegazione: "Gli altri vedono le sottofasi ma non le spuntano. Se la commessa non ha un capocantiere, le spunta chiunque ci lavori." },
];

export function chiSpuntaValido(v: unknown): ChiSpunta {
  return v === "chi_la_fa" || v === "capi" ? v : "tutti";
}
```

```ts
// src/hooks/useChiSpunta.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { messaggioModello } from "@/hooks/useModelliFasi";
import { chiSpuntaValido, type ChiSpunta } from "@/lib/orders/chiSpunta";

// La colonna non è ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaveChiSpunta = (companyId: string | undefined) => ["chi-spunta-fasi", companyId] as const;

/** Chi può spuntare le sottofasi. Senza scelta (o se la lettura fallisce): chiunque lavori sulla commessa, come oggi. */
export function useChiSpunta() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chiaveChiSpunta(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<ChiSpunta> => {
      try {
        const { data, error } = await db.from("company_fasi_settings").select("chi_spunta").eq("company_id", companyId!).maybeSingle();
        if (error) throw error;
        return chiSpuntaValido(data?.chi_spunta);
      } catch {
        return "tutti";
      }
    },
  });

  const salva = useMutation({
    mutationFn: async (chiSpunta: ChiSpunta) => {
      const { error } = await db.rpc("fasi_impostazioni_salva", { p_company_id: companyId, p_valori: { chi_spunta: chiSpunta } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fatto: vale da subito, anche per chi ha l'app aperta");
      void qc.invalidateQueries({ queryKey: chiaveChiSpunta(companyId) });
    },
    onError: (e) => toast.error(messaggioModello(e)),
  });

  return { chiSpunta: query.data ?? "tutti", isLoading: query.isLoading, salva };
}
```

- [ ] **Step 3: la scheda e la pagina**

```tsx
// src/components/settings/ChiSpuntaConfig.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useChiSpunta } from "@/hooks/useChiSpunta";
import { CHI_SPUNTA, type ChiSpunta } from "@/lib/orders/chiSpunta";

export default function ChiSpuntaConfig({ puoModificare }: { puoModificare: boolean }) {
  const { chiSpunta, salva } = useChiSpunta();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Chi può spuntare le sottofasi dal cantiere</CardTitle>
        <CardDescription>
          L'ufficio spunta sempre. Questa regola vale per chi lavora in cantiere (operai, squadre, ditte), e la controlla il database: anche chi ha ancora l'app vecchia la rispetta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={chiSpunta} onValueChange={(v) => salva.mutate(v as ChiSpunta)} disabled={!puoModificare} className="gap-3">
          {CHI_SPUNTA.map((s) => (
            <div key={s.valore} className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value={s.valore} id={`chi-spunta-${s.valore}`} className="mt-0.5" disabled={!puoModificare} />
              <Label htmlFor={`chi-spunta-${s.valore}`} className="cursor-pointer space-y-0.5 font-normal">
                <span className="block text-sm font-medium">{s.etichetta}</span>
                <span className="block text-xs text-muted-foreground">{s.spiegazione}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
```

La pagina compone le schede (sostituisce quella del Task 13):

```tsx
// src/pages/azienda/settings/SettingsModelliFasi.tsx
// Gating gestito da withCompanyPermission("canViewSettingsOrders") in companyRoutes.tsx
import ChiSpuntaConfig from "@/components/settings/ChiSpuntaConfig";
import ModelliFasiConfig from "@/components/settings/ModelliFasiConfig";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

export default function SettingsModelliFasi() {
  const { role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders;
  return (
    <div className="space-y-6">
      <ChiSpuntaConfig puoModificare={puoModificare} />
      <ModelliFasiConfig />
    </div>
  );
}
```

Run: `npx vitest run src/test/logic/chiSpunta.test.ts src/test/ui/chiSpuntaConfig.test.tsx src/test/ui/settingsFasiPagina.test.tsx`
Expected: PASS (2 + 4 + 2 casi).

- [ ] **Step 4: il nome della voce**

Da «Modelli di fasi» a **«Fasi e avanzamento»**:
- `CompanyLayout.tsx` e `SettingsMobileHub.tsx`: `label: "Fasi e avanzamento"`;
- `SettingsLayout.tsx`: `title: "Fasi e avanzamento"`, `description: "I modelli di fasi con le sottofasi, chi le spunta e come si calcola l'avanzamento delle commesse"`;
- `SettingsSearch.tsx`: `title: "Fasi e avanzamento"`, e alle parole chiave aggiungi `"chi spunta"`, `"capocantiere"`, `"peso"`, `"media"`.

Il commento di `HIDDEN_ON_MOBILE` resta valido (la pagina non compare sul telefono).

- [ ] **Step 5: lancia i test delle impostazioni**

Run: `npx vitest run src/test/ui/impostazioniDelPiano.test.tsx src/test/ui/modelliFasiConfig.test.tsx` e i test che nominano il menu delle impostazioni.
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add src/lib/orders/chiSpunta.ts src/hooks/useChiSpunta.ts src/components/settings/ChiSpuntaConfig.tsx src/pages/azienda/settings src/components/layouts src/test/logic/chiSpunta.test.ts src/test/ui/chiSpuntaConfig.test.tsx src/test/ui/settingsFasiPagina.test.tsx
git commit -m "Impostazioni «Fasi e avanzamento»: l'azienda sceglie chi può spuntare le sottofasi"
```

### Task 23: il peso nella media della commessa (migrazione, prova, applicazione)

**Files:**
- Create: `supabase/migrations/20281007150000_peso_media_avanzamento.sql`
- Test: `src/test/logic/pesoMediaMigrazione.test.ts`

Oggi la commessa è la **media semplice** delle fasi (`recompute_order_progress`, `20260710035300`): una demolizione da 800 € pesa come un impianto da 18.000 €. L'azienda sceglie come pesarle: **alla pari** (come oggi, il default), **per durata** (giorni tra inizio e fine previsti) o **per importo venduto**. Se a una fase manca il dato (data o venduto) la media ricade su «alla pari»: una scelta che non si può applicare non inventa numeri. È **l'unico ritocco a `order_work_phases`** di tutto il piano: il trigger del rollup scatta anche cambiando date e venduto (un `DROP`/`CREATE TRIGGER` su una tabella piccola, con `lock_timeout`).

- [ ] **Step 1: verifica che la versione sia libera**

Run: `ls supabase/migrations/20281007150000_*.sql`
Expected: `No such file or directory`.

- [ ] **Step 2: scrivi il test sul testo (fallisce: il file non c'è)**

```ts
// src/test/logic/pesoMediaMigrazione.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007150000_peso_media_avanzamento.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = (nome: string) => codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`))![0];

describe("migrazione peso_media_avanzamento", () => {
  it("non aspetta i lock, e di partenza non cambia niente: il default è «uguale»", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toMatch(/add column if not exists peso_media text not null default 'uguale'\s+check \(peso_media in \('uguale', 'durata', 'venduto'\)\);/);
  });

  it("la media alla pari è quella di sempre, ed è il ripiego quando manca un dato", () => {
    const f = funzione("recompute_order_progress");
    expect(f).toMatch(/else round\(avg\(f\.pct\)\)/);
    expect(f).toMatch(/v_peso = 'durata' and n\.con_giorni = n\.tot/);
    expect(f).toMatch(/v_peso = 'venduto' and n\.con_venduto = n\.tot/);
    expect(f).toMatch(/when status = 'completata' then 100/);
  });

  it("senza fasi non scrive niente, e scrive solo se il valore cambia", () => {
    const f = funzione("recompute_order_progress");
    expect(f).toMatch(/if v_pct is null then\s+return;/);
    expect(f).toMatch(/coalesce\(percentuale_avanzamento, -1\) <> v_pct/);
  });

  it("la funzione tiene i privilegi di oggi: la migrazione non li tocca", () => {
    expect(funzione("recompute_order_progress")).toMatch(/security definer\s+set search_path = public/);
    expect(codice).not.toMatch(/(grant|revoke)[^;]*recompute_order_progress/i);
  });

  it("il rollup scatta anche cambiando date e venduto; è l'unico ritocco a order_work_phases", () => {
    expect(codice).toMatch(/after insert or delete or update of percentuale, status, start_date, end_date, importo_venduto\s+on public\.order_work_phases\s+for each row execute function public\.trg_owp_recompute_order_progress\(\);/);
    expect(codice).not.toMatch(/alter table public\.order_work_phases/i);
  });

  it("la RPC delle impostazioni accetta anche il peso, tiene la regola di chi spunta e riallinea le commesse", () => {
    const f = funzione("fasi_impostazioni_salva");
    expect(f).toContain("'can_edit_settings_orders'");
    expect(f).toMatch(/p_valori \? 'chi_spunta'/);
    expect(f).toMatch(/not in \('uguale', 'durata', 'venduto'\)/);
    expect(f).toMatch(/perform public\.recompute_order_progress\(o\.order_id\)/);
    expect(codice).toContain("grant execute on function public.fasi_impostazioni_salva(uuid, jsonb) to authenticated;");
  });

  it("rispetta i guardiani delle migrazioni nuove", () => {
    expect(codice).not.toMatch(/(<>|!=)\s*(public\.)?(get_my_company_id|get_effective_company_id)\(\)/);
    expect(codice).not.toContain("'company_admin'");
  });
});
```

Nota sul secondo caso: `coalesce(percentuale_avanzamento, -1) <> v_pct` contiene `<>` ma **non** contro `get_my_company_id()` / `get_effective_company_id()`: il guardiano non si applica.

- [ ] **Step 3: lancia il test, deve fallire**

Run: `npx vitest run src/test/logic/pesoMediaMigrazione.test.ts`
Expected: FAIL — `ENOENT … 20281007150000_peso_media_avanzamento.sql`.

- [ ] **Step 4: scrivi la migrazione**

```sql
-- Peso nella media dell'avanzamento della commessa (07/10/2026).
--
-- Dipende da 20281007140000 (company_fasi_settings) e da 20281007143000 (fasi_impostazioni_salva).
--
-- recompute_order_progress (20260710035300) fa la media SEMPLICE delle fasi:
-- una demolizione da 800 € pesa come un impianto da 18.000 €. Ora l'azienda
-- sceglie come pesarle (company_fasi_settings.peso_media):
--   · 'uguale'  — la media di oggi (default, e quando non c'è la riga);
--   · 'durata'  — giorni tra inizio e fine previsti (estremi compresi);
--   · 'venduto' — importo_venduto della fase.
-- Durata e venduto valgono solo se li hanno TUTTE le fasi della commessa: se
-- ne manca uno si ricade sulla media di oggi (una scelta che non si può
-- applicare non inventa numeri). Una fase completata vale 100 anche con la
-- percentuale a 0, come sempre. Con 'uguale' il risultato è IDENTICO a quello
-- di prima: provato sulle commesse vere nella prova SQL.
--
-- Lo specchio TypeScript è src/lib/orders/avanzamentoCommessa.ts: stessi casi.
-- La funzione tiene i privilegi di oggi (create or replace li conserva).
--
-- Il rollup (trg_order_work_phases_progress) scattava solo cambiando
-- percentuale e stato: con un peso per durata o per venduto la media dipende
-- anche da date e importo, quindi ora scatta pure cambiando start_date,
-- end_date e importo_venduto. Con 'uguale' il numero non cambia: la funzione
-- scrive solo se il valore è diverso. È l'unico ritocco a order_work_phases di
-- questo piano: un DROP/CREATE TRIGGER su una tabella piccola, con lock_timeout.

set local lock_timeout = '3s';

alter table public.company_fasi_settings
  add column if not exists peso_media text not null default 'uguale'
  check (peso_media in ('uguale', 'durata', 'venduto'));

create or replace function public.recompute_order_progress(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pct integer;
  v_peso text;
begin
  select coalesce(s.peso_media, 'uguale') into v_peso
    from public.orders o
    left join public.company_fasi_settings s on s.company_id = o.company_id
   where o.id = p_order_id;

  with f as (
    select case when status = 'completata' then 100
                else least(100, greatest(coalesce(percentuale, 0), 0)) end as pct,
           case when start_date is not null and end_date is not null and end_date >= start_date
                then (end_date - start_date + 1) end as giorni,
           case when coalesce(importo_venduto, 0) > 0 then importo_venduto end as venduto
      from public.order_work_phases
     where order_id = p_order_id
  ), n as (
    select count(*) as tot, count(giorni) as con_giorni, count(venduto) as con_venduto from f
  )
  select case
           when v_peso = 'durata' and n.con_giorni = n.tot
             then round(sum(f.pct::numeric * f.giorni) / nullif(sum(f.giorni), 0))
           when v_peso = 'venduto' and n.con_venduto = n.tot
             then round(sum(f.pct::numeric * f.venduto) / nullif(sum(f.venduto), 0))
           else round(avg(f.pct))
         end::integer
    into v_pct
    from f cross join n
   group by n.tot, n.con_giorni, n.con_venduto;

  -- Senza fasi non c'è niente da scrivere (come prima).
  if v_pct is null then
    return;
  end if;

  update public.orders
     set percentuale_avanzamento = v_pct
   where id = p_order_id
     and coalesce(percentuale_avanzamento, -1) <> v_pct;
end;
$$;

-- Il rollup scatta anche cambiando date e venduto, non solo percentuale e stato.
drop trigger if exists trg_order_work_phases_progress on public.order_work_phases;
create trigger trg_order_work_phases_progress
  after insert or delete or update of percentuale, status, start_date, end_date, importo_venduto
  on public.order_work_phases
  for each row execute function public.trg_owp_recompute_order_progress();

-- Stessa firma di 20281007143000 (chi_spunta): ora accetta anche { peso_media }.
create or replace function public.fasi_impostazioni_salva(p_company_id uuid, p_valori jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  insert into public.company_fasi_settings (company_id) values (p_company_id) on conflict (company_id) do nothing;

  if p_valori ? 'chi_spunta' then
    if (p_valori->>'chi_spunta') not in ('tutti', 'chi_la_fa', 'capi') then
      raise exception 'Scelta non valida.' using errcode = '22023';
    end if;
    update public.company_fasi_settings
       set chi_spunta = p_valori->>'chi_spunta', updated_at = now()
     where company_id = p_company_id;
  end if;

  if p_valori ? 'peso_media' then
    if (p_valori->>'peso_media') not in ('uguale', 'durata', 'venduto') then
      raise exception 'Scelta non valida.' using errcode = '22023';
    end if;
    update public.company_fasi_settings
       set peso_media = p_valori->>'peso_media', updated_at = now()
     where company_id = p_company_id;
    -- Le commesse dell'azienda si riallineano subito: il numero che si vede
    -- deve essere quello della scelta.
    perform public.recompute_order_progress(o.order_id)
      from (select distinct order_id from public.order_work_phases where company_id = p_company_id) o;
  end if;
end;
$$;

revoke all on function public.fasi_impostazioni_salva(uuid, jsonb) from public, anon;
grant execute on function public.fasi_impostazioni_salva(uuid, jsonb) to authenticated;
```

- [ ] **Step 5: lancia il test sul testo, deve passare**

Run: `npx vitest run src/test/logic/pesoMediaMigrazione.test.ts`
Expected: PASS (7 casi).

- [ ] **Step 6: commit locale (migrazione non ancora applicata)**

```bash
git add supabase/migrations/20281007150000_peso_media_avanzamento.sql src/test/logic/pesoMediaMigrazione.test.ts
git commit -m "Commessa: l'azienda sceglie come pesare le fasi nella media (alla pari, durata, venduto; migrazione non ancora applicata)"
```

- [ ] **Step 7: prova SQL a secco** — una sola `execute_sql`: `20281007140000` (per `company_fasi_settings`), `20281007143000` (per la RPC) se non ancora applicate, **intero** `20281007150000_peso_media_avanzamento.sql`, poi questo blocco. Il primo controllo ricalcola **tutte** le commesse che hanno fasi (dentro la transazione che alla fine si annulla) e le confronta con la media di sempre: se una sola cambia, la prova si ferma.

```sql
do $prova$
declare
  v_azienda uuid; v_ordine uuid; v_admin uuid; v_pct integer; v_diverse integer;
begin
  -- 0. Con «alla pari» il risultato è quello di sempre: si ricalcolano TUTTE le commesse che hanno fasi
  --    (nessuna azienda ha ancora scelto un peso) e si confronta, commessa per commessa, con la media di prima.
  perform public.recompute_order_progress(x.order_id) from (select distinct order_id from public.order_work_phases) x;
  select count(*) into v_diverse
    from (select order_id,
                 round(avg(case when status = 'completata' then 100 else least(100, greatest(coalesce(percentuale, 0), 0)) end))::int as prima
            from public.order_work_phases group by order_id) vecchia
    join public.orders o on o.id = vecchia.order_id
   where o.percentuale_avanzamento is distinct from vecchia.prima;
  if v_diverse <> 0 then raise exception 'KO 0: % commesse con la media diversa da quella di sempre', v_diverse; end if;

  select p.company_id into v_azienda from public.profiles p join auth.users u on u.id = p.id where u.email = 'demo@azienda.srl';
  select ur.user_id into v_admin from public.user_roles ur join public.profiles p on p.id = ur.user_id
   where p.company_id = v_azienda and ur.role = 'company_admin'::public.app_role limit 1;
  select o.id into v_ordine from public.orders o where o.company_id = v_azienda and o.deleted_at is null
     and not exists (select 1 from public.order_work_phases f where f.order_id = o.id) order by o.created_at limit 1;
  if v_ordine is null then raise exception 'PROVA SALTATA: serve nella demo una commessa senza fasi'; end if;

  -- A chiusa (10 giorni, 800 €), B da iniziare (30 giorni, 18.000 €), C a metà (10 giorni, 1.000 €)
  insert into public.order_work_phases (company_id, order_id, name, position, status, percentuale, start_date, end_date, importo_venduto) values
    (v_azienda, v_ordine, 'A', 0, 'completata', 100, '2026-10-01', '2026-10-10', 800),
    (v_azienda, v_ordine, 'B', 1, 'da_iniziare', 0, '2026-10-11', '2026-11-09', 18000),
    (v_azienda, v_ordine, 'C', 2, 'in_corso', 50, '2026-11-10', '2026-11-19', 1000);

  select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
  if v_pct <> 50 then raise exception 'KO 1: alla pari %, atteso 50', v_pct; end if;

  insert into public.company_fasi_settings (company_id, peso_media) values (v_azienda, 'durata')
    on conflict (company_id) do update set peso_media = excluded.peso_media;
  perform public.recompute_order_progress(v_ordine);
  select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
  if v_pct <> 30 then raise exception 'KO 2: per durata %, atteso 30', v_pct; end if;

  update public.company_fasi_settings set peso_media = 'venduto' where company_id = v_azienda;
  perform public.recompute_order_progress(v_ordine);
  select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
  if v_pct <> 7 then raise exception 'KO 3: per venduto %, atteso 7', v_pct; end if;

  -- manca il venduto di una fase: il rollup scatta da solo (cambia importo_venduto) e ricade sulla media alla pari
  update public.order_work_phases set importo_venduto = null where order_id = v_ordine and name = 'C';
  select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
  if v_pct <> 50 then raise exception 'KO 4: senza venduto %, atteso 50 (il rollup non è scattato?)', v_pct; end if;

  -- per durata manca una data: ricade sulla media alla pari
  update public.company_fasi_settings set peso_media = 'durata' where company_id = v_azienda;
  update public.order_work_phases set end_date = null where order_id = v_ordine and name = 'C';
  select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
  if v_pct <> 50 then raise exception 'KO 5: senza data %, atteso 50', v_pct; end if;

  -- torna la data: il rollup scatta da solo e per durata la commessa è a 30
  update public.order_work_phases set end_date = '2026-11-19' where order_id = v_ordine and name = 'C';
  select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
  if v_pct <> 30 then raise exception 'KO 6: cambiando una data la commessa non si è riallineata (%)', v_pct; end if;

  -- torna il venduto: per venduto la commessa è a 7
  update public.company_fasi_settings set peso_media = 'venduto' where company_id = v_azienda;
  update public.order_work_phases set importo_venduto = 1000 where order_id = v_ordine and name = 'C';
  select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
  if v_pct <> 7 then raise exception 'KO 7: cambiando il venduto la commessa non si è riallineata (%)', v_pct; end if;

  -- l'RPC: rifiuta un valore sconosciuto; col valore buono riallinea la commessa anche se nessuna fase cambia
  if v_admin is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.fasi_impostazioni_salva(v_azienda, jsonb_build_object('peso_media', 'a caso'));
      raise exception 'KO 8: valore sconosciuto accettato';
    exception when sqlstate '22023' then null;
    end;
    perform public.fasi_impostazioni_salva(v_azienda, jsonb_build_object('peso_media', 'uguale'));
    reset role;
    select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
    if v_pct <> 50 then raise exception 'KO 9: dopo il salvataggio dell''RPC (alla pari) %, atteso 50', v_pct; end if;
  end if;

  raise exception 'PROVA OK — annullata di proposito, niente è stato salvato (amministratore: %)', (v_admin is not null);
end
$prova$;
```

Expected: `PROVA OK — annullata di proposito …`. `KO 0` significa che con «alla pari» una commessa vera cambierebbe numero: non applicare.

- [ ] **Step 8: chiedi l'OK e applica**: `apply_migration` con `name: "peso_media_avanzamento"` e il contenuto del file; poi

```sql
update supabase_migrations.schema_migrations
   set version = '20281007150000'
 where name = 'peso_media_avanzamento' and left(version, 4) = '2026';
```

- [ ] **Step 9: verifica**

```sql
select version, name from supabase_migrations.schema_migrations where version = '20281007150000';   -- 1 riga
select tgname, pg_get_triggerdef(oid) from pg_trigger where tgname = 'trg_order_work_phases_progress' and not tgisinternal;
   -- la definizione elenca: percentuale, status, start_date, end_date, importo_venduto
select peso_media, count(*) from public.company_fasi_settings group by 1;   -- nessuna riga, o solo 'uguale'
select has_function_privilege('anon', 'public.recompute_order_progress(uuid)', 'execute') as anon,
       has_function_privilege('authenticated', 'public.recompute_order_progress(uuid)', 'execute') as authenticated;   -- false, false (come prima)
```

### Task 24: la scheda del peso e lo stesso numero ovunque

**Files:**
- Create: `src/lib/orders/avanzamentoCommessa.ts`
- Create: `src/hooks/usePesoMediaFasi.ts`, `src/hooks/useAvanzamentoCommessa.ts`
- Create: `src/components/settings/AvanzamentoCommessaConfig.tsx`
- Modify: `src/pages/azienda/settings/SettingsModelliFasi.tsx`, `src/test/ui/settingsFasiPagina.test.tsx`
- Modify: `src/lib/orders/refreshWorkQueries.ts`
- Modify: `src/components/orders/OrderWorkPhases.tsx`, `src/components/orders/CronoprogrammaCommessa.tsx`, `src/pages/azienda/OrderDetail.tsx`
- Modify: `src/test/ui/orderWorkPlanning.test.tsx`, `src/test/ui/commessaTelefono.test.tsx`, `src/test/ui/cronoprogrammaCommessa.test.tsx` (finto del nuovo hook)
- Test: `src/test/logic/avanzamentoCommessa.test.ts`, `src/test/ui/avanzamentoCommessaConfig.test.tsx`, una riga in `src/test/logic/sottofasi.test.ts`

Il numero della commessa lo calcola **una volta sola, il database** (`orders.percentuale_avanzamento`, con il peso scelto): niente copia in TypeScript da tenere allineata. Le tre schermate che oggi fanno una media per conto loro (intestazione della commessa, Cronoprogramma, «Economia delle lavorazioni») leggono quel numero **solo se l'azienda ha scelto un peso diverso da «alla pari»**. Con «alla pari» (il default) restano i calcoli di oggi, **decimali compresi** (la proiezione del margine in `OrderDetail` usa la media non arrotondata): per le aziende che non scelgono niente non cambia un numero e non parte nemmeno una lettura in più.

- [ ] **Step 1: scrivi i test che falliscono**

```ts
// src/test/logic/avanzamentoCommessa.test.ts
import { describe, expect, it } from "vitest";
import { avanzamentoDaMostrare, PESI_MEDIA, pesoMediaValido } from "@/lib/orders/avanzamentoCommessa";

describe("avanzamentoDaMostrare", () => {
  it("con «alla pari» resta il calcolo locale (con i decimali), anche se il database dice altro", () => {
    expect(avanzamentoDaMostrare(33.33, { percentuale: 33, peso: "uguale" })).toBe(33.33);
    expect(avanzamentoDaMostrare(null, { percentuale: 40, peso: "uguale" })).toBeNull();
  });
  it("con un altro peso vale il numero del database", () => {
    expect(avanzamentoDaMostrare(50, { percentuale: 30, peso: "durata" })).toBe(30);
    expect(avanzamentoDaMostrare(50, { percentuale: 7, peso: "venduto" })).toBe(7);
  });
  it("con un altro peso ma senza il numero del database: il calcolo locale", () => {
    expect(avanzamentoDaMostrare(50, { percentuale: null, peso: "durata" })).toBe(50);
  });
});

describe("PESI_MEDIA e pesoMediaValido", () => {
  it("le tre scelte, con «alla pari» per prima", () => {
    expect(PESI_MEDIA.map((p) => p.valore)).toEqual(["uguale", "durata", "venduto"]);
  });
  it("un valore sconosciuto vale «alla pari»", () => {
    expect(pesoMediaValido("venduto")).toBe("venduto");
    expect(pesoMediaValido("durata")).toBe("durata");
    expect(pesoMediaValido("boh")).toBe("uguale");
    expect(pesoMediaValido(undefined)).toBe("uguale");
  });
});
```

In coda a `src/test/logic/sottofasi.test.ts`, nel `describe("refreshWorkQueries")` esistente:

```ts
  it("aggiorna anche l'avanzamento della commessa letto dal database", () => {
    const qc = new QueryClient();
    const spia = vi.spyOn(qc, "invalidateQueries");
    refreshWorkQueries(qc, "o1");
    expect(spia).toHaveBeenCalledWith({ queryKey: ["order-avanzamento", "o1"] });
  });
```

```tsx
// src/test/ui/avanzamentoCommessaConfig.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AvanzamentoCommessaConfig from "@/components/settings/AvanzamentoCommessaConfig";

const state = vi.hoisted(() => ({ peso: "uguale", salva: vi.fn() }));
vi.mock("@/hooks/usePesoMediaFasi", () => ({
  usePesoMediaFasi: () => ({ pesoMedia: state.peso, isLoading: false, salva: { mutate: state.salva, isPending: false } }),
}));
beforeEach(() => { vi.clearAllMocks(); state.peso = "uguale"; });
afterEach(cleanup);

describe("AvanzamentoCommessaConfig", () => {
  it("mostra le tre scelte, con quella dell'azienda selezionata", () => {
    state.peso = "durata";
    render(<AvanzamentoCommessaConfig puoModificare />);
    expect(screen.getByRole("radio", { name: /Alla pari/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Per durata/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Per importo venduto/ })).not.toBeChecked();
  });
  it("cambiare scelta salva", () => {
    render(<AvanzamentoCommessaConfig puoModificare />);
    fireEvent.click(screen.getByRole("radio", { name: /Per importo venduto/ }));
    expect(state.salva).toHaveBeenCalledWith("venduto");
  });
  it("chi non può modificare le vede spente", () => {
    render(<AvanzamentoCommessaConfig puoModificare={false} />);
    expect(screen.getByRole("radio", { name: /Per durata/ })).toBeDisabled();
  });
});
```

Run: `npx vitest run src/test/logic/avanzamentoCommessa.test.ts src/test/logic/sottofasi.test.ts src/test/ui/avanzamentoCommessaConfig.test.tsx`
Expected: FAIL (moduli mancanti, chiave non ancora in `refreshWorkQueries`).

- [ ] **Step 2: la logica, la chiave da aggiornare e i due hook**

```ts
// src/lib/orders/avanzamentoCommessa.ts
/**
 * Come si pesano le fasi nella media della commessa (scelta dell'azienda). Il
 * numero lo calcola il database (recompute_order_progress, 20281007150000); qui
 * ci sono le scelte, e la regola con cui le schermate decidono quale numero mostrare.
 * Modulo puro.
 */
export type PesoMedia = "uguale" | "durata" | "venduto";

export const PESI_MEDIA: ReadonlyArray<{ valore: PesoMedia; etichetta: string; spiegazione: string }> = [
  { valore: "uguale", etichetta: "Alla pari", spiegazione: "Ogni fase conta come le altre." },
  { valore: "durata", etichetta: "Per durata", spiegazione: "Una fase lunga conta più di una breve. Servono le date di inizio e fine di tutte le fasi." },
  { valore: "venduto", etichetta: "Per importo venduto", spiegazione: "Una fase da 18.000 € conta più di una da 800 €. Serve il venduto di tutte le fasi." },
];

export function pesoMediaValido(v: unknown): PesoMedia {
  return v === "durata" || v === "venduto" ? v : "uguale";
}

/**
 * Quale avanzamento mostrare: con «alla pari» il calcolo di sempre della schermata
 * (decimali compresi); con un altro peso, il numero del database, se c'è.
 */
export function avanzamentoDaMostrare<T extends number | null>(
  locale: T,
  dalDatabase: { percentuale: number | null; peso: PesoMedia },
): T | number {
  if (dalDatabase.peso !== "uguale" && dalDatabase.percentuale != null) return dalDatabase.percentuale;
  return locale;
}
```

In `src/lib/orders/refreshWorkQueries.ts`, aggiungi `"order-avanzamento"` a `orderKeys` (accanto a `"order_work_subphases"`):

```ts
    "order_work_subphases", "order-avanzamento",
```

```ts
// src/hooks/usePesoMediaFasi.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { messaggioModello } from "@/hooks/useModelliFasi";
import { pesoMediaValido, type PesoMedia } from "@/lib/orders/avanzamentoCommessa";

// La colonna non è ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiavePesoMedia = (companyId: string | undefined) => ["peso-media-fasi", companyId] as const;

/** Come l'azienda pesa le fasi nella media della commessa. Senza scelta (o se la lettura fallisce): alla pari. */
export function usePesoMediaFasi() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chiavePesoMedia(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<PesoMedia> => {
      try {
        const { data, error } = await db.from("company_fasi_settings").select("peso_media").eq("company_id", companyId!).maybeSingle();
        if (error) throw error;
        return pesoMediaValido(data?.peso_media);
      } catch {
        return "uguale";
      }
    },
  });

  const salva = useMutation({
    mutationFn: async (peso: PesoMedia) => {
      const { error } = await db.rpc("fasi_impostazioni_salva", { p_company_id: companyId, p_valori: { peso_media: peso } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fatto: le commesse si sono aggiornate");
      void qc.invalidateQueries({ queryKey: chiavePesoMedia(companyId) });
      // La percentuale delle commesse è cambiata nel database.
      void qc.invalidateQueries({ queryKey: ["order-avanzamento"] });
      void qc.invalidateQueries({ queryKey: ["order_work_phases"] });
    },
    onError: (e) => toast.error(messaggioModello(e)),
  });

  return { pesoMedia: query.data ?? "uguale", isLoading: query.isLoading, salva };
}
```

```ts
// src/hooks/useAvanzamentoCommessa.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePesoMediaFasi } from "@/hooks/usePesoMediaFasi";
import { avanzamentoDaMostrare, type PesoMedia } from "@/lib/orders/avanzamentoCommessa";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * L'avanzamento della commessa come lo ha calcolato il database, col peso scelto dall'azienda.
 * Si legge **solo** se l'azienda ha scelto un peso diverso da «alla pari»: con «alla pari»
 * le schermate tengono il loro calcolo di sempre e non parte nessuna lettura in più.
 */
export function useAvanzamentoCommessa(orderId: string | null | undefined) {
  const { pesoMedia } = usePesoMediaFasi();
  const { data } = useQuery({
    queryKey: ["order-avanzamento", orderId],
    enabled: !!orderId && pesoMedia !== "uguale",
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<number | null> => {
      const { data: riga, error } = await db.from("orders").select("percentuale_avanzamento").eq("id", orderId!).maybeSingle();
      if (error || riga?.percentuale_avanzamento == null) return null;
      return Number(riga.percentuale_avanzamento);
    },
  });
  const percentuale = data ?? null;
  const peso: PesoMedia = pesoMedia;
  return {
    percentuale,
    peso,
    /** Il numero da mostrare, dato quello che la schermata calcolerebbe da sola. */
    daMostrare: <T extends number | null>(locale: T): T | number => avanzamentoDaMostrare(locale, { percentuale, peso }),
  };
}
```

- [ ] **Step 3: la scheda e la pagina**

```tsx
// src/components/settings/AvanzamentoCommessaConfig.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePesoMediaFasi } from "@/hooks/usePesoMediaFasi";
import { PESI_MEDIA, type PesoMedia } from "@/lib/orders/avanzamentoCommessa";

export default function AvanzamentoCommessaConfig({ puoModificare }: { puoModificare: boolean }) {
  const { pesoMedia, salva } = usePesoMediaFasi();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Come si calcola l'avanzamento della commessa</CardTitle>
        <CardDescription>
          La commessa avanza con le sue fasi. Scegli quanto conta ciascuna: se a una fase manca il dato (la data o il venduto), la commessa conta le fasi alla pari.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={pesoMedia} onValueChange={(v) => salva.mutate(v as PesoMedia)} disabled={!puoModificare} className="gap-3">
          {PESI_MEDIA.map((p) => (
            <div key={p.valore} className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value={p.valore} id={`peso-${p.valore}`} className="mt-0.5" disabled={!puoModificare} />
              <Label htmlFor={`peso-${p.valore}`} className="cursor-pointer space-y-0.5 font-normal">
                <span className="block text-sm font-medium">{p.etichetta}</span>
                <span className="block text-xs text-muted-foreground">{p.spiegazione}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
```

La pagina `SettingsModelliFasi.tsx` mette la scheda **in cima** (importa `AvanzamentoCommessaConfig`):

```tsx
    <div className="space-y-6">
      <AvanzamentoCommessaConfig puoModificare={puoModificare} />
      <ChiSpuntaConfig puoModificare={puoModificare} />
      <ModelliFasiConfig />
    </div>
```

e `src/test/ui/settingsFasiPagina.test.tsx` riceve il suo finto e un'asserzione:

```tsx
vi.mock("@/components/settings/AvanzamentoCommessaConfig", () => ({ default: ({ puoModificare }: { puoModificare: boolean }) => <div>sezione avanzamento {String(puoModificare)}</div> }));
// … nel primo caso:
    expect(screen.getByText("sezione avanzamento true")).toBeInTheDocument();
```

Run: `npx vitest run src/test/logic/avanzamentoCommessa.test.ts src/test/logic/sottofasi.test.ts src/test/ui/avanzamentoCommessaConfig.test.tsx src/test/ui/settingsFasiPagina.test.tsx`
Expected: PASS.

- [ ] **Step 4: lo stesso numero nelle tre schermate**

`src/components/orders/OrderWorkPhases.tsx`: importa `useAvanzamentoCommessa` da `@/hooks/useAvanzamentoCommessa`; subito dopo `avanzamentoMedio` (~riga 228):

```tsx
  const { daMostrare: avanzamentoDellaCommessa } = useAvanzamentoCommessa(orderId);
```

e dove oggi si passa `avanzamentoPerc={avanzamentoMedio}` (~riga 526): `avanzamentoPerc={avanzamentoDellaCommessa(avanzamentoMedio)}`.

`src/components/orders/CronoprogrammaCommessa.tsx`: importa lo stesso hook; **insieme agli altri hook, prima dei `return` anticipati** (dopo `useCostiMaterialiFasi`, ~riga 185):

```tsx
  const { daMostrare: avanzamentoDellaCommessa } = useAvanzamentoCommessa(orderId);
```

e a ~riga 213: `const avanzamento = avanzamentoDellaCommessa(avanzamentoComplessivo(fasi));`.

`src/pages/azienda/OrderDetail.tsx`: importa lo stesso hook; dopo la query `phaseProgress` (~riga 504):

```tsx
  const { daMostrare: avanzamentoDellaCommessa } = useAvanzamentoCommessa(id);
```

e a ~riga 1214: `const avanzamentoPct = avanzamentoDellaCommessa(phaseProgress?.avgPct ?? null);`.

Nei tre test che montano `OrderWorkPhases` e `CronoprogrammaCommessa` senza i loro provider (`orderWorkPlanning.test.tsx`, `commessaTelefono.test.tsx`, `cronoprogrammaCommessa.test.tsx`), accanto agli altri `vi.mock`:

```tsx
vi.mock("@/hooks/useAvanzamentoCommessa", () => ({
  useAvanzamentoCommessa: () => ({ percentuale: null as number | null, peso: "uguale", daMostrare: (locale: unknown) => locale }),
}));
```

- [ ] **Step 5: lancia le suite**

Run: `npx vitest run src/test/ui src/test/logic`
Expected: PASS, salvo i **28 casi già rossi prima di questo lavoro**, in 10 file che non lo riguardano (logica: `salesSelectorTemplates`, `fotovoltaicoPdfTemplate`, `tettiTemplateModules`, `prenotazioneCollegataCrm`, `imapRicezione`, `flussiCampiFantasma`, `faseVendutoSoloConImporti`, `documentiFiscaliColPermesso`, `automazioniModelloWhatsApp`; UI: `serramentiLocalModules`). Se un altro test che renderizza `CronoprogrammaCommessa` o `OrderDetail` fallisce perché finge `@tanstack/react-query`, aggiungi lo stesso finto: l'errore nomina il file.

- [ ] **Step 6: verifica a occhio** (dopo l'applicazione): in una commessa con fasi datate scegli «Per durata»: intestazione, Cronoprogramma ed «Economia delle lavorazioni» mostrano **lo stesso numero** (leggi il valore: `select percentuale_avanzamento from orders where id = …`); poi riporta la scelta su «Alla pari» e controlla che i numeri tornino come prima. A 375 px la scheda non compare (la pagina è fuori dall'hub del telefono).

- [ ] **Step 7: commit**

```bash
git add src/lib/orders/avanzamentoCommessa.ts src/lib/orders/refreshWorkQueries.ts src/hooks/usePesoMediaFasi.ts src/hooks/useAvanzamentoCommessa.ts src/components/settings/AvanzamentoCommessaConfig.tsx src/pages/azienda/settings/SettingsModelliFasi.tsx src/components/orders/OrderWorkPhases.tsx src/components/orders/CronoprogrammaCommessa.tsx src/pages/azienda/OrderDetail.tsx src/test
git commit -m "Fasi e avanzamento: come si pesano le fasi nella media; lo stesso numero ovunque (solo se l'azienda sceglie un peso)"
```

---

# Tappa M5 — SAL: «meno SAL precedenti» (dopo la tua decisione)

Oggi ogni verbale mostra l'importo **cumulativo** (contrattuale × % per voce, sommato): il secondo SAL, a lavori più avanti, ripete anche quanto era già nel primo. Per fatturare serve la differenza. **Proposta, da confermare:**
- «Già maturato nei SAL precedenti» = somma di `importo_totale` dei SAL **emessi, approvati o firmati** della stessa commessa con `numero_sal` minore (le bozze non contano).
- «Da fatturare con questo SAL» = `totale − già maturato`. Se è negativo (una rettifica al ribasso) si mostra in rosso come «Rettifica», non si blocca.
- Il verbale, la scheda in elenco e il PDF mostrano le due righe in più; **non cambiano** gli importi esistenti né il database.

Questa milestone **non parte** senza il tuo OK sulla definizione qui sopra. Le scelte «a quale rata o fattura si aggancia il SAL firmato» e «SAL per i subappaltatori» restano fuori e sono domande aperte (§5). Il SAL «a misura» richiederebbe unità e quantità nelle voci e non è in questo piano.

### Task 25: il netto del SAL (logica pura, in due copie con un test di parità)

**Files:**
- Create: `src/lib/orders/salNetto.ts`, `supabase/functions/_shared/salNetto.ts`
- Test: `src/test/logic/salNetto.test.ts`

La funzione edge (Deno) non può importare da `src/`: le due copie sono identiche e **un solo test le prova entrambe sugli stessi casi**.

- [ ] **Step 1: scrivi il test che fallisce**

```ts
// src/test/logic/salNetto.test.ts
import { describe, expect, it } from "vitest";
import * as app from "@/lib/orders/salNetto";
import * as edge from "../../../supabase/functions/_shared/salNetto";

const sal = (numero_sal: number, stato: string, importo_totale: number) => ({ id: `s${numero_sal}`, numero_sal, stato, importo_totale });
const tutti = [sal(1, "firmato", 10000), sal(2, "approvato", 6000.5), sal(3, "bozza", 99999), sal(4, "emesso", 4000), sal(5, "emesso", 20000)];

describe.each([["app", app], ["edge", edge]])("salNetto (%s)", (_nome, m) => {
  it("il già maturato conta i SAL emessi, approvati o firmati con numero minore; le bozze no", () => {
    expect(m.maturatoPrecedente({ id: "s4", numero_sal: 4 }, tutti)).toBe(16000.5);
    expect(m.maturatoPrecedente({ id: "s1", numero_sal: 1 }, tutti)).toBe(0);
  });
  it("non conta se stesso né i SAL successivi", () => {
    expect(m.maturatoPrecedente({ id: "s2", numero_sal: 2 }, tutti)).toBe(10000);
  });
  it("il netto è il totale meno il già maturato, a due decimali; può essere negativo", () => {
    expect(m.nettoSal(20000, 16000.5)).toEqual({ totale: 20000, precedente: 16000.5, daFatturare: 3999.5 });
    expect(m.nettoSal(5000, 6000)).toEqual({ totale: 5000, precedente: 6000, daFatturare: -1000 });
    expect(m.nettoSal(0.1 + 0.2, 0).daFatturare).toBe(0.3);
  });
  it("un importo non numerico vale zero", () => {
    expect(m.maturatoPrecedente({ id: "x", numero_sal: 9 }, [{ id: "y", numero_sal: 1, stato: "emesso", importo_totale: Number.NaN }])).toBe(0);
  });
});
```

Run: `npx vitest run src/test/logic/salNetto.test.ts` — Expected: FAIL (moduli mancanti).

- [ ] **Step 2: le due copie** (stesso contenuto, in `src/lib/orders/salNetto.ts` e in `supabase/functions/_shared/salNetto.ts`)

```ts
/**
 * «Meno SAL precedenti»: quanto del SAL è nuovo rispetto a quelli già emessi.
 * Gli importi dei verbali sono cumulativi (contrattuale × % per voce): per
 * fatturare serve la differenza. Due copie identiche (app e funzione edge,
 * che non può importare da src/): src/test/logic/salNetto.test.ts le prova
 * entrambe sugli stessi casi.
 */
export interface SalPerNetto {
  id: string;
  numero_sal: number;
  stato: string;
  importo_totale: number;
}

const STATI_MATURATI = new Set(["emesso", "approvato", "firmato"]);
const arrotonda = (n: number): number => Math.round(n * 100) / 100;

/** Somma dei SAL precedenti già emessi, approvati o firmati (le bozze non contano). */
export function maturatoPrecedente(sal: Pick<SalPerNetto, "id" | "numero_sal">, tutti: ReadonlyArray<SalPerNetto>): number {
  return arrotonda(
    tutti
      .filter((s) => s.id !== sal.id && s.numero_sal < sal.numero_sal && STATI_MATURATI.has(s.stato))
      .reduce((n, s) => n + (Number(s.importo_totale) || 0), 0),
  );
}

export function nettoSal(totale: number, precedente: number): { totale: number; precedente: number; daFatturare: number } {
  return { totale, precedente, daFatturare: arrotonda(totale - precedente) };
}
```

- [ ] **Step 3: lancia il test** — `npx vitest run src/test/logic/salNetto.test.ts` → PASS (8 casi: 4 × 2 copie).

- [ ] **Step 4: commit**

```bash
git add src/lib/orders/salNetto.ts supabase/functions/_shared/salNetto.ts src/test/logic/salNetto.test.ts
git commit -m "SAL: calcolo del «da fatturare» (totale meno SAL precedenti), con test di parità app/edge"
```

### Task 26: il netto nel verbale (elenco e nuovo verbale)

**Files:**
- Modify: `src/components/orders/SalTab.tsx` (scheda in elenco ~riga 465; riepilogo del dialog ~riga 283)
- Test: `src/test/ui/salTabNetto.test.tsx`

- [ ] **Step 1: scrivi il test che fallisce** (non c'è ancora un test di `SalTab`: si fa con un finto `supabase` che risponde alle letture)

```tsx
// src/test/ui/salTabNetto.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SalTab } from "@/components/orders/SalTab";

const dati = vi.hoisted(() => ({ sal: [] as Array<Record<string, unknown>> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/components/shared/PrintPreviewModal", () => ({ PrintPreviewModal: (): null => null }));
vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (tabella: string) => {
    // Lettura: l'oggetto si può «attendere» a ogni passo della catena.
    const lettura: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve({ data: tabella === "sal_records" ? dati.sal : [], error: null }).then(ok, ko),
    };
    for (const metodo of ["select", "eq", "order"]) lettura[metodo] = () => lettura;
    return lettura;
  };
  return { supabase: { from: costruisci, functions: { invoke: vi.fn() } } };
});

const sal = (numero_sal: number, stato: string, importo_totale: number) => ({
  id: `s${numero_sal}`, numero_sal, data_emissione: `2026-10-0${numero_sal}`, stato, importo_totale, note: null as string | null, installment_id: null as string | null,
  sal_voci: [{ id: `v${numero_sal}`, descrizione: "Opere", importo_contrattuale: 40000, percentuale_avanzamento: 40, importo_sal: importo_totale, note: null as string | null }],
});
const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SalTab orderId="o1" companyId="c1" orderTotalAmount={100000} installments={[]} />
    </QueryClientProvider>,
  );
beforeEach(() => { dati.sal = []; });
afterEach(cleanup);

describe("SAL: meno SAL precedenti", () => {
  it("il secondo SAL dice quanto era già nei precedenti e quanto fatturare ora", async () => {
    dati.sal = [sal(2, "emesso", 16000), sal(1, "firmato", 10000)];
    disegna();
    expect(await screen.findByText(/Già maturato nei SAL precedenti:\s*10\.000,00/)).toBeInTheDocument();
    expect(screen.getByText(/Da fatturare con questo SAL:\s*6\.000,00/)).toBeInTheDocument();
    // il primo SAL non ha precedenti: la riga compare una volta sola
    expect(screen.getAllByText(/Già maturato nei SAL precedenti/)).toHaveLength(1);
  });

  it("una bozza precedente non conta", async () => {
    dati.sal = [sal(2, "emesso", 16000), sal(1, "bozza", 10000)];
    disegna();
    await screen.findByText("SAL #2");
    expect(screen.queryByText(/Già maturato nei SAL precedenti/)).not.toBeInTheDocument();
  });

  it("un netto negativo si chiama «Rettifica»", async () => {
    dati.sal = [sal(2, "emesso", 8000), sal(1, "firmato", 10000)];
    disegna();
    expect(await screen.findByText(/Rettifica:\s*[-−]2\.000,00/)).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/test/ui/salTabNetto.test.tsx` — Expected: FAIL (le righe non ci sono). Se `SalTab` pretende altri moduli finti (un provider di conferma, la query delle rate), aggiungi il relativo `vi.mock`: l'errore dice quale.

- [ ] **Step 2: la scheda in elenco** — in `SalTab.tsx`, importa `maturatoPrecedente`, `nettoSal` da `@/lib/orders/salNetto`. Dentro `salList.map((sal) => (…))`, sotto la riga «Emesso il … · Totale: …» (~riga 465):

```tsx
                    {(() => {
                      const precedente = maturatoPrecedente(sal, salList);
                      if (precedente <= 0) return null;
                      const { daFatturare } = nettoSal(sal.importo_totale, precedente);
                      return (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Già maturato nei SAL precedenti: {formatCurrency(precedente)} ·{" "}
                          <span className={daFatturare < 0 ? "font-medium text-rose-600" : "font-medium text-foreground"}>
                            {daFatturare < 0 ? "Rettifica" : "Da fatturare con questo SAL"}: {formatCurrency(daFatturare)}
                          </span>
                        </p>
                      );
                    })()}
```

e nel `<tfoot>` della tabella delle voci (~riga 530), dopo la riga «Totale SAL», aggiungi due righe **solo se** `precedente > 0`:

```tsx
                        {maturatoPrecedente(sal, salList) > 0 && (
                          <>
                            <tr className="border-t text-muted-foreground">
                              <td className="p-2" colSpan={3}>Meno SAL precedenti</td>
                              <td className="p-2 text-right">− {formatCurrency(maturatoPrecedente(sal, salList))}</td>
                            </tr>
                            <tr className="bg-muted/30 font-semibold">
                              <td className="p-2" colSpan={3}>Da fatturare con questo SAL</td>
                              <td className="p-2 text-right">{formatCurrency(nettoSal(sal.importo_totale, maturatoPrecedente(sal, salList)).daFatturare)}</td>
                            </tr>
                          </>
                        )}
```

- [ ] **Step 3: il riepilogo del nuovo verbale** — accanto a `totalDialogImporto` (~riga 283) calcola il precedente del SAL che si sta per creare (numero = massimo + 1):

```tsx
  const numeroNuovo = salList.reduce((m, s) => Math.max(m, s.numero_sal), 0) + 1;
  const precedenteNuovo = maturatoPrecedente({ id: "nuovo", numero_sal: numeroNuovo }, salList);
```

e nel riepilogo del dialog, subito **dopo** il riquadro «Totale SAL: …» (~riga 726):

```tsx
              {precedenteNuovo > 0 && (
                <div className="space-y-1 rounded-lg bg-muted/30 p-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Già maturato nei SAL precedenti</span>
                    <span>− {formatCurrency(precedenteNuovo)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-primary">
                    <span>Da fatturare con questo SAL</span>
                    <span>{formatCurrency(nettoSal(totalDialogImporto, precedenteNuovo).daFatturare)}</span>
                  </div>
                </div>
              )}
```

- [ ] **Step 4: lancia il test del SAL** — `npx vitest run src/test/ui/salTabNetto.test.tsx` → PASS (3 casi). Poi `npx vitest run src/test/ui src/test/logic` per sicurezza: nessun test esistente nomina `SalTab`.

- [ ] **Step 5: commit**

```bash
git add src/components/orders/SalTab.tsx src/test/ui/salTabNetto.test.tsx
git commit -m "SAL: elenco e nuovo verbale mostrano quanto era già maturato e quanto fatturare ora"
```

### Task 27: il netto nel PDF del verbale

**Files:**
- Modify: `supabase/functions/generate-sal-pdf/index.ts` (`buildSalHtml` ~riga 69; riquadri riepilogo ~riga 155-170; piede tabella ~riga 183-190; lettura dei dati ~riga 280)
- Test: `src/test/logic/salPdfNetto.test.ts` (legge il sorgente: la funzione gira su Deno e non si importa in vitest)

- [ ] **Step 1: test sul sorgente (fallisce)**

```ts
// src/test/logic/salPdfNetto.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(resolve(process.cwd(), "supabase/functions/generate-sal-pdf/index.ts"), "utf8");

describe("PDF del SAL: «meno SAL precedenti»", () => {
  it("usa la stessa funzione dell'app, non una sua copia", () => {
    expect(src).toMatch(/import \{ maturatoPrecedente, nettoSal \} from "\.\.\/_shared\/salNetto\.ts";/);
  });
  it("legge i SAL della stessa commessa e porta il già maturato nel verbale", () => {
    expect(src).toMatch(/\.from\("sal_records"\)[\s\S]*?\.eq\("order_id", sal\.order_id\)[\s\S]*?\.eq\("company_id", company_id\)/);
    expect(src).toMatch(/Meno SAL precedenti/);
    expect(src).toMatch(/Da fatturare con questo SAL/);
  });
  it("il primo SAL non cambia: le righe nuove compaiono solo se c'è un precedente", () => {
    expect(src).toMatch(/precedente > 0/);
  });
});
```

- [ ] **Step 2: la funzione edge** — import in cima:

```ts
import { maturatoPrecedente, nettoSal } from "../_shared/salNetto.ts";
```

`buildSalHtml` riceve un parametro in più, `precedente`, prima di `signatureUrl`:

```ts
function buildSalHtml(sal: SalRecord, order: Order | null, azienda: Azienda, precedente: number, signatureUrl?: string | null, brandFooter?: string): string {
```

e la sua chiamata (~riga 361) lo passa nella posizione nuova:

```ts
    const html = buildSalHtml(salWithVoci, order, azienda, precedente, signatureUrl, brandFooter);
```

Subito dopo `percMedia`:

```ts
  const netto = nettoSal(totaleSal, precedente);
```

Nei riquadri di riepilogo (dopo quello «Totale SAL», ~riga 169), se `precedente > 0`:

```ts
    ${precedente > 0 ? `
    <div style="flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;">
      <div style="font-size:7.5pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Da fatturare con questo SAL</div>
      <div style="font-size:13pt;font-weight:700;color:${netto.daFatturare < 0 ? "#dc2626" : "#0f172a"};">${fmtEur(netto.daFatturare)}</div>
    </div>` : ""}
```

Nel piede della tabella (dopo la riga «TOTALE», ~riga 190):

```ts
      ${precedente > 0 ? `
      <tr style="color:#475569;">
        <td style="padding:7px 10px;font-size:9pt;" colspan="3">Meno SAL precedenti</td>
        <td style="padding:7px 10px;text-align:right;font-size:9pt;">− ${fmtEur(precedente)}</td>
      </tr>
      <tr style="background:#f8fafc;font-weight:700;">
        <td style="padding:9px 10px;font-size:9.5pt;" colspan="3">Da fatturare con questo SAL</td>
        <td style="padding:9px 10px;text-align:right;font-size:9.5pt;color:${colore};">${fmtEur(netto.daFatturare)}</td>
      </tr>` : ""}
```

Dopo la lettura del SAL (`salErr`, ~riga 286), prima di leggere l'ordine:

```ts
    // I SAL della stessa commessa: serve il già maturato nei precedenti.
    const { data: tuttiISal } = await supabase
      .from("sal_records")
      .select("id, numero_sal, stato, importo_totale")
      .eq("order_id", sal.order_id)
      .eq("company_id", company_id);
    const precedente = maturatoPrecedente(sal, tuttiISal ?? []);
```

- [ ] **Step 3: lancia i test** — `npx vitest run src/test/logic/salPdfNetto.test.ts src/test/logic/salNetto.test.ts` → PASS (11 casi). Se c'è `deno`: `deno check supabase/functions/generate-sal-pdf/index.ts` → nessun errore.

- [ ] **Step 4: commit** — `git add supabase/functions/generate-sal-pdf/index.ts src/test/logic/salPdfNetto.test.ts && git commit -m "SAL: il PDF del verbale mostra «meno SAL precedenti» e «da fatturare»"`. La funzione edge si pubblica col push su `main` (job «Deploy edge functions»: basta aver toccato `index.ts`).

---

# Rischi, compatibilità e cose lasciate fuori

**Compatibilità con quello che c'è**
- Le fasi esistenti non hanno sottofasi: nessun valore cambia. La sola novità visibile all'ufficio è il discreto invito «Dividi in sottofasi» nella fase aperta (Task 5).
- Un rapportino scritto **prima** che una fase avesse sottofasi, ma approvato dopo: la sua percentuale non si applica a quella fase, la decidono le sottofasi (Task 15; la prova SQL lo controlla, KO 5).
- Le migrazioni sono additive e vanno **prima** del codice, che ha dei ripieghi: senza le tabelle le schermate si comportano come oggi. Il codice può stare su `main` solo dopo che `apply_migration` e il riallineo sono fatti, **tutti e cinque, in ordine** (130000, 140000, 141000, 143000, 150000).
- `trg_fase_campi_protetti` non cambia, e non cambiano le colonne di `order_work_phases`: la percentuale e lo stato di una fase con sottofasi li scrive una funzione `SECURITY DEFINER`, che quel trigger lascia passare. Provato a secco con il trigger vero in produzione.
- Il codice di approvazione del browser (`OrdineRapportiniCampo.tsx`) e i tre punti che scrivono `order_work_phases` **non si toccano**. Se l'ufficio approva con una fase che ha sottofasi, il browser scrive una percentuale e il database la **riscrive** con quella calcolata: risultato identico in qualunque ordine arrivino le due scritture.
- Un'**app vecchia** (PWA non ancora aggiornata) non può sporcare niente: se un operaio con l'app vecchia chiude una fase che ha sottofasi, il database ignora la chiusura e la fase resta com'è (per lui il cerchio «non si chiude»: va aggiornata l'app). La regola «chi spunta» vale anche per lui.

**Cosa cambia per chi usa Silvio**
- L'approvazione di un rapportino da WhatsApp o dal web **applica l'avanzamento** (oggi no). È il comportamento di sempre per l'ufficio, ora uguale per ogni via: decisione 3 in §5.

**Rischi**
| Rischio | Cosa lo ferma |
|---|---|
| Una fase chiusa si riapre da sola aggiungendo una sottofase | Scritto nelle regole (§3); la prova SQL lo verifica; l'ufficio lo vede perché la fase torna «In corso». |
| Due persone spuntano insieme | `for update` sulla fase dentro `ricalcola_fase_da_sottofasi`; la percentuale si ricalcola sempre da tutta la tabella, mai in modo incrementale. |
| Un operaio scrive fuori dalle sue colonne, o su una commessa non sua | `sottofase_guardia` + RLS che segue la commessa (prova SQL M1: 24 controlli, tra cui un utente di un'altra azienda e uno staff «Solo i propri») + `sottofasiCantiere.test.ts`. |
| La regola «chi spunta» non scatta perché la guardia non legge le impostazioni | Trovato dalla prova a secco e corretto: la regola si legge con `fasi_regola_chi_spunta()` (del proprietario, concessa a `authenticated`); il test sul testo della migrazione lo tiene fermo. |
| Cambiare `recompute_order_progress` cambia i numeri di tutti | Con «alla pari» (il default) è identica: il primo controllo della prova SQL ricalcola **tutte** le commesse con fasi e le confronta con la media di prima (0 differenze). Le schermate leggono il numero del database solo con un peso diverso. |
| Il rollup ora scatta anche cambiando date e venduto | `DROP/CREATE TRIGGER` con `lock_timeout` di 3 secondi (tabella piccola); la funzione scrive solo se il valore cambia. |
| Il trigger dell'approvazione ferma un'approvazione per una voce rotta | Ogni voce ha il suo blocco `exception when others`: un errore diventa un avviso nel registro del database, non un'approvazione fallita (prova: id inesistente, non-uuid, percentuale non numerica). |
| Due amministratori aprono insieme la pagina dei modelli la prima volta | `inizializza_modelli_fasi` blocca la riga delle impostazioni (`for update`): il secondo trova già fatto (0 modelli aggiunti), e un nome già presente non si duplica (indice unico + controllo). |
| «Scegli le fasi» si rompe per chi non ha ancora le tabelle | `useModelliFasi` ricade sui soli modelli di partenza; `applyTemplate` chiama una RPC: se non c'è, errore chiaro, e «Aggiungi una singola fase» funziona come sempre. Perciò: **migrazione prima, codice dopo**. |
| Un'azienda elimina tutti i modelli e non li ritrova | «Ripristina i predefiniti» rimette quelli di partenza che mancano (per nome), senza toccare gli altri. |
| Test che fingono `@tanstack/react-query` si rompono per i nuovi hook | Un `vi.mock` per hook nuovo (Task 6, 11, 18, 24): `orderWorkPlanning`, `commessaTelefono`, `laborApprovalDialog` e i due dei modelli. `npx vitest run src/test/ui src/test/logic` trova gli altri. |
| Il typecheck a cricchetto sale | Le tabelle nuove non sono nei tipi generati: cast localizzati `db = supabase as any` con commento; nessun `any` altrove; liste annotate (`(): FaseModello =>`). |
| Il database registra rumore alla creazione delle tabelle (`check_new_table_rls`) | Le tabelle nascono con la RLS attiva nella stessa migrazione: il trigger-evento registra comunque un avviso `rls_missing` (2587 righe già così); è rumore, non una falla. |

**Limiti noti (non risolti qui)**
- **Il cantiere non nasconde le caselle che la regola vieta**: se l'azienda sceglie «solo il capocantiere» e un operaio tocca una sottofase, il database rifiuta e l'operaio legge «Le sottofasi le spunta il capocantiere.» (toast). Nasconderle richiederebbe una chiamata `campo_mio_ruolo` per cantiere nella pagina «Avanzamento lavori».
- **Nessuna coda offline** per Avanzamento e rapportino (già vero oggi): con poco segnale una spunta può fallire, si legge l'errore e si riprova.
- Ogni spunta cambia `orders.percentuale_avanzamento` e, a catena, ciò che già oggi scatta con lo slider (versione della commessa, WhatsApp al cliente a 50/75/100%, evento «fase completata»): succede **più spesso**, non diversamente.

**Fuori da questo piano (decisioni o lavori a parte)**
- Avanzamento per **quantità** (mq posati / mq totali): servono unità di misura e quantità eseguite, oggi inesistenti nel database.
- **Dipendenze** tra fasi («l'impianto parte dopo la demolizione») e ritardi che si propagano.
- Approvazione ufficio **obbligatoria** sulle ore, fatturazione a SAL, SAL per subappaltatori, semaforo margine: restano domande aperte (§5).
- La pagina «Oggi» dell'app di cantiere con le sottofasi del giorno (richiede di estendere `campo_mia_giornata`); gli avvisi di fase per gli operai; la coda offline.
- Uno **strumento di Silvio / MCP** per spuntare le sottofasi (il connettore ha 54 strumenti e nessuno tocca le fasi).
- Applicare un modello **già in fase di creazione** della commessa (`CreateOrder`) e suggerire il modello giusto dal tipo di preventivo: possibile dopo, con la stessa RPC.
- Audit delle sottofasi in `user_action_log`: `fatta_il`/`fatta_da` bastano per ora.
- Riordino **trascinando** (dnd-kit) nell'editor dei modelli: ora frecce su/giù.
- Difetti trovati lungo la strada e **non toccati**: in `CampoRapportino` «Avanzamento attuale» e in `CampoLavoroDetail` la barra leggono la `percentuale` grezza (una fase chiusa dallo stato con la % a 0 mostra 0 in `OrderWorkPhases:940`); `OrdinePDF` legge una colonna `sal.percentuale_avanzamento` che non esiste; `cg_get_marginalita_commesse` tratta la % come 0–1.

# Verifica finale (prima di dire «fatto»)

- [ ] `npx vitest run src/test/logic src/test/ui` — verde, salvo i **28 casi già rossi prima di questo lavoro**, in 10 file che non lo riguardano (logica: `salesSelectorTemplates`, `fotovoltaicoPdfTemplate`, `tettiTemplateModules`, `prenotazioneCollegataCrm`, `imapRicezione`, `flussiCampiFantasma`, `faseVendutoSoloConImporti`, `documentiFiscaliColPermesso`, `automazioniModelloWhatsApp`; UI: `serramentiLocalModules`): nessun caso nuovo rosso. Tra i test che contano: `faseCampiProtetti.test.ts`, `impostazioniDelPiano.test.tsx`, i guardiani delle migrazioni in `src/test/logic` (`senzaAziendaNonVuolDireTutte`, `amministratoreDiQualeAzienda`, `funzioniInterneSoloAlServizio`, `funzioniServerPermessoAzienda`, `backupCompleto`).
- [ ] Typecheck mirato sui file toccati (tsconfig ristretto nella radice, con `src/vite-env.d.ts` e `src/test/setup.ts`, e un errore voluto come prova che controlla davvero): nessun errore nuovo.
- [ ] Migrazioni applicate e riallineate, **in ordine**: `select version, name from supabase_migrations.schema_migrations where version in ('20281007130000','20281007140000','20281007141000','20281007143000','20281007150000') order by 1;` → 5 righe; `select * from public.admin_backup_tabelle_scoperte();` → vuota; `20281007120000` (rapportini «ore proprie») applicata **prima** del push.
- [ ] A 375 px: la scheda di commessa, il dialog «Fasi di lavoro» e «Avanzamento lavori» sono densi come prima (nessuno spazio bianco in più; caselle da 44 px solo dove ci sono le sottofasi); la pagina «Fasi e avanzamento» non compare nell'hub del telefono.
- [ ] A mano, a computer, con l'azienda demo (e **togliendo** quello che si crea):
  1. Impostazioni → «Fasi e avanzamento»: compaiono gli otto modelli, ognuno con «Modifica», «Duplica», «Elimina»; elimina uno, poi «Ripristina i predefiniti»: torna solo quello.
  2. Modifica un modello: due sottofasi nella prima fase. Commessa vuota → «Scegli le fasi» → quel modello → «Aggiungi le N fasi»: fasi e sottofasi ci sono.
  3. Spunta una sottofase dall'ufficio: la percentuale della fase e quella della commessa seguono; la fase non si rettifica a mano.
  4. Con la regola «Solo il capocantiere»: un operaio che spunta vede la frase del database; il capocantiere spunta dal rapportino, l'ufficio approva e vede «Avanzamento che passa in commessa», e dopo l'approvazione le sottofasi sono fatte.
  5. Approva un rapportino con Silvio (WhatsApp o web): l'avanzamento si applica.
  6. Scegli «Per durata»: intestazione, Cronoprogramma ed «Economia delle lavorazioni» mostrano lo stesso numero; torna su «Alla pari»: i numeri sono quelli di prima.
- [ ] Nessun file tracciato modificato fuori da quelli del piano; i due file dell'altra sessione (`src/test/logic/faseCampiProtetti.test.ts`, `supabase/migrations/20281006150000_fasi_campi_protetti.sql`) **non** sono nei miei commit.

# Auto-revisione del piano

**Copertura delle richieste.** (1) Sottofasi che determinano l'avanzamento della fase → M1 (database, ufficio), M3 (cantiere). (2) Modelli per azienda, impostati nelle Impostazioni e usati da «Scegli le fasi» → M2. (3) Gli otto modelli diventano dell'azienda, modificabili ed eliminabili → Task 13 (pagina), Task 8 (`inizializza_modelli_fasi`), Task 11 («Scegli le fasi»). (4) Rianalisi del sistema e del collegamento con operaio, capocantiere, caposquadra, ditte e ufficio → §0.bis, e le scelte che ne escono: approvazione dal database (Task 15), anteprima in approvazione (Task 18), scheda del cantiere (Task 19), regola per azienda (Task 21-22), un solo numero (Task 24). (5) Peso nella media e SAL → M4, M5.

**Nomi coerenti.** `Sottofase`, `avanzamentoDaSottofasi`, `statoFaseDaAvanzamento`, `faseHaSottofasi`, `riepilogoSottofasi`, `sottofasiPerFase`, `sottofaseDaRiga`, `messaggioErrore`, `fasiLavorateDelRapportino`, `sottofasiSpuntate` (Task 1 e 17); `ModelloFasi`, `BozzaModello`, `PayloadModello`, `modelliDaOffrire`, `modelliPerInizializzare`, `modelliDiPartenzaMancanti`, `fasiPerCommessa`, `validaBozza` (Task 7); `useModelliFasi` con `modelli`, `inizializzati`, `disponibile`, `salva`, `elimina`, `inizializza` (Task 10); `anteprimaAvanzamento`, `RigaAnteprima` (Task 18); `CHI_SPUNTA`, `chiSpuntaValido` (Task 22); `PESI_MEDIA`, `pesoMediaValido`, `avanzamentoDaMostrare` (Task 24); RPC `salva_modello_fasi`, `elimina_modello_fasi`, `salva_commessa_come_modello`, `inizializza_modelli_fasi`, `aggiungi_fasi_commessa`, `fasi_impostazioni_salva`, `fasi_regola_chi_spunta`.

**Segnaposto.** Nessun «TBD»: ogni passo ha codice, comandi e risultato atteso. I blocchi SQL dei Task 3, 9, 15, 21 e 23 sono quelli **già lanciati a secco** sulla produzione il 07/10/2026.

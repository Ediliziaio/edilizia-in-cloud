# Piano — Lingua della piattaforma (prima l'area operai)

Data: 23/11/2026 · Stato: **APPROVATO 23/11 — fase 1 e fase 2 (parte operai) fatte in locale, vedi «Stato dei lavori» in fondo** · Ramo: `claude/lingua-piattaforma`

## In breve (per Florin)

- Ogni persona sceglie la sua lingua da **Impostazioni → Profilo**, sul telefono e sul computer.
  La scelta resta legata alla persona: vale su ogni dispositivo con cui entra.
- Chi non sceglie niente vede tutto **in italiano, come oggi**. Non cambiamo la lingua da soli
  guardando il telefono della persona.
- Lingue: italiano (di partenza), rumeno, albanese, darija marocchino, arabo egiziano, tedesco,
  francese, inglese, spagnolo, spagnolo argentino, spagnolo peruviano.
- **Prima fase: solo l'area operai** (`/campo`) più la pagina del profilo. Il resto della
  piattaforma resta in italiano finché non lo traduciamo nelle fasi dopo.
- Restano **in italiano** i documenti che vanno all'ufficio o al cliente (PDF del rapportino,
  verbali, tesserino), i messaggi WhatsApp, le email, e tutto quello che scrivono le persone
  (nomi dei cantieri, fasi, note, articoli di magazzino).
- Le traduzioni le preparo io con la traduzione automatica e sono segnate **«da controllare»**:
  serve che un madrelingua per lingua (anche un vostro operaio) le riveda con un foglio semplice.
- Tempi stimati della prima fase: 4–6 giornate di lavoro, più la revisione dei madrelingua.

**Una cosa da sapere subito:** l'altra sessione di collaudo sta modificando proprio i file
dell'area operai (circa 40 file non ancora salvati nel repository). Per non pestarci i piedi,
il lavoro sui testi delle schermate parte **dopo** che le sue modifiche sono salvate. Nel
frattempo faccio le parti che non toccano quei file (vedi Fase 1a).

---

## 1. Cosa c'è già nel repository

Controllato il 23/11/2026 su `origin/main` (5e29495aa) e sul database live.

| Cosa | Esito |
|---|---|
| Libreria di traduzioni (i18next, react-intl, lingui…) | **Nessuna.** Tutti i testi sono scritti in italiano dentro i componenti. |
| Cartella testi (`src/i18n`, `src/locales`) | Non esiste. |
| Colonna lingua su `profiles` / `hr_profili` | **Non esiste.** Le colonne `language`/`lingua` presenti sono su altre tabelle (agenti AI, contatti marketing, modelli WhatsApp) e non vanno toccate. |
| Preferenze utente riusabili su `profiles` | Nessun campo jsonb di preferenze; c'è solo `preferred_briefing_channel`. |
| `index.html` | `<html lang="it">` fisso. |
| Direzione destra→sinistra | Nessun uso di `dir="rtl"` né di varianti `rtl:` di Tailwind. |
| Formati | Area operai: `date-fns/locale` (17 punti), `toLocale…("it-IT")` (12 punti), `Intl.NumberFormat("it-IT")` (2 punti). |
| Profilo utente in memoria | `AuthContext` legge `profiles` con `select("*")` e lo tiene in cache sul dispositivo: una colonna nuova arriva da sola, senza toccare la logica di accesso. |
| Pagina profilo | `src/pages/azienda/impostazioni/MioProfilo.tsx` è **la stessa** usata dall'app azienda (`/azienda/impostazioni/mio-profilo`) e dall'area operai (`/campo/impostazioni`, dentro `CampoImpostazioni`). Una sola scheda «Lingua» serve a entrambe. L'admin ha una pagina sua (`AdminMioProfilo`), fuori dalla prima fase. |

Non c'è niente da riusare: si introduce un sistema nuovo, uno solo, per tutta la piattaforma.

**Scelta dello strumento: `i18next` + `react-i18next`** (installati con `bun add`).
Motivo: la piattaforma, tradotta tutta, avrà decine di migliaia di testi; serve uno strumento
standard che sappia già fare la catena di ripiego (es‑AR → es → it), i plurali di ogni lingua
(l'arabo ne ha sei forme), il caricamento di una lingua solo quando serve, e che chiunque
lavori sul codice dopo di noi conosca. Una soluzione fatta in casa costerebbe meno oggi e
molto di più alla fase 3.

## 2. Dove si salva la lingua

- **Sul profilo, nel database:** nuova colonna `profiles.lingua text` (vuota = italiano),
  con un controllo che accetta solo i codici previsti. Così vale su ogni dispositivo.
- **Ripiego sul dispositivo:** la stessa scelta viene scritta anche in memoria locale
  (`eic_lingua`). Serve a tre cose: mostrare subito la lingua giusta all'apertura, prima che
  il profilo sia arrivato (niente «lampo» di italiano); funzionare senza rete; ricordare la
  scelta prima dell'accesso.
- **Ordine di precedenza:** lingua del profilo → lingua salvata sul dispositivo → italiano.
  La lingua del telefono **non** viene usata (regola: per default tutto resta come oggi).
- **Senza rete:** la scelta si applica subito e resta sul dispositivo; il salvataggio sul
  profilo viene ritentato al prossimo avvio con rete. Messaggio: «Salvata su questo telefono».
- **Permessi:** l'utente aggiorna già la sua riga di `profiles` da `MioProfilo` (nome,
  telefono, foto); verifico prima che la regola di accesso permetta anche la nuova colonna.

**Migrazione** (secondo `CLAUDE.md`):

```sql
-- supabase/migrations/2029052xxxxxxx_profiles_lingua.sql  (versione libera da verificare con ls)
alter table public.profiles add column if not exists lingua text;
alter table public.profiles drop constraint if exists profiles_lingua_valida;
alter table public.profiles add constraint profiles_lingua_valida check (
  lingua is null or lingua in ('it','ro','sq','ar-MA','ar-EG','de','fr','en','es','es-AR','es-PE')
);
comment on column public.profiles.lingua is 'Lingua scelta dalla persona; null = italiano.';
```

1. SQL idempotente (sopra). Colonna vuota per tutti: nessun dato esistente cambia.
2. Applicata con `apply_migration` (mai `supabase db push`).
3. Subito dopo, riallineamento della versione in `supabase_migrations.schema_migrations`
   al nome del file, come da `CLAUDE.md`.
4. File salvato con la stessa versione, dopo aver controllato con `ls` che non sia già presa.
5. Aggiunta della riga nuova in `src/integrations/supabase/types.ts`.

Nota: applicare la migrazione cambia il database live (colonna nuova, vuota, innocua).
La applico **solo dopo il tuo ok** su questo piano; il codice resta in locale senza pubblicare.

## 3. La scelta della lingua in Impostazioni → Profilo

**Dove:** in `MioProfilo`, scheda «Profilo», una nuova scheda «Lingua» **in cima** (prima dei
dati personali). Siccome `MioProfilo` è condivisa, compare sia nell'app azienda sia nell'area
operai. In più, nel menu dell'area operai (`CampoMenu`) una riga con il mappamondo
🌐 «Lingua · Română» che porta lì: un operaio che non legge l'italiano deve poterla trovare.

**Come appare:**
- Ogni lingua è scritta **nella sua lingua** («Română», «Shqip», «الدارجة المغربية»,
  «العربية المصرية», «Deutsch», «Français», «English», «Español», «Español (Argentina)»,
  «Español (Perú)»), con sotto il nome in italiano piccolo per l'ufficio. Niente bandiere
  (una lingua non è uno Stato); per le varianti basta il nome.
- Il titolo della scheda è sempre doppio: «Lingua · Language», così chi ha sbagliato lingua
  ritrova la strada.
- **Telefono (390 px):** elenco verticale a righe grandi (almeno 48 px), un tocco = scelta,
  segno di spunta sulla lingua attiva. Niente tendina: sul telefono è più facile sbagliare.
- **Computer:** la stessa lista su 2–3 colonne dentro la scheda.
- Il cambio è immediato, senza ricaricare la pagina; un avviso breve conferma nella lingua nuova.
- Sotto la lista, una riga onesta: «Per ora sono tradotte le schermate del cantiere; il resto
  arriverà.» (nella lingua scelta).

## 4. Arabo: da destra a sinistra, e come scrivere darija ed egiziano

**Direzione.** Quando la lingua è araba e la persona è nell'area operai:
- `<html dir="rtl" lang="ar-MA">` (o `ar-EG`) mentre è aperta una pagina `/campo`; uscendo si
  torna a `ltr`/`it`. Deve stare su `<html>` e non solo sul contenitore, perché finestre,
  tendine, pannelli e avvisi si aprono fuori dal contenitore e altrimenti resterebbero girati
  al contrario. In più `DirectionProvider` di Radix per i componenti che lo leggono.
- Fuori dall'area operai, nella prima fase, la pagina resta in italiano e da sinistra a
  destra: girare all'arabo uno schermo scritto in italiano sarebbe peggio.
- **Controllo dei layout:** nelle schermate del campo ci sono ~100 posizionamenti «fisici»
  (`ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`/`text-right`) da convertire nelle
  forme logiche di Tailwind 3.4 (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`/`text-end`),
  che in italiano danno esattamente lo stesso risultato di oggi.
- **Frecce:** ~60 icone direzionali (`ChevronRight`, `ChevronLeft`, `ArrowLeft`) vanno
  specchiate (`rtl:-scale-x-100`): «indietro» in arabo punta a destra. Non si specchiano
  icone che non hanno direzione (fotocamera, telefono, spunta, orologio).
- Numeri, orari e importi restano nell'ordine giusto dentro le frasi arabe (vengono isolati).

**Come scrivere darija ed egiziano.**
- **Alfabeto arabo per entrambi**, scritti nel parlato vero (non l'arabo classico dei libri):
  frasi corte, parole che si usano davvero in cantiere. Motivi: è la scrittura che il
  telefono già sa mostrare e leggere ad alta voce; chi ha studiato anche poco la riconosce;
  l'arabo classico sarebbe più «corretto» ma per molti operai suona da ufficio e si capisce peggio.
- Termini italiani che l'operaio sente ogni giorno in cantiere e in ufficio restano anche in
  italiano tra parentesi la prima volta (es. «rapportino», «DDT», «SAL», «timbratura»),
  così parla la stessa lingua dell'ufficio.
- **Darija in lettere latine** («Arabizi», come molti scrivono su WhatsApp): **non nella prima
  fase.** Non ha un modo di scrivere fisso, quindi la traduzione automatica sarebbe poco
  affidabile. Se dalla revisione con i vostri operai marocchini esce che lo preferiscono, si
  aggiunge come dodicesima lingua (`ar-MA-Latn`, da sinistra a destra) — **domanda per te sotto.**
- Cifre: **0–9 occidentali** anche in arabo (in Marocco sono già quelle; in Egitto si usano
  anche le cifre arabe orientali). Motivo: le ore e le quantità devono essere identiche a
  quelle che l'ufficio vede nel PDF.

## 5. Spagnolo base e varianti

- `es` (base): spagnolo neutro con il «tú».
- `es-AR` eredita da `es` e cambia **solo** ciò che cambia davvero: il «vos» nei pulsanti e
  negli inviti («Guardá», «Elegí», «Tocá», «Podés») e poche parole (celular, …).
  Stima: 150–300 testi, perché il «vos» tocca quasi tutti i pulsanti.
- `es-PE` eredita da `es` e cambia poche parole (celular, …). Stima: 20–60 testi.
- Il file di una variante contiene **solo** le righe diverse; per tutto il resto vale lo
  spagnolo base, e se manca anche lì, l'italiano. Catena: `es-AR → es → it`, `es-PE → es → it`.

## 6. Date, numeri, valute

Un solo punto del codice (`src/lib/lingua/formati.ts`) da cui passano tutte le date, ore,
numeri e importi dell'area operai, al posto degli `"it-IT"` scritti a mano (~30 punti).

| Lingua | Formato usato | Note |
|---|---|---|
| it | it-IT | come oggi: 23/11/2026, 1.234,50 € |
| ro, sq, de, fr | ro-RO, sq-AL, de-DE, fr-FR | giorno/mese/anno |
| en | **en-GB** | giorno/mese come in Italia (en-US metterebbe il mese prima: rischio di errori sulle date) |
| es, es-AR, es-PE | es-ES, es-AR, es-PE | |
| ar-MA, ar-EG | ar-MA / ar-EG con cifre occidentali (`-u-nu-latn`) | vedi punto 4 |

- La valuta è **sempre l'euro**, scritta come si usa nella lingua (`1.234,50 €` / `€1,234.50`).
- Il fuso orario resta quello italiano (le ore di lavoro sono ore del cantiere).
- I nomi dei giorni e dei mesi nel calendario seguono la lingua (`date-fns/locale` per le
  lingue disponibili; per darija/egiziano si usa l'arabo).
- I calcoli non cambiano: si cambia solo come i valori vengono **mostrati**. I campi dove si
  scrivono numeri (ore, quantità) accettano sia virgola sia punto, come oggi.

## 7. Estrarre i testi senza rompere niente, e chi traduce

**Schermate dell'area operai (prima fase)** — 32 pagine in `src/pages/campo` + 2 del
subappaltatore, 49 componenti in `src/components/campo`, il layout `CampoLayout` con la barra
in basso, e le parti condivise che l'operaio vede:

- Home · Oggi · Avvisi · Campanella · Menu · Impostazioni · Profilo (`MioProfilo`) · Notifiche
- Cantieri: elenco, scheda cantiere, dettaglio lavoro (documenti, piano, rilievi, note, chi lavora, avanzamento, foto)
- Rapportino (anche vocale), sottofasi, firma, rapporto fine lavori, verbale/collaudo
- Timbratura, correzioni, presenze, ferie, cedolini, tesserino
- Magazzino, prelievi, scorte furgone, inventario, DDT, merce in arrivo, posizioni
- Mezzi e attrezzi (scansione, fine giornata, segnala problema), sicurezza (checklist)
- Calendario, attività, sopralluoghi, invii, ticket di assistenza, avanzamento/SAL
- Subappaltatore: documenti, POS della ditta
- Pezzi condivisi: messaggi di conferma/errore, finestre di conferma, testi nascosti per
  lettori di schermo nei componenti base («Chiudi», …), etichette dei calendari.

**Stima:** circa **1.500–2.000 testi** (conta automatica: ~1.200 nelle cartelle del campo,
~300 nelle parti condivise; il conteggio sottostima le frasi lunghe su più righe).
Le schermate più grandi: Rapportino (~130), Dettaglio lavoro (~100), DDT, Merce, Attrezzi,
Calendario, Inventario, Home (30–50 ciascuna).

**Fuori dalla prima fase**, anche se raggiungibili dal campo: la chat condivisa
(`InternalChat`, è dell'app azienda ed è appena stata toccata dal collaudo) e l'editor del
sopralluogo (`SopralluogoEditor`): passano alla fase 2. Restano in italiano intanto.

**Come si estraggono (senza cambiare niente in italiano):**
1. File per file, ogni testo diventa una chiave (`campo.rapportino.salva`) e la frase italiana
   va **identica** nel file `src/locales/it/campo.json`. L'italiano resta la fonte di tutto.
2. L'italiano è caricato **subito** con l'app (nessuna attesa); le altre lingue si caricano
   solo quando qualcuno le sceglie, come pezzi separati, così chi usa l'italiano non scarica nulla in più.
3. **Garanzia che l'italiano non cambi:** gli oltre 2.000 test esistenti del campo cercano i
   testi italiani a schermo; devono restare tutti verdi senza toccarli. Se un test cambia,
   vuol dire che ho cambiato una frase, e la rimetto com'era.
4. Un controllo automatico verifica che ogni chiave italiana esista in tutte le lingue e
   segnala quelle mancanti (che intanto si vedono in italiano, mai una chiave grezza a schermo).
5. Una regola del controllo codice segnala le frasi scritte a mano nelle cartelle del campo,
   così i testi nuovi non sfuggono alla traduzione.
6. Plurali e frasi con numeri («3 ore», «1 ora») scritti con le regole di ogni lingua, non
   incollando pezzi di frase.

**Chi traduce:**
- Prima un **glossario dei termini di cantiere** (~80 parole: rapportino, commessa, cantiere,
  capocantiere, timbratura, DDT, SAL, ponteggio, ferie, cedolino…) in tutte le lingue:
  è la base che rende coerenti le traduzioni.
- Poi la traduzione dei testi, fatta da me (traduzione automatica guidata dal glossario e dal
  contesto di ogni schermata). Ogni file di lingua porta il segno **«da controllare da un
  madrelingua»**, che si toglie lingua per lingua.
- Per la revisione preparo **un foglio per lingua** (colonne: schermata, italiano, traduzione,
  OK / correzione) da dare a un vostro operaio o a un traduttore. Le correzioni rientrano nel
  codice senza toccare altro.
- Nella scheda «Lingua», accanto alle lingue non ancora riviste, una nota piccola:
  «Traduzione in revisione».

## 8. Testi generati dal server: cosa resta in italiano per ora

| Cosa | Prima fase | Perché / dopo |
|---|---|---|
| PDF del rapportino, verbale di collaudo, rapporto fine lavori | **Italiano** | Vanno all'ufficio e al cliente; sono documenti dell'azienda. |
| Tesserino di riconoscimento, POS, documenti di sicurezza | **Italiano** | Documenti con valore di legge in Italia. |
| Notifiche nella campanella e sul telefono | **Italiano** | Sono scritte dal server già come frase. Fase 3: il server manda un codice + i dati, e il telefono le mostra nella lingua della persona. |
| Messaggi WhatsApp (bot operativo, promemoria) | **Italiano** | Fase 3, usando la stessa colonna `profiles.lingua`. |
| Email | **Italiano** | Fase 3. |
| Contenuti scritti dall'azienda (nomi cantieri, fasi, sottofasi, voci della checklist di sicurezza, articoli, note) | **Come sono stati scritti** | Sono dati, non testi del programma. Le voci della checklist di sicurezza meritano una traduzione controllata: proposta per una fase a parte. |
| Messaggi di errore che arrivano dal server | Testo generico tradotto («Non è riuscito, riprova») | Il dettaglio tecnico resta per il super admin, come da regola. |
| Dettatura vocale | **Invariata** | L'operaio può già parlare nella sua lingua; il testo resta come trascritto. Idea per dopo: proporre anche la versione in italiano per l'ufficio. |

## 9. Test, verifica a schermo e fasi di consegna

**Test nuovi:**
- scelta della lingua: precedenza profilo → dispositivo → italiano; italiano se non c'è scelta;
- catena di ripiego `es-AR → es → it` e chiave mancante → italiano;
- in arabo `<html dir="rtl">` dentro `/campo` e `ltr` appena si esce;
- formati: data, ora, numero, euro per ogni lingua (cifre occidentali in arabo, giorno/mese in inglese);
- completezza: ogni chiave italiana presente in tutte le lingue (rapporto delle mancanti);
- scheda «Lingua»: scelta, salvataggio sul profilo, ripiego senza rete.

**Test esistenti:** tutti quelli del campo verdi senza modificarli (l'ambiente di test parte in italiano).

**Controlli di build e tipi** (Mac da 8 GB): uno alla volta, mai insieme alle build delle
altre sessioni; tipi controllati con un `tsconfig` temporaneo con solo i file toccati;
dipendenze solo con `bun`.

**Verifica a schermo** (server mio su una porta diversa da 8080/8081, utente operaio di Demo 2):
- a **390 px** e su **computer**: Home, Rapportino, Timbratura, Dettaglio lavoro, Magazzino,
  Impostazioni → Lingua, in **italiano** (identico a prima), **rumeno**, **darija** (destra→sinistra),
  **spagnolo argentino** (controllo del «vos»);
- in arabo: frecce, margini, finestre e tendine girate nel verso giusto, nessun testo tagliato;
- testi lunghi (tedesco) che non escono dai pulsanti sul telefono.

**Fasi di consegna:**

| Fase | Contenuto | Quando |
|---|---|---|
| **1a** | Sistema di traduzioni, colonna `lingua`, scheda «Lingua» in `MioProfilo` (azienda + campo), riga nel menu del campo, formati, direzione destra→sinistra, glossario. Non tocca i file del collaudo. | Subito dopo il tuo ok |
| **1b** | Estrazione e traduzione di tutte le schermate dell'area operai in 10 lingue + fogli di revisione. | Appena le modifiche del collaudo sono salvate nel repository |
| **1c** | Revisione dei madrelingua, correzioni, tolto il segno «da controllare». Poi, con il tuo ok, pubblicazione. | Quando arrivano le revisioni |
| 2 | Chat, sopralluoghi, portale dipendente, poi l'app azienda a blocchi (ogni blocco come la 1b). | Da decidere |
| 3 | Notifiche, WhatsApp ed email nella lingua della persona (testi del server). | Da decidere |

Fatto (prima fase) = area operai tradotta, scelta della lingua funzionante su telefono e
computer, verificata nel browser, test verdi, tutto in locale, niente pubblicato.

## Domande per Florin

1. **Approvi il piano?** (sì → parto dalla fase 1a, compresa la colonna nuova sul database live)
2. **Darija anche in lettere latine** (come su WhatsApp), come lingua in più? Il mio consiglio:
   no per ora, sì se i vostri operai marocchini lo chiedono dopo aver provato la versione araba.
3. **Chi rivede le traduzioni?** Avete operai o collaboratori madrelingua per qualcuna di
   queste lingue? Basta una persona per lingua, mezz'ora–un'ora a testa per il glossario.
4. **L'ufficio deve poter impostare la lingua di un operaio** dalla sua scheda (utile per chi
   non sa trovare l'impostazione)? Il mio consiglio: sì, ma nella fase 2.

---

## Stato dei lavori (23/11/2026 notte, tutto in locale, niente pubblicato)

**Differenze rispetto al piano iniziale**
- **Niente i18next.** La sessione di collaudo aveva già costruito un sistema leggero e funzionante
  (`src/lib/campo/lingua`, la chiave è la frase italiana): è stato riusato, non duplicato.
- **Dove sta il lavoro.** Le traduzioni sono sul ramo `campo-lingua-23nov` (worktree `~/edilizia-campo-lingua`) e sul ramo
  `claude/lingua-rifiniture`. Il ramo `claude/lingua-piattaforma` contiene solo il piano e i primi pezzi.

**Fatto**
- **Lingua sul profilo:** colonna `profiles.lingua` già nel database (migrazione `20290523090000_profiles_lingua`,
  riallineata). Ordine: profilo → dispositivo → italiano; la lingua del telefono non conta. Senza rete la scelta resta
  sul dispositivo e si salva al ritorno della rete.
- **Formati:** date, ore, numeri ed euro nella lingua scelta (`formati.ts`, `dateFnsCampo()`, `intlCampo()`). In inglese
  il giorno viene prima del mese (en-GB); in arabo le cifre restano 0-9; l'ora è sempre quella italiana.
- **Arabo da destra a sinistra:** `dir="rtl"` solo nell'area operai; `rtlCampo.css` è generato dalle classi delle
  schermate; frecce specchiate; valori isolati dentro le frasi; `dir="auto"` sui testi scritti dagli utenti.
- **Area operai tradotta per intero** in 10 lingue: circa 2.500 frasi in 127 file, più le etichette dei modelli dei
  sopralluoghi (circa 3.680 voci per dizionario).
  - Tradotto anche l'editor del sopralluogo (fase 2).
  - Tradotti gli avvisi composti nelle funzioni di supporto (scadenza rapportino, ore, foto, «Compilato da»).
- **Controlli:**
  - `campoLingua.test`: ogni frase presente in tutte le lingue.
  - `campoLinguaProfiloEFormati.test` e `campoLinguaSulProfilo.test`.
  - Registro solo-sviluppo delle frasi senza traduzione (chiave localStorage `sviluppo-frasi-senza-traduzione`).
- **Verifica a schermo**, nell'app vera con l'operaio Demo 2, a 390 px e su desktop: italiano invariato, arabo, rumeno,
  spagnolo argentino. Con il registro ho aperto 32 pagine del campo in arabo: zero frasi mancanti.
- **Per i revisori:** `docs/lingua/revisione/*.csv` (10 lingue più il glossario) e `docs/lingua/scelte-da-confermare.md`.
  La checklist di sicurezza va rivista per prima.

**Resta in italiano, di proposito**
- PDF, verbali, tesserino, POS.
- WhatsApp, email, notifiche (fase 3).
- Dati scritti dall'azienda, compresi i modelli di sopralluogo personalizzati.
- Parti solo-ufficio del sopralluogo.
- «Chiudi» del lettore di schermo nei componenti `ui`.
- Paragrafo privacy del profilo (contiene un link).

**Da fare (decisioni del founder)**
1. Revisione dei madrelingua (fase 1c), con i fogli pronti.
2. Pubblicazione: il ramo `campo-lingua-23nov` più le rifiniture, con l'ok esplicito del founder. Dopo il push va
   controllata l'area operai sul sito vero.
3. Fase 2 bis, app dell'ufficio: scelta della lingua anche fuori da `/campo`, contenitore per tutta l'app, traduzione
   a blocchi.
4. Fase 3: WhatsApp, email e notifiche push nella lingua della persona (testi del server). **Fatta la parte «leggera»**: la campanella dell'area operai riconosce i modelli delle notifiche (esito rapportino, nuovo cantiere, promemoria, attività, correzione timbratura, ticket, scadenze mezzi) e li mostra tradotti, senza toccare il server (`lib/campo/lingua/notifiche.ts`).
5. Domande ancora aperte:
   - darija in lettere latine;
   - lingua impostata dall'ufficio nella scheda dell'operaio.

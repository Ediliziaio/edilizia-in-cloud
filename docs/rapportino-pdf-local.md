# Rapportino PDF operativo - implementazione locale

## Perimetro

Intervento del 24 settembre 2026, non pubblicato. Nessuna migrazione applicata,
nessuna scrittura su account o dati reali. Preservate le modifiche preesistenti
nel worktree condiviso. Il PDF dimostrativo usa il renderer effettivo della
funzione; le prove dell'handler sostituiscono soltanto servizi e dati esterni.

## Contenuti e impaginazione (documento a blocchi, 06/10/2026)

Il documento si legge dall'alto in basso, a blocchi con la stessa grammatica (bordo colorato a sinistra,
etichette in maiuscoletto, tessere): `render.ts` per il disegno, `model.ts` per i dati.

1. **Fascia** coi colori dell'azienda: nome, contatti, logo, tipo di documento («Rapportino giornaliero» /
   «Rapporto di fine lavori»), data grande, riferimento e meteo. Il testo è bianco o scuro secondo il contrasto
   del colore scelto (`inchiostroSu`: sull'arancione della piattaforma vince lo scuro, 5,2 a 1 contro 2,8 a 1).
2. **Scheda commessa**: codice, descrizione, stato (pillola), cantiere, cliente, compilatore e ruolo.
   Un rapportino **respinto** mostra subito, in cima, il motivo scritto dall'ufficio.
3. **Quattro contatori**: ore (squadra o personali), lavorazioni, materiali, foto. I valori a zero sono attenuati.
4. **Cosa è stato fatto**: la descrizione in un riquadro.
5. **Lavorazioni: una scheda per ogni fase** su cui si è lavorato: nome, avanzamento (barra e pillola
   «Completata / In corso / Lavorata»), ore dichiarate, poi i **materiali** e le **foto di quella fase**.
   Il titolo della sezione viaggia sempre col primo pezzo del suo corpo: mai solo in fondo a una pagina.
6. **Altri materiali** e **Altre foto del cantiere**: quello che non è legato a nessuna fase (con una fase sola
   non ce n'è: tutto va alla fase; senza fasi le sezioni si chiamano «Materiali utilizzati» e
   «Documentazione fotografica»).
7. Squadra (con totale), tempi di chi compila (timbrature in ora italiana, straordinario), note e
   segnalazioni («Da leggere»), verifica dell'ufficio e firme.
8. Note del documento e avvertenze (foto o firme non incluse), con il piè di pagina su ogni pagina:
   riferimento, edizione, data di generazione, «n / totale».

Regole che restano: le presenze sostituiscono le ore del compilatore nel totale (non si sommano); nessun costo
orario, costo di manodopera, snapshot economico o coordinata GPS nel documento; le tabelle ripetono le colonne a
ogni salto pagina e una riga normale non si spezza; testi lunghi e parole lunghissime vanno a capo; i caratteri
fuori dal set WinAnsi (emoji, simboli) diventano un solo «?» per simbolo.

### Materiali e foto per fase (nessuna migrazione)

I dati stanno dove stavano; si aggiunge solo il collegamento alla fase, dentro le colonne jsonb già esistenti:

- `materiali_usati[].fase_id`: la fase del materiale (le liste di sempre restano intere);
- `fasi_lavorate[].foto`: gli indirizzi delle foto di quella fase (sottoinsieme di `foto_urls`).

Chi compila (`CampoRapportino`): con **una fase sola** tutto si collega da solo; con **più fasi** compaiono i menu
«Fase» accanto a ogni materiale e a ogni foto (facoltativi: ciò che non si assegna resta generale). Togliere una fase
dall'elenco scioglie i suoi collegamenti. Un rapportino respinto si riapre con i collegamenti già fatti.
Un rapportino vocale/WhatsApp/storico (senza collegamenti) mostra le fasi senza materiali né foto e tutto il resto
nelle liste generali, com'era. Le funzioni del database che leggono `fasi_lavorate` (costi) guardano solo
`phase_id` della prima fase quando ce n'è una sola: i campi in più non le toccano.
Raggruppamento unico per PDF, scheda dell'ufficio e lista dell'operaio: `bloccoFasi` in `model.ts`.

## Generazione e accessi

- Lettura iniziale del rapportino con client autenticato soggetto a RLS, prima della
  lettura amministrativa. Conservato anche il precedente controllo di azienda del profilo.
- Foto/firme lette da Storage privato, solo bucket previsti e percorsi della stessa
  azienda. Non vengono scaricati URL arbitrari contenuti nel rapportino.
- Nuovo oggetto `rapportino-v4-<edizione>.pdf` a ogni generazione, `upsert: false`.
  I vecchi file restano intatti. `pdf_url` mantiene il riferimento all'ultima edizione.
  Il numero di versione è anche il «disegno» del documento: i PDF fatti con un disegno precedente (v2, v3) si
  rigenerano da soli la prima volta che qualcuno li apre (`openRapportinoPdf`); cambiare il disegno = alzare il numero.
- Aggiornamento del riferimento condizionato a `updated_at`: se il rapportino cambia
  durante la generazione si restituisce 409, senza collegare la copia obsoleta.
- I vecchi locator pubblici restano riconoscibili, ma l'apertura richiede un URL firmato.
- Firma, approvazione e rifiuto azzerano il riferimento precedente e rigenerano il PDF.
- Un helper condiviso gestisce invio manuale/vocale, errori restituiti da `invoke`,
  feedback preparazione/pronto/avvertenze, riprova senza reinserire il rapportino e
  aggiornamento delle cache Campo/azienda. Le richieste simultanee sono deduplicate.
- Apertura della scheda durante il tap, prima delle operazioni asincrone, per ridurre
  i blocchi popup. Il browser può aprire il PDF oppure scaricarlo.

## Verifiche effettuate

- 430 test Vitest in 30 file: PDF, ore, date, assegnazioni, squadre, materiali,
  approvazione, vocale e componenti Campo.
- 14 gruppi di controlli nell'harness dell'handler/renderer reale, senza rete:
  autorizzazione negata, altro tenant, 401, conflitto, errore upload/aggiornamento,
  filtri cantiere/giornata e guardia di concorrenza.
- 51 gruppi browser di regressione Home/timbratura/rapportino e 40 controlli browser
  PDF: fallimento, riprova, nessun doppione, pronto, apertura/download.
- Browser Chromium con viewport 320, 390, 768, 1440 px; dati e servizi simulati.
- Cinque PDF di prova, 18 pagine complessive: demo, handler, minimo, stress e subappalto.
  Rendering Poppler e ispezione visiva; controlli testo, margini, numerazione,
  assenza dei valori sensibili, note complete e foto mancanti.
- `deno check --no-config supabase/functions/genera-pdf-rapportino/index.ts`: passato.
- Typecheck mirato su helper, invio manuale/vocale e lista azienda: passato.
- ESLint sui nuovi moduli e sui punti di integrazione indicati: passato.
- Build Vite isolata: passata, escluso il postprocessore HTML che usa `dist` fisso
  e senza prerender. Non sovrascritti gli output degli altri terminali.

Il typecheck della pagina `CampoLavoroDetail.tsx` incontra 9 diagnostiche già presenti
nella sezione Diario (unione OrderEvent/OrderMessage/OrderDiaryAudit); ESLint segnala
il precedente setState nell'effetto del timeout e una variabile non usata.
Questi punti, estranei al PDF, non sono stati modificati.

## Non dichiarare come già completato

- Non è un test su dispositivo iOS/Android fisico né sul backend remoto.
- Le policy RLS sono rispettate dal nuovo client, ma i test dell'handler sono con
  adapter sintetici, non una certificazione delle policy del database reale.
- Le timbrature sono eventi grezzi del compilatore: non un totale della squadra,
  una riconciliazione validata o una ricostruzione dei turni oltre mezzanotte.
- Non esiste ancora una coda server durevole con stato del job nel database.
  Chi chiude l'app può riprovare dalla scheda se il PDF non è stato prodotto.
- Le edizioni sono conservate nello Storage; non c'è ancora una schermata storico
  né una politica di retention. Le modifiche effettuate da altri flussi devono
  invalidare `pdf_url` oppure richiedere una nuova generazione.
- Nessuna nuova versione commerciale cliente, riepilogo economico riservato,
  ripartizione viaggi/mezzi o contabilizzazione del subappalto è stata inventata.
- PNG/JPEG supportati; altri formati producono avvertenza per allegati di lavoro.
  Logo opzionale non leggibile: resta il nome azienda. Font standard WinAnsi:
  caratteri non supportati diventano `?`, non vengono stampati come glifi rotti.

## Riproduzione locale

`node scripts/qa-rapportino-pdf.mjs <percorso-demo.pdf> <directory-qa>`

La funzione `renderRapportino` è riutilizzabile nei test senza Deno/Storage;
`index.ts` gestisce autenticazione, raccolta dati e salvataggio.
Per il rilascio servono frontend e nuova Edge Function coordinati; qui non è
stato eseguito alcun deploy.

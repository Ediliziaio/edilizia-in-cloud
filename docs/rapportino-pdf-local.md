# Rapportino PDF operativo - implementazione locale

## Perimetro

Intervento del 24 settembre 2026, non pubblicato. Nessuna migrazione applicata,
nessuna scrittura su account o dati reali. Preservate le modifiche preesistenti
nel worktree condiviso. Il PDF dimostrativo usa il renderer effettivo della
funzione; le prove dell'handler sostituiscono soltanto servizi e dati esterni.

## Contenuti e impaginazione

- Identità aziendale compatta, accento del brand, logo PNG/JPEG quando disponibile.
- Data della giornata distinta dalla data di registrazione; `created_at` non viene
  presentato come data di invio, perché potrebbe appartenere a una vecchia bozza.
- Stato esplicito, commessa, cliente, indirizzo, compilatore e tipo di personale.
- Le presenze sostituiscono le ore del compilatore nel totale, come nel contratto
  dati esistente. Non si sommano entrambe. Le righe esterne non implicano costo orario.
- Lavorazioni selezionate con percentuali dichiarate; nomi recuperati dalla stessa
  commessa. Il nome recuperato è quello corrente, non uno snapshot storico.
- Timbrature del compilatore, stesso cantiere e stessa data italiana. Intervallo
  Europe/Rome, incluso cambio ora. Nessun calcolo inventato di ore validate.
- Materiali con quantità/unità e registrazione: furgone, articolo commessa oppure
  dichiarazione manuale. Non si presume uno scarico di magazzino.
- Testi e note completi, paragrafi conservati, parole molto lunghe spezzate.
- Tabelle con intestazioni ripetute; righe normali non spezzate tra pagine.
- Fotografie su pagine dedicate, due per pagina; indice originale conservato se
  una foto manca. L'assenza di foto/firma è un'avvertenza visibile, non un'omissione.
- Firme effettive distinte dall'approvazione. Sul fine lavori l'assenza è dichiarata.
- Nessun costo orario, costo manodopera, snapshot economico o coordinata GPS esportato.

## Generazione e accessi

- Lettura iniziale del rapportino con client autenticato soggetto a RLS, prima della
  lettura amministrativa. Conservato anche il precedente controllo di azienda del profilo.
- Foto/firme lette da Storage privato, solo bucket previsti e percorsi della stessa
  azienda. Non vengono scaricati URL arbitrari contenuti nel rapportino.
- Nuovo oggetto `rapportino-v2-<edizione>.pdf` a ogni generazione, `upsert: false`.
  I vecchi file restano intatti. `pdf_url` mantiene il riferimento all'ultima edizione.
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

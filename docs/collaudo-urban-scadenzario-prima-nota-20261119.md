# Scadenzario e prima nota — verifica Urban, 19 novembre 2026

## Causa verificata

Verifica in sola lettura su URBAN VISION: 47 commesse, nessuna rata nella tabella
`order_installments`, nessuna fattura nelle due anagrafiche e nessuna riga in
`scadenze`. La pagina leggeva esclusivamente quest'ultima tabella: poteva quindi
mostrare un elenco vuoto anche con commesse e costi presenti.

La regola comune `cruscotto_rate_da_incassare` restituisce 44 importi residui
delle commesse, tutti senza data. Sono inoltre presenti 40 costi: 34 aperti senza
data e 6 pagati (4 senza data, 2 con data). Il valore `9999-12-31` nei costi è la
convenzione del progetto per una data ignota, non una scadenza effettiva.

Le 18 registrazioni di prima nota sono 11 pagamenti automatici di costi e
7 storni. Il comando di eliminazione fisica le esclude per preservare la
coerenza dei costi e dei pagamenti. Il messaggio generico «automatica» nascondeva
il percorso operativo corretto.

## Comportamento corretto

- Due RPC in sola lettura completano lo scadenzario con i costi privi di scadenze
  esplicite e con i residui delle commesse prive di scadenze esplicite di incasso.
  Le scadenze già esistenti mantengono identità, pagamenti e azioni. Per le
  commesse già dotate di scadenze esplicite continuano a prevalere quelle righe.
- I costi usano il totale lordo del pagamento, le eventuali rate fornitore e gli
  acconti al netto degli storni. Le rate già pagate non tornano aperte.
- Non vengono create rate, scadenze o registrazioni contabili. Gli identificativi
  delle righe calcolate sono stabili; le azioni aprono la fonte esatta.
- Gli importi senza data compaiono nelle viste ordinarie anche con l'anno
  corrente selezionato. Un comando li raccoglie in una vista dedicata. I periodi
  personalizzati e lo scaduto richiedono invece una data effettiva.
- Lista, CSV, riepilogo e grafico leggono la stessa proiezione; il grafico
  mensile comprende solo importi con data. Paginazione ed esportazione mantengono
  un ordinamento stabile per data e identificativo.
- In prima nota resta l'eliminazione delle righe manuali. La selezione e il
  dettaglio dei pagamenti dei costi offrono lo storno tramite la RPC esistente:
  la conferma precisa che coinvolge **tutti i pagamenti del costo**, anche fuori
  pagina. Uno stesso costo viene elaborato una volta. Banca e SAL mantengono i
  controlli del server; i motivi di rifiuto restano visibili.
- Gli storni vengono cercati anche fuori dal periodo visibile, per non offrire
  nuovamente lo storno di un pagamento già stornato. «Apri origine» apre il costo
  specifico. Annullamento e ripristino dalla scheda del costo aggiornano anche
  prima nota, scadenzario e previsionale.

Le RPC sono `SECURITY INVOKER`, verificano accesso all'azienda e permesso sulle
scadenze, rispettano le policy delle fonti e non sono eseguibili da `anon`.
Le commesse mantengono anche il controllo di accesso della RPC del cruscotto.

## Verifiche

- Esecuzione delle sole SELECT della nuova proiezione sui dati reali di Urban:
  44 residui di commesse, 34 costi aperti, 6 pagati; nessuna modifica ai dati.
- PostgreSQL locale con PGlite: costi lordi, acconti e storni, rate fornitore,
  assenza di duplicati, date ignote, aggiornamento dopo pagamento, riepilogo,
  idempotenza, isolamento aziende, permessi e RLS con ruolo `authenticated`.
- Test dell'interfaccia: selezione mista in prima nota, conferma/rifiuto dello
  storno, banca/SAL e righe già stornate, storni fuori pagina, filtri ed export
  oltre mille righe, dettagli e importi senza data.
- Anteprima locale con dati simulati su Chromium e WebKit a 375, 768 e 1280 px:
  dettaglio della fonte e conferma dello storno senza errori JavaScript né
  scorrimento orizzontale della pagina. Non è un accesso autenticato a Urban.
- Il lint del file `AnnullaCostoDialog.tsx` segnala un errore preesistente
  `react-hooks/set-state-in-effect`, riprodotto anche sul file di `HEAD`.
  Questa modifica aggiunge soltanto l'aggiornamento della finanza al suo callback.

I test mirati sono inclusi anche nel workflow CI. L'esito finale di build e CI
va letto sulla revisione della PR destinata al rilascio.

## Rilascio

La migrazione pronta è
`docs/migrazioni-pronte/20290420110000_scadenzario_fonti_commesse_costi.sql`.
Resta fuori da `supabase/migrations` fino all'autorizzazione del rilascio, perché
il controllo Supabase applica i file presenti in quella cartella al primo push.

Al rilascio autorizzato: verificare che la versione sia ancora libera, applicare
con MCP `apply_migration`, riallineare immediatamente la versione nel registro,
spostare il file in `supabase/migrations`, completare i controlli della revisione
e fare merge. Le RPC vanno disponibili prima del frontend che le usa.
Non sono richiesti backfill o cancellazioni di movimenti reali.

Le personalizzazioni PDF della PR 149 restano separate da questa correzione.

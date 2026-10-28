# Automazioni: collegamenti strutturati e flusso verticale

## Ambito

Modifica locale del builder, senza push, deploy, migrazioni, pubblicazioni di
automazioni o invii. Sono state preservate le modifiche degli altri terminali.
HEAD osservato durante il lavoro: `5f55410cd`.

## Intervento

- Collegamenti ortogonali con angoli appena arrotondati (6 px), uscite in basso,
  ingressi in alto, frecce e pulsanti di inserimento accessibili.
- Etichetta del ramo accanto al pulsante: Sì/No e A/B restano distinguibili.
- Niente animazione continua in modifica. Il segnalatore di esecuzione rimane
  soltanto nel test riuscito e si nasconde con movimento ridotto.
- Layout topologico con spazio libero di 96 px fra livelli, considerando
  l'altezza reale delle card; colonne distanziate in base alla larghezza reale.
- Centri allineati anche fra card, attese e Fine. Split con più di due rami
  centrati; ricongiungimenti sotto tutti i genitori nei grafi aciclici validi.
- Cicli non validi e componenti sconnesse rimangono ispezionabili con coordinate
  finite: il layout non cambia collegamenti né aggira la validazione.
- Riordino visivo a caricamento/inserimento/cambio dimensioni, non durante
  selezione o trascinamento. Usa le misure interne aggiornate di React Flow.
- Card con larghezze stabili; niente sollevamento al passaggio del mouse che
  disallinei card e connettori. Inquadrature automatiche e Fit View limitate a 1×.
- Correzione funzionale correlata: inserire un passo su un ramo conserva
  `sourceHandle` ed etichetta anche nel mirror destinato al salvataggio. Prima
  l'arco entrante veniva ricreato senza Sì/No o A/B.

Il riordino automatico è soltanto visivo. Il comando esplicito «Riordina
dall’alto» continua ad aggiornare le posizioni nel mirror locale, con il consueto
salvataggio manuale. Annotazioni e logica di esecuzione non vengono alterate.

## Verifica

- 714 test superati in 29 file, inclusi 21 nuovi test di layout e interfaccia.
- Test su catene con larghezze diverse, card alte, Sì/No, split a tre rami,
  ricongiungimenti diseguali, rami annidati, note, idempotenza, cicli e nodi
  sconnessi; conservazione del ramo nel round-trip dei dati.
- UI: geometria del path, pulsanti, animazione solo in esecuzione,
  attesa delle misure, StrictMode, cleanup e riallineamento al ridimensionamento.
- `npm run build:fast`: riuscita sulla versione finale.
- `git diff --check`: nessun errore.
- Lint: zero errori nei nuovi file/layout/edge/test. Il controllo completo dei
  file toccati incontra 8 errori preesistenti (6 nella pagina, 1 in ActionNode,
  1 in TriggerNode), verificati anche leggendo gli stessi file da HEAD; non sono
  stati disabilitati controlli né modificate baseline.
- `npm run typecheck:ci`: riuscito, 655 errori preesistenti contro la baseline
  di 703; nessun incremento per file. Baseline non modificata. Il primo giro
  aveva segnalato due annotazioni mancanti nei nuovi file, poi corrette, e
  modifiche concorrenti di un altro terminale, assenti nel controllo finale.

### Prova nel browser

Demo Azienda 2, bozza esistente `80f29f48-6dee-462e-8174-39088674b0ce`:

1. Nuovo contatto → condizione «Email presente?» (campo email non vuoto).
2. Sì → attesa di un'ora → Fine; No → attività di verifica recapito → Fine.
3. Verificati layout automatico dopo ogni inserimento, mantenimento Sì/No,
   trascinamento libero e riordino esplicito, scala naturale con Fit View.
4. Nessun clic su Salva, Pubblica o test di esecuzione. Uscita con «Flussi» e
   riapertura: la bozza è ancora vuota, con i soli segnaposto.

L'immagine `output/automazioni-layout-20261026/flusso-verticale.jpg` documenta
l'esempio temporaneo, non un'automazione salvata o attivata.

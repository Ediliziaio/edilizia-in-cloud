# Piano: permessi, rapportini e listini, documenti, fatture (14/11/2026)

Nato dalle segnalazioni di un'impresa cliente, vale per tutte le aziende. Ogni fase ha le sue
prove: test automatici, prove nel database con utenti veri in transazioni annullate, e prove nel
browser da super admin «visualizzando come» l'azienda e il singolo utente. Le prove che
scrivono dati si fanno su Demo Azienda 2, mai sulle aziende vere.

## Fatto il 14/11

| Cosa | Dove |
|---|---|
| Ogni rifiuto per permessi dice il permesso (traduttore del client, fasi, assegnazioni) | main e265744a5 |
| Modifica commessa non azzera importi e rate a chi non li vede | main 4e2f62620 |
| Database: dati protetti → messaggio col permesso; guardia su `commessa_salva` | migrazioni 20290317130000/01 |
| Fasi da computo o preventivo, anche a commessa creata | main f589635f3 + migrazione 20290317130002 |

## Fase 1 — Permessi che restano

1. **Assegnare persone alle fasi.** Oggi solo gli amministratori: tutti gli altri che modificano
   le commesse ricevono un rifiuto. Decisione: chi ha «Modifica commesse» assegna le persone;
   note e costo previsto restano a chi ha «Costi» e «Personale» (messaggio col permesso).
2. **Inserimenti attraverso le viste protette** (rate, assegnazioni): stessa regola già data agli
   aggiornamenti, un valore nuovo senza diritto si rifiuta col permesso.
3. **Censimento dei permessi «mostrati ma non concessi»** pagina per pagina: dove un pulsante si
   vede ma il database rifiuta, il pulsante sparisce o dice il permesso.

Prove: per ogni ruolo tipo (amministratore, ufficio con e senza importi, acquisti, capocantiere)
«visualizza come» e tentativo di ogni azione: o riesce, o compare il messaggio del permesso.

## Fase 2 — Listini nei rapportini (il cuore)

Regola: si parte dal **listino generale** dei servizi (`tariffe_aziendali`). Se il committente
della commessa ha un **listino particolare** (`appalto_tariffe`, con eventuale eccezione per
cantiere) con la stessa voce, vale quel prezzo. Voce assente da entrambi: «prezzo da definire».

1. Una funzione unica nel database: il prezzo applicabile di una voce per una commessa, con la
   provenienza (cantiere, committente, generale, mancante). Collegamento per voce (id del
   listino generale), non per descrizione simile.
2. Nel rapportino (ufficio): «Aggiungi voce» cerca nel listino generale per codice, descrizione,
   categoria; il prezzo si propone dalla regola sopra e accanto si legge «Prezzo applicato:
   listino committente» o «listino generale».
3. Il rapportino salva il prezzo del giorno, la provenienza e l'eventuale modifica a mano
   (distinta). Cambiare un listino dopo non tocca i rapportini già salvati.
4. Vale per tutte le commesse, non solo gli appalti.

Prove (le 8 del capitolato): senza listino del committente → generale; con la voce → committente;
listino del committente senza quella voce → generale; voce in nessuno → «da definire»; modifica
a mano → cambia il rapportino, non il listino; listino aggiornato dopo → il rapportino tiene il
prezzo storico; prezzo al committente e costo interno restano distinti.

## Fase 3 — Costi interni di operai e mezzi

1. Un costo orario mancante non diventa più 0 €: il rapportino e la commessa dicono «costo da
   completare» e la marginalità si dichiara incompleta.
2. Nel rapportino d'ufficio, per chi ha «Costi»: ore × costo orario = costo, per operai e mezzi.

Prove: operaio senza costo → avviso, nessun margine «completo»; prezzo e costo distinti.

## Fase 4 — Documenti

1. Descrizioni lunghe nel preventivo: campo che si allarga, testo intero e a capo nel PDF (oggi
   il PDF taglia a 220 caratteri e toglie gli a capo).
2. Cliente o committente nel preventivo e nel computo: ricerca anche nell'anagrafica clienti e
   per partita IVA; collegamento salvato e ritrovato riaprendo.

Prove: preventivo con descrizione di 600 caratteri e a capo → uguale nel PDF; scelta del cliente
per partita IVA, salva, ricarica, è ancora lì.

## Fase 5 — Fatture, mezzi, incassi

1. Mezzi: «Conferma in blocco» dei collegamenti proposti dalla targa; la ricerca della targa si
   ripete quando nasce un mezzo o cambiano le righe della fattura.
2. Fatture emesse importate segnate «pagate» senza incasso registrato: si vedono come tali e si
   riportano da incassare in un clic; l'import non le segna più pagate senza una data.
3. Prima le regole, poi l'AI: commessa riconosciuta da CUP, CIG, codice commessa; la lettura
   dei PDF ricorda il risultato per lo stesso file.
4. Doppio conteggio: una fattura del mezzo ripartita su più commesse non entra anche nel costo
   orario del mezzo.

Prove: fattura con targa di un solo mezzo → collegata senza AI; due fatture identiche → una sola
lettura AI; incasso parziale e saldo; nessun costo contato due volte nella commessa.

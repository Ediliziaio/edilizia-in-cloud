# Movimenti e riconciliazione

Le due tab precedenti erano lo stesso componente `TransactionsFeed`: la riconciliazione imponeva solo `state=work`. Il registro unico conserva ricerca, filtri, colonne, esportazione, dettaglio, note, contesti, commesse, collegamento a pagamenti esistenti e annullamento. I vecchi link `tab=riconciliazione` aprono il registro unico.

Il pulsante Riconcilia apre uno spazio quasi a tutto schermo. Incassi e pagamenti hanno gli stessi filtri e lo stesso editor. Quote, note e selezioni restano in memoria cambiando ricerca, conto, sezione e pagina; chiusura e abbandono della pagina segnalano il lavoro non confermato. Non vengono salvate bozze finanziarie nel browser.

Le proposte combinano importo residuo, identità, IBAN disponibile, identificativo del documento e distanza dalla scadenza. Il punteggio non basta per la selezione in blocco: servono riscontri d'identità forti, assenza di incongruenze e un documento non conteso da altri movimenti analizzati. Proposte scartate e abbinamenti annullati restano manuali. Le proposte forti vengono ricalcolate alla conferma.

Il lotto usa il lock aziendale e riutilizza `bank_conferma_ripartizione`, `riconcilia_movimento_su_documenti`, i pagamenti atomici delle scadenze e il registro fiscale delle ritenute. Conferma atomica fino a 100 movimenti, residui/revisioni verificati e richiesta idempotente. Qualunque errore annulla l'intero lotto. La cronologia conserva utente, data, documenti e quote.

Commissioni nelle uscite e arrotondamenti fino a 1 euro possono creare un costo pagato per la differenza; l'annullamento storna solo il pagamento creato da questo percorso. Il residuo può invece restare aperto con motivazione esplicita. Il bonifico parlante usa il percorso fiscale con verifica di netto, lordo, ritenuta e commissioni. Le altre differenze fiscali restano da verificare, senza forzare il saldo del documento. Movimenti non contabilizzati e valute diverse da EUR non registrano automaticamente pagamenti in euro.

L'IBAN di un altro conto aziendale segnala un giroconto; la classificazione esplicita non crea costi o ricavi. Entrambe le gambe possono essere selezionate nello stesso lotto.

Le fatture importate aggiornano subito il residuo locale. Il write-back bancario verso Fatture in Cloud usa il target assoluto autorizzato dal server, raggruppato per fattura, così un nuovo tentativo non somma nuovamente gli incassi. Un errore del provider conserva le registrazioni locali e viene segnalato.

## Verifiche

Test di logica, interfaccia e PostgreSQL/PGlite per ambiguità, quote concorrenti, bozze, idempotenza, tenant, proposte scartate e totali indipendenti dalla pagina. Collaudo reale `scripts/sql/bank-reconciliation-batch-collaudo.sql`: 15 scenari sull'azienda demo, tutti conclusi con ROLLBACK, senza invocare servizi esterni. Include saldo, cumulativi, acconti, scadenzario, costi senza fattura, giroconti, commissioni, ritenute, importate e annullamenti. Corretto inoltre il controllo tenant che usava il nome inesistente `documenti_fiscali_native` invece di `documenti_fiscali`.

# Azienda della schermata e azienda del server

Misura del 04/11/2026. La schermata tiene l'azienda nel suo stato, per scheda. Il
server la legge da una riga per utente, con `get_my_company_id()`, che chiama
`get_effective_company_id()`: prima `active_impersonations`, poi
`active_company_selection`, poi il profilo. Le due possono divergere in tre modi:

- un'altra finestra o sessione cambia azienda: `secure-impersonation` cancella la
  riga e ne scrive una nuova, senza avvisare nessuno;
- l'accesso scade dopo 2 ore e niente lo rinnova: il server non ha più azienda
  (un super admin ha `profiles.company_id` nullo), la schermata non lo sa;
- per chi ha più aziende, `set_active_company` cambia la riga di tutte le schede.

## Cosa succede quando non coincidono

Prova sul database, come super admin, in una transazione annullata: server su
un'azienda, riga di Demo Azienda 2.

| Tabelle provate | Lettura | UPDATE per id | Effetto |
|---|---|---|---|
| `orders`, `quotes`, `employees`, `suppliers`, `email_inbox`, `warehouse_stock`, `purchase_orders`, `appointments`, `scadenze`, `tasks` | sì | 1 riga | La policy lascia passare il super admin: si scrive sulla riga mostrata. Corretto. |
| `invoices`, `fatture_ricevute`, `documenti_fiscali`, `invoice_payments`, `warehouses` | no | 0 righe, nessun errore | Elenco vuoto e salvataggio muto: è il sintomo visto il 04/11. |
| `silvio_alerts` | sì | 0 righe, nessun errore | Si vede, ma non si modifica. |

Dal testo delle policy, contando anche le funzioni che chiamano
`get_my_company_id()` indirettamente (258 funzioni, 483 tabelle): sulle tabelle che
ne dipendono, 174 non hanno in lettura una via per il super admin e 160 non
l'hanno in scrittura; l'hanno 299 e 207. È una stima per testo: la prova vale per
le 16 tabelle della tabella sopra. L'INSERT non è stato provato: dove la policy
non lascia passare ci si aspetta un errore 42501 visibile.

Nessun default di colonna e nessun trigger usa l'azienda del server: da lì non
parte nessuna scrittura sbagliata.

## Le scritture che finiscono sull'azienda sbagliata

Sono quelle che non ricevono l'azienda né una riga da cui ricavarla: la prendono
dal server, e l'errore non si vede. Lette dal corpo delle funzioni, non provate una
per una.

| Dove | Cosa scrive sull'azienda del server |
|---|---|
| `costo_personale_parametri_salva` | Cancella e riscrive i parametri del costo del personale |
| `bonifica_archivia_categoria` | Archivia in massa la posta non letta di una categoria |
| `silvio_azione_override_set` | Autonomia di Silvio per un'azione |
| `upsert_mittente_noto` | Classificazione di un mittente |
| `toggle_survey_template`, `clone_survey_template` (dai modelli di sistema) | Impostazioni dei sondaggi |
| `save_dashboard` (dashboard nuova) | Cruscotto creato sull'altra azienda |
| `silvio_canale_avvia_verifica`, `telegram_generate_verification_code` | Canale collegato all'altra azienda |
| `log_email_accesso` | Registro degli accessi alla posta |
| Edge `silvio-orchestratore` (origine «richiesta») | Le proposte di Silvio partono sull'azienda del server |
| Edge `cg-export-pacchetto-banca`, `customer-portal` | Leggono o aprono per l'azienda del server: da rivedere singolarmente |
| Edge `billing-connect`, `billing-import` | Solo se il client non passa `company_id` |
| ~~`ArticoliCSVImportDialog`~~ | **Corretto qui:** l'import articoli chiedeva l'azienda al server e mescolava azienda e magazzino |

Le altre funzioni che scrivono (circa 40, fra cui `create_shipment_atomic`,
`oda_registra_arrivo`, `registra_incasso_atomico`, `delete_order_cascading`)
controllano che la riga indicata sia dell'azienda del server: si fermano con un
errore, oppure, come `silvio_dismiss_alert`, non cambiano nulla senza dirlo.

## L'avviso

`AvvisoAziendaServer` è una barra rossa sopra «Stai visualizzando», con due azioni:
riportare il server sull'azienda di questa scheda, oppure aprire qui l'azienda del
server. Vale per chi è entrato in un'azienda e per chi ne ha più d'una, non per il
commercialista. Nessuna migrazione: usa la RPC `get_my_company_id()`.

Il controllo non sta sulle richieste. Una lettura all'apertura, al ritorno sulla
scheda (non più di una ogni 15 secondi), subito quando un'altra scheda dello stesso
sito avvisa, e una al minuto a scheda visibile. Una differenza si crede solo se la
seconda lettura, 2 secondi dopo, la conferma. Una lettura fallita non cambia nulla.

**Quello che l'avviso non fa.** Fra il cambio e il controllo una scrittura può
ancora partire: fino a 60 secondi su una finestra già visibile, e da un altro
dispositivo o da un altro sottodominio non arriva l'avviso immediato. Riduce il
rischio, non lo chiude. «Riporta» cambia a sua volta l'azienda delle altre finestre,
che mostreranno l'avviso.

## Una finestra deve poter cambiare l'azienda delle altre?

No. Oggi può, perché la riga è una per utente: è il difetto di fondo.

| | A. Riga unica + avviso (ora) | B. Azienda per scheda |
|---|---|---|
| Come | Questo lavoro | Ogni scheda ha il suo token e lo manda in un header; `get_effective_company_id()` lo legge da `request.headers` e lo verifica su `active_impersonations`, che tiene una riga per scheda |
| Due aziende affiancate | Si rincorrono: ogni ritorno su una finestra può dare l'avviso | Funzionano |
| Scrittura sbagliata | Resta possibile nell'intervallo | Chiusa per le richieste che portano l'header |
| Da toccare | Nulla sul server | `get_effective_company_id` (ci passano le policy di 483 tabelle: un errore ferma tutti), `secure-impersonation`, il client Supabase, le edge function e `resolveEffectiveCompanyId`, che devono inoltrare l'header |
| Limiti | | Realtime non porta header; lo storage va verificato; il fallback sulla riga resta per chi non lo manda |

**Proposta: tenere A adesso e fare B come lavoro a parte, se si conferma il modo di
lavorare visto il 04/11.** Quel giorno il registro ha 28 ingressi in azienda, con
due aziende che si alternano ogni pochi minuti dalle 09:28 alle 09:46: è compatibile con
due finestre affiancate, ma il registro non lo dimostra. Se è così, A darà molti
avvisi e B diventa il lavoro giusto. Prima di B, conviene correggere le funzioni
della tabella sopra perché ricevano l'azienda: serve comunque e toglie il danno
peggiore.

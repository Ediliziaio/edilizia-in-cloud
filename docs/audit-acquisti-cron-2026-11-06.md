# Collaudo acquisti e cron — 6 novembre 2026

## 📊 BASELINE vs FINALE
| Metrica | Prima | Dopo |
|---|---|---|
| Test mirati acquisti e cron | Nuovi casi non coperti | 85 PASS, 16 file |
| Cron SQL, ultime 24 ore | 15.741 esecuzioni riuscite, nessun fallimento | Nessun job disattivato |
| Coda HTTP / sessioni bloccate / transazioni oltre 30 s | 0 / 0 / 0 | Verifica ripetuta dopo la migrazione |
| Riciclo PostgREST | Includeva il listener LISTEN inattivo | Listener e transazioni aperte esclusi |
| Tipo/build | Rilascio precedente verde | Esiti locali e CI associati al rilascio |
| Bundle, Lighthouse e audit dipendenze | Non misurati in questo audit circoscritto | Nessuna nuova dipendenza |

## 🗑️ RIMOSSO
Nessun file, indice o job eliminato. I numerosi indici segnalati come inutilizzati non sono stati rimossi: il riavvio precedente ha azzerato le statistiche, che non provano il loro inutilizzo storico.

## 🔒 SECURITY FIX
Nessun ampliamento dei privilegi, modifica di RLS o esposizione di credenziali. L’advisor di salute non segnala problemi. Gli advisor di sicurezza e performance contengono avvisi strutturali preesistenti: sette viste con privilegi del proprietario (proiezioni pubbliche o filtri espliciti di autorizzazione), funzioni SECURITY DEFINER, chiavi esterne senza indice e policy multiple. Non sono stati convertiti in massa: serve una revisione dei singoli contratti di accesso e piani di esecuzione.

## 🐛 BUG CORRETTI
| Problema | Causa | Correzione |
|---|---|---|
| Riciclo interrompe il listener PostgREST | LISTEN rimane correttamente idle per ore | Esclusione esplicita LISTEN e xact_start non nullo, stessi limiti di età e inattività |
| RDO mostra un valore non salvato dopo un errore | Campi defaultValue senza ripristino | Cella con salvataggio asincrono, blocco durante il salvataggio, ripristino su errore e aggiornamento da dati server |
| Descrizione/UM RDO vuote | Nessuna validazione al blur | Rifiuto del vuoto senza scrittura |
| Riepilogo OdA ambiguo con prezzi pendenti | Etichetta laterale sempre Totale | Totale parziale coerente con la tabella |
| Avviso 1 voci | Plurale fisso | Singolare/plurale corretto |

## ♿ ACCESSIBILITÀ
Campi RDO nominati, stato di salvataggio aria-busy, pulsante di eliminazione con nome della voce. Aggiunta/eliminazione disabilitate durante la rispettiva mutazione.

## ✨ UX MIGLIORATA
Il valore mostrato dopo un errore coincide col valore salvato e il messaggio invita a riprovare. Aggiornamenti dal server compaiono nelle celle. Le azioni già pubblicate aprono direttamente la composizione email.

## ⚡ PERFORMANCE
Il riciclo periodico non chiude più il listener delle notifiche e conserva la politica di rilascio delle connessioni realmente inattive. Nessun riavvio necessario per questa modifica. Documento PostgREST: https://docs.postgrest.org/en/v14/references/configuration.html#db-channel

## ✅ CHECKLIST TEST FINALE
- Online Demo 2: dettaglio OdA e RDO, dati fornitore, commessa facoltativa, confronto offerte, storico, email testo e PDF con allegato e mittente: verificati senza invio.
- Anteprima PDF e download: verifica online e test automatici dedicati.
- Modifica, validazioni, errore di rete, prezzi, confronto e contabilizzazione: test automatici mirati; nessun movimento reale o aggiudicazione di prova creati.
- Nuovo test SQL PGlite del comando reale di riciclo: idempotenza, esclusione listener maiuscolo/minuscolo, connessioni attive/recenti e transazioni aperte; solo la connessione idonea viene selezionata.
- Quantità negative/zero/vuote: test isolati, nessuna scrittura.
- Lint dei file toccati, TypeScript completo e build: risultati nei log di collaudo e CI del commit.
- Safari, Firefox, offline reale, invio SMTP a un destinatario e registrazione merce reale: non eseguiti, non dichiarati verificati.

## 🔴 PROBLEMI NON RISOLTI
La revisione automatica ha rifiutato l’inserimento online di una quantità negativa per il rischio di persistenza. Il caso è stato verificato con test isolati. Gli avvisi strutturali degli advisor non equivalgono a errori cron né a un incidente in corso; restano documentati senza interventi indiscriminati su sicurezza e indici.

Non si dichiara una verifica universale di tutti i browser o di ogni funzionalità della piattaforma. Il perimetro è acquisti/RDO e salute operativa del database.

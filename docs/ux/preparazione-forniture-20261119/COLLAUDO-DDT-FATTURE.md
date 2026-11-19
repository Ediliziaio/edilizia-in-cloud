# Collaudo DDT e fatture ricevute — 19 novembre 2026

Eseguito nel gestionale reale su localhost:8096, Demo Azienda 2 S.r.l., commessa DEMO-2025-048 (`39e05a1b-f998-48d8-aab7-9aafb25a4a2a`). Documenti e prezzi sono di simulazione. Nessun invio a fornitori, nessun invio SDI e nessun pagamento.

## Documenti registrati e risultato contabile

Registrati quattro DDT con tutte le 22 righe, abbinate alle righe ODA e ricevute direttamente in cantiere. Gli ODA sono passati da bozza a ricevuto tramite la registrazione manuale dello stato e la conferma delle consegne, senza email. Per le posizioni con misure provvisorie è stato scritto il motivo «SIMULAZIONE su commessa demo»; le misure non sono state falsamente confermate.

Importati quattro XML dimostrativi dall'interfaccia Fatture ricevute. I riferimenti ai DDT sono stati riconosciuti. L'ODA è stato scelto manualmente perché gli importi delle fatture differiscono dagli ordini. Le fatture sono state contabilizzate dalla UI, con scadenza 19/12/2026 e pagamento ancora aperto.

| Fornitore | ODA | DDT | Fattura | Stima/ODA netto | DDT netto iniziale | Fattura/costo netto |
|---|---|---|---|---:|---:|---:|
| Internorm Italia | 2026-0056 | SIM-DDT-IN-2026-001 | SIM-FT-IN-2026-001 | 3.080,00 € | 3.140,00 € | 3.183,00 € |
| Griesser Italia | 2026-0057 | SIM-DDT-GR-2026-001 | SIM-FT-GR-2026-001 | 670,00 € | 696,00 € | 714,00 € |
| Edilmateriali Roma | 2026-0058 | SIM-DDT-ED-2026-001 | SIM-FT-ED-2026-001 | 697,00 € | 716,40 € | 731,50 € |
| Elettrica Moderna | 2026-0059 | SIM-DDT-EL-2026-001 | SIM-FT-EL-2026-001 | 650,00 € | 670,90 € | 693,40 € |
| Totale | | | | **5.097,00 €** | **5.223,30 €** | **5.321,90 €** |

IVA dimostrativa al 22%: 1.170,82 €. Totale da pagare: 6.492,72 €. Maggior costo rispetto alle stime: 224,90 € al netto dell'IVA.

Verifica successiva su database e UI: un solo `company_costs` per ciascun ODA; la fattura ha aggiornato lo stesso ID creato alla ricezione, senza raddoppiare il costo. Tutte le 22 consegne sono registrate e 22 valorizzazioni fattura/DDT sono salvate. Gli importi originali degli ODA e le 22 stime iniziali restano presenti.

La scheda Costi mostra le quattro fatture aperte, totale 6.492,72 €. Il riepilogo della commessa passa da **54.488,14 € a 59.810,04 €** di costi sostenuti: incremento **5.321,90 €**, esattamente l'imponibile delle quattro fatture. Il margine reale passa da 3.775,94 € a -1.545,96 €. È l'effetto dei costi aggiunti nella simulazione.

## Difetti emersi e correzioni preparate

1. Il popup di collegamento ODA conservava ordini e quote dopo il salvataggio e li riproponeva sulla fattura successiva. Il corpo ora ha una chiave per azienda, fattura e apertura; la nuova fattura e la riapertura partono senza selezioni e ricerca precedenti. Verificato nel gestionale collegando Edilmateriali ed Elettrica dopo gli altri fornitori.
2. Il confronto fattura/DDT aggiornava il prezzo degli articoli creati dal DDT, ma non quello degli articoli preparati in precedenza e collegati tramite consegne. La correzione SQL aggiunge il ricalcolo dei prezzi sulle quantità effettivamente accettate, al netto dei resi, con fonte DDT/fattura distinta, stima iniziale conservata e precedenza rispetto a revisioni successive dell'ODA. Non crea costi né ricezioni. I retry del confronto riallineano anche articoli già collegati, senza duplicare valorizzazioni.
3. Le due azioni DDT invalidano ora anche la query `materiali-per-fase`, così gli importi si aggiornano nella commessa senza attendere un ricaricamento.
4. Anche le etichette e le icone delle righe per fase riconoscono DDT e fattura, invece di descriverli come prezzi scritti a mano. Lo zero esplicitamente confermato dal documento resta un prezzo conosciuto.

**Correzione SQL applicata:** dopo la conferma richiesta dal connettore, applicata con MCP `apply_migration` e riallineata subito alla versione `20290421100000`. La funzione di ricalcolo è privata: esecuzione negata sia ad `anon` sia ad `authenticated`. L'advisor di sicurezza non segnala le due nuove funzioni.

Ripetuto dall'interfaccia il confronto di tutte le quattro fatture, sugli stessi 22 abbinamenti già salvati. Verifica successiva riga per riga: **22 prezzi corretti su 22**, tutti con fonte `fattura`; totale articoli **5.321,90 €**, uguale ai costi contabilizzati. Le stime iniziali restano **5.097,00 €**. Restano esattamente **22 consegne e 22 valorizzazioni**, con un solo costo per ODA: il retry non duplica nessuna registrazione. Gli importi degli ODA restano quelli originali.

## Controlli locali

- 45 test in 5 file, inclusi 9 casi SQL della correzione, 4 casi UI del collegamento fattura/ODA e regressioni su DDT, magazzino, prezzi parziali e IVA.
- Altri 103 test in 7 file su preparazione, ODA, procurement, contabilità e consegne.
- Altri 36 test in 2 file su fonti prezzo e vista materiali per fase: **184 test complessivi**.
- TypeScript mirato completato senza errori (`tsconfig-ddt.json`).
- ESLint: nessun errore; restano tre avvisi `any` preesistenti nel dialogo di collegamento.
- `git diff --check` superato.

La correzione SQL è stata eseguita due volte nel database PGlite di test per verificarne l'idempotenza. I test coprono prezzi zero, DDT senza prezzo, conferme allo stesso prezzo, fatture parziali, due DDT con prezzi diversi, resi, isolamento tra aziende, privilegi e precedenza dei documenti sull'ODA.

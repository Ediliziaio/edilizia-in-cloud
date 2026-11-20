# Subappalto dalla commessa — 20 novembre 2026

Richiesta: gestire fasi, affidamenti, richiesta d'offerta o listino della ditta, computo, conferma del costo, varianti e verbali SAL in un percorso collegato.

## Scelte

- Riutilizzare gli affidamenti, i contratti, i quadri lavori versionati e i SAL esistenti. Non introdurre un secondo registro dei costi.
- Rendere raggiungibili dalla sezione Subappalto delle lavorazioni tutti i contratti della commessa, anche senza una squadra esterna assegnata.
- Distinguere bozza da contratto confermato; mostrare l'importo iniziale, la variazione e il valore attuale. Le varianti sono già comprese nell'importo attuale e non si sommano due volte.
- Consultare il computo aggiornato dall'ultima revisione del quadro lavori; conservare il computo originale firmato. Segnalare un quadro che non torna con il contratto, senza presentarlo come aggiornato.
- Assegnare nuove voci alla stessa ditta e registrarle come variante; conservare quantità, prezzi, fasi e collegamenti delle misure. Per nuovi lavori, aggiungere prima le voci nelle lavorazioni della commessa.
- Aprire misure, SAL, verbali, listino e condizioni del contratto mantenendo il contesto della commessa. Ricaricare i riepiloghi dopo ogni modifica.
- Mantenere i controlli esistenti su permessi, quantità disponibili, prezzi misurati e contratti firmati. Il DURC resta un avviso.

## Accettazione e collaudo

1. Richiesta senza prezzi di vendita; offerta e listino della ditta alimentano la conferma del costo esistente.
2. Contratti visibili anche senza squadra esterna e con più contratti della stessa ditta.
3. Computo corrente con fasi e quantità/prezzi aggiornati; originale distinto; PDF con soli prezzi della ditta.
4. Variante positiva, negativa e nuova voce; totale coerente al centesimo e storico leggibile.
5. SAL ricevuti distinti dagli approvati, contestati esclusi, pagamenti parziali riconosciuti; accesso al verbale.
6. Errori di lettura visibili con Riprova; nessun falso importo zero, nessuna scrittura durante un errore.
7. Test di regressione su calcoli, collegamenti e permessi; TypeScript, lint dei file modificati, build e prova a schermo senza modificare contratti reali.

## Stato iniziale

- Base: `d4cdd81fa0282c4227bd1cedb9022e3380645311`.
- `npm run typecheck:ci`: 0 errori.
- Supabase health: nessun avviso. Nessun errore delle funzioni subappalto nelle ultime 48 ore al momento della verifica.
- Nessuna migrazione prevista: il flusso usa le funzioni atomiche già esistenti.

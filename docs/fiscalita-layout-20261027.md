# Uniformità delle sezioni fiscali — 27 ottobre 2026

## Problema

Ritenute di garanzia manteneva un contenitore `container mx-auto p-6` e una testata navy propria, mentre Registro IVA e Contabilità usavano già il layout chiaro del workspace. Non era un problema di URL: era una differenza nei componenti di presentazione.

## Correzione locale

- Introdotti `FiscalSectionHeader` e `FiscalMetric`, condivisi dalle sezioni fiscali: medesima tipografia, spaziatura, sfondo e angoli arrotondati. Nessuna query o regola contabile nel componente grafico.
- Eliminati il rientro aggiuntivo e il grande banner blu di Ritenute. Riepiloghi, direzioni e azioni seguono lo stile di Registro IVA e Contabilità.
- Indicati separatamente saldi aperti di tutti gli anni e svincoli dell’anno selezionato; il filtro della tabella include anche le garanzie chiuse. Non si tratta di numeri duplicati.
- Mantenuti i criteri di verifica in un pannello richiudibile, senza rimuovere l’avvertenza che lo svincolo non attesta un incasso.
- Anno soltanto in Ritenute e Archivio: differenza intenzionale rispetto ai periodi mensili/trimestrali di IVA e Contabilità, non incoerenza grafica.

## Verifica

- 98 test superati in 12 file; 3 test live non eseguiti.
- Nuovi test: componenti condivisi, saldi e conteggi invariati, direzione conservata nell’URL, sola lettura ed errori di caricamento.
- Lint senza errori e zero diagnostiche nel typecheck mirato a 7 file.
- Build locale completata con successo in una cartella temporanea dedicata, senza sovrascrivere l’output delle altre lavorazioni. Log in `output/fiscalita-layout-20261027/`.
- Browser locale Demo Azienda 2: verificati tutti e quattro i pannelli; ritenuta esistente da 7.500 € rimasta invariata. Nessuna creazione o conferma di operazioni.
- Screenshot in `output/fiscalita-layout-20261027/ritenute-uniformate.png`.

Nessuna pubblicazione, modifica del database, trasmissione o pagamento.

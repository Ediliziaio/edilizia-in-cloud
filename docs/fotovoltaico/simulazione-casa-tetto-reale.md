# Simulazione locale su una casa reale

Anteprima: `http://127.0.0.1:8087/simulazione-tetto-reale`.

Caso pubblico Delft (3DBAG + ortofoto PDOK), senza dati cliente e senza copertina aggiuntiva. Il campione iniziale a cinque pannelli è stato ristretto con il tracciamento sulla foto: ora tre moduli da 450 Wp sulla falda SE, 1,35 kWp e 1.315 kWh/anno da risposta PVGIS salvata. Foto e render derivano dalla medesima posa, con una zona esclusa prudenziale visibile nella foto. Tutte le misure e le ipotesi sono separate nell'ultima pagina. Fonti e limiti in `dev/fotovoltaico-locale/esempi/README.md`.

Il PDF contiene ora 11 pagine: tetto reale, Chi siamo e garanzie, bolletta prima/dopo, flussi, giorno/sera, prodotti, fornitura, stagionalità e ipotesi, percorso economico, domande frequenti e riepilogo finale. Il disegno giorno/sera è identico al renderer nativo. Bolletta, prodotti e grafico economico mantengono quel renderer; le nuove pagine commerciali sono un’anteprima locale e usano gli stessi dati e calcoli. Nessuna pubblicazione in produzione.

Rigenerazione:

```sh
bun dev/fotovoltaico-locale/preparaCasaTettoReale.ts
```

Produce HTML autonomo senza font o immagini remote e due SVG di verifica sotto `output/pdf/`. Il PDF viene stampato da quell'HTML in un browser isolato senza rete e verificato visivamente. Nessun deploy, migrazione o scrittura nel database.

Verifiche automatiche: posa fuori dagli ingombri, dimensioni reali dei pannelli, conteggio/potenza, aggregazione PVGIS mensile e annua, bilanci energetici, prezzo/cassa ricalcolati, presenza di fonti e ipotesi, undici pagine senza copertina.

## Perimetro a punti e scelta della posa

L’anteprima ora parte dall’area prudenziale a quattro vertici scelta nella UI (salvata in `esempi/perimetro-delft-tracciato.json`), che contiene 3 moduli da 450 Wp. Il campione originale a 5 moduli resta disponibile come dato di confronto nei test, senza alterare il CityJSON originale.

- **Traccia da zero**: clic in ordine sui bordi della stessa falda, chiusura sul primo punto o con il pulsante. Vertici trascinabili, correzione con frecce da tastiera (Shift per 10 pixel), annullamento e rimozione del singolo punto; zoom.
- **Usa perimetro e ricalcola posa**: valida il poligono, conserva gli ostacoli e i moduli delle altre falde. Se la griglia ricalcolata ospita meno moduli di quelli già validi nel nuovo perimetro, conserva questi ultimi. La bozza resta invariata durante il tracciamento.
- **Confronta pose**: verticale, orizzontale e blocco rettangolare quando distinto. Anteprima separata dall’applicazione. Il blocco non scavalca righe o colonne vuote. Le scelte si collegano a quantità, potenza, produzione e prezzo del PDF; a parità di moduli sulla medesima falda la resa è identica. Nessuna ottimizzazione elettrica o delle ombre.
- L’editor Foto + 3D del wizard locale offre le schede **Perimetro sulla foto** e **Confronta pose**. La correzione commerciale compare nell’ortofoto, nell’area delimitata in 3D e nella tavola PDF. La geometria del modello sorgente resta conservata; non si ricostruiscono quote nuove dalla foto.
- La pagina autonoma consente di annullare l’ultima applicazione; nel wizard si usa la cronologia esistente.

Il nuovo PDF e le immagini sotto `output/pdf/` usano il campione tracciato. I prezzi, le tariffe e i consumi restano ipotesi dimostrative.


## Revisione commerciale del PDF

`casaVendita.ts` introduce tre pagine locali: flussi con la casa illustrata approvata, fornitura con stati distinti, riepilogo della decisione con la foto del tetto e la posa simulata. Il confronto della bolletta precede le spiegazioni tecniche; ipotesi e percorso economico precedono la chiusura, che torna a essere l’ultima pagina. Nessuna copertina aggiunta.

La pagina dei flussi usa di nuovo `svgScenaEnergia` con la casa illustrativa approvata; i valori rimangono quelli del preventivo. Il riepilogo mostra l’ortofoto del campione con i pannelli simulati e una didascalia esplicita. Il disegno giorno/sera resta identico (test sul contenuto completo della pagina, esclusa la numerazione).

Il prezzo mostra le sole voci previste nel campione. Pratiche e ulteriori lavorazioni sono da concordare; durate delle garanzie compaiono solo se disponibili. Il riepilogo separa risparmio annuale, media mensile e pagamenti. Nel campione prudenziale a 3 moduli il saldo a 25 anni rimane negativo: la chiusura segnala la configurazione da rivalutare, senza suggerire un recupero mancante.

Per completare una proposta commerciale reale servono dati verificati: componenti e garanzie, attività incluse/escluse, referente, tempi concordati ed eventuali esempi reali dell’installatore. L’anteprima non inventa testimonianze, incentivi o scadenze promozionali.


## Correzione delle immagini e pagine aziendali

Su richiesta, la pagina energia torna alla casa illustrativa precedente; il giorno/sera resta invariato. La foto del tetto sostituisce il modello geometrico nel riepilogo. Il confronto con l’SVG approvato e la presenza della foto sono coperti da test.

Sono reintegrate le pagine native `garanzie` e `faq`. Titolo, presentazione, garanzie, motivi di scelta e domande usano i campi già previsti dal modello (`presentazione_impresa_html`, `chi_siamo_titolo`, `garanzie_conversione`, `usp`, `faq_items`, `pdf_blocchi.testata_garanzie`). Il contenuto di Demo Solar è dichiaratamente dimostrativo: nessuna certificazione, recensione o anzianità inventata.

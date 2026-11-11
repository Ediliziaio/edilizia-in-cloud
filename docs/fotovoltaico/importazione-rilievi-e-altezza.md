# Importazione locale dei rilievi e altezza edificio

Anteprima: http://127.0.0.1:8087/?esempio=tetto-reale, fase Configurazione → Modifica disposizione pannelli → Rilievo e altezza.
Implementazione locale: nessuna pubblicazione, migrazione o modifica dei dati di produzione.

## Procedura

1. Caricare l’ortofoto e/o il modello. Il nome del rilievo identifica il lavoro nel preventivo.
2. Indicare asse verticale, metri per unità, rotazione e traslazioni. Il modello viene centrato sul piano e appoggiato a quota zero. L’ortofoto conserva CRS, origine e trasformazione affine; non viene effettuata una conversione automatica fra sistemi di coordinate diversi.
3. Preparare il rilievo e tracciare in ordine i vertici delle singole falde. Sul modello i vertici sono ricavati dalla mesh; sulla foto, se è presente il modello, un raggio verticale ricava le quote dalla mesh allineata. Con la sola ortofoto inserire gronda, pendenza e azimut noti: le pareti estruse sono illustrative.
4. Confermare scala/allineamento e applicare il tetto alla bozza. I pannelli selezionati vengono ridisposti sulle falde disponibili: se non entrano tutti, verificare quantità e prezzo nel riepilogo.
5. Controllare Foto + 3D e confermare con «Usa disposizione nel preventivo». Annulla conserva il preventivo precedente. Il flusso nativo quantità/potenza/listino/IVA resta in uso.

## Formati e limiti

- GeoTIFF RGB 8 bit, proiezione metrica, massimo 150 MB e 64 milioni di pixel; anteprima ridotta a 2048 pixel conservando la trasformazione. EPSG geografici, Web Mercator, unità non metriche e raster di sole quote non sono ortofoto accettate.
- JPG/PNG/WebP con world file e CRS metrico dichiarato, oppure risoluzione nota in metri/pixel. Una foto obliqua non è un’ortofoto.
- GLB 2.0 standard, con risorse incorporate. OBJ con eventuale MTL e texture selezionate insieme. Massimo 32 file, 100 MB complessivi e 1,5 milioni di vertici. Per OBJ georiferiti la centratura precede la conversione dei vertici a Float32.
- Niente decoder remoti per DRACO/KTX, risorse HTTP o texture mancanti. Esportare una mesh standard alleggerita del solo fabbricato. Non sono implementate nuvole LAS/LAZ, ricostruzione fotogrammetrica da foto grezze o segmentazione automatica dei tetti.
- Fino a 12 falde, ciascuna planare con 3–64 vertici, inclinazione massima 80° e scostamento dal piano massimo 12 cm. Un contorno che attraversa colmo o superfici diverse va diviso.

## Altezza

L’altezza complessiva è modificabile e reversibile: le coperture vengono traslate in quota, le pareti sottostanti adattate, mentre posa, quantità e prezzi restano conservati. La quota massima comprende l’intera mesh, anche parti non incluse nei contorni tracciati. Non genera nuovi piani architettonici. La modifica riguarda l’intero modello: importare il solo edificio interessato. Originali e parametri sono separati; «Ripristina quote originali» e Annulla/Ripeti recuperano le versioni precedenti. L’inquadratura si adatta alle nuove dimensioni.

## Persistenza

File originali, anteprima e trasformazioni vengono archiviati in IndexedDB nel browser. Il disegno del preventivo conserva un riferimento alla versione del rilievo, convalidato dal parser condiviso. La conferma della finestra aggiorna la bozza locale; la riapertura dopo reload ricarica mesh e texture. Se il riferimento non è disponibile, viene mostrato un errore invece di usare il campione pubblico come se fosse il cliente. Nessun invio a servizi esterni. Cancellare i dati del browser elimina i rilievi: per trasferire il lavoro conservare e reimportare gli originali. Non è ancora un archivio cloud condiviso fra dispositivi.

## Avvio e verifiche

La dipendenza GeoTIFF è isolata in `dev/fotovoltaico-locale/dependencies` per non modificare le dipendenze condivise del progetto:

```sh
npm ci --prefix dev/fotovoltaico-locale/dependencies --ignore-scripts
./node_modules/.bin/vite --config vite.fotovoltaico-locale.config.ts
./node_modules/.bin/tsc --project tsconfig.fotovoltaico-locale.json --pretty false
```

Prova browser effettuata con i GeoTIFF/GLB sintetici inclusi: tracciate due falde, sette moduli da 450 W (3,15 kWp), totale d’esempio €4.686 IVA inclusa; riapertura dopo reload, correzione 6→18 m, ripristino e annullamento verificati. Nessun rilievo reale del cliente è stato fornito per questa verifica. Test automatici coprono affini/world file, lettura GeoTIFF, superfici non valide, quote, parser/persistenza, caricamento OBJ, raggio verticale, precisione georiferita e geometrie condivise.

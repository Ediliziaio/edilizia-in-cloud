# Rilievo sintetico per verificare l’importazione

File creati localmente per i test; non rappresentano un cliente né un volo drone.

- Casa 10 × 8 m: gronda 4 m, colmo 6 m, due falde, texture sintetica incorporata nel GLB.
- GLB con asse Y verticale; OBJ equivalente con asse Z verticale.
- Ortofoto RGB sintetica 200 × 200 pixel, risoluzione 0,1 m/pixel, estensione 20 × 20 m. GeoTIFF EPSG:32632, bbox [500000, 4639980, 500020, 4640000]. Centro [500010,4639990].
- PNG e PGW equivalenti: valori world file A,D,B,E,C,F (centro del primo pixel).

Il pulsante «Prova con GeoTIFF e GLB sintetici» usa gli stessi lettori e l’archivio IndexedDB impiegati per i file selezionati. La texture serve a riconoscere l’orientamento; i contorni vanno tracciati sulle due falde separatamente. Per l’OBJ scegliere asse Z. Per il PNG con PGW dichiarare EPSG:32632. Tutte le risorse sono autonome e senza riferimenti HTTP.

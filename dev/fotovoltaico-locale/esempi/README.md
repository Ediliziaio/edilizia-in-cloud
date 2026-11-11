# Fonti del campione reale

Scaricato il **10 novembre 2026**. Sono dati pubblici per una dimostrazione locale; non sono dati di un cliente e non coprono gli immobili italiani.

## Geometria

- `edificio-3dbag-originale.json`: risposta originale [3DBAG API](https://api.3dbag.nl/collections/pand/items/NL.IMBAG.Pand.0503100000022863).
- Edificio `NL.IMBAG.Pand.0503100000022863`, Delft, Paesi Bassi; impronta riportata 71,52 m²; geometria Solid LoD 2.2 con quattro RoofSurface.
- Sistema di riferimento EPSG:7415 (RD New + NAP), coordinate in metri dopo il transform CityJSON. Il codice applica scale/translate, poi una traslazione locale; non aggiunge altezze all’edificio. Fonte altimetrica AHN5, anno 2023 negli attributi.
- © **3DBAG by tudelft3d and 3DGI**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Copyright e attribuzione](https://docs.3dbag.nl/en/copyright/), [documentazione dei servizi](https://docs.3dbag.nl/en/delivery/webservices/).
- Elaborazioni: triangolazione delle superfici, coordinate locali, materiale grafico uniforme e aggiunta dei moduli simulati. Posa e bordi di rispetto sono ipotesi della dimostrazione.

## Ortofoto

- `ortofoto-pdok.jpg`: [WMS PDOK Luchtfoto RGB](https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0?service=WMS&version=1.1.1&request=GetMap&layers=Actueel_orthoHR&styles=&srs=EPSG:28992&bbox=84994.458875,447507.3615,85034.458875,447547.3615&width=800&height=800&format=image/jpeg).
- Livello `Actueel_orthoHR`, EPSG:28992, bbox `[84994.458875,447507.3615,85034.458875,447547.3615]`, immagine 800 × 800, area 40 × 40 m, nord in alto. Il passo dell’immagine richiesta è 5 cm/pixel; non è una dichiarazione di precisione metrica del rilievo.
- Credito **Samenwerkingsverband Beeldmateriaal / PDOK**, CC BY come indicato nella [scheda ufficiale](https://www.pdok.nl/introductie/-/article/pdok-luchtfoto-rgb-open-). [Servizi ufficiali](https://www.pdok.nl/ogc-webservices/-/article/pdok-luchtfoto-rgb-open-).
- Il livello è aggiornabile: il download è del 10/11/2026, ma la data puntuale di ripresa di questo riquadro non è stata verificata. Foto e modello non sono necessariamente contemporanei. Sovrapposizioni delle falde e dei pannelli sono aggiunte della dimostrazione.

La foto mostra dettagli che il modello non rappresenta: camini e abbaini devono essere rilevati e trasformati in ostacoli prima di valutare la fattibilità della posa. La luce nel 3D è illustrativa e non simula le ombre solari.

## Simulazione casa / PVGIS

- `pvgis-delft-se.json`: risposta originale [PVGIS 5.3 PVcalc](https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=52.01169363&lon=4.3678348&peakpower=1&loss=14&angle=50.9&aspect=-42&mountingplace=free&outputformat=json&raddatabase=PVGIS-SARAH3), consultato il 10/11/2026. SARAH3, periodo 2005–2023; c-Si ventilato (`free`), potenza unitaria 1 kWp, perdite 14%, pendenza richiesta 50,9° (risposta arrotondata a 51°), aspect −42° da sud = azimut 138° da nord. Produzione annua 974,23 kWh/kWp; si usa `E_y`, senza applicare una seconda volta le perdite. Orizzonte DEM predefinito; nessuna stima delle ombre vicine.
- Posizione WGS84 `(52.01169363, 4.3678348)` dal punto indirizzo pubblico PDOK prossimo all'edificio: [reverse](https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?X=85014.458875&Y=447527.3615&rows=1&type=adres) e [lookup](https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=adr-d716be93a427a4ea4f395d37a6f0a3ff). Il reverse riporta distanza 3,36 m dall'origine del modello; non si presenta come georeferenziazione topografica.
- `casaTettoReale.ts`: 5 moduli di esempio da 450 Wp, 1,134 × 1,762 m, sulla falda `faccia-22`. Zona esclusa prudenziale `(x=2,85; y=0,85; w=2,05; h=3,05 m)` nella tavola sviluppata: include il dettaglio visibile intorno al pixel ortofoto `(430,439)`. Non è il rilievo del camino né della sua ombra. Bordo ipotizzato 30 cm, intermodulo 5 cm. Si controllano ingombri e distanze; non si dichiara capacità massima né fattibilità tecnica.
- La vista prima/dopo usa la foto originale e proietta gli stessi vertici dei pannelli sul modello e sul PDF. Il render vettoriale usa le superfici reali, con materiali uniformi e luce illustrativa; nessuna facciata ricostruita dall'AI.
- Prezzi, aliquota IVA, consumi, autoconsumo e tariffa sono esplicitamente dimostrativi. Non sono un'offerta per il proprietario del campione olandese. Nessun caricamento in produzione.

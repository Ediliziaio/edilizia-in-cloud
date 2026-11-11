# Icone comuni ai modelli fotovoltaici

12 SVG trasparenti, griglia 24×24, tratto 1,6 e colore del marchio: fotovoltaico, inverter, accumulo, installazione, garanzie, assistenza, sopralluogo, documenti, tempi, risparmio, certificazioni e rete.

- Libreria locale: `http://127.0.0.1:8087/icone-fotovoltaico` (colore e download SVG).
- Modulo condiviso: `supabase/functions/_shared/fvIconeEditoriali.ts`.
- Nel modello: selettore Icona della sezione Garanzie, con anteprima. Le icone accompagnano i contenuti realmente indicati, senza aggiungere garanzie o certificazioni.
- Nel PDF: usate nelle schede di Chi siamo e garanzie. Badge o immagini personalizzati hanno precedenza e restano conservati.

```ts
svgIconaEditorialeFv("inspection", {colore:"#188569", dimensione:24});
```

Le etichette vengono trattate come testo, i colori sono limitati a valori esadecimali e i nomi sconosciuti usano l’icona neutra delle garanzie. Le SVG decorative non ripetono il titolo ai lettori di schermo.

Esportazione: `bun dev/fotovoltaico-locale/preparaIconeEditoriali.ts`. I singoli file e la tavola sono in `output/icons/fotovoltaico/`; lo ZIP di consegna è `output/icons/icone-fotovoltaico-svg.zip`.

La veste di Chi siamo è circoscritta a `.cv-about` (`chiSiamoEditoriale.ts`). Titoli, presentazione, foto e contenuti provengono dal modello nativo. Il confronto dell’HTML conferma che le altre dieci pagine della simulazione sono rimaste identiche, comprese le immagini approvate.

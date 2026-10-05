# Foto di riferimento ancora da generare

Il 04/10/2026 le 310 foto fornite dal titolare sono entrate nei render (vedi `public/render-references/CREDITS.md`).
Nello stesso lavoro i render hanno guadagnato elementi che prima non si potevano scegliere (termoarredo, nicchia
nella doccia, fermaneve, linea vita, recinzione in vetro, pareti sopravasca, finiture delle porte…). Funzionano già a parole;
per quasi tutti, la foto che il modello riceverebbe in più renderebbe il risultato più fedele. In questa cartella c'è, per
verticale, **cosa far generare**: nome del file, se è di forma (bianco e nero) o di materia (colori), a quale scelta del
form si aggancia e il prompt per il generatore, nello stile del set esistente.

| File | Verticale | Cosa contiene |
|---|---|---|
| [bagno.md](bagno.md) | Render bagno | termoarredo (3 modelli), nicchia doccia (2), scarico (canalina, piletta), luci (4 tipi), parete sopravasca (fissa, girevole) |
| [facciata-tetto.md](facciata-tetto.md) | Render facciata e tetto | zoccolatura e davanzali (materiali), tegole piane e guaina, fotovoltaico con cornice, scossaline, comignoli, fermaneve, linea vita |
| [moduli-tecnici.md](moduli-tecnici.md) | Porte, pavimenti esterni, giardini | tipologie di porta senza foto, finiture, gradini e cordoli dei pavimenti esterni, giardino |
| [pavimento-stanza.md](pavimento-stanza.md) | Render pavimento e stanza | illuminazione a binario; posa a doppia fila ed esagonale, boiserie, pannelli 3D (facoltative) |
| [persiane-pergole.md](persiane-pergole.md) | Persiane e pergole | veneziana esterna, anta singola, lamelle orientabili, cassonetto nascosto, rovere chiaro, vetro satinato e fumé, piede del montante |
| [piscine.md](piscine.md) | Render piscine | recinzione in vetro, rivestimento esterno della vasca rialzata, superficie al posto della piscina tolta |
| [in-piu.md](in-piu.md) | Più render | 36 foto in più: scatti deboli da sostituire (piatto doccia a filo, specchiera, intonaco bugnato, materiali delle persiane nei colori comuni) e foto per elementi ancora da aggiungere |

Priorità consigliata: prima quelle di **forma** degli elementi che il form oggi offre senza foto (sono quelle che cambiano
di più il risultato), poi le superfici (materia). Le voci marcate «facoltative» possono aspettare.

## Stato al 05/10/2026

Il titolare ha consegnato la cartella «48-immagini-edilizia»: **44 foto di forma valide, già collegate al motore**
(bagno 11, facciata/tetto/stanza 6, porte interne 5, pavimenti esterni e giardino 9, piscine 8, persiane e pergole 5)
e **4 file vuoti (0 byte), da rigenerare**: `Canalina-Doccia-Lineare-A-Filo-Parete`, `Linea-Vita-Sul-Colmo`,
`Parete-Vasca-Girevole-In-Vetro`, `Persiana-Con-Lamelle-Orientabili-E-Asta`.
Restano da generare le foto di **materia** e le «facoltative» di ogni verticale, e le 36 di [in-piu.md](in-piu.md).
Dentro ogni documento, in testa, c'è l'elenco di cosa è già entrato.

## Come si aggancia una foto quando arriva

1. Genera la foto: quadrata, almeno 1024 px, senza testo né persone, nome come proposto nel file.
2. Convertila nel formato del motore (stesse regole delle 310: forma in bianco e nero 900 px, materia a colori 800 px,
   più la miniatura a colori da 320 px per il form; non sovrascrive mai un file già pubblicato):

   ```bash
   python3 scripts/render-references/converti-nuova-foto.py <foto.png> <cartella> <Nome-Della-Foto> --forma
   ```

   Senza `--forma` la foto è di materia e resta a colori. Le cartelle sono quelle del verticale in
   `public/render-references/` (`bathroom`, `floors`, `facades`, `roofs`, `shutters`, `pergolas`, `pools`, `doors`, `exterior`, e `lighting` per il binario della stanza).
3. Aggiungi la voce nella tabella del verticale (`shared/render-references/<verticale>References.ts`) con un testo inglese
   di al massimo 160 caratteri scritto guardando la foto, e togli la chiave dall'elenco `…_SENZA_FOTO` se c'era.
   Per una foto di forma il testo descrive la costruzione e **mai** colori o finiture: il colore arriva dal testo del prompt.
4. Lancia i test del verticale (`npx vitest run src/test/logic/referenceImages.<verticale>.test.ts`): controllano che il file e
   la miniatura esistano, che le foto `-BN` siano davvero in scala di grigi e che l'etichetta di una foto di forma non parli di colore.
5. Le edge function scaricano le foto dal sito: la foto deve essere online (deploy del frontend) **prima** del codice che la usa.

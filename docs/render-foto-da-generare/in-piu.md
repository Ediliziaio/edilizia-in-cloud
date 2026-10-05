# Foto in più (oltre a quelle dei file per verticale)

Elenco del 05/10/2026, generato dalla stessa lista della pagina «Foto dei render da generare». Due gruppi:

- **Scatti da sostituire o da sbloccare**: foto che oggi peggiorano il render (una stanza intera al posto di un piano doccia, un'anta aperta con gli oggetti dentro, pietra al posto di intonaco) o che il codice non riesce ad allegare (i materiali delle persiane sono marrone, grigio e antracite, e si allegano solo se il colore scelto è vicino: col bianco di default non arriva nessuna foto).
- **Elementi ancora da aggiungere**: foto per opzioni che il form non ha ancora (larghezza delle fughe, battiscopa a filo muro, cementine, scale interne, tende, persiane scorrevoli, ferramenta della blindata, recinzioni del giardino…). Servono solo se l'elemento viene aggiunto: tipi, form, prompt e foto si fanno insieme.

Come si convertono e si agganciano: vedi `README.md` in questa cartella.

## In più · scatti da sostituire o da sbloccare

Foto che oggi peggiorano il render o che il codice non riesce ad allegare.

### Piatto-Doccia-A-Filo-Pavimento-Primo-Piano-BN.webp — FORMA

- **Serve per**: Sostituisce la foto del piatto «a filo pavimento» (Bagno)
- **Deve mostrare**: Oggi la foto è un bagno intero (doccia, mobile, finestra): il modello ne copia la stanza. Serve il solo piano doccia che prosegue nel pavimento senza gradino.
- **Cartella**: `bathroom`
- **Prompt**: «Fotografia realistica ravvicinata di un piatto doccia a filo pavimento: superficie piana e liscia che prosegue senza gradino nel pavimento della stanza, con una leggera pendenza verso uno scarico lineare, bordo a filo. Vista dall'alto a 45 gradi, nessuna parete di vetro, nessun mobile, nessuna finestra, nessun oggetto, luce naturale morbida. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Specchiera-Contenitore-Con-Anta-Chiusa-BN.webp — FORMA

- **Serve per**: Sostituisce la foto della specchiera contenitore (Bagno)
- **Deve mostrare**: Oggi la foto ha l'anta aperta con piante, asciugamani e flaconi dentro: il modello li copia.
- **Cartella**: `bathroom`
- **Prompt**: «Fotografia realistica di una specchiera contenitore da bagno con una sola anta a specchio chiusa, montata su una parete liscia chiara sopra un lavabo: corpo rettangolare sottile, anta a specchio a filo, maniglia a presa nascosta, profilo laterale visibile per mostrare lo spessore. Vista frontale leggermente angolata, nessun oggetto, nessun interno visibile, luce naturale morbida. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Intonaco-Bugnato-A-Fasce-Dipinto.webp — MATERIA

- **Serve per**: Sostituisce la foto dell'intonaco «bugnato» (Facciata)
- **Deve mostrare**: Oggi la foto è pietra a blocchi veri; l'opzione è un intonaco inciso a finto bugnato (giunti a V in un tono solo).
- **Cartella**: `facades`
- **Prompt**: «Primo piano frontale a luce radente della parete di una facciata intonacata e lavorata a finto bugnato: fasce orizzontali di circa 40 cm separate da giunti incisi nell'intonaco profondi 1 cm e giunti verticali sfalsati, superficie liscia leggermente granulosa, un solo tono chiaro uniforme. La parete riempie il quadro, nessuna finestra, nessun oggetto. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Lamella-In-Legno-Verniciato-Bianco.webp — MATERIA

- **Serve per**: Materiale legno nel colore bianco (Persiane)
- **Deve mostrare**: Oggi le foto dei materiali sono marrone, grigio e antracite: il codice le allega solo se il colore scelto è vicino, quindi con il bianco di default non ne arriva nessuna. Le aggancio io (serve scegliere la foto dal tono più vicino).
- **Cartella**: `shutters`
- **Prompt**: «Primo piano a luce radente di lamelle di persiana in legno verniciato, venatura appena leggibile sotto la vernice satinata, bordi smussati, qualche piccola irregolarità di verniciatura a pennello, di colore bianco avorio (RAL 9010). Le lamelle riempiono il quadro, scala reale leggibile (lamella larga circa 5 cm), nessun oggetto estraneo. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Lamella-In-Legno-Verniciato-Verde.webp — MATERIA

- **Serve per**: Materiale legno nel colore verde (Persiane)
- **Deve mostrare**: Oggi le foto dei materiali sono marrone, grigio e antracite: il codice le allega solo se il colore scelto è vicino, quindi con il bianco di default non ne arriva nessuna. Le aggancio io (serve scegliere la foto dal tono più vicino).
- **Cartella**: `shutters`
- **Prompt**: «Primo piano a luce radente di lamelle di persiana in legno verniciato, venatura appena leggibile sotto la vernice satinata, bordi smussati, qualche piccola irregolarità di verniciatura a pennello, di colore verde scuro (RAL 6005). Le lamelle riempiono il quadro, scala reale leggibile (lamella larga circa 5 cm), nessun oggetto estraneo. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Lamella-In-Fibra-Di-Vetro-Bianco.webp — MATERIA

- **Serve per**: Materiale fibra di vetro nel colore bianco (Persiane)
- **Deve mostrare**: Oggi le foto dei materiali sono marrone, grigio e antracite: il codice le allega solo se il colore scelto è vicino, quindi con il bianco di default non ne arriva nessuna. Le aggancio io (serve scegliere la foto dal tono più vicino).
- **Cartella**: `shutters`
- **Prompt**: «Primo piano a luce radente di lamelle di persiana in fibra di vetro, superficie liscia e uniforme tipo gelcoat satinato, bordi arrotondati, nessuna venatura, di colore bianco avorio (RAL 9010). Le lamelle riempiono il quadro, scala reale leggibile (lamella larga circa 5 cm), nessun oggetto estraneo. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Lamella-In-Fibra-Di-Vetro-Verde.webp — MATERIA

- **Serve per**: Materiale fibra di vetro nel colore verde (Persiane)
- **Deve mostrare**: Oggi le foto dei materiali sono marrone, grigio e antracite: il codice le allega solo se il colore scelto è vicino, quindi con il bianco di default non ne arriva nessuna. Le aggancio io (serve scegliere la foto dal tono più vicino).
- **Cartella**: `shutters`
- **Prompt**: «Primo piano a luce radente di lamelle di persiana in fibra di vetro, superficie liscia e uniforme tipo gelcoat satinato, bordi arrotondati, nessuna venatura, di colore verde scuro (RAL 6005). Le lamelle riempiono il quadro, scala reale leggibile (lamella larga circa 5 cm), nessun oggetto estraneo. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Lamella-In-Alluminio-Bianco.webp — MATERIA

- **Serve per**: Materiale alluminio nel colore bianco (Persiane)
- **Deve mostrare**: Oggi le foto dei materiali sono marrone, grigio e antracite: il codice le allega solo se il colore scelto è vicino, quindi con il bianco di default non ne arriva nessuna. Le aggancio io (serve scegliere la foto dal tono più vicino).
- **Cartella**: `shutters`
- **Prompt**: «Primo piano a luce radente di lamelle di persiana in alluminio estruso, profili dritti e nitidi, verniciatura a polvere opaca uniforme, giunti stretti tra le lamelle, di colore bianco avorio (RAL 9010). Le lamelle riempiono il quadro, scala reale leggibile (lamella larga circa 5 cm), nessun oggetto estraneo. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Lamella-In-Alluminio-Verde.webp — MATERIA

- **Serve per**: Materiale alluminio nel colore verde (Persiane)
- **Deve mostrare**: Oggi le foto dei materiali sono marrone, grigio e antracite: il codice le allega solo se il colore scelto è vicino, quindi con il bianco di default non ne arriva nessuna. Le aggancio io (serve scegliere la foto dal tono più vicino).
- **Cartella**: `shutters`
- **Prompt**: «Primo piano a luce radente di lamelle di persiana in alluminio estruso, profili dritti e nitidi, verniciatura a polvere opaca uniforme, giunti stretti tra le lamelle, di colore verde scuro (RAL 6005). Le lamelle riempiono il quadro, scala reale leggibile (lamella larga circa 5 cm), nessun oggetto estraneo. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

## In più · per elementi ancora da aggiungere

Servono solo se mi dici di aggiungere l'elemento al form: lo metto io (tipi, prompt, foto) mentre generi.

### Fuga-Sottile-2-Mm-Piastrelle-Chiare.webp — MATERIA

- **Serve per**: Larghezza delle fughe → 2 mm (Bagno)
- **Deve mostrare**: Fuga appena leggibile, in tono su tono.
- **Cartella**: `bathroom`
- **Prompt**: «Primo piano a luce radente di piastrelle di gres grande formato in tono neutro chiaro con una fuga sottile di 2 mm in tono su tono, appena leggibile. Le piastrelle riempiono il quadro, nessun oggetto. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Fuga-Media-4-Mm-Piastrelle-Chiare.webp — MATERIA

- **Serve per**: Larghezza delle fughe → 4 mm (Bagno)
- **Deve mostrare**: Fuga media, ben leggibile, grigio medio.
- **Cartella**: `bathroom`
- **Prompt**: «Primo piano a luce radente di piastrelle di gres grande formato in tono neutro chiaro con una fuga media di 4 mm di colore grigio medio, ben leggibile. Le piastrelle riempiono il quadro, nessun oggetto. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Fuga-Larga-8-Mm-Piastrelle-Chiare.webp — MATERIA

- **Serve per**: Larghezza delle fughe → 8 mm (Bagno)
- **Deve mostrare**: Fuga larga e marcata, grigio scuro.
- **Cartella**: `bathroom`
- **Prompt**: «Primo piano a luce radente di piastrelle di gres in tono neutro chiaro con una fuga larga di 8 mm di colore grigio scuro, marcata e regolare. Le piastrelle riempiono il quadro, nessun oggetto. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Wc-A-Terra-Filo-Muro-Con-Cassetta-Incasso-BN.webp — FORMA

- **Serve per**: WC a terra filo muro (oggi la foto «a terra» è un monoblocco) (Bagno)
- **Deve mostrare**: Vaso a pavimento con il retro a filo parete, cassetta incassata, placca di comando a parete.
- **Cartella**: `bathroom`
- **Prompt**: «Fotografia realistica di un WC a terra filo muro: vaso a pavimento con la parte posteriore a filo della parete, nessuna cassetta a vista (cassetta incassata nel muro), placca di comando a parete sopra, sedile con chiusura rallentata. Vista a tre quarti, parete chiara liscia, nessun oggetto, luce naturale morbida. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Rivestimento-A-Mezza-Altezza-Con-Profilo-BN.webp — FORMA

- **Serve per**: Rivestimento a mezza altezza (Bagno)
- **Deve mostrare**: Piastrelle fino a circa 120 cm, sopra tinta unita, profilo sottile di chiusura.
- **Cartella**: `bathroom`
- **Prompt**: «Fotografia realistica di una parete di bagno rivestita con piastrelle fino a circa 120 cm da terra e, sopra, la stessa parete in tinta unita liscia, con un sottile profilo di chiusura in metallo lungo il bordo superiore del rivestimento. Vista frontale leggermente angolata, nessun oggetto, nessun sanitario, luce naturale morbida. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Barra-Portasciugamani-E-Anello-A-Parete-BN.webp — FORMA

- **Serve per**: Accessori → barra e anello portasalviette (Bagno)
- **Deve mostrare**: Barra orizzontale sottile, anello e gancio a parete.
- **Cartella**: `bathroom`
- **Prompt**: «Fotografia realistica di una parete di bagno chiara con una barra portasciugamani orizzontale in metallo sottile, un anello portasalviette e un gancio, montati a parete. Vista a tre quarti, nessun asciugamano, nessun altro oggetto, luce naturale morbida. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Mensola-A-Parete-Per-Bagno-BN.webp — FORMA

- **Serve per**: Accessori → mensola a parete (Bagno)
- **Deve mostrare**: Mensola sottile a sbalzo, fissaggi nascosti.
- **Cartella**: `bathroom`
- **Prompt**: «Fotografia realistica di una mensola a parete per bagno, lastra sottile a sbalzo con fissaggi nascosti, montata su una parete chiara liscia sopra un sanitario. Vista a tre quarti, mensola vuota, luce naturale morbida. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Battiscopa-A-Filo-Muro-Con-Canale-Ombra-BN.webp — FORMA

- **Serve per**: Battiscopa → a filo muro (Pavimento e stanza)
- **Deve mostrare**: Profilo incassato nell'intonaco, nessuna sporgenza, piccolo canale d'ombra in basso.
- **Cartella**: `floors`
- **Prompt**: «Fotografia realistica ravvicinata dell'angolo tra pavimento e parete con un battiscopa a filo muro: profilo incassato nell'intonaco, filo della parete liscio senza sporgenza, piccolo canale d'ombra in basso. Vista a 45 gradi dall'alto, pavimento in listoni chiari, nessun oggetto. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Battiscopa-Nero-In-Metallo-Sottile.webp — MATERIA

- **Serve per**: Battiscopa → nero in metallo (Pavimento e stanza)
- **Deve mostrare**: Lamiera nera opaca alta 6 cm lungo una parete chiara.
- **Cartella**: `floors`
- **Prompt**: «Primo piano a luce radente di un battiscopa in lamiera metallica nera opaca alto 6 cm, spigolo sottile, che corre lungo una parete chiara sopra un pavimento in legno chiaro; il battiscopa attraversa il quadro in orizzontale, nessun oggetto. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Cementine-Decorate-Geometriche.webp — MATERIA

- **Serve per**: Pavimento → cementine decorate (Pavimento e stanza)
- **Deve mostrare**: Motivo geometrico a più colori ripetuto, fughe sottili, usura leggera.
- **Cartella**: `floors`
- **Prompt**: «Primo piano dall'alto di un pavimento in cementine decorate: piastrelle quadrate 20×20 con un motivo geometrico a quattro colori (blu, bianco, ocra, grigio) ripetuto, fughe sottili, usura leggera della superficie. Le piastrelle riempiono il quadro, nessun oggetto. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Parquet-In-Posa-Versailles-BN.webp — FORMA

- **Serve per**: Pavimento, posa → Versailles (Pavimento e stanza)
- **Deve mostrare**: Pannelli quadrati di doghe incrociate a 90°, un solo tono neutro.
- **Cartella**: `floors`
- **Prompt**: «Fotografia dall'alto, perpendicolare al pavimento, di un parquet posato a Versailles: pannelli quadrati composti da doghe incrociate a 90 gradi con un motivo a tessitura regolare, cornici diagonali tra i pannelli. Doghe di un solo tono neutro e uniforme, fughe sottili e leggibili, luce naturale morbida e uniforme, nessun oggetto. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Marmo-Bookmatch-Lastre-Specchiate.webp — MATERIA

- **Serve per**: Pavimento / pareti → marmo bookmatch (Pavimento e stanza)
- **Deve mostrare**: Venatura che si specchia lungo la giunzione centrale.
- **Cartella**: `floors`
- **Prompt**: «Primo piano frontale di due lastre di marmo bianco venato accostate a libro (bookmatch): la venatura si specchia perfettamente lungo la giunzione centrale, fuga sottilissima. Le lastre riempiono il quadro, nessun oggetto. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Scala-Interna-Rivestita-In-Legno-BN.webp — FORMA

- **Serve per**: Gradini interni rivestiti (Pavimento e stanza)
- **Deve mostrare**: Pedate e alzate chiuse, spigolo, battiscopa che sale lungo la parete.
- **Cartella**: `floors`
- **Prompt**: «Fotografia realistica di una scala interna dritta di cinque gradini rivestiti in listelli di legno, con alzate chiuse e battiscopa che sale lungo la parete. Vista a tre quarti dal basso, parete liscia chiara, nessun corrimano, nessun oggetto, luce naturale morbida. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Tende-A-Pacchetto-Alla-Finestra-BN.webp — FORMA

- **Serve per**: Stanza → tende a pacchetto (Pavimento e stanza)
- **Deve mostrare**: Tessuto sollevato a metà con pieghe orizzontali regolari.
- **Cartella**: `floors`
- **Prompt**: «Fotografia realistica di una finestra con una tenda a pacchetto in tessuto lino chiaro, sollevata a metà con pieghe orizzontali regolari, cassonetto sottile in alto. Vista frontale leggermente angolata, stanza neutra e luminosa, nessun mobile. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Radiatore-A-Parete-In-Alluminio-BN.webp — FORMA

- **Serve per**: Stanza → radiatore a parete (Pavimento e stanza)
- **Deve mostrare**: Elementi verticali affiancati, mensole e valvola in basso.
- **Cartella**: `floors`
- **Prompt**: «Fotografia realistica di un radiatore a parete in alluminio a elementi verticali affiancati, montato su una parete liscia chiara con staffe e valvola in basso. Vista a tre quarti, elemento intero, luce naturale morbida, nessun oggetto. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Paraschizzi-Cucina-In-Vetro-Retroverniciato.webp — MATERIA

- **Serve per**: Stanza → paraschizzi cucina (Pavimento e stanza)
- **Deve mostrare**: Lastra continua di vetro tra piano di lavoro e pensili.
- **Cartella**: `floors`
- **Prompt**: «Primo piano frontale di un paraschizzi di cucina in lastra di vetro retroverniciato in tono neutro, continuo tra il piano di lavoro e i pensili, con un tratto del piano di lavoro in basso. Luce naturale morbida, nessun oggetto. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Sottogronda-In-Legno-Con-Travetti-A-Vista-BN.webp — FORMA

- **Serve per**: Sottogronda / sporto di gronda in legno (Facciata)
- **Deve mostrare**: Travetti a vista a passo regolare con tavolato sopra, gronda e pluviale in metallo.
- **Cartella**: `facades`
- **Prompt**: «Fotografia realistica dal basso dello sporto di gronda di una casa: travetti in legno a vista a passo regolare con il tavolato sopra, gronda e pluviale in metallo, parete intonacata. Luce naturale morbida, cielo neutro. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Persiana-Scorrevole-Su-Binario-Esterno-BN.webp — FORMA

- **Serve per**: Persiane → tipo scorrevole (Persiane)
- **Deve mostrare**: Un'anta a lamelle fisse che scorre su un binario superiore parallelo alla facciata.
- **Cartella**: `shutters`
- **Prompt**: «Fotografia realistica di una finestra su una facciata intonacata con una persiana scorrevole: un'anta a lamelle fisse che scorre su un binario superiore esterno parallelamente alla facciata, parzialmente aperta. Vista di tre quarti, luce naturale morbida. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Riscaldatore-A-Infrarossi-Su-Trave-Di-Pergola-BN.webp — FORMA

- **Serve per**: Pergola → riscaldamento a infrarossi (Pergole)
- **Deve mostrare**: Riscaldatore lineare sottile fissato sotto la trave frontale.
- **Cartella**: `pergolas`
- **Prompt**: «Fotografia realistica, dettaglio di una pergola in alluminio con un riscaldatore a infrarossi lineare e sottile fissato sotto la trave frontale. Vista dal basso a tre quarti, luce naturale morbida, nessun arredo. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Porta-Blindata-Con-Sopraluce-BN.webp — FORMA

- **Serve per**: Porta blindata → con sopraluce (Porte)
- **Deve mostrare**: Sopraluce vetrato fisso sopra l'anta.
- **Cartella**: `doors`
- **Prompt**: «Fotografia realistica di una porta blindata d'ingresso con un sopraluce vetrato fisso sopra l'anta, telaio sottile, maniglia moderna. Ripresa frontale a tre quarti da un portico, luce naturale morbida. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Porta-Blindata-Doppia-Anta-BN.webp — FORMA

- **Serve per**: Porta blindata → doppia anta (Porte)
- **Deve mostrare**: Due ante di larghezza diversa o uguale, battuta centrale.
- **Cartella**: `doors`
- **Prompt**: «Fotografia realistica di una porta blindata d'ingresso a due ante, con un'anta principale e un'anta semifissa più stretta, battuta centrale, maniglia moderna. Ripresa frontale a tre quarti da un portico, luce naturale morbida. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Maniglione-A-Barra-Per-Porta-Blindata-BN.webp — FORMA

- **Serve per**: Ferramenta blindata → maniglione a barra (Porte)
- **Deve mostrare**: Barra verticale lunga fissata sul pannello esterno.
- **Cartella**: `doors`
- **Prompt**: «Fotografia realistica ravvicinata di un maniglione a barra verticale in acciaio lungo circa 120 cm fissato sul pannello esterno di una porta blindata, con la serratura sotto. Vista a tre quarti, luce naturale morbida. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Pomolo-Fisso-Esterno-Per-Porta-Blindata-BN.webp — FORMA

- **Serve per**: Ferramenta blindata → pomolo fisso (Porte)
- **Deve mostrare**: Pomolo tondo fisso al centro del pannello, serratura a cilindro sotto.
- **Cartella**: `doors`
- **Prompt**: «Fotografia realistica ravvicinata di un pomolo tondo fisso in acciaio satinato sul pannello esterno di una porta blindata, con la serratura a cilindro sotto. Vista a tre quarti, luce naturale morbida. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Spioncino-Digitale-Su-Porta-Blindata-BN.webp — FORMA

- **Serve per**: Ferramenta blindata → spioncino digitale (Porte)
- **Deve mostrare**: Piccolo schermo/obiettivo a filo del pannello.
- **Cartella**: `doors`
- **Prompt**: «Fotografia realistica ravvicinata dello spioncino digitale su una porta blindata: obiettivo piccolo a filo del pannello esterno e, sopra, un minuscolo dispositivo di controllo. Vista a tre quarti, luce naturale morbida. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Recinzione-Giardino-A-Doghe-Di-Legno-BN.webp — FORMA

- **Serve per**: Giardino → recinzione a doghe di legno (Pavimenti esterni e giardino)
- **Deve mostrare**: Doghe verticali accostate su montanti, altezza circa 1,6 m.
- **Cartella**: `exterior`
- **Prompt**: «Fotografia realistica di una recinzione da giardino a doghe verticali di legno accostate su montanti, alta circa 1,6 metri, lungo il confine di un prato curato. Ripresa a tre quarti, luce naturale morbida, nessuna piscina. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Recinzione-Giardino-In-Rete-Con-Siepe-BN.webp — FORMA

- **Serve per**: Giardino → recinzione in rete con siepe (Pavimenti esterni e giardino)
- **Deve mostrare**: Rete metallica plastificata su paletti, siepe che la accompagna.
- **Cartella**: `exterior`
- **Prompt**: «Fotografia realistica di una recinzione da giardino in rete metallica plastificata su paletti, alta circa 1,2 metri, con una siepe bassa sempreverde che la accompagna, lungo il confine di un prato. Ripresa a tre quarti, luce naturale morbida, nessuna piscina. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

### Canaletta-Di-Drenaggio-Lineare-Pavimento-Esterno-BN.webp — FORMA

- **Serve per**: Pavimento esterno → canaletta di drenaggio (Pavimenti esterni e giardino)
- **Deve mostrare**: Canaletta lineare con griglia a filo, pendenza del pavimento verso di essa.
- **Cartella**: `exterior`
- **Prompt**: «Fotografia realistica di una pavimentazione esterna in lastre con una canaletta di drenaggio lineare a griglia a filo che attraversa il pavimento, con le lastre che hanno una leggera pendenza verso di essa. Ripresa a tre quarti dall'alto, luce naturale morbida, nessun oggetto. Nessun testo, nessun marchio, nessuna persona. Formato quadrato 1024×1024.»

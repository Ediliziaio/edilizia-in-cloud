# Piano: dal DWG a tutto il progetto, con Silvio a fianco — 24/11/2026

## Cosa vuole il titolare

Carico un DWG di un progetto su più piani e il gestionale genera da solo tutto quello che un
altro Claude ha prodotto a mano per Via Callimaco (tavole per piano con unità e superfici,
planimetria generale con i dati del lotto, viste 3D dell'edificio e del lotto, piante 3D a taglio,
computo), più quello che solo il gestionale sa fare (computo legato alla pianta, prezzi,
previsione, varianti, commessa). Mentre lo fa, Silvio sta a fianco in chat: chiede quello che
non si capisce dal disegno e esegue le correzioni.

## Da dove si parte: cosa ho fatto a mano su Callimaco (= cosa manca)

| Passo fatto a mano oggi | Cosa manca al gestionale |
|---|---|
| Convertito il DWG sul Mac con LibreDWG e il convertitore Python | Il DWG online è spento: serve il motore su Cloudflare (pronto, da pubblicare) |
| Trovati i 4 piani nella tavola e scritti i rettangoli e le quote | Riconoscimento automatico delle piante nella tavola (oggi si ritaglia a mano un piano alla volta) |
| Letto «+6.98» per l'interpiano | Quote e altezze dalle scritte e dalle sezioni |
| Corretto il convertitore (porte senza anta, «mq.», nomi abbreviati, INFISSI) | Fatto (1cb114c77 e seguenti) |
| Stanze piccole del piano terra mancanti (ingressi, disimpegni, atrio) | Stanze dal testo quando il contorno non si chiude |
| Unità int. 01–07 dalle sigle | Fatto in parte (sigle vicine); manca la legenda «INT. 04 – SUL 55,20 – BILOCALE (S.U. 44,00)» come dato e controllo |
| Trovato il blocco dell'edificio nella planimetria del lotto, allineato al 98% | Lotto automatico: blocco dell'edificio, verde, piscine, parcheggi, quote del terreno |
| Detto al sistema «prefabbricato con sopraelevazione» | Fatto (pannello «Costruzione e sopraelevazione»); manca che lo chieda Silvio |
| Salvato 6 versioni via SQL | Tutto dall'app, con «Salva versione» e il registro |
| — | Tavole PDF come quelle dell'altro Claude |
| — | Viste 3D esterne e animazioni esportabili |

L'altro Claude ha disegnato (immagini dalle linee del DWG): niente si perde ma niente si conta.
Il gestionale costruisce un modello (pareti, porte, stanze, unità) da cui escono computo, tempi e
varianti. La strada è fare entrambe le cose: modello per i conti, disegno del DWG per le tavole.

## Lotti

### Lotto 0 — Callimaco come banco di prova (1 giorno)
DWG, risultati attesi (SUL e S.U. per unità dalla legenda, stanze per piano, 2 piscine, 950 m² di
verde, interpiano 3,49 m) in un fixture; un test che rilegge il DWG e conta quanto ci si avvicina.
Ogni lotto dopo deve far salire il punteggio. **Fatto quando:** il test esiste e oggi dà il
punteggio di partenza (es. 25 stanze su 33, 7 unità su 7, 22 finestre su 41 con misure).

### Lotto 1 — DWG dall'app, online (2–3 giorni + token Cloudflare del titolare)
Pubblicare il container `services/planimetria-motore` (LibreDWG + convertitore + Blender) e
accendere `VITE_PLANIMETRIE_MOTORE_ONLINE`. Il convertitore deve essere lo stesso di
`dev/planimetria-editor/ricostruisciDxf.py` (i miglioramenti di oggi). **Fatto quando:** carico
`callimaco.dwg` da Planimetrie → Nuova e ottengo la stessa pianta che ho fatto oggi a mano.

### Lotto 2 — Piante trovate da sole (3–4 giorni)
Nella tavola il motore propone le piante: gruppi di muri (layer delle pareti), il titolo vicino
(«piano terra», «piano primo»), la quota (scritta «+6.98» o interpiano medio), e le scarta
quando sono prospetti o sezioni (linee senza stanze, scritte «PROSP», «SEZ»). L'utente conferma
o corregge in un passo solo («Ho trovato 4 piani: va bene?»). Oggi `PianiDaDwg.tsx` chiede di
ritagliare ogni piano. **Fatto quando:** Callimaco si legge con un solo «Conferma».

### Lotto 3 — Stanze anche quando il contorno non si chiude (3–5 giorni)
Dove c'è un nome e una superficie scritti («INGRESSO 2,9 m²») ma la stanza non si è chiusa:
riempimento dalla posizione del testo sulla griglia delle pareti (lo stesso metodo di
`geometriaPiano`), con chiusura dei varchi di porta; si accetta se l'area torna con quella scritta
(±10%). **Fatto quando:** il piano terra di Callimaco ha ingresso, armadio, cabina armadio,
disimpegni e atrio condominiale, e tutte le unità hanno bagno e tipo.

### Lotto 4 — Unità e legenda come dato (2 giorni)
Leggere le righe di legenda «INT. 04 – SUL MQ. 55,20 – BILOCALE (S.U. 44,00) + balcone…» come
dati dell'unità (SUL, S.U., tipo, pertinenze) e confrontarli con quello che esce dalla pianta:
«Int. 04: dichiarati 44,00 m², misurati 36,0 – mancano stanze». Collegarle alle 26 unità della
commessa (listino, €/m²). **Fatto quando:** il riepilogo mostra dichiarato e misurato per unità.

### Lotto 5 — Lotto e sistemazioni esterne dal DWG (3–4 giorni)
Trovare nella planimetria del lotto il blocco dell'edificio (come Callimaco: `INSERT` con le
stesse pareti del piano terra) e allineare per corrispondenza dei punti; poi leggere confine,
verde (campiture e polilinee), piscine (rettangoli con la scritta), parcheggi e stalli, rampe,
alberi, quote del terreno. **Fatto quando:** Callimaco ha lotto, verde, piscine, parcheggi e alberi
senza un passo a mano, e il computo ha il capitolo 12 completo.

### Lotto 6 — Altezze, coperture e sezioni (3 giorni)
Dalle sezioni e dai prospetti: interpiano, altezza netta, quota della copertura, tipo di tetto,
parapetti. Dalle piante: le sigle «H 310». **Fatto quando:** i piani hanno le altezze vere e la
copertura del 3D è quella del progetto.

### Lotto 7 — Tavole di progetto in PDF (3 giorni)
Una pagina per piano come le tavole dell'altro Claude: pianta con i colori per zona (giorno,
notte, servizi, parti comuni), nomi e m², tabella delle unità (alloggio, tipo, SUL, S.U.,
pertinenze), scala grafica, legenda, cartiglio; la planimetria generale con i dati del lotto;
una pagina con 4 viste 3D; le piante 3D a taglio con le etichette. Si parte da `fascicoloPdf`.
**Fatto quando:** «PDF progetto» su Callimaco dà le 8 pagine dell'altro Claude o meglio.

### Lotto 8 — 3D esterno e animazioni (3–4 giorni)
- «Edificio intero» (fatto oggi nella barra) aperto da solo quando ci sono più piani e si guarda da fuori.
- Inquadrature pronte: dalla strada, dal giardino, dall'alto, a volo d'uccello (come
  render_01…04), salvabili come immagini.
- Animazioni: giro intorno all'edificio e volo sul lotto esportati in video (registrazione del
  canvas 3D), e passeggiata nelle stanze.
- Render fotorealistico (Cycles sul motore online) e render AI per le viste esterne.
- Finestre nel 3D con le misure vere delle sigle (già lette) e i serramenti scelti.
**Fatto quando:** da Callimaco escono 4 viste e un video di 20 secondi senza uscire dall'app.

### Lotto 9 — Silvio che accompagna (4–5 giorni)
La chat unica della scheda (lotto F) diventa il regista: dopo il caricamento del DWG Silvio
riassume cosa ha trovato e chiede solo quello che il disegno non dice, una domanda alla volta:
«È una nuova costruzione, una ristrutturazione o una sopraelevazione?», «Quali piani esistono
già?», «Queste 7 unità sono giuste?», «Il lotto è recintato?». Ogni risposta diventa un'azione
(scelte della costruzione, unità, lotto) con anteprima e conferma, come i comandi del disegno.
Poi: «Fammi le tavole», «Fammi il video», «Quanto costa?» lanciano i lotti 7, 8 e lo studio.
Le chiamate restano a consumo con l'addebito all'azienda. **Fatto quando:** Callimaco si fa da
zero in chat: carico il DWG, rispondo a 4-5 domande, ho tavole, 3D, video e computo.

### Lotto 10 — Prezzi delle voci nuove e computo esportabile (2–3 giorni)
Abbinamenti al prezzario regionale (Lazio per Urban Vision) per strutture, solai, coperture,
impianti, esterni: oggi 122 voci hanno il prezzo indicativo. Export del computo in Excel come
quello dell'altro Claude (riepilogo per capitolo, foglio delle quantità dal DWG, ipotesi ed
esclusioni). **Fatto quando:** su Callimaco l'intervallo della previsione scende sotto ±10%.

## Ordine

0 → 1 (serve il token Cloudflare) → 2 → 3 → 4 → 5 → 7 → 8 → 9; 6 e 10 in parallelo da subito.
Il primo risultato visibile è dopo 2–3–7: «carico il DWG, confermo i piani, ho le tavole».
In tutto circa 30–35 giornate di lavoro, divisibili su 3–4 sessioni in parallelo dopo il lotto 0.

## Rischi

- DWG diversi da Callimaco (layer con altri nomi, blocchi, scale): il lotto 0 va allargato ad
  almeno 3 DWG veri di clienti diversi prima del lotto 3.
- Memoria e tempo del motore online su DWG grandi: limiti e coda come per i render.
- Costo AI di Silvio: sempre a consumo, mai chiamate in parallelo (vedi memoria).

# Editor delle planimetrie (fase 2)

Piano: `docs/superpowers/specs/2026-10-30-planimetrie-design.md`.
Prova locale, senza database:

```bash
npx vite --config vite.planimetria-local.config.ts   # http://127.0.0.1:8084
```

`?esempio` e `?trilocale` aprono gli esempi della fase 1 (`shared/planimetrie/esempi/`),
`?stimate` un bilocale con misure stimate, `?nuova` una pianta vuota, `?telefono` la
vista da telefono. Il documento resta nel `localStorage` del browser.

Ingresso e uscita del componente sono il documento della fase 1:

```tsx
<EditorPlanimetria piantaIniziale={planimetria} onChange={(p) => salva(p)} />
```

`onChange` arriva a ogni modifica completa (non durante i trascinamenti) con una
`Planimetria` pronta per `useSalvaVersionePlanimetria`.

## Cosa fa

- **Stanza**: si trascina un rettangolo (le misure interne compaiono mentre si
  disegna) oppure «Scrivi le misure» (larghezza × lunghezza interne). La seconda
  stanza si aggancia alla prima e la parete in comune non si raddoppia.
- **Parete**: clic per l'inizio, clic per la fine; va dritta da sola (90°), si
  aggancia agli angoli e alle pareti esistenti, si allinea agli angoli. Mentre si
  disegna si può scrivere la lunghezza («3,5» + Invio).
- **Spostare / allungare**: si trascina una parete (si sposta di traverso, la
  stanza la segue, le pareti in fila sulla stessa linea vengono con lei); si
  trascinano i pallini agli estremi della parete selezionata.
- **Misure**: clic sulla quota → si scrive «4,20» (o «420 cm», «4 m 20») → Invio.
  Il lato di una stanza è la misura interna, da muro a muro, come col metro.
- **Porte e finestre**: si trascinano dalla barra su una parete (o si sceglie lo
  strumento e si clicca la parete); un clic sulla porta già selezionata ne gira
  il verso (quattro posizioni).
- **Stanze**: nome, «che stanza è» (bagno, cucina…), mq del pavimento e perimetro
  subito, sulla pianta e nel pannello, col totale. I numeri sono quelli di
  `calcolaQuantita` (fase 1): gli stessi che userà il computo.
- **Stanze che si chiudono da sole**: tre o quattro pareti che fanno un giro diventano
  una stanza; una parete che taglia una stanza la divide in due.
- **Da controllare**: i problemi di `controllaPlanimetria` in parole semplici; un clic
  porta all'oggetto.
- **Com'è oggi / Progetto**: nel progetto le pareti di oggi non si spostano: si
  demoliscono (gialle, un secondo clic le rimette) e quelle nuove nascono rosse.
- **Misure stimate**: a righe viola, in corsivo con «≈»; si confermano una per
  stanza o tutte insieme. Scrivere una misura la rende rilevata.
- **Annulla / ripeti**: bottoni e Ctrl/⌘+Z, Ctrl/⌘+Maiusc+Z, Ctrl+Y.
- **Zoom e spostamento**: rotella (con Ctrl il pinch del trackpad), trascinare il
  fondo, spazio + trascinare, due dita sul touch.
- **Telefono** («meno è meglio»): niente disegno. Si guarda, si sposta, si
  ingrandisce; toccando una stanza o una parete si correggono nome e misure.

## Perché SVG e non Konva o Pixi

Una pianta ha qualche centinaio di oggetti, non decine di migliaia: il limite non è
la velocità di disegno ma la semplicità delle interazioni.

- **Ogni pezzo è un elemento del DOM**: clic, cursore e accessibilità vengono gratis
  (`data-tipo`/`data-id` sul bersaglio dicono cosa si è toccato), senza ricostruire
  un sistema di eventi come su un canvas.
- **Nitido a ogni zoom e stampabile**: è già vettoriale; lo stesso disegno potrà
  diventare l'anteprima delle esportazioni (fase 6).
- **Testi e caselle sopra il disegno**: la misura si scrive in un `<input>` vero,
  posato sopra la quota.
- **Zero dipendenze**: Konva (~150 kB) e Pixi (~450 kB) non servono a questa scala.
  Se un giorno servissero migliaia di oggetti (sfondo DXF da ricalcare, fase 3) si
  può mettere un canvas sotto l'SVG solo per lo sfondo.

## Come è fatto

| File | Cosa |
|---|---|
| `adattatore.ts` | **unico punto di contatto col modello della fase 1**: documento ⇄ pianta di lavoro (`daPlanimetria`, `aPlanimetria`), stanze/mq/problemi della vista (`datiVista`) |
| `comandi.ts` | ogni modifica è una funzione pura `pianta → pianta` (stanze, pareti, aperture, stato, stimate) |
| `geometria.ts` | proiezioni e aggancio del cursore (angoli, pareti, dritto, allineamento, griglia 5 cm) |
| `storia.ts` | annulla/ripeti (al massimo 200 passi) |
| `misure.ts` | lettura e scrittura delle misure all'italiana |
| `disegno.ts` | forme da disegnare: corpo delle pareti, simboli di porte e finestre |
| `TelaPlanimetria.tsx` | il disegno SVG, senza logica dei gesti |
| `PannelloDettagli.tsx` | pannello a destra (sul telefono: in basso) |
| `EditorPlanimetria.tsx` | gesti, tastiera, barra, stato |
| `esempio.ts` | bilocale per la pagina di prova |

Test: `src/test/logic/planimetrieEditor.test.ts` (comandi) e
`planimetrieEditorModello.test.ts` (il giro documento → editor → documento su bilocale
e trilocale non cambia nessuna quantità).

La pianta di lavoro usa coordinate dello schermo (y in giù) e tiene le stanze sull'asse
dei muri, così spostando una parete gli angoli la seguono. Il documento ha y in su e
locali al filo interno: la conversione sta tutta nell'adattatore. Nel progetto i locali
si richiudono dalle pareti (`ricostruisciLocali`) e tengono gli id della proposta, così
le chiavi del computo non cambiano da una modifica all'altra.

## Lasciato per dopo

- Una sola proposta (A) e un solo livello nell'interfaccia; il documento ne regge di più
  e l'editor le conserva intatte.
- Arredi, quote e testi del documento si vedono ma non si spostano ancora.
- Stanze non rettangolari si fanno solo da codice (`aggiungiStanza` accetta un
  contorno qualunque); nell'interfaccia c'è il rettangolo.
- Elementi (sanitari, arredi), quote libere e testi: dopo il modello della fase 1.

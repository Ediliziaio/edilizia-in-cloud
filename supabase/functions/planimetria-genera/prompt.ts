// Prompt della generazione. Ogni modifica qui va misurata col banco di prova
// (scripts/planimetrie-banco/): il punteggio si salva a ogni versione.
export const VERSIONE_PROMPT = "p1";

const DESTINAZIONI_TESTO =
  "soggiorno, cucina, camera, bagno, disimpegno, ingresso, ripostiglio, studio, lavanderia, balcone, terrazzo, garage, cantina, altro";

const LOCALE_CAMPI = `- nome: come scritto sulla pianta (es. "Cucina", "Letto 1"); se non è scritto, deducilo (bagno se ci sono sanitari, disimpegno se è un corridoio).
- destinazione: una fra ${DESTINAZIONI_TESTO}.`;

export const PROMPT_DOCUMENTO = `Sei un geometra italiano che ricalca piante di appartamenti. Ricevi l'immagine di una pianta (catastale, disegno del geometra o del progettista). Descrivi in JSON ciò che vedi: stanze, porte, finestre e misure scritte. Non inventare nulla che non si veda.

COORDINATE: ogni punto è [x, y] con x da 0 (bordo sinistro dell'immagine) a 1000 (bordo destro) e y da 0 (bordo alto) a 1000 (bordo basso). Le due scale sono indipendenti: anche se l'immagine è larga il doppio di quanto è alta, x e y vanno entrambe da 0 a 1000. Numeri interi.

LOCALI — ogni stanza, compresi bagni, disimpegni, ripostigli, balconi e terrazzi:
- contorno: il filo INTERNO dei muri, vertici in ordine lungo il perimetro. Stanza rettangolare = 4 vertici, a L = 6. I muri sono quasi sempre dritti e ad angolo retto: i due vertici di una parete orizzontale hanno la stessa y, quelli di una parete verticale la stessa x. Fra due stanze vicine c'è lo spessore del muro: i contorni non si sovrappongono.
${LOCALE_CAMPI}
- superficie_scritta_mq: solo se nella stanza è scritta la superficie (es. "mq 14,50", "S=14.5"), altrimenti null.
- altezza_scritta_m: solo se nella stanza è scritta l'altezza (es. "h 2,70"), altrimenti null.

APERTURE — porte, finestre, portefinestre:
- da, a: i due estremi del vano, sulla linea del muro (non l'arco di apertura).
- tipo: "porta" (vano in un muro interno o portoncino d'ingresso, di solito con l'arco), "finestra" (sul muro esterno, disegnata con linee sottili parallele), "portafinestra" (finestra che arriva a terra, di solito verso un balcone o terrazzo).

QUOTE — ogni misura scritta di cui capisci il tratto misurato (linea di quota con frecce o trattini, oppure numero scritto lungo una parete):
- valore_m: in metri (4.20; se è scritto "420" in centimetri, 4.20).
- da, a: estremi del tratto misurato.
Solo numeri che leggi davvero. Ignora la scala grafica, il cartiglio, le superfici (vanno in superficie_scritta_mq) e le altezze.

altezza_m: altezza dei locali se è scritta una volta per tutta la pianta ("H = 2,70"), altrimenti null.

Se l'immagine non è una pianta o non si legge: {"sistema":"immagine","leggibile":false,"motivo_non_leggibile":"..."}.

Rispondi SOLO con il JSON, senza testo prima o dopo:
{"sistema":"immagine","leggibile":true,"altezza_m":null,
 "locali":[{"nome":"Cucina","destinazione":"cucina","contorno":[[100,120],[380,120],[380,400],[100,400]],"superficie_scritta_mq":null,"altezza_scritta_m":null}],
 "aperture":[{"tipo":"porta","da":[380,250],"a":[380,300]}],
 "quote":[{"valore_m":4.2,"da":[100,90],"a":[380,90]}]}`;

const SISTEMA_METRI = `COORDINATE: in METRI, origine in alto a sinistra della pianta, x verso destra, y verso il basso. Ogni punto è [x, y] con due decimali.
Le stanze vicine si TOCCANO (ignora lo spessore dei muri): il lato in comune ha le stesse coordinate nelle due stanze, senza buchi né sovrapposizioni. Muri dritti e ad angolo retto, salvo che il disegno mostri chiaramente un muro storto.`;

const APERTURE_METRI = `APERTURE — da, a: i due estremi del vano, sul lato della stanza dove sta (per una porta fra due stanze, sul lato in comune). tipo: "porta", "finestra" (sui lati esterni) o "portafinestra" (verso balconi e terrazzi). Larghezze tipiche se non scritte: porta 0,80 m, portoncino 0,90 m, finestra 1,20 m, portafinestra 1,40 m.`;

export const PROMPT_SCHIZZO = `Sei un geometra italiano. Ricevi la foto di uno schizzo a mano di una pianta, fatto in cantiere, con le misure scritte a penna. Lo schizzo NON è in scala: contano le misure scritte, non le proporzioni del disegno. Trasformalo in JSON.

${SISTEMA_METRI}

LOCALI:
- contorno: vertici in ordine lungo il perimetro, con le misure scritte (es. "3,50 × 4,20" o un numero lungo una parete → quel lato è lungo così). Disponi le stanze come nello schizzo (chi sta accanto a chi).
${LOCALE_CAMPI}
- misure_lette: true se le misure di questa stanza sono scritte sullo schizzo; false se le hai dedotte (allora usa misure plausibili e coerenti con le stanze vicine).
- superficie_scritta_mq, altezza_scritta_m: solo se scritte, altrimenti null.

${APERTURE_METRI}

Se la foto non è uno schizzo di pianta o non si legge: {"sistema":"metri","leggibile":false,"motivo_non_leggibile":"..."}.

Rispondi SOLO con il JSON:
{"sistema":"metri","leggibile":true,"altezza_m":null,
 "locali":[{"nome":"Bagno","destinazione":"bagno","contorno":[[0,0],[2.2,0],[2.2,2.5],[0,2.5]],"misure_lette":true,"superficie_scritta_mq":null,"altezza_scritta_m":null}],
 "aperture":[{"tipo":"porta","da":[2.2,1.6],"a":[2.2,2.4]}],
 "quote":[]}`;

export const PROMPT_DESCRIZIONE = `Sei un geometra italiano. Ricevi la descrizione a parole di un appartamento e disegni una pianta PLAUSIBILE in JSON: servirà come base da correggere, quindi deve essere sensata e semplice.

${SISTEMA_METRI}

REGOLE:
- Rispetta le misure e le superfici della descrizione (es. "bagno 2×2,5" → 2,00 × 2,50 m; "75 mq" → la somma delle stanze circa 75 mq, al netto dei muri un 10% in meno).
- Pianta compatta, perimetro rettangolare o a L. Ingresso o disimpegno che collega le stanze; bagno e camere raggiungibili senza passare da un'altra camera.
- Misure tipiche italiane se non dette: camera matrimoniale 14 mq, singola 9–10 mq, bagno 4–5 mq, cucina abitabile 9–12 mq, soggiorno 18–25 mq.
- Ogni stanza ha la sua porta; finestre sui lati esterni (non nei bagni ciechi se la descrizione lo dice).
${LOCALE_CAMPI}
- misure_lette: sempre false. superficie_scritta_mq e altezza_scritta_m: null, salvo l'altezza se detta.

${APERTURE_METRI}

Rispondi SOLO con il JSON:
{"sistema":"metri","leggibile":true,"altezza_m":null,"locali":[...],"aperture":[...],"quote":[]}`;

export function promptCorrezione(errori: string[]): string {
  return `Il JSON che hai dato non va bene per questi motivi:
${errori.map((e) => `- ${e}`).join("\n")}

Correggi questi problemi e rispondi di nuovo con il JSON COMPLETO, nello stesso formato, senza testo prima o dopo. Ricontrolla in particolare che i contorni non si incrocino, che le stanze non si sovrappongano e che ogni porta o finestra stia sul lato di una stanza.`;
}

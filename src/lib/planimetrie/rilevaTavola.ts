import type { PlanText } from "../preventivi/planReading";
import type { ElementoLetturaTavola, TipoTavola, TrattoTavola } from "../../../shared/planimetrie/letturaAssistita.ts";
import { zonaFotoValida, type ZonaFotoDocumento } from "../../../shared/planimetrie/letturaTipi.ts";

interface Tratto {
  verticale: boolean;
  asse: number;
  inizio: number;
  fine: number;
  spessore: number;
}
type Quadro = { pixel: Uint8Array; larghezza: number; altezza: number };
type Proposta = Omit<ElementoLetturaTavola, "id" | "stato">;
const lunghezza = (t: Tratto) => t.fine - t.inizio;
const sovrapposta = (a: Tratto, b: Tratto) => Math.min(a.fine, b.fine) - Math.max(a.inizio, b.inizio);
const punto = (verticale: boolean, asse: number, lungo: number) => verticale ? { x: asse, y: lungo } : { x: lungo, y: asse };

function linee(q: Quadro, verticale: boolean, minimo: number): Tratto[] {
  const lunga = verticale ? q.altezza : q.larghezza;
  const corta = verticale ? q.larghezza : q.altezza;
  const linee: Tratto[] = [];
  let precedenti: Tratto[] = [];
  for (let riga = 0; riga < corta; riga++) {
    const correnti: Tratto[] = [];
    let inizio = -1;
    let ultimo = -1;
    for (let i = 0; i <= lunga; i++) {
      if (i < lunga && q.pixel[verticale ? i * q.larghezza + riga : riga * q.larghezza + i]) {
        if (inizio < 0) inizio = i;
        ultimo = i;
      } else if (inizio >= 0 && (i === lunga || i - ultimo > 1)) {
        if (ultimo - inizio >= minimo) {
          const tolleranza = Math.max(2, (ultimo - inizio) * 0.08);
          const precedente = precedenti.find((p) => Math.abs(p.inizio - inizio) <= tolleranza && Math.abs(p.fine - ultimo) <= tolleranza);
          if (precedente && !correnti.includes(precedente)) {
            precedente.asse += 0.5;
            precedente.spessore += 1;
            correnti.push(precedente);
          } else {
            const nuovo = { verticale, asse: riga, inizio, fine: ultimo, spessore: 1 };
            linee.push(nuovo);
            correnti.push(nuovo);
          }
        }
        inizio = -1;
      }
    }
    precedenti = correnti;
  }
  return linee.sort((a, b) => lunghezza(b) - lunghezza(a)).slice(0, 480);
}

function muriDalleLinee(tratti: Tratto[], riferimento: number, schizzo: boolean): Tratto[] {
  const muri = tratti.filter((t) => t.spessore >= riferimento * (schizzo ? 0.0027 : 0.0035) && lunghezza(t) >= riferimento * 0.032);
  for (let i = 0; i < tratti.length; i++) {
    const a = tratti[i];
    if (lunghezza(a) < riferimento * 0.028) break;
    for (const b of tratti.slice(i + 1)) {
      const distanza = Math.abs(a.asse - b.asse);
      const comune = sovrapposta(a, b);
      if (distanza < riferimento * 0.004 || distanza > riferimento * 0.023
        || comune < Math.max(riferimento * 0.028, lunghezza(a) * 0.58, lunghezza(b) * 0.7)) continue;
      muri.push({ ...a, asse: (a.asse + b.asse) / 2, inizio: Math.max(a.inizio, b.inizio), fine: Math.min(a.fine, b.fine), spessore: distanza });
    }
  }
  const distinti: Tratto[] = [];
  for (const muro of muri.sort((a, b) => lunghezza(b) - lunghezza(a))) {
    if (!distinti.some((m) => Math.abs(m.asse - muro.asse) < (m.spessore + muro.spessore) * 0.65
      && sovrapposta(m, muro) > lunghezza(muro) * 0.67)) distinti.push(muro);
    if (distinti.length === 34) break;
  }
  return distinti;
}

function zona(q: Quadro, x: number, y: number, destra: number, fondo: number): ZonaFotoDocumento {
  const sinistra = Math.max(0, Math.min(x / q.larghezza, 0.99));
  const alto = Math.max(0, Math.min(y / q.altezza, 0.99));
  return { x: sinistra, y: alto, larghezza: Math.max(0.002, Math.min(1, destra / q.larghezza) - sinistra),
    altezza: Math.max(0.002, Math.min(1, fondo / q.altezza) - alto) };
}

function propostaTratto(q: Quadro, tipo: TipoTavola, t: Tratto, evidenza?: ZonaFotoDocumento): Proposta {
  const a = punto(t.verticale, t.asse, t.inizio);
  const b = punto(t.verticale, t.asse, t.fine);
  const bordo = Math.max(3, t.spessore / 2);
  const tratto: TrattoTavola = {
    da: { x: a.x / q.larghezza, y: a.y / q.altezza }, a: { x: b.x / q.larghezza, y: b.y / q.altezza },
    spessore: t.spessore / q.larghezza,
  };
  return { tipo, tratto, zona: evidenza ?? zona(q, a.x - bordo, a.y - bordo, b.x + bordo, b.y + bordo) };
}

function inchiostro(q: Quadro, verticale: boolean, asse: number, lungo: number, raggio: number): boolean {
  const { x, y } = punto(verticale, Math.round(asse), Math.round(lungo));
  for (let r = Math.max(y - raggio, 0); r <= Math.min(y + raggio, q.altezza - 1); r++) {
    for (let c = Math.max(x - raggio, 0); c <= Math.min(x + raggio, q.larghezza - 1); c++) {
      if (q.pixel[r * q.larghezza + c]) return true;
    }
  }
  return false;
}

function cercaArco(q: Quadro, asse: number, cardine: number, verso: number, raggio: number, verticale: boolean) {
  const tolleranza = Math.min(4, Math.max(2, Math.round(raggio * 0.06)));
  for (const lato of [-1, 1]) {
    let arco = 0;
    let anta = 0;
    for (let i = 1; i < 10; i++) {
      const angolo = i * Math.PI / 20;
      if (inchiostro(q, verticale, asse + lato * Math.sin(angolo) * raggio, cardine + verso * Math.cos(angolo) * raggio, tolleranza)) arco++;
      if (inchiostro(q, verticale, asse + lato * i * raggio / 10, cardine, tolleranza)) anta++;
    }
    if (arco >= 6 && anta >= 6) return lato;
  }
  return 0;
}

function vetriNellInterruzione(q: Quadro, t: Tratto) {
  const fascia = Math.max(4, Math.min(10, Math.ceil(t.spessore + 1)));
  const sequenze: number[] = [];
  let linea = 0;
  for (let scarto = -fascia; scarto <= fascia + 1; scarto++) {
    let campioni = 0;
    if (scarto <= fascia) for (let i = 2; i < 15; i++) {
      if (inchiostro(q, t.verticale, t.asse + scarto, t.inizio + lunghezza(t) * i / 16, 0)) campioni++;
    }
    if (campioni >= 11) linea++;
    else if (linea) { sequenze.push(linea); linea = 0; }
  }
  return sequenze.filter(spessore => spessore <= 3).length >= 2;
}

/** In uno schizzo i due segni del vetro possono proseguire lungo entrambi i bordi del
 * muro. Cerco il tratto cavo soltanto se è delimitato da penna piena ai due estremi. */
function vetriConBordiContinui(q: Quadro, muri: Tratto[], riferimento: number): Proposta[] {
  const proposte: Proposta[] = [];
  for (const m of muri) {
    const pieno = (i: number) => [-1, 0, 1].filter(d => inchiostro(q, m.verticale, m.asse + d, i, 0)).length >= 2;
    const bordo = (i: number, verso: number) => [2, 3, 4, 5].some(d => inchiostro(q, m.verticale, m.asse + d * verso, i, 0));
    let da = -1;
    for (let i = Math.ceil(m.inizio); i <= Math.floor(m.fine) + 1; i++) {
      const vetro = i <= m.fine && !pieno(i) && bordo(i, -1) && bordo(i, 1);
      if (vetro) {
        if (da < 0) da = i;
        continue;
      }
      if (da < 0) continue;
      const fine = i - 1;
      if (fine - da >= riferimento * .019 && fine - da <= riferimento * .134 && fine - da < lunghezza(m) * .65
        && da - 4 >= m.inizio && fine + 4 <= m.fine && pieno(da - 4) && pieno(fine + 4)) {
        proposte.push(propostaTratto(q, "finestra", { ...m, inizio: da, fine }));
      }
      da = -1;
    }
  }
  return proposte;
}

function varchi(q: Quadro, muri: Tratto[], linee: Tratto[], riferimento: number, schizzo: boolean): Proposta[] {
  const risultati: Proposta[] = [];
  for (const prima of muri) {
    for (const dopo of muri) {
      const ampiezza = dopo.inizio - prima.fine;
      const spessore = Math.min(prima.spessore, dopo.spessore);
      if (ampiezza < riferimento * 0.017 || ampiezza > riferimento * (schizzo ? 0.134 : 0.11)
        || Math.abs(prima.asse - dopo.asse) > Math.max(3, spessore / 2)) continue;
      const t = { ...prima, asse: (prima.asse + dopo.asse) / 2, inizio: prima.fine, fine: dopo.inizio, spessore };
      const battente = cercaArco(q, t.asse, t.inizio, 1, ampiezza, t.verticale)
        || cercaArco(q, t.asse, t.fine, -1, ampiezza, t.verticale);
      if (battente) {
        const a = punto(t.verticale, Math.min(t.asse, t.asse + battente * ampiezza), t.inizio);
        const b = punto(t.verticale, Math.max(t.asse, t.asse + battente * ampiezza), t.fine);
        risultati.push(propostaTratto(q, "porta", t, zona(q, a.x - 3, a.y - 3, b.x + 3, b.y + 3)));
        continue;
      }
      const vetri = linee.filter((l) => Math.abs(l.asse - t.asse) <= spessore * 0.65 + 2
        && sovrapposta(l, t) >= ampiezza * 0.7 && lunghezza(l) < ampiezza * 1.45);
      if (vetri.some((a) => vetri.some((b) => Math.abs(a.asse - b.asse) >= 2)) || schizzo && vetriNellInterruzione(q, t)) {
        risultati.push(propostaTratto(q, "finestra", t));
      }
    }
  }
  return risultati;
}

/** In molte tavole i bordi del muro proseguono lungo il serramento. I due
 * stipiti trasversali e la linea in mezzo delimitano il vano anche lì. */
function finestreNelMuro(q: Quadro, muri: Tratto[], tratti: Tratto[], riferimento: number): Proposta[] {
  const finestre: Proposta[] = [];
  for (const muro of muri) {
    if (muro.spessore < riferimento * 0.006) continue;
    for (const vetro of tratti) {
      const luce = lunghezza(vetro);
      if (luce < riferimento * 0.02 || luce > riferimento * 0.13 || luce >= lunghezza(muro) * 0.8
        || sovrapposta(muro, vetro) < luce * 0.92 || Math.abs(vetro.asse - muro.asse) > muro.spessore * 0.32) continue;
      const stipite = (p: number) => {
        let pieni = 0;
        for (let i = -3; i <= 3; i++) {
          if (inchiostro(q, muro.verticale, muro.asse + i * muro.spessore / 8, p, 2)) pieni++;
        }
        return pieni >= 6;
      };
      if (!stipite(vetro.inizio) || !stipite(vetro.fine)) continue;
      finestre.push(propostaTratto(q, "finestra", { ...muro, inizio: vetro.inizio, fine: vetro.fine }));
    }
  }
  return finestre;
}

function rampe(q: Quadro, tratti: Tratto[], riferimento: number): Proposta[] {
  const gradini = tratti.filter((t) => t.spessore <= 3 && lunghezza(t) >= riferimento * 0.018 && lunghezza(t) <= riferimento * 0.16)
    .sort((a, b) => a.asse - b.asse);
  const sequenze: Array<{ elementi: Tratto[]; asse: number }> = [];
  for (const primo of gradini) {
    const allineati = gradini.filter((l) => l.asse > primo.asse && l.asse <= primo.asse + riferimento * 0.23
      && sovrapposta(primo, l) >= Math.max(lunghezza(l), lunghezza(primo)) * 0.72);
    for (const secondo of allineati) {
      const passo = secondo.asse - primo.asse;
      if (passo < riferimento * 0.005 || passo > riferimento * 0.024) continue;
      const elementi = [primo, secondo];
      for (let atteso = secondo.asse + passo; elementi.length < 24; atteso += passo) {
        const successivo = allineati.find((l) => Math.abs(l.asse - atteso) <= Math.max(1.8, passo * 0.22));
        if (!successivo) break;
        elementi.push(successivo);
      }
      if (elementi.length >= 5) sequenze.push({ elementi, asse: (primo.fine + primo.inizio) / 2 });
    }
  }
  const scale: Proposta[] = [];
  for (const sequenza of sequenze.sort((a, b) => b.elementi.length - a.elementi.length)) {
    const [primo] = sequenza.elementi;
    const ultimo = sequenza.elementi[sequenza.elementi.length - 1];
    const sinistra = punto(primo.verticale, primo.asse, Math.min(...sequenza.elementi.map((t) => t.inizio)));
    const destra = punto(primo.verticale, ultimo.asse, Math.max(...sequenza.elementi.map((t) => t.fine)));
    const evidenza = zona(q, sinistra.x - 3, sinistra.y - 3, destra.x + 3, destra.y + 3);
    if (scale.some((s) => intersezione(s.zona, evidenza) > 0.55)) continue;
    scale.push(propostaTratto(q, "scala", {
      verticale: !primo.verticale, asse: sequenza.asse, inizio: primo.asse, fine: ultimo.asse, spessore: lunghezza(primo),
    }, evidenza));
    if (scale.length === 5) break;
  }
  return scale;
}

function intersezione(a: ZonaFotoDocumento, b: ZonaFotoDocumento) {
  const w = Math.max(0, Math.min(a.x + a.larghezza, b.x + b.larghezza) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.altezza, b.y + b.altezza) - Math.max(a.y, b.y));
  return w * h / Math.min(a.larghezza * a.altezza, b.larghezza * b.altezza);
}

const ETICHETTA_LOCALE = /\b(?:cucina|kitchen|breakfast|soggiorno|living|family\s*(?:room)?|dining|bagno|bath(?:room)?|wc|camera|bedroom|master\s*bed|garage|autorimessa|carport|studio|study|office|foyer|ingresso|hall(?:way)?|corridoio|disimpegno|pantry|dispensa|ripostiglio|storage|lavanderia|laundry|utility|terrace|terrazzo|balcony|balcone|chiostrina|cavedio|closet|wardrobe)\b/i;

export function rilevaSullaTavola(q: Quadro, testi: readonly PlanText[], schizzo = false): ElementoLetturaTavola[] {
  const riferimento = Math.max(q.larghezza, q.altezza);
  const proposte: Proposta[] = [];
  for (const verticale of [false, true]) {
    const tratti = linee(q, verticale, Math.max(8, riferimento * 0.014));
    const muri = muriDalleLinee(tratti, riferimento, schizzo);
    proposte.push(...muri.map((m) => propostaTratto(q, "muro", m)), ...varchi(q, muri, tratti, riferimento, schizzo),
      ...finestreNelMuro(q, muri, tratti, riferimento), ...rampe(q, tratti, riferimento));
    if (schizzo) proposte.push(...vetriConBordiContinui(q, muri, riferimento));
  }
  for (const { text, confidence, bbox } of testi) {
    if (confidence < 0.28 || !ETICHETTA_LOCALE.test(text)) continue;
    const [x, y, w, h] = bbox;
    proposte.push({ tipo: "locale", nome: text.trim().slice(0, 80),
      zona: zona(q, x * q.larghezza - 3, y * q.altezza - 3, (x + w) * q.larghezza + 3, (y + h) * q.altezza + 3) });
  }
  const riconosciute: Proposta[] = [];
  for (const proposta of proposte) {
    if (zonaFotoValida(proposta.zona) && !riconosciute.some((p) => p.tipo === proposta.tipo && intersezione(p.zona, proposta.zona) > 0.67)) riconosciute.push(proposta);
  }
  const contatori = new Map<TipoTavola, number>();
  return riconosciute.slice(0, 180).map((p) => {
    const numero = (contatori.get(p.tipo) ?? 0) + 1;
    contatori.set(p.tipo, numero);
    return { ...p, id: `${p.tipo}-${numero}`, stato: "da_verificare" };
  });
}

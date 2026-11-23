/**
 * Il controllore della disposizione (23/11/2026): regole che una casa deve
 * rispettare e che un modello AI, disegnando da una descrizione, sbaglia —
 * il bagno con la porta che dà fuori, una stanza che non comunica con le altre,
 * una finestra fra due stanze, una stanza più grande di come è stata dettata.
 *
 * È codice, non AI: gratis e ripetibile. I dettagli sono scritti per essere letti
 * dal correttore (il secondo giro del modello) e, se restano, da chi usa la pianta.
 */
import { areaPoligono, distanzaDalContorno } from "./geometria.ts";
import { eAmbienteInterno, type Locale, type Planimetria, type StatoPianta } from "./modello.ts";
import { latiApertura, vaniDiPassaggio } from "./passaggi.ts";

export interface ProblemaDisposizione {
  codice: "senza_ingresso" | "stanza_isolata" | "porta_su_esterno" | "finestra_interna" | "misura_diversa";
  dettaglio: string;
  localeId?: string;
}

/** Stanze dove una porta verso fuori è normale. */
const CON_ACCESSO_DA_FUORI = new Set(["garage", "cantina", "ingresso", "soggiorno", "cucina", "corridoio", "disimpegno", "altro"]);
const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

/** Le stanze che toccano `l` (stanno di là da un muro): a quelle si può aprire una porta. */
function vicine(l: Locale, locali: Locale[]): Locale[] {
  const punti = l.contorno.flatMap((p, i) => { const q = l.contorno[(i + 1) % l.contorno.length]; return [p, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }]; });
  return locali.filter((o) => o.id !== l.id && punti.some((p) => distanzaDalContorno(p, o.contorno) <= 45));
}

export function controllaDisposizioneStato(stato: StatoPianta, nomePiano = "", unPianoSolo = true): ProblemaDisposizione[] {
  const problemi: ProblemaDisposizione[] = [];
  const interni = stato.locali.filter((l) => eAmbienteInterno(l) && !l.aperto && l.contorno.length >= 3);
  // Con più appartamenti (sigle di unità) gli ingressi li verifica il controllo delle unità.
  if (interni.length < 2 || interni.some((l) => l.unita?.trim())) return problemi;
  const idInterni = new Set(interni.map((l) => l.id));
  const nome = new Map(stato.locali.map((l) => [l.id, l.nome]));
  const dove = unPianoSolo ? "" : ` (${nomePiano})`;

  const collegate = new Map(interni.map((l) => [l.id, new Set<string>()]));
  const daFuori = new Set<string>();
  for (const { lati: [a, b] } of vaniDiPassaggio(stato)) {
    const ia = a.filter((id) => idInterni.has(id)), ib = b.filter((id) => idInterni.has(id));
    if (ia.length === 1 && ib.length === 1 && ia[0] !== ib[0]) {
      collegate.get(ia[0])!.add(ib[0]);
      collegate.get(ib[0])!.add(ia[0]);
    } else if (ia.length + ib.length === 1) daFuori.add(ia[0] ?? ib[0]);
  }

  // Da dove si entra: una porta sul perimetro in una stanza adatta, oppure il vano scala.
  const scala = interni.filter((l) => /scal/i.test(l.nome));
  const ingressi = interni.filter((l) => daFuori.has(l.id) && CON_ACCESSO_DA_FUORI.has(l.destinazione));
  const partenze = [...ingressi, ...scala].map((l) => l.id);
  if (!partenze.length) {
    if (unPianoSolo) problemi.push({ codice: "senza_ingresso", dettaglio: "Manca la porta d'ingresso: metti UNA porta sul perimetro esterno, nell'ingresso, nel disimpegno o nel soggiorno." });
    // senza un ingresso certo si parte dalla stanza con più porte
    const centro = [...interni].sort((x, y) => collegate.get(y.id)!.size - collegate.get(x.id)!.size)[0];
    partenze.push(centro.id);
  }
  const raggiunte = new Set(partenze);
  const coda = [...partenze];
  for (let i = 0; i < coda.length; i++) for (const id of collegate.get(coda[i]) ?? []) if (!raggiunte.has(id)) { raggiunte.add(id); coda.push(id); }

  for (const l of interni) {
    if (raggiunte.has(l.id) || l.destinazione === "garage" || l.destinazione === "cantina") continue;
    const accanto = vicine(l, interni).filter((o) => raggiunte.has(o.id));
    const versoDove = accanto.length ? ` Apri la porta su una parete in comune con ${accanto.slice(0, 3).map((o) => `«${o.nome}»`).join(" o ")}.` : " Avvicinala a una stanza di passaggio e apri lì la porta.";
    problemi.push(daFuori.has(l.id)
      ? { codice: "porta_su_esterno", localeId: l.id, dettaglio: `«${l.nome}»${dove} ha la porta che dà sull'esterno e non comunica con il resto della casa: la porta deve essere interna.${versoDove}` }
      : { codice: "stanza_isolata", localeId: l.id, dettaglio: `«${l.nome}»${dove} non comunica con il resto della casa: non ha una porta verso un'altra stanza.${versoDove}` });
  }
  // Bagni e camere raggiungibili da dentro ma con una seconda porta verso fuori.
  for (const l of interni) {
    if (!raggiunte.has(l.id) || !daFuori.has(l.id) || !["bagno", "camera", "ripostiglio", "lavanderia", "studio"].includes(l.destinazione)) continue;
    problemi.push({ codice: "porta_su_esterno", localeId: l.id, dettaglio: `«${l.nome}»${dove} ha una porta che dà sull'esterno: toglila (se è una portafinestra su un balcone, usa il tipo portafinestra e disegna il balcone).` });
  }

  const muri = new Map(stato.muri.map((m) => [m.id, m]));
  for (const a of stato.aperture) {
    if (a.tipo !== "finestra" || a.stato === "da_demolire") continue;
    const muro = muri.get(a.muroId);
    if (!muro) continue;
    const { lati: [x, y] } = latiApertura(stato, a, muro);
    const ix = x.filter((id) => idInterni.has(id)), iy = y.filter((id) => idInterni.has(id));
    if (ix.length && iy.length && ix[0] !== iy[0]) {
      problemi.push({ codice: "finestra_interna", localeId: ix[0], dettaglio: `Una finestra${dove} sta fra «${nome.get(ix[0])}» e «${nome.get(iy[0])}»: le finestre vanno solo sui muri verso l'esterno.` });
    }
  }
  return problemi;
}

export interface MisuraAttesa { nome: string; mq: number; piano?: string }

/** Controlla ogni piano dello stato di fatto; `attese` sono le superfici dettate dall'utente. */
export function controllaDisposizione(p: Planimetria, attese: readonly MisuraAttesa[] = []): ProblemaDisposizione[] {
  const problemi = p.livelli.flatMap((l) => controllaDisposizioneStato(l.fatto, l.nome, p.livelli.length === 1));
  const chiave = (s: string) => s.trim().toLocaleLowerCase("it-IT");
  for (const a of attese) {
    if (!(a.mq > 0)) continue;
    const livelli = p.livelli.filter((l) => !a.piano || chiave(l.nome) === chiave(a.piano) || p.livelli.length === 1);
    const locale = livelli.flatMap((l) => l.fatto.locali).find((l) => chiave(l.nome) === chiave(a.nome));
    if (!locale || locale.contorno.length < 3) continue;
    const mq = areaPoligono(locale.contorno) / 10_000;
    if (Math.abs(mq - a.mq) / a.mq > 0.1) {
      problemi.push({ codice: "misura_diversa", localeId: locale.id, dettaglio: `«${locale.nome}» deve misurare ${fmt(a.mq)} m² come nella descrizione, ma il contorno ne dà ${fmt(mq)}: rispetta i lati dettati e sistema le stanze vicine, non questa.` });
    }
  }
  return problemi;
}

/**
 * Il riparatore degli accessi (24/11/2026). Dove il controllore trova una stanza che non
 * comunica con il resto della casa, qui si apre — a codice, senza AI — una porta interna
 * sulla parete che la stanza ha in comune con una stanza di passaggio già raggiungibile.
 *
 * Nasce dalle prove dal vivo: su descrizioni vaghe («trilocale di 85 m² con…») il modello
 * lascia stanze senza porta o con la porta verso uno spazio che non ha disegnato, e il suo
 * secondo giro spesso non migliora. Una porta su una parete in comune è geometria, non
 * interpretazione: si può fare giusta ogni volta.
 *
 * Cosa NON fa, di proposito: non fa passare da un bagno, un ripostiglio o una lavanderia
 * per raggiungere un'altra stanza, non apre un bagno sulla cucina (né su un soggiorno con cucina: serve un antibagno), non sposta le stanze.
 * Quello che non si può riparare così resta un difetto detto all'utente.
 */
import { controllaDisposizioneStato } from "./controlloDisposizione.ts";
import { assiDelMuro, lunghezzaMuro } from "./geometria.ts";
import { eAmbienteInterno, type Apertura, type Locale, type Muro, type StatoPianta } from "./modello.ts";
import { latiApertura, vaniDiPassaggio } from "./passaggi.ts";

const LARGHEZZA_PORTA = 80;
const TRATTO_MINIMO = 100;
/** Da qui non si passa per andare altrove. */
const SENZA_PASSAGGIO = new Set(["bagno", "ripostiglio", "lavanderia", "garage", "cantina"]);
/** Da dove conviene entrare in una stanza, in ordine. */
const ORDINE_PASSAGGIO = ["disimpegno", "corridoio", "ingresso", "soggiorno", "studio", "cucina", "altro", "camera"];

export interface PortaAggiunta { id: string; fra: [string, string] }
export interface EsitoRiparazione { stato: StatoPianta; aggiunte: PortaAggiunta[]; tolte: string[] }

/** I tratti di `locale` che corrono lungo il muro, per lato: [inizio, fine] lungo l'asse del muro. */
function trattiSulMuro(l: Locale, m: Muro): { lato: 1 | -1; da: number; a: number }[] {
  const { dir, normale } = assiDelMuro(m);
  const lunghezza = lunghezzaMuro(m);
  const tratti: { lato: 1 | -1; da: number; a: number }[] = [];
  l.contorno.forEach((p, i) => {
    const q = l.contorno[(i + 1) % l.contorno.length];
    const dp = (p.x - m.p1.x) * normale.x + (p.y - m.p1.y) * normale.y, dq = (q.x - m.p1.x) * normale.x + (q.y - m.p1.y) * normale.y;
    if (Math.abs(dp - dq) > 1 || Math.abs(dp) > m.spessore / 2 + 8 || Math.abs(dp) < 0.5) return;
    const tp = (p.x - m.p1.x) * dir.x + (p.y - m.p1.y) * dir.y, tq = (q.x - m.p1.x) * dir.x + (q.y - m.p1.y) * dir.y;
    const da = Math.max(0, Math.min(tp, tq)), a = Math.min(lunghezza, Math.max(tp, tq));
    if (a - da >= TRATTO_MINIMO) tratti.push({ lato: dp > 0 ? 1 : -1, da, a });
  });
  return tratti;
}

/** Una porta sulla parete che le due stanze hanno in comune; null se non ce n'è una libera di almeno un metro. */
export function portaFra(stato: StatoPianta, a: Locale, b: Locale, id: string): Apertura | null {
  for (const m of stato.muri) {
    if (m.stato === "da_demolire" || m.tipo === "esterno") continue;
    const ta = trattiSulMuro(a, m), tb = trattiSulMuro(b, m);
    for (const x of ta) for (const y of tb) {
      if (x.lato === y.lato) continue;
      const da = Math.max(x.da, y.da), fine = Math.min(x.a, y.a);
      if (fine - da < TRATTO_MINIMO) continue;
      const occupate = stato.aperture.filter((o) => o.muroId === m.id && o.stato !== "da_demolire").map((o) => [o.offset - 10, o.offset + o.larghezza + 10]);
      // dal centro del tratto verso i bordi, il primo posto libero
      const centro = (da + fine) / 2 - LARGHEZZA_PORTA / 2;
      const posti = [centro, da + 10, fine - 10 - LARGHEZZA_PORTA].filter((o) => o >= da + 5 && o + LARGHEZZA_PORTA <= fine - 5);
      const offset = posti.find((o) => occupate.every(([i, f]) => o + LARGHEZZA_PORTA <= i || o >= f));
      if (offset === undefined) continue;
      const porta = { id, muroId: m.id, tipo: "porta", offset: Math.round(offset), larghezza: LARGHEZZA_PORTA, altezza: 210, davanzale: 0,
        manovra: "battente", stato: "esistente", origine: "stimata" } as Apertura;
      // la porta deve davvero unire le due stanze, viste come le vede il controllore
      const { lati: [l1, l2] } = latiApertura(stato, porta, m);
      if ((l1.includes(a.id) && l2.includes(b.id)) || (l1.includes(b.id) && l2.includes(a.id))) return porta;
    }
  }
  return null;
}

const nonCollegate = (stato: StatoPianta) => controllaDisposizioneStato(stato)
  .filter((p) => p.localeId && (p.codice === "stanza_isolata" || (p.codice === "porta_su_esterno" && p.dettaglio.includes("non comunica"))));

/** Apre le porte interne che mancano e toglie quelle di bagni e camere che danno fuori. */
export function riparaAccessi(statoIniziale: StatoPianta): EsitoRiparazione {
  let stato = statoIniziale;
  const aggiunte: PortaAggiunta[] = [], tolte: string[] = [];
  const nome = new Map(stato.locali.map((l) => [l.id, l.nome]));
  const interni = stato.locali.filter((l) => eAmbienteInterno(l) && !l.aperto && l.contorno.length >= 3);
  if (interni.some((l) => l.unita?.trim())) return { stato, aggiunte, tolte };
  let n = stato.aperture.length;
  for (let giro = 0; giro < 12; giro++) {
    const isolate = nonCollegate(stato);
    if (!isolate.length) break;
    const idIsolate = new Set(isolate.map((p) => p.localeId));
    let fatto = false;
    for (const problema of isolate) {
      const stanza = interni.find((l) => l.id === problema.localeId);
      if (!stanza) continue;
      const da = interni
        .filter((o) => o.id !== stanza.id && !idIsolate.has(o.id) && !SENZA_PASSAGGIO.has(o.destinazione) && !(stanza.destinazione === "bagno" && (o.destinazione === "cucina" || /cucina|cottura/i.test(o.nome))))
        .sort((x, y) => (ORDINE_PASSAGGIO.indexOf(x.destinazione) + 99) % 99 - (ORDINE_PASSAGGIO.indexOf(y.destinazione) + 99) % 99);
      for (const o of da) {
        const porta = portaFra(stato, stanza, o, `r${++n}`);
        if (!porta) continue;
        const prova = { ...stato, aperture: [...stato.aperture, porta] };
        if (nonCollegate(prova).length >= isolate.length) continue;
        stato = prova;
        aggiunte.push({ id: porta.id, fra: [nome.get(stanza.id) ?? "", nome.get(o.id) ?? ""] });
        fatto = true;
        break;
      }
      if (fatto) break; // la casa è cambiata: si ricontrolla da capo
    }
    if (!fatto) break;
  }
  // Bagni, camere e ripostigli ora raggiungibili da dentro non tengono una porta verso fuori.
  const conPortaFuori = new Set(controllaDisposizioneStato(stato).filter((p) => p.codice === "porta_su_esterno" && !p.dettaglio.includes("non comunica")).map((p) => p.localeId));
  if (conPortaFuori.size) {
    const daTogliere = new Set(vaniDiPassaggio(stato).filter(({ apertura, lati: [x, y] }) => apertura.tipo === "porta"
      && ((!x.length && y.length === 1 && conPortaFuori.has(y[0])) || (!y.length && x.length === 1 && conPortaFuori.has(x[0])))).map((v) => v.apertura.id));
    if (daTogliere.size) {
      tolte.push(...daTogliere);
      stato = { ...stato, aperture: stato.aperture.filter((a) => !daTogliere.has(a.id)) };
    }
  }
  return { stato, aggiunte, tolte };
}

/** Tutti i piani dello stato di fatto. Restituisce la pianta riparata e cosa è cambiato, in parole. */
export function riparaAccessiPianta<T extends { livelli: { fatto: StatoPianta }[] }>(p: T): { pianta: T; nota: string | null } {
  const aggiunte: PortaAggiunta[] = [], tolte: string[] = [];
  const livelli = p.livelli.map((l) => {
    const esito = riparaAccessi(l.fatto);
    aggiunte.push(...esito.aggiunte); tolte.push(...esito.tolte);
    return esito.stato === l.fatto ? l : { ...l, fatto: esito.stato };
  });
  if (!aggiunte.length && !tolte.length) return { pianta: p, nota: null };
  const porte = aggiunte.map((a) => `${a.fra[0]}–${a.fra[1]}`).join(", ");
  const nota = [
    aggiunte.length ? `Ho aperto ${aggiunte.length === 1 ? "una porta interna che mancava" : `${aggiunte.length} porte interne che mancavano`} (${porte})` : "",
    tolte.length ? `${aggiunte.length ? "e tolto" : "Ho tolto"} ${tolte.length === 1 ? "una porta che dava" : `${tolte.length} porte che davano`} verso l'esterno da bagni o camere` : "",
  ].filter(Boolean).join(" ") + ": controllale nell'editor.";
  return { pianta: { ...p, livelli }, nota };
}

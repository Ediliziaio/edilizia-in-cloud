/**
 * Render AI dalla pianta (fase 5b): ciò che la pianta dice di una stanza e che il
 * render deve rispettare — misure, pareti numerate, porte e finestre con la loro
 * posizione.
 *
 * Puro e senza dipendenze: lo usano il browser (pianta della stanza da allegare,
 * riepilogo per l'utente) e `generate-room-render` (Deno), che rilegge la pianta dal
 * database e non si fida delle misure mandate dal browser.
 *
 * Convenzioni del modello (docs/planimetrie/modello.md): centimetri, y verso l'alto,
 * locale al filo interno delle pareti, aperture misurate sull'asse del muro dal p1.
 */
import { apertureDelLocale, areaPoligono, assiDelMuro, perimetroPoligono, proiezioneSulSegmento, distanza, areaConSegno } from "../planimetrie/geometria.ts";
import { origineMisura, statoDelLivello, type Apertura, type Locale, type Planimetria, type Punto, type StatoPianta, type TipoApertura } from "../planimetrie/modello.ts";

/** Quale stanza di quale pianta: si salva nella sessione del render (`config.planimetria`). */
export interface RiferimentoStanza {
  planimetria_id: string;
  versione: number;
  livello_id: string;
  /** «fatto» oppure «progetto:<id proposta>». */
  ambito: string;
  locale_id: string;
}

export interface PareteStanza {
  /** 1, 2, 3… nel giro della stanza (antiorario visto dall'alto). */
  numero: number;
  da: Punto;
  a: Punto;
  lunghezza_cm: number;
}

export interface AperturaStanza {
  id: string;
  tipo: TipoApertura;
  /** «Porta 1», «Finestra 2»: lo stesso nome sulla pianta allegata, nel prompt e nel riepilogo. */
  etichetta: string;
  /** Lo stesso nome in inglese, per il modello immagine. */
  label: string;
  larghezza_cm: number;
  altezza_cm: number;
  davanzale_cm: number;
  parete: number;
  /** Dall'inizio della parete (nel giro della stanza) al bordo del vano. */
  da_inizio_parete_cm: number;
  /** Misure stimate dall'AI e non confermate da una persona. */
  stimata: boolean;
}

export interface VincoliStanza {
  locale: {
    id: string;
    nome: string;
    destinazione: string;
    superficie_mq: number;
    perimetro_m: number;
    altezza_cm: number;
    /** Lati del rettangolo che contiene la stanza (per una stanza rettangolare, le sue misure). */
    larghezza_cm: number;
    profondita_cm: number;
    rettangolare: boolean;
    stimata: boolean;
  };
  /** Contorno al filo interno, antiorario, in cm (y verso l'alto). */
  contorno: Punto[];
  pareti: PareteStanza[];
  aperture: AperturaStanza[];
}

const NOMI: Record<TipoApertura, [string, string]> = {
  porta: ["Porta", "Door"],
  finestra: ["Finestra", "Window"],
  portafinestra: ["Portafinestra", "French window"],
  varco: ["Passaggio", "Open passage"],
};

const arrotonda = (x: number, cifre = 2) => Math.round(x * 10 ** cifre) / 10 ** cifre;

/** Lo stato (fatto o proposta) di un livello per la chiave dell'ambito. */
export function statoPerAmbito(p: Planimetria, livelloId: string, ambito: string): StatoPianta | null {
  const livello = p.livelli.find((l) => l.id === livelloId);
  if (!livello) return null;
  const propostaId = ambito === "fatto" ? null : ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : undefined;
  if (propostaId === undefined) return null;
  return statoDelLivello(livello, { chiave: ambito, nome: "", propostaId });
}

function stimato(l: Locale): boolean {
  return origineMisura(l, "contorno") === "stimata" || origineMisura(l, "altezza") === "stimata";
}

function aperturaStimata(a: Apertura): boolean {
  return ["larghezza", "altezza", "offset", "davanzale"].some((c) => origineMisura(a, c as "larghezza") === "stimata");
}

/** Rettangolo che contiene il contorno, allineato al lato più lungo (per una L dà l'ingombro). */
function ingombro(contorno: Punto[]): { larghezza: number; profondita: number } {
  let migliore = { larghezza: 0, profondita: 0, area: Infinity };
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i];
    const b = contorno[(i + 1) % contorno.length];
    const l = distanza(a, b);
    if (l < 1e-6) continue;
    const ux = (b.x - a.x) / l;
    const uy = (b.y - a.y) / l;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of contorno) {
      const u = p.x * ux + p.y * uy;
      const v = -p.x * uy + p.y * ux;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < migliore.area - 1e-6) migliore = { larghezza: maxU - minU, profondita: maxV - minV, area };
  }
  const [lato1, lato2] = [migliore.larghezza, migliore.profondita].sort((x, y) => y - x);
  return { larghezza: lato1, profondita: lato2 };
}

/**
 * I vincoli di una stanza, o null se la stanza non c'è in quello stato della pianta.
 * Le pareti partono dal lato più in basso della pianta e girano in senso antiorario.
 */
export function vincoliDellaStanza(p: Planimetria, rif: Pick<RiferimentoStanza, "livello_id" | "ambito" | "locale_id">): VincoliStanza | null {
  const stato = statoPerAmbito(p, rif.livello_id, rif.ambito);
  const locale = stato?.locali.find((l) => l.id === rif.locale_id);
  if (!stato || !locale || locale.contorno.length < 3) return null;

  // Antiorario, partendo dal lato più in basso (a parità, più a sinistra): l'ordine
  // non dipende da come è stato disegnato il contorno.
  let contorno = areaConSegno(locale.contorno) < 0 ? [...locale.contorno].reverse() : [...locale.contorno];
  let inizio = 0;
  for (let i = 1; i < contorno.length; i++) {
    const c = contorno[i], s = contorno[inizio];
    const nc = contorno[(i + 1) % contorno.length], ns = contorno[(inizio + 1) % contorno.length];
    const yc = (c.y + nc.y) / 2, ys = (s.y + ns.y) / 2;
    if (yc < ys - 0.5 || (Math.abs(yc - ys) <= 0.5 && Math.min(c.x, nc.x) < Math.min(s.x, ns.x))) inizio = i;
  }
  contorno = [...contorno.slice(inizio), ...contorno.slice(0, inizio)];

  const pareti: PareteStanza[] = contorno.map((da, i) => {
    const a = contorno[(i + 1) % contorno.length];
    return { numero: i + 1, da, a, lunghezza_cm: arrotonda(distanza(da, a), 1) };
  });

  const muri = new Map(stato.muri.map((m) => [m.id, m]));
  const contatori: Partial<Record<TipoApertura, number>> = {};
  const aperture: AperturaStanza[] = [];
  const trovate = apertureDelLocale(locale, stato)
    .map((ap) => {
      const muro = muri.get(ap.muroId)!;
      const { dir } = assiDelMuro(muro);
      const centro = { x: muro.p1.x + dir.x * (ap.offset + ap.larghezza / 2), y: muro.p1.y + dir.y * (ap.offset + ap.larghezza / 2) };
      let parete = pareti[0];
      let t = 0;
      let dMin = Infinity;
      for (const pr of pareti) {
        const pj = proiezioneSulSegmento(centro, pr.da, pr.a);
        const d = distanza(centro, pj.punto);
        if (d < dMin) { dMin = d; parete = pr; t = pj.t; }
      }
      return { ap, parete, lungo: t * parete.lunghezza_cm };
    })
    // In ordine di parete e poi lungo la parete: «Finestra 1» è la prima che si incontra.
    .sort((x, y) => x.parete.numero - y.parete.numero || x.lungo - y.lungo);
  for (const { ap, parete, lungo } of trovate) {
    const n = (contatori[ap.tipo] = (contatori[ap.tipo] ?? 0) + 1);
    const [it, en] = NOMI[ap.tipo];
    aperture.push({
      id: ap.id,
      tipo: ap.tipo,
      etichetta: `${it} ${n}`,
      label: `${en} ${n}`,
      larghezza_cm: ap.larghezza,
      altezza_cm: ap.altezza,
      davanzale_cm: ap.davanzale,
      parete: parete.numero,
      da_inizio_parete_cm: Math.max(0, arrotonda(lungo - ap.larghezza / 2, 0)),
      stimata: aperturaStimata(ap),
    });
  }

  const box = ingombro(contorno);
  const superficie = areaPoligono(contorno) / 10_000;
  return {
    locale: {
      id: locale.id,
      nome: locale.nome,
      destinazione: locale.destinazione,
      superficie_mq: arrotonda(superficie),
      perimetro_m: arrotonda(perimetroPoligono(contorno) / 100),
      altezza_cm: locale.altezza,
      larghezza_cm: arrotonda(box.larghezza, 0),
      profondita_cm: arrotonda(box.profondita, 0),
      rettangolare: Math.abs(box.larghezza * box.profondita / 10_000 - superficie) < 0.02 * superficie + 0.01,
      stimata: stimato(locale),
    },
    contorno,
    pareti,
    aperture,
  };
}

/** Misura in metri all'italiana: 420 → «4,20 m». */
export function metri(cm: number): string {
  return `${(cm / 100).toFixed(2).replace(".", ",")} m`;
}

/** Riepilogo in parole semplici, per l'utente: «4,20 × 3,10 m, alta 2,70 m · 13,02 mq · 1 porta, 2 finestre». */
export function riepilogoStanza(v: VincoliStanza): string {
  const l = v.locale;
  const misure = l.rettangolare ? `${metri(l.larghezza_cm).replace(" m", "")} × ${metri(l.profondita_cm)}` : `circa ${metri(l.larghezza_cm).replace(" m", "")} × ${metri(l.profondita_cm)}`;
  const conta = (t: TipoApertura, uno: string, tanti: string) => {
    const n = v.aperture.filter((a) => a.tipo === t).length;
    return n === 0 ? null : `${n} ${n === 1 ? uno : tanti}`;
  };
  const vani = [conta("porta", "porta", "porte"), conta("portafinestra", "portafinestra", "portefinestre"), conta("finestra", "finestra", "finestre"), conta("varco", "passaggio", "passaggi")].filter(Boolean);
  return [`${misure}, alta ${metri(l.altezza_cm)}`, `${l.superficie_mq.toFixed(2).replace(".", ",")} mq`, vani.length ? vani.join(", ") : "nessuna porta o finestra"].join(" · ");
}

/**
 * Planimetrie — controllo geometrico. Nessuna pianta si salva da un'AI o da
 * un'importazione senza essere passata di qui (vedi docs/planimetrie/modello.md).
 *
 * - errore: la pianta è rotta, le quantità non sono affidabili;
 * - avviso: qualcosa di strano che può essere voluto (un muretto libero).
 * I messaggi sono per il titolare d'impresa: parole semplici, niente gergo.
 */
import {
  ambitiDi,
  statoDelLivello,
  validaPlanimetria,
  type Ambito,
  type Livello,
  type Muro,
  type Planimetria,
  type StatoPianta,
} from "./modello.ts";
import {
  TOLLERANZA_CM,
  apertureDelLocale,
  areaPoligono,
  assiDelMuro,
  contornoIncrociato,
  distanza,
  distanzaPuntoSegmento,
  lunghezzaMuro,
  puntoInterno,
  puntoNelPoligono,
  ricostruisciLocali,
} from "./geometria.ts";

export type CodiceProblema =
  | "forma_non_valida"
  | "parete_senza_lunghezza"
  | "parete_staccata"
  | "pareti_sovrapposte"
  | "locale_senza_area"
  | "locale_contorno_incrociato"
  | "locale_non_chiuso"
  | "apertura_senza_parete"
  | "apertura_fuori_parete"
  | "aperture_sovrapposte"
  | "apertura_troppo_alta"
  | "apertura_senza_locale";

export interface Problema {
  gravita: "errore" | "avviso";
  codice: CodiceProblema;
  messaggio: string;
  /** Assenti solo per `forma_non_valida`. */
  livelloId?: string;
  /** «fatto» o «progetto:<id>». */
  ambito?: string;
  /** L'oggetto da evidenziare nell'editor. */
  oggettoId?: string;
}

/** Tutti i problemi della pianta, in tutti i livelli e in tutti gli stati. */
export function controllaPlanimetria(p: Planimetria): Problema[] {
  const forma = validaPlanimetria(p);
  if (!forma.ok) return forma.errori.map(messaggio => ({ gravita: "errore", codice: "forma_non_valida", messaggio }));

  const problemi: Problema[] = [];
  for (const livello of p.livelli) {
    for (const ambito of ambitiDi(p)) {
      const stato = statoDelLivello(livello, ambito);
      if (stato) controllaStato(stato, livello, ambito, problemi);
    }
  }
  return problemi;
}

/** Vero se fra i problemi c'è almeno un errore. */
export const haErrori = (problemi: Problema[]) => problemi.some(pr => pr.gravita === "errore");

function controllaStato(stato: StatoPianta, livello: Livello, ambito: Ambito, out: Problema[]) {
  const dove = { livelloId: livello.id, ambito: ambito.chiave };
  const errore = (codice: CodiceProblema, oggettoId: string, messaggio: string) => out.push({ gravita: "errore", codice, messaggio, oggettoId, ...dove });
  const avviso = (codice: CodiceProblema, oggettoId: string, messaggio: string) => out.push({ gravita: "avviso", codice, messaggio, oggettoId, ...dove });
  const metri = (cm: number) => `${(cm / 100).toLocaleString("it-IT", { maximumFractionDigits: 2 })} m`;

  // ─── Pareti ───
  const muriBuoni: Muro[] = [];
  for (const m of stato.muri) {
    if (lunghezzaMuro(m) <= TOLLERANZA_CM) errore("parete_senza_lunghezza", m.id, "Una parete ha lunghezza zero: allungala o cancellala.");
    else muriBuoni.push(m);
  }

  for (const m of muriBuoni) {
    const altri = muriBuoni.filter(o => o !== m);
    const attaccato = (capo: typeof m.p1) =>
      altri.some(o => distanzaPuntoSegmento(capo, o.p1, o.p2) <= o.spessore / 2 + TOLLERANZA_CM);
    if (altri.length && (!attaccato(m.p1) || !attaccato(m.p2))) {
      avviso("parete_staccata", m.id, `Una parete lunga ${metri(lunghezzaMuro(m))} ha un capo che non tocca nessun'altra parete.`);
    }
  }

  for (let i = 0; i < muriBuoni.length; i++) {
    for (let j = i + 1; j < muriBuoni.length; j++) {
      if (sovrapposizione(muriBuoni[i], muriBuoni[j]) > TOLLERANZA_CM) {
        errore("pareti_sovrapposte", muriBuoni[j].id, "Due pareti sono disegnate una sopra l'altra: cancellane una.");
      }
    }
  }

  // ─── Locali ───
  const ricostruiti = muriBuoni.length ? ricostruisciLocali(muriBuoni) : [];
  for (const l of stato.locali) {
    if (areaPoligono(l.contorno) <= TOLLERANZA_CM * TOLLERANZA_CM) {
      errore("locale_senza_area", l.id, `Il locale «${l.nome}» non ha superficie: controlla il contorno.`);
      continue;
    }
    if (contornoIncrociato(l.contorno)) {
      errore("locale_contorno_incrociato", l.id, `Il contorno del locale «${l.nome}» si incrocia: ridisegnalo seguendo le pareti.`);
      continue;
    }
    // Senza pareti (stanze a riquadri da un sopralluogo) non c'è niente da confrontare.
    const dentro = puntoInterno(l.contorno);
    if (muriBuoni.length && dentro && !ricostruiti.some(r => puntoNelPoligono(dentro, r.contorno))) {
      avviso("locale_non_chiuso", l.id, `Il locale «${l.nome}» non è chiuso da pareti.`);
    }
  }

  // ─── Aperture ───
  const perMuro = new Map(stato.muri.map(m => [m.id, m]));
  const nome = (tipo: string) => ({ porta: "Una porta", finestra: "Una finestra", portafinestra: "Una portafinestra", varco: "Un varco" }[tipo] ?? "Un'apertura");
  const valide: typeof stato.aperture = [];
  for (const a of stato.aperture) {
    const m = perMuro.get(a.muroId);
    if (!m) { errore("apertura_senza_parete", a.id, `${nome(a.tipo)} non è su nessuna parete.`); continue; }
    if (a.offset + a.larghezza > lunghezzaMuro(m) + TOLLERANZA_CM) {
      errore("apertura_fuori_parete", a.id, `${nome(a.tipo)} esce dalla parete: la parete è lunga ${metri(lunghezzaMuro(m))}.`);
      continue;
    }
    if (a.davanzale + a.altezza > m.altezza + TOLLERANZA_CM) {
      avviso("apertura_troppo_alta", a.id, `${nome(a.tipo)} è più alta della parete (${metri(m.altezza)}).`);
    }
    const sovrapposta = valide.find(b => b.muroId === a.muroId && a.offset < b.offset + b.larghezza && b.offset < a.offset + a.larghezza);
    if (sovrapposta) { errore("aperture_sovrapposte", a.id, `${nome(a.tipo)} si sovrappone a un'altra apertura nella stessa parete.`); continue; }
    valide.push(a);
  }
  if (stato.locali.length) {
    const servite = new Set(stato.locali.flatMap(l => apertureDelLocale(l, stato).map(a => a.id)));
    for (const a of valide) {
      if (a.stato === "da_demolire" || perMuro.get(a.muroId)!.stato === "da_demolire") continue;
      if (!servite.has(a.id)) avviso("apertura_senza_locale", a.id, `${nome(a.tipo)} non dà su nessun locale.`);
    }
  }
}

/** Lunghezza in comune di due pareti allineate (0 se non sono sulla stessa retta). */
function sovrapposizione(a: Muro, b: Muro): number {
  const { dir } = assiDelMuro(a);
  const { dir: dirB } = assiDelMuro(b);
  if (Math.abs(dir.x * dirB.y - dir.y * dirB.x) > 1e-6) return 0;
  const sullaRetta = (p: typeof a.p1) => Math.abs((p.x - a.p1.x) * dir.y - (p.y - a.p1.y) * dir.x) <= TOLLERANZA_CM;
  if (!sullaRetta(b.p1) || !sullaRetta(b.p2)) return 0;
  const t = (p: typeof a.p1) => (p.x - a.p1.x) * dir.x + (p.y - a.p1.y) * dir.y;
  const [b1, b2] = [t(b.p1), t(b.p2)].sort((x, y) => x - y);
  return Math.min(distanza(a.p1, a.p2), b2) - Math.max(0, b1);
}

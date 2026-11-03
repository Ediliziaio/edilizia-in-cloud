/**
 * Tutto l'edificio in 3D: i piani della pianta uno sopra l'altro, ognuno alla sua quota
 * (interrati sotto zero, sottotetto in cima). Ogni piano si costruisce come da solo e poi si
 * alza; gli id delle mesh prendono il piano davanti, così non si scontrano.
 *
 * «Esploso» stacca i piani di qualche metro per vedere dentro a ognuno; «fino a» toglie
 * quelli sopra, come sollevare il tetto e i solai.
 */
import type { Planimetria } from "../../../../shared/planimetrie/modello.ts";
import { pianteDaPlanimetria } from "./adattatore";
import { costruisciScena, limitiDi, meshTerreno } from "./scena";
import { MATERIALI } from "./materiali";
import { modelloElemento } from "./elementi";
import { CostruttoreMesh } from "./costruttore";
import type { Mesh3D, OpzioniScena, PiantaPer3D, Scena3D } from "./tipi";

export interface PianoPer3D {
  id: string;
  nome: string;
  /** Quota del pavimento, in cm (negativa per gli interrati). */
  quota: number;
  piante: { fatto: PiantaPer3D; progetto: PiantaPer3D };
}

/** I piani dal più basso al più alto, con la proposta scelta su ognuno (se ce l'ha). */
export function pianiDaPlanimetria(doc: Planimetria, propostaId?: string): PianoPer3D[] {
  return [...doc.livelli]
    .sort((a, b) => a.quota - b.quota)
    .map((l) => {
      const p = pianteDaPlanimetria(doc, { livelloId: l.id, propostaId: l.proposte.some((x) => x.id === propostaId) ? propostaId : undefined });
      return { id: l.id, nome: l.nome, quota: l.quota, piante: { fatto: p.fatto, progetto: p.progetto } };
    });
}

export interface OpzioniEdificio extends OpzioniScena {
  /** Metri in più fra un piano e l'altro (0 = come è davvero). */
  esploso?: number;
  /** Si mostrano i piani fino a questo (compreso); quelli sopra no. */
  finoA?: string;
}

const MARGINE_BUCO_CM = 6;
const PASSANTI = ["scala", "scala_u", "scala_chiocciola", "ascensore"];

/** L'ingombro (ruotato) di scale e ascensori di un piano, un po' allargato: da lì passa il solaio bucato. */
function ingombriPassanti(p: PiantaPer3D): Array<Array<{ x: number; y: number }>> {
  return p.elementi.filter((e) => PASSANTI.includes(e.tipo)).map((e) => {
    const m = modelloElemento(e.tipo).misure;
    const l = (e.larghezza ?? m.l * 100) / 2 + MARGINE_BUCO_CM, pr = (e.profondita ?? m.p * 100) / 2 + MARGINE_BUCO_CM;
    const a = (e.rotazione * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    return [[-l, -pr], [l, -pr], [l, pr], [-l, pr]].map(([dx, dz]) => ({ x: e.centro.x + dx * c - dz * sn, y: e.centro.y + dx * sn + dz * c }));
  });
}

export function scenaEdificio(piani: PianoPer3D[], opzioni: OpzioniEdificio = {}): Scena3D {
  const vista = opzioni.vista ?? "progetto";
  const fino = opzioni.finoA ? piani.findIndex((p) => p.id === opzioni.finoA) : -1;
  const scelti = fino >= 0 ? piani.slice(0, fino + 1) : piani;
  const mesh: Mesh3D[] = [];
  const materiali: Scena3D["materiali"] = {};
  const avvisi: string[] = [];
  const impiantiTot = new Map<string, { linea: string; nome: string; colore: string; metri: number }>();
  const pianteDi = (p: PianoPer3D) => (vista === "fatto" ? p.piante.fatto : p.piante.progetto);
  // la cabina dell'ascensore sta al piano terra (quota 0, o il più basso se non c'è)
  const pianoCabina = scelti.find((p) => p.quota === 0)?.id ?? scelti[0]?.id;
  scelti.forEach((piano, i) => {
    const base0 = pianteDi(piano);
    const base = { ...base0, elementi: base0.elementi.map((e) => (e.tipo === "ascensore" && piano.id !== pianoCabina ? { ...e, senzaCabina: true } : e)) };
    // le pareti arrivano fino al piano sopra (lo spessore del solaio): senza, da fuori fra un
    // piano e l'altro resterebbe una fessura
    const sopra = scelti[i + 1];
    const fino = sopra ? sopra.quota - piano.quota : 0;
    // pareti fino al piano sopra; la scala e il vano ascensore salgono fino al pavimento del piano sopra (non 2,80 fissi)
    const pianta = fino > 0
      ? { ...base, muri: base.muri.map((m) => ({ ...m, altezza: Math.max(m.altezza, fino) })), elementi: base.elementi.map((e) => (PASSANTI.includes(e.tipo) || e.tipo === "pilastro" ? { ...e, altezza: fino } : e.tipo === "trave" || e.tipo === "solaio" ? { ...e, interpiano: fino } : e)) }
      : base;
    // il tetto solo sull'ultimo piano mostrato (con «fino a» si scoperchia)
    const conTetto = i === scelti.length - 1 ? pianta : { ...pianta, tetto: undefined };
    // la scala e l'ascensore del piano sotto bucano il pavimento, quelli di questo piano il soffitto (se c'è un piano sopra)
    const buchiPavimento = i > 0 ? ingombriPassanti(pianteDi(scelti[i - 1])) : [];
    const buchiSoffitto = sopra ? ingombriPassanti(base) : [];
    const s = costruisciScena(conTetto, { ...opzioni, terreno: undefined, foroScala: i > 0, zoccolo: piano.id === pianoCabina && opzioni.zoccolo !== false, buchiPavimento, buchiSoffitto, fondazioni: !!opzioni.fondazioni && i === 0 });
    // un attico o un duplex ai piani alti: sotto c'è il resto dell'edificio, in grigio
    if (i === 0 && piano.quota > 100) {
      const l = limitiDi(s.mesh, (g) => g === "muro");
      if (Number.isFinite(l.min[0])) {
        const c = new CostruttoreMesh();
        c.scatola((l.min[0] + l.max[0]) / 2, (l.min[2] + l.max[2]) / 2, 0, l.max[0] - l.min[0], l.max[2] - l.min[2], piano.quota / 100, 0);
        mesh.push(c.mesh({ id: "edificio-sotto", nome: "Edificio (piani sotto)", genere: "muro", materiale: "massa", riferimento: "edificio" }));
        materiali.massa = MATERIALI.massa;
      }
    }
    // l'ultimo piano mostrato resta senza soffitto se lo si guarda dall'alto: lo decide `soffitto`
    const dy = piano.quota / 100 + i * (opzioni.esploso ?? 0);
    for (const m of s.mesh) {
      const posizioni = m.posizioni.slice();
      for (let k = 1; k < posizioni.length; k += 3) posizioni[k] += dy;
      mesh.push({ ...m, id: `${piano.id}/${m.id}`, nome: `${piano.nome} · ${m.nome}`, posizioni });
    }
    Object.assign(materiali, s.materiali);
    avvisi.push(...s.avvisi.map((a) => `${piano.nome}: ${a}`));
    for (const im of s.impianti ?? []) {
      const gia = impiantiTot.get(im.linea);
      impiantiTot.set(im.linea, gia ? { ...gia, metri: Math.round((gia.metri + im.metri) * 10) / 10 } : im);
    }
  });
  const limiti = limitiDi(mesh);
  if (opzioni.terreno && opzioni.terreno > 0 && mesh.length) {
    mesh.push(meshTerreno(limiti, opzioni.terreno, piani[0]?.piante.fatto.terreno, limitiDi(mesh, (g) => g === "muro")));
    materiali.prato = MATERIALI.prato;
  }
  return { mesh, materiali, limiti, avvisi, ...(impiantiTot.size ? { impianti: [...impiantiTot.values()] } : {}) };
}

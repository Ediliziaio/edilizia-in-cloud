/**
 * Sanitari e arredi dimensionati dai simboli della pianta.
 *
 * Ogni modello è descritto nel suo sistema: x lungo la larghezza, z lungo la
 * profondità, il retro a z = -profondità/2 (contro il muro), misure in metri.
 */
import { CostruttoreMesh } from "./costruttore";
import { costruisciLavabo, costruisciSanitario, costruisciVasca } from "./sanitari";
import { CAMPI, definizioneCampo, disegnoCampo, eCampo } from "../campiSport";
import { areaConSegno, pedateCad } from "../../../../shared/planimetrie/geometria.ts";
import type { AlzataCad } from "../../../../shared/planimetrie/modello.ts";
import { altezzaPensiliCucina, altezzaTestieraLetto, disposizioneIsola, PROFONDITA_PISCINA_CM, quoteDivanoAngolare, rettangoliIngombroArredo } from "../../../../shared/planimetrie/modelliArredo.ts";
import { costruisciPiscina } from "./piscina";
import type { V3 } from "./tipi";
import type { AttaccoDoccia3D } from "./doccia";
import { costruisciDivanoLino } from "./divanoLino";
import { costruisciOlivo } from "./olivo";
import { costruisciQuadro, costruisciScaldasalviette, costruisciTenda } from "./decorazioni";

export interface Blocco {
  materiale: string;
  /** Rotazione del blocco attorno al suo centro (radianti), prima di quella dell'elemento. */
  girata?: number;
  /** Centro della base del blocco, rispetto al centro dell'ingombro. */
  x: number;
  z: number;
  y: number;
  l: number;
  p: number;
  h: number;
  raggio?: number;
}

interface ModelloElemento {
  nome: string;
  misure: { l: number; p: number; h: number };
  blocchi: (l: number, p: number, h: number, opz?: { senzaCabina?: boolean; interpiano?: number }) => Blocco[];
}

const b = (materiale: string, x: number, z: number, y: number, l: number, p: number, h: number, raggio?: number): Blocco => ({ materiale, x, z, y, l, p, h, raggio });
const bordoVasca = (l: number, p: number, y: number, h: number, z = 0): Blocco[] => {
  const s = Math.min(.055, l / 6, p / 6);
  return [b("ceramica", -l / 2 + s / 2, z, y, s, p, h), b("ceramica", l / 2 - s / 2, z, y, s, p, h), b("ceramica", 0, z - p / 2 + s / 2, y, l - 2 * s, s, h), b("ceramica", 0, z + p / 2 - s / 2, y, l - 2 * s, s, h)];
};
function dotazioneCucina(l: number, p: number, h: number) {
  if (l < 1.18 || p < .40 || h < .55) return null;
  return { lavelloX: -.255 * l, lavelloL: Math.min(.53, l * .36), lavelloP: Math.min(.405, p * .64),
    cotturaX: .245 * l, cotturaL: Math.min(.59, l * .41), cotturaP: Math.min(.49, p * .83) };
}

/** Fasce attorno al foro del lavello, con lo stesso riferimento metrico per il materiale. */
function fasceLavello(materiale: string, l: number, p: number, base: number, h: number, x: number, foroL: number, foroP: number): Blocco[] {
  const a = x - foroL / 2, z = x + foroL / 2;
  const laterali = (p - foroP) / 2;
  return [b(materiale, (a - l / 2) / 2, 0, base, a + l / 2, p, h), b(materiale, (z + l / 2) / 2, 0, base, l / 2 - z, p, h),
    ...[-1, 1].map(s => b(materiale, x, s * (p / 2 - laterali / 2), base, foroL, laterali, h))];
}

function basiCucina(l: number, p: number, h: number, attrezzata = true, gola = false): Blocco[] {
  const n = Math.max(1, Math.min(30, Math.round(l / .6))), sp = Math.min(.023, p / 7), passo = l / n;
  const zoccolo = Math.min(.095, h * .15), piano = Math.min(.034, h * .08);
  const mobile = gola ? "rovere_chiaro" : "laccato", lastra = gola ? "piano_travertino" : "quarzo";
  const corpo = h - zoccolo - piano;
  const d = attrezzata ? dotazioneCucina(l, p, h) : null;
  const fondo = d ? h - Math.min(.18, h * .25) : h - piano;
  const profonditaCorpo = p - sp * 2;
  const indiceForno = d && n >= 3 ? Math.floor((d.cotturaX + l / 2) / passo) : -1;
  return [
    b("guarnizione", 0, 0, 0, l * .965, p * .83, zoccolo, .003),
    b(mobile, 0, 0, zoccolo, l - .004, profonditaCorpo, fondo - zoccolo, .002),
    ...(d ? fasceLavello(mobile, l - .004, profonditaCorpo, fondo, h - piano - fondo, d.lavelloX, d.lavelloL, d.lavelloP) : []),
    ...(d ? fasceLavello(lastra, l, p, h - piano, piano, d.lavelloX, d.lavelloL, d.lavelloP)
      : [b(lastra, 0, 0, h - piano, l, p, piano, Math.min(.007, piano * .24))]),
    ...(d ? [b("induzione", d.cotturaX, 0, h + .001, d.cotturaL, d.cotturaP, .008, .003)] : []),
    ...Array.from({ length: n }, (_, i) => {
      const x = -l / 2 + (i + .5) * passo;
      const larg = passo - Math.min(.005, passo * .09), fronte = p / 2 - sp * .52;
      const presa = Math.min(.012, p / 8, h * .12);
      if (i === indiceForno) return [
        b(mobile, x, fronte, zoccolo + .004, larg, sp, corpo - .009, .003),
        b("induzione", x, p / 2 - .008, zoccolo + corpo * .16, larg * .91, .015, corpo * .67, .006),
        b("schermo", x, p / 2 - .004, zoccolo + corpo * .26, larg * .77, .007, corpo * .41, .003),
        b("inox", x, p / 2 - .007, zoccolo + corpo * .735, larg * .80, .013, .011, .004),
      ];
      const cassetti = i === 0 && n >= 3 ? 3 : 1;
      const altezzaAnta = corpo / cassetti;
      return Array.from({ length: cassetti }, (_, part) => {
        const base = zoccolo + part * altezzaAnta;
        const fuga = gola ? Math.min(.019, altezzaAnta * .1) : .003;
        return [b(mobile, x, fronte, base + .003, larg, sp, altezzaAnta - fuga - .003, .003),
          gola ? b("grafite", x, fronte - sp * .67, base + altezzaAnta - fuga, larg, sp * .35, fuga * .88, .001)
            : b("inox", x, p / 2 - presa * .55, base + altezzaAnta * .79, Math.min(.19, passo * .46), presa, .009, .002)];
      }).flat();
    }).flat(),
  ];
}

function blocchiPensili(l: number, p: number, h: number, led = false): Blocco[] {
  const profondita = Math.min(.35, p * .83), n = Math.max(1, Math.min(30, Math.round(l / .65))), passo = l / n;
  const y = altezzaPensiliCucina(h * 100) / 100, z = -p / 2 + profondita / 2;
  const separazione = Math.min(.006, passo * .085);
  return [
    ...Array.from({ length: n }, (_, i) => b("laccato", (i + .5 - n / 2) * passo, z, y, passo - separazione, profondita, .69, .004)),
    b("grafite", 0, z + profondita * .36, y - .016, l * .972, profondita * .22, .016, .003),
    b(led ? "luce_calda" : "lino_avorio", 0, z + profondita * .36, y - .020, l * .92, profondita * .12, .004),
  ];
}

function pensiliConNicchie(l: number, p: number, h: number): Blocco[] {
  const d = Math.min(.34, p * .78), y = altezzaPensiliCucina(h * 100) / 100;
  const retro = -p / 2, centro = retro + d / 2, quota = .68;
  const n = Math.max(1, Math.min(12, Math.round(l / .65))), passo = l / n;
  const fascia = Math.min(.018, passo * .1, d * .12);
  return [
    b("piano_travertino", 0, retro + fascia * .5, h, l, fascia, y - h - .01, .002),
    ...Array.from({ length: n }, (_, i) => {
      const x = (i + .5 - n / 2) * passo, larg = passo - Math.min(.005, passo * .065);
      const nicchia = n >= 3 && (i === Math.floor(n * .57) || (n >= 5 && i === n - 1));
      if (!nicchia) return [b("rovere_chiaro", x, centro, y, larg, d, quota, .003)];
      return [
        b("rovere_chiaro", x, retro + fascia / 2, y, larg, fascia, quota),
        ...[-1, 1].map(lato => b("rovere_chiaro", x + lato * (larg - fascia) / 2, centro, y, fascia, d, quota)),
        ...[0, .49, 1].map(rapporto =>
          b("rovere_chiaro", x, centro, y + rapporto * (quota - fascia), larg - 2 * fascia, d, fascia, .002)),
        b("luce_calda", x, centro + d * .31, y + quota - fascia - .004, larg - 3 * fascia, d * .063, .003),
        ...[0, 1].map(indice => b("lino_avorio", x + (indice - .5) * larg * .39, centro - d * .022,
          y + fascia, larg * .23, d * .36, .10 + .034 * indice, .018)),
      ];
    }).flat(),
    b("grafite", 0, centro + d * .32, y - .015, l * .97, d * .13, .014, .002),
    b("luce_calda", 0, centro + d * .32, y - .016, l * .945, d * .082, .003),
  ];
}

function blocchiCucinaAngolare(l: number, p: number, h: number, attrezzata = true, led = false, nicchie = false): Blocco[] {
  const [principale, ritorno] = rettangoliIngombroArredo("cucina_angolare", l * 100, p * 100);
  const pr = principale.profondita / 100;
  return [
    ...basiCucina(l, pr, h, attrezzata, nicchie).map(v => ({ ...v, z: v.z + principale.y / 100 })),
    ...(ritorno ? basiCucina(ritorno.profondita / 100, ritorno.larghezza / 100, h, false, nicchie)
      .map(v => ({ ...v, x: ritorno.x / 100 + v.z, z: ritorno.y / 100 - v.x, girata: -Math.PI / 2 })) : []),
    ...(nicchie ? pensiliConNicchie(l, pr, h) : blocchiPensili(l, pr, h, led)).map(v => ({ ...v, z: v.z + principale.y / 100 })),
  ];
}

function isolaInTravertino(l: number, p: number, h: number): Blocco[] {
  const { banco, diametro, sedute, zSeduta } = disposizioneIsola(l * 100, p * 100);
  const profondita = banco / 100, retro = -p / 2, z = zSeduta / 100, d = diametro / 100;
  const pietra = "piano_travertino", mobile = "rovere_chiaro";
  const lastra = Math.min(.045, h * .066), fianco = Math.min(.093, l * .115, profondita * .25);
  const quota = h - lastra, sotto = Math.min(.065, h * .12);
  const sp = Math.min(.019, profondita * .12), centro = retro + profondita / 2;
  const larghezza = l - 2 * fianco, corpo = profondita * .72, cassa = corpo - sp;
  const passo = larghezza / sedute.length;
  const altezzaSeduta = h * .665, gamba = d * .087;
  return [
    b(pietra, 0, centro, quota, l, profondita, lastra, .014),
    ...[-1, 1].map(sx => b(pietra, sx * (l - fianco) / 2, centro, 0, fianco, profondita, quota, .016)),
    b("grafite", 0, retro + corpo / 2, 0, larghezza * .956, corpo * .92, sotto),
    b(mobile, 0, retro + cassa / 2, sotto, larghezza, cassa, quota - sotto - .014, .003),
    ...sedute.flatMap((xCm, i) => {
      const x = xCm / 100, fronte = (i + .5 - sedute.length / 2) * passo;
      return [
        b(mobile, fronte, retro + corpo - sp / 2, sotto + .005, passo - Math.min(.005, passo * .09), sp, quota - sotto - .027, .003),
        b(mobile, x, z, altezzaSeduta - .023, d, d * .86, .029, .012),
        b("lino_avorio", x, z, altezzaSeduta, d * .94, d * .84, Math.min(.038, h * .07), .018),
        ...[-1, 1].flatMap(sx => [-1, 1].map(sz =>
          b(mobile, x + sx * d * .36, z + sz * d * .33, 0, gamba, gamba, altezzaSeduta, .005))),
        b("ottone", x, z + d * .32, altezzaSeduta * .39, d * .78, gamba, gamba * .69),
      ];
    }),
  ];
}
function blocchiDivanoAngolare(l: number, p: number, h: number, lino = false): Blocco[] {
  const quote = quoteDivanoAngolare(l * 100, p * 100);
  const { posti } = quote;
  const schienale = quote.schienale / 100, bracciolo = quote.bracciolo / 100, penisola = quote.penisola / 100;
  const corpo = quote.profonditaCorpo / 100;
  const retro = -p / 2, fronte = retro + corpo, giunto = l / 2 - penisola;
  const piedino = Math.min(.085, h * .105);
  const seduta = Math.min(.47, h * .53);
  const cuscino = Math.min(.16, seduta * .34);
  const baseSeduta = seduta - cuscino;
  const tessuto = lino ? "tessuto" : "tessuto_divano";
  const passo = (giunto - (-l / 2 + bracciolo)) / posti;
  const cucitura = Math.min(.018, passo * .09, penisola * .07);
  const zSeduta = retro + schienale + cucitura;
  const braccioloDestro = Math.min(bracciolo, penisola * .32);
  const profonditaBracciolo = corpo - schienale * .52;
  const centroBracciolo = fronte - profonditaBracciolo / 2;
  const moduli = [
    ...Array.from({ length: posti }, (_, i) => ({ x: -l / 2 + bracciolo + (i + .5) * passo, l: passo, fronte })),
    { x: (giunto + l / 2 - braccioloDestro) / 2, l: penisola - braccioloDestro, fronte: p / 2 },
  ];
  const basi = rettangoliIngombroArredo("divano_angolare", l * 100, p * 100);
  return [
    ...basi.flatMap(r => {
      const x = r.x / 100, z = r.y / 100, w = r.larghezza / 100, d = r.profondita / 100;
      const gamba = Math.min(.068, w * .2, d * .2);
      return [
        b(tessuto, x, z, piedino, w, d, baseSeduta - piedino, .026),
        ...(lino ? [b("rovere_chiaro", x, z, 0, w * .96, d * .96, piedino, .009)]
          : [-1, 1].flatMap(sx => [-1, 1].map(sz => b("grafite", x + sx * w * .35, z + sz * d * .34, 0, gamba, gamba, piedino, .008)))),
      ];
    }),
    b(tessuto, 0, retro + schienale * .26, baseSeduta, l, schienale * .52, h - baseSeduta, .05),
    b(tessuto, -l / 2 + bracciolo / 2, centroBracciolo, baseSeduta, bracciolo, profonditaBracciolo, h * .68 - baseSeduta, .047),
    b(tessuto, l / 2 - braccioloDestro / 2, centroBracciolo, baseSeduta, braccioloDestro, profonditaBracciolo, h * .68 - baseSeduta, .047),
    ...moduli.flatMap(m => [
      b(tessuto, m.x, (zSeduta + m.fronte - cucitura) / 2, baseSeduta, m.l - cucitura, m.fronte - zSeduta - cucitura, cuscino, .045),
      b(tessuto, m.x, retro + schienale * .78, seduta, m.l - cucitura, schienale * .6, (h - seduta) * .91, .065),
    ]),
    ...[moduli[0], moduli[moduli.length - 1]].map((m, i) => ({
      ...b(i === 0 ? "lino_avorio" : "tessuto_cuscino", m.x, zSeduta + (corpo - schienale) * .19,
        seduta, Math.min(.35, m.l * .68), Math.min(.16, (corpo - schienale) * .25), (h - seduta) * .74, .053),
      girata: i === 0 ? -.15 : .13,
    })),
  ];
}

function blocchiArmadio(l: number, p: number, h: number, scorrevole: boolean): Blocco[] {
  const n = Math.max(2, Math.min(12, Math.round(l / (scorrevole ? .92 : .58))));
  const modulo = l / n, sp = Math.min(.023, p * .13, modulo * .2);
  const zoccolo = Math.min(.072, h * .1), bordo = Math.min(.008, h * .05, modulo * .03);
  return [
    b("grafite", 0, -p * .037, 0, l * .94, p * .83, zoccolo),
    b("laccato", 0, -sp, zoccolo, l, p - 2 * sp, h - zoccolo, bordo),
    ...Array.from({ length: n }, (_, i) => {
      const x = (i + .5 - n / 2) * modulo;
      const z = p / 2 - sp * (scorrevole && i % 2 === 0 ? 1.5 : .5);
      const anta = b("laccato", x, z, zoccolo + bordo, modulo - bordo, sp, h - zoccolo - 2 * bordo, bordo / 2);
      const presa = b(scorrevole ? "grafite" : "ottone", x + modulo * .38, z + sp * .19, h * .44, sp * .67, sp * .61, Math.min(.23, h * .16), sp / 5);
      return scorrevole ? [anta, b("legno", x, z + sp * .33, h * .42, modulo - bordo, sp * .33, h * .16), presa] : [anta, presa];
    }).flat(),
  ];
}

function dettagliCucina(l: number, p: number, h: number, z: number, centro: { x: number; z: number }, r: number,
  fabbrica: (materiale: string) => CostruttoreMesh): void {
  const d = dotazioneCucina(l, p, h);
  if (!d) return;
  const c = Math.cos(r), s = Math.sin(r);
  const punto = (x: number, y: number, dz: number): V3 => [centro.x + x * c - (z + dz) * s, y, centro.z + x * s + (z + dz) * c];
  const inox = fabbrica("inox");
  const x = d.lavelloX, hw = d.lavelloL / 2, hp = d.lavelloP / 2;
  const fondo = h - Math.min(.135, h * .19);
  const rettangolo = [[-hw, -hp], [hw, -hp], [hw, hp], [-hw, hp]];
  const sotto = rettangolo.map(([u, v]) => punto(x + u * .84, fondo, v * .81));
  inox.poligono(sotto, [0, 1, 0]);
  for (let i = 0; i < rettangolo.length; i++) {
    const j = (i + 1) % rettangolo.length;
    const [u, v] = rettangolo[i], [ju, jv] = rettangolo[j];
    const nx = v - jv, nz = ju - u;
    inox.quad(punto(x + u, h + .003, v), punto(x + ju, h + .003, jv), sotto[j], sotto[i], [nx * c - nz * s, .19, nx * s + nz * c]);
  }
  for (const lato of [-1, 1]) {
    inox.scatola(centro.x, centro.z, h, .012, d.lavelloP + .014, .004, r, x + lato * hw, z);
    inox.scatola(centro.x, centro.z, h, d.lavelloL + .014, .012, .004, r, x, z + lato * hp);
  }
  fabbrica("guarnizione").tubo([punto(x + hw * .44, fondo + .001, 0), punto(x + hw * .44, fondo + .004, 0)], .026, 20);
  const attacco = -hp - Math.min(.039, p * .078);
  inox.tubo([punto(x, h, attacco), punto(x, h + .019, attacco)], .027, 16);
  inox.tubo([[h + .011, attacco], [h + .17, attacco], [h + .212, attacco + .012], [h + .237, attacco + .047],
    [h + .238, attacco + .081], [h + .216, attacco + .121], [h + .174, attacco + .14]]
    .map(([y, dz]) => punto(x, y, dz)), .013);
  inox.tubo([punto(x + .019, h + .056, attacco), punto(x + .062, h + .056, attacco), punto(x + .065, h + .103, attacco)], .0045, 8);

  const piano = fabbrica("grafica_induzione");
  for (const ix of [-1, 1]) for (const iz of [-1, 1]) {
    const cx = d.cotturaX + ix * d.cotturaL * .25, cz = d.cotturaP * (iz * .215 - .025);
    const raggio = Math.min(d.cotturaL, d.cotturaP) * (ix === iz ? .158 : .183);
    for (let k = 0; k < 24; k++) {
      const a = k * Math.PI / 12, b = (k + 1) * Math.PI / 12;
      const p = (angolo: number, r: number) => punto(cx + r * Math.cos(angolo), h + .0094, cz + r * Math.sin(angolo));
      piano.quad(p(a, raggio), p(b, raggio), p(b, raggio - .0015), p(a, raggio - .0015), [0, 1, 0]);
    }
  }
}

function dettagliDoccia(l: number, p: number, h: number, centro: { x: number; z: number }, r: number, attacco: AttaccoDoccia3D,
  fabbrica: (materiale: string) => CostruttoreMesh): void {
  if (l < .31 || p < .31 || h < .42) return;
  const c = Math.cos(r), s = Math.sin(r);
  const laterale = attacco.lato === "sinistra" || attacco.lato === "destra";
  const segno = attacco.lato === "fronte" || attacco.lato === "destra" ? -1 : 1;
  const ampiezza = laterale ? p : l, profondita = laterale ? l : p;
  const punto = (u: number, y: number, d: number): V3 => {
    const x = laterale ? d * segno : u + attacco.scarto;
    const z = laterale ? u + attacco.scarto : d * segno;
    return [centro.x + x * c - z * s, y, centro.z + x * s + z * c];
  };
  const inox = fabbrica("inox");
  const bordo = -profondita / 2;
  const parete = (u: number) => bordo - attacco.distanza + attacco.pendenza * u;
  const dz = Math.max(bordo, parete(0)) + Math.min(.033, profondita * .088);
  const y = h * .945, miscelatore = h * .487, getto = -profondita * .10;
  const raccordo = Math.min(.051, profondita * .13);
  inox.tubo([punto(0, miscelatore, dz), punto(0, y - raccordo, dz), punto(0, y - raccordo * .27, dz + raccordo * .27),
    punto(0, y, dz + raccordo), punto(0, y, getto)], .011);
  inox.tubo([punto(0, y - .021, getto), punto(0, y + .004, getto)], Math.min(.104, profondita * .16, ampiezza * .16), 24);
  const raccordi = ampiezza * .13;
  inox.tubo([punto(-raccordi, miscelatore, dz + .012), punto(raccordi, miscelatore, dz + .012)], .018, 18);
  for (const [u, quota] of [[-raccordi, miscelatore], [raccordi, miscelatore], [0, h * .80]]) {
    const filo = parete(u);
    inox.tubo([punto(u, quota, filo - .002), punto(u, quota, filo + .009)], .029, 18);
    inox.tubo([punto(u, quota, filo + .005), punto(u, quota, dz + .016)], .013, 16);
  }
}

function blocchiDoccia(l: number, p: number, h: number, lato?: AttaccoDoccia3D["lato"], variante?: string): Blocco[] {
  const s = Math.min(.025, l / 10, p / 10);
  const x = (l / 2 - s / 2) * (lato === "destra" ? -1 : 1);
  const z = (p / 2 - s / 2) * (lato === "fronte" ? -1 : 1);
  if (variante === "walk_in" || variante === "spa") {
    const quota = Math.min(.038, h * .05);
    const cristallo = Math.min(.009, s * .55);
    const latoLungo = p >= l;
    const ampiezza = latoLungo ? p : l;
    const varco = Math.min(.78, ampiezza * .55);
    const pannello = ampiezza - varco - s;
    const w = latoLungo ? cristallo : pannello, d = latoLungo ? pannello : cristallo;
    const cx = latoLungo ? x : varco / 2;
    const cz = latoLungo ? -varco / 2 * Math.sign(z) : z;
    const scaricoL = latoLungo ? l * .69 : l * .085;
    const scaricoP = latoLungo ? p * .052 : p * .63;
    const scaricoX = latoLungo ? 0 : -x * .82;
    const scaricoZ = latoLungo ? -z * .79 : 0;
    return [
      b("ceramica", 0, 0, 0, l, p, quota, .005),
      b("vetro", cx, cz, quota, w, d, h - quota),
      ...[-1, 1].map(f => b("grafite", cx + (latoLungo ? 0 : f * (w - s) / 2), cz + (latoLungo ? f * (d - s) / 2 : 0),
        quota, s, s, h - quota, .002)),
      b("grafite", cx, cz, h - s, w, d, s),
      b("inox", scaricoX, scaricoZ, quota + .0005, scaricoL, scaricoP, .003, .001),
      ...[-.24, 0, .24].map(f => b("guarnizione", scaricoX + (latoLungo ? 0 : f * scaricoL), scaricoZ + (latoLungo ? f * scaricoP : 0),
        quota + .0035, scaricoL * (latoLungo ? .93 : .12), scaricoP * (latoLungo ? .12 : .93), .001)),
      ...(variante === "spa" && l > 1 && p > .80 ? [
        b("piano_travertino", l * .265, -p * .27, quota, l * .34, p * .25, .33, .008),
        b("piano_travertino", l * .265, -p * .255, quota + .33, l * .39, p * .31, .082, .012),
        b("luce_calda", l * .265, -p * .113, quota + .322, l * .318, .013, .004),
      ] : []),
    ];
  }
  return [b("ceramica", 0, 0, 0, l, p, .04), ...bordoVasca(l, p, .04, .025),
    b("metallo", 0, 0, .041, Math.min(.09, l / 4), Math.min(.09, p / 4), .006),
    b("vetro", x, 0, .065, s, p, h - .065), b("vetro", 0, z, .065, l, s, h - .065),
    ...[-1, 1].map(latoZ => b("metallo", x, latoZ * (p / 2 - s / 2), .065, s, s, h - .065)),
    b("metallo", -x, z, .065, s, s, h - .065),
    b("metallo", x, 0, h - s, s, p, s), b("metallo", 0, z, h - s, l, s, s)];
}

function frigoInox(l: number, p: number, h: number): Blocco[] {
  const basamento = Math.min(.061, h * .058);
  const anta = Math.min(.061, p * .15), lato = Math.min(.004, l * .015);
  const gola = Math.min(.028, h * .033), fronte = p / 2 - anta / 2;
  const giunto = h * .315, corpo = p - anta;
  const presa = Math.min(.102, l * .24), bordo = Math.min(.006, anta * .22);
  return [
    b("grafite", 0, -anta / 2, 0, l * .9, corpo * .87, basamento, .005),
    b("inox", 0, -anta / 2, basamento, l, corpo, h - basamento, .011),
    b("guarnizione", 0, fronte - bordo, basamento + .004, l - 2 * lato, anta - 2 * bordo, h - basamento - .010, .004),
    b("inox", 0, fronte, basamento + .009, l - 2 * lato, anta, giunto - basamento - gola - .009, .007),
    b("inox", 0, fronte, giunto + gola, l - 2 * lato, anta, h - giunto - gola, .009),
    ...[-1, 1].map(s => b("inox", -l / 2 + lato + presa / 2, fronte, giunto + s * (gola - .004),
      presa, anta, .005, .0014)),
    b("schermo", l * .245, p / 2 - .0006, h * .745, Math.min(.036, l * .085), .0012, h * .019, .0006),
  ];
}

function costruisciAuto(l: number, p: number, h: number, c: { x: number; z: number }, r: number, suv: boolean,
  fabbrica: (materiale: string) => CostruttoreMesh) {
  if (Math.min(l, p, h) <= 0) return;
  const cos = Math.cos(r), sin = Math.sin(r);
  const punto = (x: number, y: number, z: number): V3 => [c.x + x * cos - z * sin, y, c.z + x * sin + z * cos];
  const scatola = (mat: string, x: number, z: number, y: number, w: number, d: number, a: number, smusso: number) =>
    fabbrica(mat).scatola(c.x, c.z, y, w, d, a, r, x, z, 0, smusso);
  const linea = h * (suv ? .62 : .55);
  scatola("carrozzeria", 0, 0, h * .14, l * .99, p * .99, linea - h * .14, Math.min(.13, h * .09));
  const tetto = h * .948;
  const anello = (y: number, w: number, d: number, z: number) =>
    [punto(-w / 2, y, z - d / 2), punto(w / 2, y, z - d / 2), punto(w / 2, y, z + d / 2), punto(-w / 2, y, z + d / 2)];
  const base = anello(linea - .005, l * .86, p * (suv ? .69 : .59), -.012 * p);
  const alto = anello(tetto, l * .72, p * (suv ? .56 : .37), -.045 * p);
  const vetri = fabbrica("vetro_auto");
  const normali = [[0, .62, -1], [1, .28, 0], [0, .73, 1], [-1, .28, 0]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, [x, y, z] = normali[i];
    vetri.quad(base[i], base[j], alto[j], alto[i], [x * cos - z * sin, y, x * sin + z * cos]);
    fabbrica("carrozzeria").tubo([base[i], alto[i]], Math.min(.016, l * .02), 10);
  }
  for (const [a, b] of [[0, 3], [1, 2]]) {
    const medio = (p: V3, q: V3): V3 => [(.53 * p[0] + .47 * q[0]), (.53 * p[1] + .47 * q[1]), (.53 * p[2] + .47 * q[2])];
    fabbrica("carrozzeria").tubo([medio(base[a], base[b]), medio(alto[a], alto[b])], Math.min(.021, l * .02), 10);
  }
  scatola("carrozzeria", 0, -.045 * p, tetto - .006, l * .725, p * (suv ? .565 : .375), h - tetto + .006, .034);
  const ruota = Math.min(.35, h * .205, p * .093, l * .20);
  for (const lato of [-1, 1]) for (const estremita of [-1, 1]) {
    const f = lato * l / 2, z = estremita * p * .31;
    fabbrica("guarnizione").tubo([punto(f - lato * l * .118, ruota, z), punto(f - lato * .008, ruota, z)], ruota, 24);
    fabbrica("inox").tubo([punto(f - lato * .014, ruota, z), punto(f - lato * .001, ruota, z)], ruota * .69, 24);
    scatola(estremita === 1 ? "faro_auto" : "fanale_auto", lato * l * .335, estremita * (p * .492 - .007),
      linea * .69, l * .235, Math.min(.045, p * .013), Math.min(.067, h * .056), .012);
  }
  scatola("guarnizione", 0, p * .495, linea * .48, l * .44, Math.min(.011, p * .008), h * .059, .008);
}

function costruisciLettino(l: number, p: number, h: number, centro: { x: number; z: number }, r: number,
  fabbrica: (materiale: string) => CostruttoreMesh) {
  if (Math.min(l, p) <= 0) return;
  const seduta = h > .15 ? h : .32;
  const c = Math.cos(r), s = Math.sin(r), x = l * .41, z0 = -p * .09, z1 = -p * .468;
  const y0 = seduta + .076, y1 = y0 + p * .235;
  const punto = (x: number, y: number, z: number): V3 => [centro.x + x * c - z * s, y, centro.z + x * s + z * c];
  const teak = fabbrica("legno"), cuscino = fabbrica("lino_avorio");
  for (const lato of [-1, 1]) {
    teak.scatola(centro.x, centro.z, seduta - .062, l * .083, p * .97, .058, r, lato * x, 0, 0, .011);
    for (const fondo of [-1, 1]) {
      teak.scatola(centro.x, centro.z, 0, l * .09, p * .048, seduta - .044, r, lato * x, fondo * p * .34, 0, .009);
    }
    teak.tubo([punto(lato * x, y0 - .057, z0), punto(lato * x, y1 - .063, z1)], .019);
    teak.tubo([punto(lato * x, seduta - .027, -p * .393), punto(lato * x, y1 - .132, z1 + p * .065)], .014);
  }
  teak.scatola(centro.x, centro.z, seduta - .037, l * .88, p * .97, .039, r, 0, 0, 0, .009);
  cuscino.scatola(centro.x, centro.z, seduta, l * .89, p * .565, .079, r, 0, p * .195, 0, .023);
  const superficie = [punto(-x, y0, z0), punto(x, y0, z0), punto(x, y1, z1), punto(-x, y1, z1)] as const;
  const sotto = superficie.map(([x, y, z]): V3 => [x, y - .061, z]);
  const n: V3 = [s * .54, .84, -c * .54];
  cuscino.poligono([...superficie], n);
  for (let i = 0; i < superficie.length; i++) {
    const j = (i + 1) % superficie.length;
    const direzione: V3 = [superficie[i][2] - superficie[j][2], 0, superficie[j][0] - superficie[i][0]];
    cuscino.quad(superficie[i], superficie[j], sotto[j], sotto[i], direzione);
  }
  for (const frazione of [.19, .42, .65, .88]) {
    const y = y0 + (y1 - y0) * frazione, z = z0 + (z1 - z0) * frazione;
    fabbrica("lenzuola").tubo([punto(-x, y + .001, z), punto(x, y + .001, z)], .0035, 8);
  }
}

export const MODELLI: Record<string, ModelloElemento> = {
  wc: {
    nome: "WC",
    misure: { l: 0.38, p: 0.55, h: 0.4 },
    blocchi: (l, p, h) => [b("ceramica", 0, .05 * p, 0, l * .6, p * .65, h * .65), ...bordoVasca(l * .9, p * .75, h * .65, h * .35, .1 * p), b("ceramica", 0, -p / 2 + .08, h, l, .16, .38)],
  },
  bidet: {
    nome: "Bidet",
    misure: { l: 0.38, p: 0.52, h: 0.4 },
    blocchi: (l, p, h) => [b("ceramica", 0, 0, 0, l * .65, p * .7, h * .65), ...bordoVasca(l * .9, p, h * .65, h * .35), b("metallo", 0, -p * .38, h, .035, .035, .1)],
  },
  lavabo: {
    nome: "Lavabo",
    misure: { l: 0.6, p: 0.45, h: 0.85 },
    blocchi: (l, p, h) => [
      b("legno", 0, -p * .03, h * .26, l * .94, p * .89, h * .64, .012),
      b("ceramica", 0, 0, h * .90, l, p, h * .10, .014),
      ...bordoVasca(l * .79, p * .68, h, .07),
      b("metallo", 0, -p * .38, h, .03, .032, .13, .008),
      b("metallo", 0, -p * .30, h + .115, .032, p * .19, .03, .007),
    ],
  },
  doccia: {
    nome: "Doccia",
    misure: { l: 0.8, p: 0.8, h: 2.0 },
    blocchi: (l, p, h) => blocchiDoccia(l, p, h),
  },
  vasca: {
    nome: "Vasca",
    misure: { l: 1.7, p: 0.7, h: 0.55 },
    blocchi: (l, p, h) => [b("ceramica", 0, 0, 0, l, p, h)],
  },
  letto: {
    nome: "Letto",
    misure: { l: 1.6, p: 2.0, h: 0.5 },
    blocchi: (l, p, h) => {
      const piano = h > 0 ? h : .5, cuscini = l >= 1.3 ? 2 : 1;
      const piedi = Math.min(.06, l * .12, p * .12), base = Math.min(.06, piano * .13), testiera = Math.min(.08, p * .15);
      return [b("legno", 0, 0, base, l, p, piano * .56 - base, .017), b("lenzuola", 0, .02 * p, piano * .56, l * .956, p * .94, piano * .44, .042),
        b("copriletto", 0, p * .165, piano * .91, l * .983, p * .624, piano * .13, .027),
        b("copriletto", 0, p * .33, piano * 1.03, l * .978, p * .22, .017, .006),
        ...Array.from({ length: cuscini }, (_, i) => b("lenzuola", (i - (cuscini - 1) / 2) * l / cuscini, -p * .32, piano * .995,
          l * .84 / cuscini, p * .205, Math.min(.12, piano * .225), .049)),
        b("tessuto", 0, -p / 2 + testiera / 2, base, l, testiera, altezzaTestieraLetto(piano * 100) / 100 - base, .033),
        ...[-1, 1].flatMap((x) => [-1, 1].map((z) => b("legno", x * l * .42, z * p * .42, 0, piedi, piedi, base)))];
    },
  },
  comodino: {
    nome: "Comodino",
    misure: { l: 0.45, p: 0.4, h: 0.5 },
    blocchi: (l, p, h) => [
      b("legno", 0, -p * .033, h * .16, l, p * .93, h * .84, .014),
      ...[.18, .57].flatMap(y => [b("legno", 0, p * .464, h * y, l * .93, p * .065, h * .36, .008),
        b("ottone", 0, p * .478, h * (y + .22), l * .27, p * .041, h * .018, .004)]),
      ...[-1, 1].flatMap(x => [-1, 1].map(z => b("grafite", x * l * .36, z * p * .34, 0, l * .1, p * .12, h * .16, .007))),
    ],
  },
  armadio: {
    nome: "Armadio",
    misure: { l: 2.0, p: 0.6, h: 2.3 },
    blocchi: (l, p, h) => blocchiArmadio(l, p, h, false),
  },
  divano: {
    nome: "Divano",
    misure: { l: 2.2, p: 0.9, h: 0.85 },
    blocchi: (l, p, h) => {
      const posti = Math.max(2, Math.round(l / .75)), braccio = Math.min(.16, l * .1), seduta = h * .5;
      const luce = l - braccio * 2, larghezzaSeduta = luce / posti;
      // Il telaio entra nei braccioli. Il tessuto esterno ha una sola superficie per lato.
      const telaio = luce + Math.min(.023, braccio * .48);
      return [b("tessuto", 0, p * .009, .08, telaio, p * .957, seduta * .65, .063), b("tessuto", 0, -p * .405, seduta * .65, telaio, p * .19, h - seduta * .65, .05),
        ...Array.from({ length: posti }, (_, i) => {
          const x = (i + .5 - posti / 2) * larghezzaSeduta;
          return [
            b("tessuto", x, p * .102, seduta * .65, larghezzaSeduta - .012, p * .775, seduta * .35, .044),
            b("tessuto", x, -p * .245, seduta, larghezzaSeduta - .014, p * .23, h - seduta - .035, .063),
          ];
        }).flat(),
        ...[-1, 1].map((x) => b("tessuto", x * (l / 2 - braccio / 2), 0, .08, braccio, p, Math.min(h * .7, h - .08), .052)),
        ...[-1, 1].map(x => ({ ...b(x < 0 ? "tessuto_cuscino" : "lino_avorio", x * l * .27, -p * .086, seduta,
          Math.min(.35, l * .2), p * .185, h * .34, .057), girata: x * .12 })),
        ...[-1, 1].flatMap((x) => [-1, 1].map((z) => b("legno", x * l * .42, z * p * .38, 0, .06, .06, .08)))];
    },
  },
  tavolo: {
    nome: "Tavolo",
    misure: { l: 1.4, p: 0.8, h: 0.75 },
    blocchi: (l, p, h) => {
      const g = 0.06;
      const gambe = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => b("legno", sx * (l / 2 - g), sz * (p / 2 - g), 0, g, g, h - 0.04)));
      return [b("legno", 0, 0, h - 0.04, l, p, 0.04, .011), ...gambe];
    },
  },
  tavolino: {
    nome: "Tavolino",
    misure: { l: 1.02, p: .6, h: .42 },
    blocchi: (l, p, h) => [
      b("legno", 0, 0, h - .045, l, p, .045, .016),
      ...[-1, 1].map(x => b("legno", x * l * .29, 0, 0, Math.min(.08, l * .15), p * .69, h - .045, .013)),
    ],
  },
  tappeto: {
    nome: "Tappeto",
    misure: { l: 2.4, p: 1.7, h: .02 },
    blocchi: (l, p, h) => [b("tessuto", 0, 0, .002, l, p, h, .006)],
  },
  scrivania: {
    nome: "Scrivania",
    misure: { l: 1.2, p: 0.6, h: 0.75 },
    blocchi: (l, p, h) => {
      const g = Math.min(.046, l / 8, p / 8), piano = Math.min(.034, h / 5);
      return [b("legno", 0, 0, h - piano, l, p, piano, .011),
        b("legno", -l * .226, -p * .018, h * .72, l * .39, p * .77, h * .28 - piano, .006),
        b("ottone", -l * .226, p * .37, h * .805, l * .13, p * .037, h * .018, .004),
        ...[-1, 1].flatMap(x => [-1, 1].map(z => b("grafite", x * (l / 2 - g), z * (p / 2 - g), 0, g, g, h - piano, .006)))];
    },
  },
  sedia: {
    nome: "Sedia",
    misure: { l: 0.45, p: 0.5, h: 0.9 },
    blocchi: (l, p, h) => {
      const seduta = h * .47, g = Math.min(.045, l / 8, p / 8);
      return [b("legno", 0, 0, seduta, l * .95, p * .91, .038, .014), b("tessuto", 0, p * .024, seduta + .031, l * .90, p * .82, .044, .019),
        b("legno", 0, -p * .432, h * .71, l * .89, p * .12, h * .29, .025),
        ...[-1, 1].flatMap(x => [b("legno", x * l * .355, -p * .386, 0, g, g, h * .83, .006),
          b("legno", x * l * .355, p * .336, 0, g, g, seduta, .006)])];
    },
  },
  cucina: {
    nome: "Cucina",
    misure: { l: 2.4, p: 0.6, h: 0.9 },
    blocchi: (l, p, h) => basiCucina(l, p, h > 0 ? h : .9),
  },
  frigorifero: {
    nome: "Frigorifero",
    misure: { l: 0.6, p: 0.65, h: 1.85 },
    blocchi: (l, p, h) => [
      b("grafite", 0, -p * .021, 0, l * .84, p * .79, h * .046, .007),
      b("grafite", 0, -p * .08, h * .025, l * .988, p * .84, h * .967, .012),
      ...[[.04, .285], [.335, .652]].flatMap(([y, altezza]) => [
        b("inox", 0, p * .405, y * h, l, p * .171, h * altezza, .018),
        b("grafite", l * .34, p * .478, (y + .09) * h, l * .028, p * .039, Math.min(.18, h * altezza * .52), .006),
      ]),
    ],
  },
  specchio_parete: {
    nome: "Specchio a parete",
    misure: { l: .6, p: .04, h: 1.85 },
    blocchi: (l, p, h) => {
      const lastra = Math.min(l * 1.22, h * .58), bordo = Math.min(.015, l * .085, lastra * .085);
      return [b("ottone", 0, -p * .145, h - lastra, l, p * .71, lastra, bordo * .7),
        b("specchio", 0, p * .27, h - lastra + bordo, l - 2 * bordo, p * .42, lastra - 2 * bordo, bordo * .46)];
    },
  },
  lampada_piantana: {
    nome: "Lampada a piantana",
    misure: { l: .35, p: .35, h: 1.54 },
    blocchi: () => [],
  },
  lampada_sospensione: {
    nome: "Lampada a sospensione",
    misure: { l: .36, p: .36, h: 2.8 },
    blocchi: () => [],
  },
  lavatrice: {
    nome: "Lavatrice",
    misure: { l: .6, p: .6, h: .85 },
    blocchi: (l, p, h) => [b("laccato", 0, 0, 0, l, p, h), b("metallo", 0, p / 2 + .002, h * .87, l * .9, .008, h * .08), b("vetro", 0, p / 2 + .004, h * .25, l * .65, .012, h * .45)],
  },
  // ─── nuovi arredi ───
  divano_angolare: {
    nome: "Divano angolare",
    misure: { l: 2.8, p: 1.7, h: 0.85 },
    blocchi: (l, p, h) => blocchiDivanoAngolare(l, p, h),
  },
  poltrona: {
    nome: "Poltrona",
    misure: { l: 0.85, p: 0.85, h: 0.9 },
    blocchi: (l, p, h) => {
      const fianco = l * .17;
      return [
        b("tessuto", 0, p * .045, h * .13, l * .96, p * .91, h * .26, .073),
        b("tessuto", 0, p * .1, h * .37, l - 2 * fianco, p * .68, h * .13, .05),
        b("tessuto", 0, -p * .36, h * .17, l, p * .28, h * .83, .1),
        ...[-1, 1].map(x => b("tessuto", x * (l - fianco) / 2, p * .05, h * .14, fianco, p * .88, h * .55, .064)),
        ...[-1, 1].flatMap(x => [-1, 1].map(z => b("legno", x * l * .34, z * p * .31, 0, .046, .052, h * .14, .009))),
      ];
    },
  },
  mobile_tv: {
    nome: "Mobile TV",
    misure: { l: 1.8, p: 0.45, h: 0.5 },
    blocchi: (l, p, h) => [b("laccato", 0, 0, .05, l, p, h - .05), b("metallo", 0, 0, h, .22, .18, .06), b("schermo", 0, 0, h + .06, Math.min(l * .72, 1.3), .035, .75)],
  },
  libreria: {
    nome: "Libreria",
    misure: { l: 1.6, p: 0.35, h: 2.0 },
    blocchi: (l, p, h) => {
      const s = Math.min(.025, l / 10, p / 5, h / 10), ripiani = Math.max(2, Math.round(h / .4));
      return [b("legno", -l / 2 + s / 2, 0, 0, s, p, h), b("legno", l / 2 - s / 2, 0, 0, s, p, h), ...Array.from({ length: ripiani + 1 }, (_, i) => b("legno", 0, 0, (h - s) * i / ripiani, l - 2 * s, p, s))];
    },
  },
  vetrinetta: { nome: "Vetrinetta illuminata", misure: { l: 1.12, p: .39, h: 1.64 }, blocchi: blocchiVetrinetta },
  tenda: { nome: "Tenda a binario", misure: { l: 3.2, p: .18, h: 2.75 }, blocchi: () => [] },
  quadro: { nome: "Quadro a parete", misure: { l: .82, p: .04, h: 1.81 }, blocchi: () => [] },
  pianta_vaso: { nome: "Pianta in vaso", misure: { l: .37, p: .37, h: .32 }, blocchi: () => [] },
  scaldasalviette: { nome: "Scaldasalviette", misure: { l: .52, p: .13, h: 1.65 }, blocchi: () => [] },
  tavolo_rotondo: {
    nome: "Tavolo rotondo",
    misure: { l: 1.1, p: 1.1, h: 0.75 },
    blocchi: (l, p, h) => [b("legno", 0, 0, h - 0.04, l * 0.9, p * 0.9, 0.04), b("legno", 0, 0, 0, 0.12, 0.12, h - 0.04)],
  },
  cucina_angolare: {
    nome: "Cucina ad angolo",
    misure: { l: 3.0, p: 2.4, h: 0.9 },
    blocchi: (l, p, h) => blocchiCucinaAngolare(l, p, h > 0 ? h : .9),
  },
  isola_cucina: {
    nome: "Isola",
    misure: { l: 1.8, p: 0.9, h: 0.9 },
    blocchi: (l, p, altezza) => {
      const h = altezza > 0 ? altezza : .9;
      const { banco, diametro, sedute, zSeduta } = disposizioneIsola(l * 100, p * 100);
      const prof = banco / 100, lato = diametro / 100, z = zSeduta / 100;
      const sp = Math.min(.038, h * .055), zoccolo = Math.min(.09, h * .13);
      const corpo = prof * .83, spAnta = Math.min(.021, prof * .045), ySeduta = h * .68;
      const s = lato * .09;
      return [
        b("metallo", 0, -p / 2 + corpo / 2, 0, l * .94, corpo * .84, zoccolo),
        b("laccato", 0, -p / 2 + corpo / 2 + spAnta, zoccolo, l * .976, corpo - 2 * spAnta, h - zoccolo - sp),
        b("quarzo", 0, -p / 2 + prof / 2, h - sp, l, prof, sp, Math.min(.011, sp * .45)),
        ...sedute.flatMap(xCm => {
          const x = xCm / 100;
          return [
            b("laccato", x, -p / 2 + spAnta, zoccolo + .008 * h, l / sedute.length * .98, spAnta, h - zoccolo - sp - .02 * h, spAnta * .26),
            b("metallo", x, -p / 2 + spAnta / 2, h * .71, Math.min(.145, l / sedute.length * .45), spAnta * .55, Math.min(.014, h * .04)),
            b("legno", x, z, ySeduta, lato, lato, Math.min(.043, h * .065), Math.min(.038, lato * .16)),
            ...[-1, 1].flatMap(sx => [-1, 1].map(sz =>
              b("metallo", x + sx * lato * .37, z + sz * lato * .37, 0, s, s, ySeduta))),
            b("metallo", x, z + lato * .36, ySeduta * .42, lato * .76, s, s),
          ];
        }),
      ];
    },
  },
  lavastoviglie: { nome: "Lavastoviglie", misure: { l: 0.6, p: 0.6, h: 0.85 }, blocchi: (l, p, h) => [b("metallo", 0, 0, 0, l, p, h)] },
  auto: {
    nome: "Auto",
    misure: { l: 1.9, p: 4, h: 1.44 },
    blocchi: (l, p, h) => [
      b("metallo", 0, 0, 0.18, l, p, h * 0.45),
      b("metallo", 0, 0.05 * p, 0.18 + h * 0.45, l * 0.86, p * 0.5, h * 0.4),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b("piano_cucina", sx * (l / 2 - 0.08), sz * p * 0.31, 0, 0.18, 0.62, 0.62))),
    ],
  },
  scaffale: { nome: "Scaffalatura", misure: { l: 3.0, p: 1.0, h: 4.0 }, blocchi: (l, p, h) => [0, 1, 2, 3].map((k) => b("metallo", 0, 0, (h / 4) * k + 0.1, l, p, 0.06)).concat([-1, 1].map((sx) => b("metallo", sx * (l / 2 - 0.04), 0, 0, 0.08, p, h))) },
  banco_lavoro: { nome: "Banco da lavoro", misure: { l: 2.0, p: 0.8, h: 0.9 }, blocchi: (l, p, h) => [b("legno", 0, 0, h - 0.06, l, p, 0.06), b("metallo", 0, 0, 0, l - 0.1, p - 0.1, h - 0.06)] },
  // ─── struttura ───
  pilastro: { nome: "Pilastro", misure: { l: 0.3, p: 0.3, h: 3.0 }, blocchi: (l, p, h) => [b("calcestruzzo", 0, 0, 0, l, p, h)] },
  // Muro di contenimento a mensola (sezione a «T rovescia»): suola sottoterra con punta davanti e tallone dietro,
  // fusto rastremato (lo spessore cala verso l'alto, la faccia davanti resta verticale) e il terreno trattenuto sul retro.
  muro_contenimento: {
    nome: "Muro di contenimento",
    misure: { l: 6.0, p: 2.2, h: 3.0 },
    blocchi: (l, p, h) => {
      const suola = Math.min(0.5, Math.max(0.3, h / 8)), punta = p * 0.3, base = Math.min(0.7, Math.max(0.3, h / 9)), cima = 0.3;
      const zf = p / 2 - punta, fette = 8, alza = h / fette;
      return [
        b("calcestruzzo", 0, 0, -suola, l, p, suola),
        ...Array.from({ length: fette }, (_, i) => {
          const t = base - ((base - cima) * (i + 0.5)) / fette;
          return b("calcestruzzo", 0, zf - t / 2, i * alza, l, t, alza);
        }),
        ...Array.from({ length: fette }, (_, i) => {
          const t = base - ((base - cima) * (i + 0.5)) / fette, prof = zf - t + p / 2;
          return b("terra", 0, -p / 2 + prof / 2, i * alza, l, prof, alza * 0.98);
        }),
      ];
    },
  },
  // Trave e solaio in c.a.: stanno sotto il pavimento del piano sopra (h = altezza della trave o spessore del solaio).
  trave: { nome: "Trave", misure: { l: 4.0, p: 0.3, h: 0.5 }, blocchi: (l, p, h, opz) => [b("calcestruzzo", 0, 0, (opz?.interpiano ?? 3.0) - h, l, p, h)] },
  solaio: { nome: "Solaio", misure: { l: 8.0, p: 6.0, h: 0.25 }, blocchi: (l, p, h, opz) => [b("calcestruzzo", 0, 0, (opz?.interpiano ?? 3.0) - h, l, p, h)] },
  // Vano ascensore: quattro pareti piene fino al piano sopra (l'altezza la decide l'edificio) e, sul davanti
  // (+p/2), l'apertura con la porta di piano in metallo. Su ogni piano ce n'è uno, uno sopra l'altro: fanno un vano unico.
  // Scala a U: due rampe affiancate e un pianerottolo in fondo. Alzata ≈ 17,5 cm, pedata dalla lunghezza che resta (≈ 25 cm).
  // Si sale dal davanti (+p/2): la prima rampa arriva al pianerottolo a metà altezza, la seconda torna indietro.
  scala_u: {
    nome: "Scala a U",
    misure: { l: 2.0, p: 3.6, h: 2.8 },
    blocchi: (l, p, h) => {
      const n = Math.max(4, Math.round(h / 0.175)), meta = Math.floor(n / 2), alza = h / n;
      const pian = Math.min(1.0, p * 0.35), lungo = p - pian, pedata = lungo / meta, pedataRitorno = lungo / (n - meta), rampa = (l - 0.2) / 2;
      const xA = -(0.1 + rampa / 2), xB = 0.1 + rampa / 2;
      return [
        ...Array.from({ length: meta }, (_, i) => b("legno", xA, p / 2 - pedata * (i + 0.5), 0, rampa, pedata, alza * (i + 1))),
        b("legno", 0, -p / 2 + pian / 2, 0, l, pian, alza * meta),
        ...Array.from({ length: n - meta }, (_, j) => b("legno", xB, -p / 2 + pian + pedataRitorno * (j + 0.5), 0, rampa, pedataRitorno, alza * (meta + j + 1))),
      ];
    },
  },
  // Scala a chiocciola: palo centrale e gradini a ventaglio, un giro completo dal piano al piano sopra.
  scala_chiocciola: {
    nome: "Scala a chiocciola",
    misure: { l: 1.6, p: 1.6, h: 2.8 },
    blocchi: (l, p, h) => {
      const R = Math.min(l, p) / 2, palo = 0.1, n = Math.max(10, Math.round(h / 0.175)), alza = h / n;
      const raggio = R - palo, centro = palo + raggio / 2, largo = Math.max(0.2, ((2 * Math.PI * centro) / n) * 0.98);
      return [
        b("metallo", 0, 0, 0, palo * 2, palo * 2, h),
        ...Array.from({ length: n }, (_, i) => {
          const a = ((i + 0.5) / n) * 2 * Math.PI;
          return { ...b("legno", Math.cos(a) * centro, Math.sin(a) * centro, alza * (i + 1) - 0.05, raggio, largo, 0.05), girata: a };
        }),
      ];
    },
  },
  ascensore: {
    nome: "Ascensore",
    misure: { l: 1.5, p: 1.5, h: 2.8 },
    blocchi: (l, p, h, opz) => {
      const s = 0.12, porta = Math.min(0.9, l - 0.4), alta = Math.min(2.1, h), lato = (l - porta) / 2;
      // la cabina, dove l'ascensore si ferma: pianale, tre pareti e le due ante della porta socchiuse
      const cl = l - 2 * s - 0.16, cp = p - 2 * s - 0.2, cz = -p / 2 + s + 0.04 + cp / 2, ch = Math.min(2.2, h - 0.1), t = 0.04;
      const cabina = opz?.senzaCabina ? [] : [
        b("metallo", 0, cz, 0.02, cl, cp, 0.04),
        b("metallo", 0, cz - cp / 2 + t / 2, 0.04, cl, t, ch),
        b("metallo", -cl / 2 + t / 2, cz, 0.04, t, cp - 2 * t, ch),
        b("metallo", cl / 2 - t / 2, cz, 0.04, t, cp - 2 * t, ch),
        b("laccato", 0, cz + cp / 2 - t / 2, ch + 0.04, cl, cp, 0.04),
        b("laccato", -cl / 4 - 0.1, cz + cp / 2 - t / 2, 0.04, cl / 2 - 0.2, t, Math.min(2.0, ch)),
        b("laccato", cl / 4 + 0.1, cz + cp / 2 - t / 2, 0.04, cl / 2 - 0.2, t, Math.min(2.0, ch)),
      ];
      return [
        ...cabina,
        b("muro", 0, -p / 2 + s / 2, 0, l, s, h),
        b("muro", -l / 2 + s / 2, 0, 0, s, p - 2 * s, h),
        b("muro", l / 2 - s / 2, 0, 0, s, p - 2 * s, h),
        b("muro", -(porta + lato) / 2, p / 2 - s / 2, 0, lato, s, h),
        b("muro", (porta + lato) / 2, p / 2 - s / 2, 0, lato, s, h),
        ...(h > alta ? [b("muro", 0, p / 2 - s / 2, alta, porta, s, h - alta)] : []),
        ...(opz?.senzaCabina ? [b("metallo", 0, p / 2 - s / 2, 0, porta, 0.04, alta)] : []),
      ];
    },
  },
  scala: {
    nome: "Scala",
    misure: { l: 1.0, p: 4.5, h: 2.8 },
    blocchi: (l, p, h) => {
      // si sale verso il «retro» (in alto sulla pianta): gradini da circa 28 × 17,5 cm
      const n = Math.max(3, Math.round(h / 0.175));
      const pedata = p / n;
      return Array.from({ length: n }, (_, i) => b("legno", 0, p / 2 - pedata * (i + 0.5), 0, l, pedata, (h / n) * (i + 1)));
    },
  },
  // ─── impianti: piccoli e alla loro quota (h = altezza da terra), non scatole sul pavimento ───
  presa: { nome: "Presa", misure: { l: 0.08, p: 0.02, h: 0.3 }, blocchi: (_l, p, h) => [b("ceramica", 0, -p / 2, h - 0.04, 0.08, 0.015, 0.08)] },
  interruttore: { nome: "Interruttore", misure: { l: 0.08, p: 0.02, h: 1.1 }, blocchi: (_l, p, h) => [b("ceramica", 0, -p / 2, h - 0.04, 0.08, 0.015, 0.08)] },
  punto_luce: { nome: "Punto luce", misure: { l: 0.3, p: 0.3, h: 2.7 }, blocchi: (l, p, h) => [b("ceramica", 0, 0, Math.max(h - 0.06, 2.2), Math.min(l, 0.35), Math.min(p, 0.35), 0.05)] },
  split: { nome: "Split", misure: { l: 0.9, p: 0.25, h: 2.2 }, blocchi: (l, p, h) => [b("ceramica", 0, 0, Math.max(h - 0.3, 1.8), l, Math.min(p, 0.25), 0.3)] },
  termosifone: { nome: "Termosifone", misure: { l: 0.8, p: 0.12, h: 0.6 }, blocchi: (l, p, h) => [b("ceramica", 0, 0, 0.12, l, Math.min(p, 0.12), Math.min(h, 0.8))] },
  quadro_elettrico: { nome: "Quadro elettrico", misure: { l: 0.4, p: 0.12, h: 1.6 }, blocchi: (l, p, h) => [b("laccato", 0, -p / 2 + 0.05, Math.max(h - 0.3, 1.2), l, 0.1, 0.5)] },
  unita_esterna: { nome: "Unità esterna", misure: { l: 0.8, p: 0.3, h: 0.3 }, blocchi: (l, p) => [b("laccato", 0, 0, 0.1, l, p, 0.6)] },
  collettore: { nome: "Collettore", misure: { l: 0.5, p: 0.12, h: 0.4 }, blocchi: (l, p, h) => [b("laccato", 0, -p / 2 + 0.05, h, l, 0.1, 0.6)] },
  // ─── giardino e piscina ───
  piscina: {
    nome: "Piscina",
    misure: { l: 3.5, p: 6.5, h: PROFONDITA_PISCINA_CM / 100 },
    blocchi: () => [],
  },
  idromassaggio: { nome: "Minipiscina", misure: { l: 2.2, p: 2.2, h: 0 }, blocchi: (l, p) => [b("laccato", 0, 0, 0, l, p, 0.8), b("acqua", 0, 0, 0.8, l - 0.2, p - 0.2, 0.01)] },
  pergola: {
    nome: "Pergola",
    misure: { l: 4, p: 3, h: 2.5 },
    blocchi: (l, p, h) => {
      const hh = Math.max(h, 2.3);
      const pilastri = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => b("legno", sx * (l / 2 - 0.06), sz * (p / 2 - 0.06), 0, 0.12, 0.12, hh)));
      const n = Math.max(3, Math.round(p / 0.4));
      const lamelle = Array.from({ length: n }, (_, i) => b("legno", 0, -p / 2 + (p * (i + 0.5)) / n, hh, l + 0.2, 0.08, 0.14));
      return [...pilastri, b("legno", 0, -p / 2 + 0.06, hh - 0.18, l, 0.12, 0.18), b("legno", 0, p / 2 - 0.06, hh - 0.18, l, 0.12, 0.18), ...lamelle];
    },
  },
  albero: { nome: "Albero", misure: { l: 3, p: 3, h: 0 }, blocchi: (l, p) => [b("legno", 0, 0, 0, 0.3, 0.3, 2.2), b("fogliame", 0, 0, 2.0, l, p, Math.max(l, p) * 0.8), b("fogliame", 0, 0, 2.0 + Math.max(l, p) * 0.8, l * 0.6, p * 0.6, Math.max(l, p) * 0.4)] },
  siepe: { nome: "Siepe", misure: { l: 3, p: 0.6, h: 1.2 }, blocchi: (l, p, h) => [b("fogliame", 0, 0, 0, l, p, Math.max(h, 0.6))] },
  aiuola: { nome: "Aiuola", misure: { l: 2, p: 1, h: 0 }, blocchi: (l, p) => [b("pietra", 0, 0, 0, l, p, 0.2), b("fogliame", 0, 0, 0.2, l - 0.1, p - 0.1, 0.35)] },
  ombrellone: { nome: "Ombrellone", misure: { l: 3, p: 3, h: 0 }, blocchi: (l, p) => [b("metallo", 0, 0, 0, 0.05, 0.05, 2.3), b("lenzuola", 0, 0, 2.2, l, p, 0.12)] },
  lettino: { nome: "Lettino", misure: { l: 0.7, p: 1.9, h: .32 }, blocchi: () => [] },
  tavolo_esterno: { nome: "Tavolo da esterno", misure: { l: 2, p: 1, h: 0 }, blocchi: (l, p) => [b("legno", 0, 0, 0.72, l, p, 0.04), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b("legno", sx * (l / 2 - 0.08), sz * (p / 2 - 0.08), 0, 0.06, 0.06, 0.72)))] },
  barbecue: { nome: "Barbecue", misure: { l: 1.5, p: 0.6, h: 0 }, blocchi: (l, p) => [b("pietra", 0, 0, 0, l, p, 0.9), b("piano_cucina", 0, 0, 0.9, l * 0.45, p * 0.8, 0.05), b("pietra", 0, -p / 2 + 0.15, 0.9, l * 0.4, 0.3, 1.1)] },
  cancello_pedonale: { nome: "Cancello pedonale", misure: { l: 1.1, p: 0.12, h: 1.5 }, blocchi: (l, p, h) => [b("metallo", -l / 2 + 0.05, 0, 0, 0.1, 0.1, h + 0.1), b("metallo", l / 2 - 0.05, 0, 0, 0.1, 0.1, h + 0.1), b("recinzione", 0, 0, 0.05, l - 0.12, 0.03, h)] },
  cancello_carrabile: { nome: "Cancello carrabile", misure: { l: 4, p: 0.12, h: 1.5 }, blocchi: (l, p, h) => [b("muro", -l / 2 - 0.15, 0, 0, 0.3, 0.3, h + 0.3), b("muro", l / 2 + 0.15, 0, 0, 0.3, 0.3, h + 0.3), b("recinzione", 0, 0, 0.05, l, 0.04, h)] },
  lampione: { nome: "Lampione", misure: { l: 0.3, p: 0.3, h: 3 }, blocchi: (l, p, h) => [b("metallo", 0, 0, 0, 0.08, 0.08, Math.max(h, 2.5) - 0.3), b("lenzuola", 0, 0, Math.max(h, 2.5) - 0.35, l, p, 0.35)] },
  faretto_giardino: { nome: "Faretto", misure: { l: 0.15, p: 0.15, h: 0 }, blocchi: (l, p) => [b("metallo", 0, 0, 0, l, p, 0.4)] },
  irrigatore: { nome: "Irrigatore", misure: { l: 0.2, p: 0.2, h: 0 }, blocchi: (l, p) => [b("piano_cucina", 0, 0, 0, l * 0.4, p * 0.4, 0.1)] },
  pozzetto: { nome: "Pozzetto", misure: { l: 0.4, p: 0.4, h: 0 }, blocchi: (l, p) => [b("piano_cucina", 0, 0, 0, l, p, 0.02)] },
  pompa_calore: { nome: "Pompa di calore", misure: { l: 1.0, p: 0.4, h: 0 }, blocchi: (l, p) => [b("metallo", 0, 0, 0.1, l, p, 0.85)] },
  bollitore: { nome: "Bollitore", misure: { l: 0.6, p: 0.6, h: 0 }, blocchi: (l, p) => [b("ceramica", 0, 0, 0, l, p, 1.6)] },
  inverter: { nome: "Inverter", misure: { l: 0.5, p: 0.2, h: 1.4 }, blocchi: (l, p, h) => [b("ceramica", 0, -p / 2 + 0.1, Math.max(h - 0.25, 0.8), l, 0.2, 0.5)] },
  batteria_accumulo: { nome: "Batteria", misure: { l: 0.6, p: 0.25, h: 0 }, blocchi: (l, p) => [b("ceramica", 0, 0, 0, l, p, 1.1)] },
  wallbox: { nome: "Wallbox", misure: { l: 0.3, p: 0.15, h: 1.2 }, blocchi: (l, p, h) => [b("piano_cucina", 0, -p / 2 + 0.06, Math.max(h - 0.2, 0.8), l, 0.12, 0.4)] },
  termostato: { nome: "Termostato", misure: { l: 0.12, p: 0.03, h: 1.5 }, blocchi: (_l, p, h) => [b("ceramica", 0, -p / 2, h - 0.05, 0.12, 0.02, 0.1)] },
  // punto quotato: un picchetto alla quota del terreno (h = quota, la passa la scena)
  quota_terreno: { nome: "Punto quotato", misure: { l: 0.06, p: 0.06, h: 0 }, blocchi: (_l, _p, h) => [b("legno", 0, 0, h, 0.05, 0.05, 0.45), b("laccato", 0, 0, h + 0.4, 0.12, 0.02, 0.08)] },
  // lucernario: il vetro sulla falda (in mansarda la scena lo porta alla quota del tetto)
  lucernario: { nome: "Lucernario", misure: { l: 0.78, p: 1.18, h: 2.2 }, blocchi: (l, p, h) => [b("vetro", 0, 0, Math.max(h - 0.04, 0.5), l, p, 0.04), b("metallo", 0, -p / 2 + 0.03, Math.max(h - 0.07, 0.5), l, 0.06, 0.07)] },
  vmc: { nome: "VMC", misure: { l: 0.6, p: 0.45, h: 2.6 }, blocchi: (l, p, h) => [b("metallo", 0, 0, Math.max(h - 0.3, 2.0), l, p, 0.3)] },
  // a filo pavimento o nel muro: nel 3D non si vedono
  punto_acqua: { nome: "Punto acqua", misure: { l: 0.05, p: 0.05, h: 0.5 }, blocchi: () => [] },
  scarico: { nome: "Scarico", misure: { l: 0.05, p: 0.05, h: 0 }, blocchi: () => [] },
  colonna_scarico: { nome: "Colonna di scarico", misure: { l: 0.16, p: 0.16, h: 0 }, blocchi: () => [] },
  caldaia: {
    nome: "Caldaia",
    misure: { l: 0.4, p: 0.3, h: 0.7 },
    blocchi: (l, p, h) => [b("laccato", 0, 0, 1.3, l, p, h)],
  },
};

const GENERICO: ModelloElemento = {
  nome: "Elemento",
  misure: { l: 0.6, p: 0.6, h: 0.8 },
  blocchi: (l, p, h) => [b("laccato", 0, 0, 0, l, p, h)],
};

/** Il modello del tipo; per i tipi composti («letto_matrimoniale», «piatto_doccia») vale la prima parola che si conosce. */
// I campi sportivi: misure di partenza dal regolamento; il 3D lo fa costruisciCampo.
for (const c of CAMPI) MODELLI[c.tipo] = { nome: c.nome, misure: { l: c.ingombro[0] / 100, p: c.ingombro[1] / 100, h: 0 }, blocchi: () => [] };

/** Altezza della rete (cm): dal suolo fino a… (pallavolo: rete alta, staccata da terra). */
const RETI: Record<string, { da: number; a: number; pali: number }> = {
  campo_tennis: { da: 0, a: 107, pali: 107 }, campo_padel: { da: 0, a: 88, pali: 92 },
  campo_pallavolo: { da: 143, a: 243, pali: 255 }, campo_beach_volley: { da: 143, a: 243, pali: 255 },
  campo_pickleball: { da: 0, a: 91, pali: 91 },
};
const TRAVERSA: Record<string, number> = { campo_calcio5: 200, campo_calcio7: 200, campo_calcio11: 244 };

/** Un campo sportivo: fondo, campo di gioco, linee, rete, porte, canestri, pareti del padel. */
function costruisciCampo(tipo: string, centro: { x: number; z: number }, rotazione: number, l: number, p: number, costruttore: (materiale: string) => CostruttoreMesh): void {
  const d = definizioneCampo(tipo), g = disegnoCampo(tipo, l * 100, p * 100);
  if (!d || !g) return;
  const m = (v: number) => v / 100;
  const sc = (mat: string, x: number, z: number, y: number, ll: number, pp: number, h: number, girata = 0) => costruttore(mat).scatola(centro.x, centro.z, y, ll, pp, h, rotazione, x, z, girata);
  // tre livelli ben staccati (fondo 3 cm, campo 8, linee 11): da lontano superfici quasi
  // sovrapposte tremolano, e i campi grandi si guardano da 100 metri
  // le facce sotto finiscono sotto il terreno (che le copre), altrimenti lottano con quelle sopra
  sc(d.materiale.fuori, 0, 0, -0.2, l, p, 0.23);
  const gi = g.gioco;
  sc(d.materiale.gioco, m((gi.x0 + gi.x1) / 2), m((gi.y0 + gi.y1) / 2), -0.2, m(gi.x1 - gi.x0), m(gi.y1 - gi.y0), 0.28);
  // linee: un listello sottile per ogni tratto, girato come il tratto
  const lineaMat = tipo === "campo_beach_volley" ? "linee_blu" : "linee";
  const tratto = (a: { x: number; y: number }, b: { x: number; y: number }, mat: string, y: number, spessore: number, alto: number) => {
    const lungo = Math.hypot(b.x - a.x, b.y - a.y);
    if (lungo < 1) return;
    sc(mat, m((a.x + b.x) / 2), m((a.y + b.y) / 2), y, m(lungo) + spessore, spessore, alto, Math.atan2(b.y - a.y, b.x - a.x));
  };
  for (const linea of g.linee) for (let i = 0; i + 1 < linea.length; i++) tratto(linea[i], linea[i + 1], lineaMat, 0, 0.06, 0.11);
  // rete e pali
  const r = RETI[tipo];
  if (g.rete && r) {
    const [a, b] = g.rete;
    const lungo = Math.hypot(b.x - a.x, b.y - a.y);
    sc("rete", m((a.x + b.x) / 2), m((a.y + b.y) / 2), m(r.da), 0.02, m(lungo), m(r.a - r.da));
    for (const q of g.pali) sc("metallo", m(q.x), m(q.y), 0, 0.08, 0.08, m(r.pali));
  }
  // porte da calcio: due pali sulla linea di fondo e la traversa
  const traversa = TRAVERSA[tipo];
  if (traversa) for (const po of g.porte) {
    const xl = Math.abs(po.x0) < Math.abs(po.x1) ? po.x0 : po.x1;
    for (const y of [po.y0, po.y1]) sc("linee", m(xl), m(y), 0, 0.12, 0.12, m(traversa));
    sc("linee", m(xl), m((po.y0 + po.y1) / 2), m(traversa) - 0.12, 0.12, m(po.y1 - po.y0) + 0.12, 0.12);
    sc("rete", m((po.x0 + po.x1) / 2), m((po.y0 + po.y1) / 2), 0, m(po.x1 - po.x0), m(po.y1 - po.y0), m(traversa) * 0.9);
  }
  // canestri: palo dietro la linea di fondo, tabellone, ferro a 3,05 m
  for (const c of g.canestri) {
    const verso = c.x > 0 ? 1 : -1;
    sc("metallo", m(c.x + verso * 280), 0, 0, 0.2, 0.2, 3.0);
    sc("metallo", m(c.x + verso * 140), 0, 2.9, m(280), 0.12, 0.12);
    sc("vetro", m(c.x + verso * 40), 0, 2.9, 0.05, 1.8, 1.05);
    sc("arancio", m(c.x), 0, 3.03, 0.45, 0.45, 0.03);
  }
  // padel: pareti di vetro e rete metallica
  for (const pr of g.pareti) tratto(pr.a, pr.b, pr.vetro ? "vetro" : "recinzione", 0, 0.05, m(pr.altezza));
}

export function chiaveModelloElemento(tipo: string): string | null {
  const t = tipo.toLowerCase();
  return MODELLI[t] ? t : t.split(/[_\s-]+/).find((p) => MODELLI[p]) ?? null;
}

export function modelloElemento(tipo: string): ModelloElemento {
  const chiave = chiaveModelloElemento(tipo);
  return chiave ? MODELLI[chiave] : GENERICO;
}

function blocchiModulari(l: number, p: number, h: number): Blocco[] {
  const n = Math.max(2, Math.round(l / .78)), modulo = l / n;
  return Array.from({ length: n }, (_, i) => {
    const x = (i + .5 - n / 2) * modulo;
    return [
      b("tessuto", x, 0, h * .055, modulo - .007, p, h * .345, .056),
      b("tessuto", x, p * .093, h * .398, modulo - .01, p * .81, h * .13, .049),
      b("tessuto", x, -p * .31, h * .4, modulo - .011, p * .36, h * .6, .068),
    ];
  }).flat();
}

function mobileTv(l: number, p: number, h: number, sospeso: boolean): Blocco[] {
  const base = sospeso ? h * .37 : h * .16;
  const corpo = h - base;
  return [
    b("legno", 0, -p * .03, base, l, p * .94, corpo, .013),
    ...[-1, 0, 1].map(i => b("legno", l * i / 3, p * .464, base + .004, l / 3 - .005, p * .067, corpo - .009, .004)),
    ...(!sospeso ? [-1, 1].flatMap(x => [-1, 1].map(z => b("metallo", x * l * .39, z * p * .33, 0, .045, .059, base, .006))) : []),
    b("metallo", 0, 0, h, .22, .18, .06),
    b("schermo", 0, 0, h + .06, Math.min(l * .72, 1.3), .035, .75, .008),
  ];
}

function mobileTvOLED(l: number, p: number, h: number): Blocco[] {
  const base = h * .24, fronte = p * .448, n = Math.max(2, Math.round(l / .52)), modulo = l / n;
  const w = Math.min(1.222, l * .95), quota = h + .21, d = Math.min(.0451, p * .22);
  const schermo = w * .703 / 1.222;
  const retro = -p / 2 + d / 2 + .011;
  const doghe = Math.max(1, Math.ceil(modulo / .031));
  return [
    b("rovere_chiaro", 0, -p * .032, base, l, p * .9, h - base, .008),
    ...Array.from({ length: n }, (_, i) => {
      const x = (i + .5 - n / 2) * modulo;
      return [
        b("grafite", x, fronte, base + .007, modulo - .007, p * .065, h - base - .015, .003),
        ...Array.from({ length: doghe }, (_, j) => b("rovere_chiaro", x + (j + .5 - doghe / 2) * modulo / doghe,
          fronte + p * .028, base + .009, modulo / doghe * .79, p * .038, h - base - .020, .002)),
      ];
    }).flat(),
    b("grafite", 0, retro, quota + .012, w * .63, d, schermo * .58, .005),
    b("grafite", 0, retro + d * .55, quota, w, .009, schermo, .003),
    b("schermo", 0, retro + d * .55 + .0045, quota + .006, w - .011, .0018, schermo - .011, .001),
    b("spia", w * .417, retro + d * .55 + .005, quota + .002, .003, .002, .002),
  ];
}

function armadioRovere(l: number, p: number, h: number, cannettato = false): Blocco[] {
  const moduli = Math.max(2, Math.min(12, Math.round(l / .55))), passo = l / moduli;
  const zoccolo = Math.min(.072, h * .1), anta = Math.min(.022, p * .12), fronte = (p - anta) / 2;
  const gola = Math.min(.021, passo * .11);
  return [
    b("grafite", 0, 0, 0, l * .95, p * .86, zoccolo),
    b("rovere_chiaro", 0, -anta, zoccolo, l, p - 2 * anta, h - zoccolo, .003),
    ...Array.from({ length: moduli }, (_, i) => {
      const x = (i + .5 - moduli / 2) * passo;
      const doghe = Math.max(3, Math.round(passo / .032));
      return [
        b("rovere_chiaro", x - gola / 2, fronte - (cannettato ? .006 : 0), zoccolo + .004, passo - gola - .004, anta, h - zoccolo - .007, .0025),
        b("grafite", x + (passo - gola) / 2, fronte - anta * .30, zoccolo + .006, gola, anta * .22, h - zoccolo - .010, .001),
        ...(cannettato ? Array.from({ length: doghe }, (_, j) => {
          const d = (passo - gola - .007) / doghe;
          return b("rovere_chiaro", x - gola / 2 + (j + .5 - doghe / 2) * d, fronte + anta * .18, zoccolo + .009,
            d * .76, anta * .34, h - zoccolo - .018, .0016);
        }) : []),
      ];
    }).flat(),
  ];
}

function libreriaConLibri(l: number, p: number, h: number): Blocco[] {
  const s = Math.min(.024, p * .11, h * .065, l * .085), base = h * .27, mezzo = (l - s) / 2;
  const ripiani = 4, passo = (h - base - s) / ripiani, frontale = p / 2 - s / 2;
  const colori = ["libro_ruggine", "libro_verde", "libro_tela", "grafite"];
  return [
    ...[-1, 1].map(x => b("rovere_chiaro", x * mezzo, 0, 0, s, p, h - s, .003)),
    b("rovere_chiaro", 0, -p / 2 + s / 2, 0, l - s * 2, s, h - s),
    b("rovere_chiaro", 0, -s / 2, .01, l - s * 2, p - s * 2, base - .009, .004),
    ...[-1, 1].flatMap(x => [
      b("rovere_chiaro", x * l * .24, frontale, .013, l * .47 - s, s, base - .024, .003),
      b("grafite", x * l * .24, p / 2 - .005, base - .046, l * .1, .01, .009, .002),
    ]),
    b("rovere_chiaro", 0, 0, h - s, l, p, s, .003),
    ...Array.from({ length: ripiani }, (_, i) => {
      const quota = base + i * passo, n = i % 2 ? 5 : 8, lato = i % 2 ? 1 : -1;
      const luce = Math.min(l * .49, p * 1.32), larghezza = luce / n;
      return [
        b("rovere_chiaro", 0, 0, quota, l - 2 * s, p, s, .003),
        ...Array.from({ length: n }, (_, j) => {
          const x = lato * (l / 2 - s * 1.65 - (j + .5) * larghezza);
          const altezza = (passo - s) * (.59 + ((i * 13 + j * 7) % 9) * .033);
          const d = p * (.58 + (j % 3) * .042), z = p * .075;
          return [
            b(colori[(i + j) % colori.length], x, z, quota + s + .0005, larghezza * .91, d, altezza, .002),
            b("carta", x, z - .002, quota + s + altezza * .08, larghezza * .69, d * .88, altezza * .93, .001),
          ];
        }).flat(),
      ];
    }).flat(),
  ];
}

function blocchiVetrinetta(l: number, p: number, h: number): Blocco[] {
  const bordo = Math.min(.023, l * .065, p * .115, h * .09);
  const base = h * .105, alto = h - bordo, vano = alto - base;
  const dentro = l - 2 * bordo, fronte = p / 2 - bordo / 2;
  const gomma = Math.min(.017, bordo * .68);
  return [
    b("grafite", 0, 0, 0, l * .91, p * .84, base, .006),
    ...[-1, 1].map(x => b("rovere_chiaro", (l - bordo) / 2 * x, 0, base, bordo, p, vano, .003)),
    b("rovere_chiaro", 0, -p / 2 + bordo / 2, base, dentro, bordo, vano),
    b("rovere_chiaro", 0, 0, alto, l, p, bordo, .004),
    ...[0, .36, .67].map(y => b("rovere_chiaro", 0, -bordo * .5, base + vano * y, dentro, p - 2 * bordo, bordo, .002)),
    ...[-1, 1].flatMap(i => {
      const larghezza = dentro / 2 - gomma * .22, centro = i * dentro / 4;
      return [
        b("vetro_fume", centro, fronte, base + gomma, larghezza - gomma * 1.8, bordo * .22, vano - gomma * 2),
        ...[-1, 1].map(x => b("grafite", centro + x * (larghezza - gomma) / 2, fronte, base, gomma, bordo, vano)),
        ...[base, alto - gomma].map(y => b("grafite", centro, fronte, y, larghezza - 2 * gomma, bordo, gomma)),
        b("ottone", centro - i * larghezza * .36, p / 2 - bordo * .07, base + vano * .52,
          gomma * .43, bordo * .13, vano * .087, .001),
      ];
    }),
    b("luce_calda", 0, -p * .275, alto - bordo * .29, dentro * .93, bordo * .57, bordo * .28),
    b("libro_verde", l * .13, -.06 * p, base + bordo, l * .06, p * .40, vano * .12, .004),
    b("libro_ruggine", l * .21, -.06 * p, base + bordo, l * .06, p * .42, vano * .15, .004),
  ];
}

function ceramicheNellaVetrina(l: number, p: number, h: number, centro: { x: number; z: number }, r: number,
  costruttore: (materiale: string) => CostruttoreMesh) {
  const bordo = Math.min(.023, l * .065, p * .115, h * .09), base = h * .105, vano = h - bordo - base;
  const raggio = Math.min(l * .098, p * .21), cos = Math.cos(r), sin = Math.sin(r);
  const vaso = (materiale: string, x: number, quota: number, altezza: number, larghezza: number, profilo: [number, number][]) =>
    profiloTondo(costruttore(materiale), centro.x + x * cos, centro.z + x * sin,
      profilo.map(([y, rr]) => [quota + y * altezza, rr * larghezza]));
  const ripianoMedio = base + vano * .36 + bordo;
  const collo: [number, number][] = [[0, .03], [0, .63], [.07, .73], [.30, .96], [.52, 1],
    [.67, .83], [.80, .49], [.91, .41], [1, .43], [1, .36], [.82, .34], [.58, .72], [.23, .73], [.14, .03]];
  vaso("ceramica_satinata", -l * .19, ripianoMedio, vano * .23, raggio * .85, collo);
  vaso("terracotta", l * .21, ripianoMedio, vano * .15, raggio, collo);
  vaso("piano_travertino", -l * .20, base + vano * .67 + bordo, vano * .055, raggio * 1.35,
    [[0, .03], [0, .62], [.30, .79], [1, 1], [1, .91], [.54, .77], [.31, .03]]);
}

function grillDaEsterno(l: number, p: number, h: number): Blocco[] {
  const top = h * .758, lastra = Math.min(.054, h * .085), base = h * .085;
  const piano = top + lastra, corpo = top - base;
  const box = l * .52, x = l * .19, sportello = Math.min(.028, p * .12);
  return [
    b("grafite", 0, 0, 0, l * .90, p * .83, base, .008),
    b("pietra", 0, -sportello / 2, base, l, p - sportello, corpo, .005),
    b("piano_travertino", 0, 0, top, l, p, lastra, .009),
    ...[-1, 1].flatMap(i => {
      const centro = i * l * .247, w = l * .478, n = 12;
      return [
        b("grafite", centro, p / 2 - sportello / 2, base + .007, w, sportello * .44, corpo - .012, .004),
        ...Array.from({ length: n }, (_, j) =>
          b("rovere_chiaro", centro + w * ((j + .5) / n - .5), p / 2 - sportello * .17, base + .011,
            w / n * .73, sportello * .32, corpo - .021, .002)),
      ];
    }),
    b("inox", x, -.025 * p, piano, box, p * .87, (h - piano) * .27, .014),
    b("inox", x, -.067 * p, piano + (h - piano) * .27, box * .985, p * .742, (h - piano) * .73, .044),
    b("ottone", x, p * .327, piano + (h - piano) * .50, box * .68, p * .035, (h - piano) * .086, .007),
    ...[-1, 0, 1].map(i => b("grafite", x + i * box * .225, p * .446, piano + (h - piano) * .075,
      box * .084, p * .06, (h - piano) * .11, .006)),
    b("guarnizione", x, p * .406, piano + (h - piano) * .258, box * .974, p * .016, (h - piano) * .032, .002),
  ];
}

function specchioLuminoso(l: number, p: number, h: number): Blocco[] {
  const lastra = Math.min(l * 1.12, h * .54), base = h - lastra;
  const bordo = Math.min(.026, l * .086, lastra * .082);
  return [
    b("grafite", 0, -p * .19, base, l, p * .62, lastra, bordo * .73),
    b("luce_specchio", 0, p * .202, base + .001, l * .991, p * .15, lastra - .002, bordo * .71),
    b("specchio", 0, p * .375, base + bordo, l - bordo * 2, p * .248, lastra - bordo * 2, bordo * .58),
  ];
}

function sedutaTeak(l: number, p: number, h: number): Blocco[] {
  const telaio = Math.min(.055, l * .1, p * .12), seduta = h * .54, zoccolo = h * .168;
  const posti = Math.max(1, Math.round(l / .64)), passi = (l - 3 * telaio) / posti;
  return [
    ...[-1, 1].flatMap(x => [-1, 1].map(z => b("rovere_chiaro", x * (l - telaio) / 2, z * (p - telaio) / 2, 0,
      telaio, telaio, z < 0 ? h * .87 : h * .73, .005))),
    ...[-1, 1].map(f => b("rovere_chiaro", f * (l - telaio) / 2, 0, h * .70, telaio, p, telaio, .008)),
    b("rovere_chiaro", 0, 0, zoccolo, l, p, Math.min(.068, h * .18), .006),
    ...[.34, .52, .70].map(y => b("rovere_chiaro", 0, -p / 2 + telaio / 2, h * y, l, telaio, telaio * .84, .005)),
    ...Array.from({ length: posti }, (_, i) => {
      const x = (i + .5 - posti / 2) * passi;
      return [
        b("tessuto", x, p * .055, zoccolo + Math.min(.068, h * .18), passi * .97, p * .79,
          seduta - zoccolo - Math.min(.068, h * .18), .035),
        { ...b("tessuto", x, -p * .335, seduta - .01, passi * .95, p * .204, h - seduta + .010, .051), girata: i % 2 ? .03 : -.028 },
      ];
    }).flat(),
  ];
}

function pergolaLuce(l: number, p: number, h: number): Blocco[] {
  const trave = Math.min(.13, l / 9, p / 9, h / 4), sotto = h - trave, montante = trave * .78;
  const n = Math.max(4, Math.round(p / .185));
  return [
    ...[-1, 1].flatMap(x => [-1, 1].map(z => b("grafite", x * (l - montante) / 2, z * (p - montante) / 2,
      0, montante, montante, sotto, .003))),
    ...[-1, 1].flatMap(z => [
      b("grafite", 0, z * (p - trave) / 2, sotto, l, trave, trave, .003),
    ]),
    b("luce_calda", 0, (p - trave) / 2, sotto - .005, l - trave * 2, trave * .105, .005),
    ...[-1, 1].map(x => b("grafite", x * (l - trave) / 2, 0, sotto, trave, p - 2 * trave, trave, .003)),
    ...Array.from({ length: n }, (_, i) => b("rovere_chiaro", 0, (i + .5 - n / 2) * (p - 2 * trave) / n,
      sotto + trave * .41, l - 2 * trave, p / n * .60, trave * .45, .003)),
  ];
}

function lettoInLino(l: number, p: number, h: number, centro: { x: number; z: number }, r: number,
  fabbrica: (materiale: string) => CostruttoreMesh, cassetti = false) {
  const quota = h > .12 ? h : .5;
  const struttura = MODELLI.letto.blocchi(l, p, quota).filter(bl => bl.materiale !== "copriletto" && bl.materiale !== "tessuto");
  for (const bl of struttura) {
    const contenitore = cassetti && bl.materiale === "legno" && bl.l === l;
    fabbrica(contenitore ? "rovere_chiaro" : bl.materiale).scatola(centro.x, centro.z, bl.y,
      contenitore ? l * .94 : bl.l, bl.p, bl.h, r, bl.x, bl.z, 0, bl.raggio);
  }
  if (cassetti) {
    for (const lato of [-1, 1]) for (const z of [-p * .215, p * .224]) {
      const y = Math.min(.068, quota * .15), sp = Math.min(.02, l * .041);
      fabbrica("rovere_chiaro").scatola(centro.x, centro.z, y + .007, sp, p * .407, quota * .47 - y, r, lato * (l - sp) / 2, z, 0, .005);
      fabbrica("grafite").scatola(centro.x, centro.z, quota * .41, .004, p * .079, .012, r, lato * (l / 2 - .002), z, 0, .002);
    }
  }
  const tessuto = fabbrica("tessuto");
  const testiera = altezzaTestieraLetto(quota * 100) / 100, moduli = Math.max(3, Math.min(12, Math.round(l / .23)));
  const sp = Math.min(.095, p * .085), base = Math.min(.067, quota * .15), intervallo = l / moduli;
  for (let i = 0; i < moduli; i++) tessuto.scatola(centro.x, centro.z, base, intervallo * .99, sp, testiera - base,
    r, (i + .5 - moduli / 2) * intervallo, -(p - sp) / 2, 0, Math.min(.035, sp * .38));

  // Il copriletto segue il materasso e scende sui lati con pieghe.
  const coperta = fabbrica("copriletto"), c = Math.cos(r), s = Math.sin(r);
  const abbassamento = Math.min(.18, quota * .37);
  const avvolgi = (u: number, v: number) => abbassamento * Math.max(Math.abs(u) ** 16, Math.max(0, v) ** 22);
  const y = (u: number, v: number) => quota + .03 - avvolgi(u, v)
    + Math.sin(u * 18 + v * 4) * Math.cos(v * 8 + u * 2) * (.006 + .009 * Math.abs(u) ** 4);
  const punto = (u: number, v: number): V3 => {
    const x = u * l / 2, z = p * (.177 + .322 * v);
    return [centro.x + x * c - z * s, y(u, v), centro.z + x * s + z * c];
  };
  const normale = (u: number, v: number): V3 => {
    const dx = -(y(u + .001, v) - y(u - .001, v)) / (.001 * l);
    const dz = -(y(u, v + .001) - y(u, v - .001)) / (.000644 * p);
    const k = Math.hypot(dx, 1, dz);
    return [(dx * c - dz * s) / k, 1 / k, (dx * s + dz * c) / k];
  };
  for (let i = 0; i < 40; i++) for (let j = 0; j < 36; j++) {
    const u = i / 20 - 1, v = j / 18 - 1, du = .05, dv = 1 / 18;
    coperta.quadLiscio([punto(u, v), punto(u + du, v), punto(u + du, v + dv), punto(u, v + dv)],
      [normale(u, v), normale(u + du, v), normale(u + du, v + dv), normale(u, v + dv)]);
  }
  coperta.tubo(Array.from({ length: 45 }, (_, i) => punto(i / 22 - 1, -1)), .004, 7);
}

function pareteTv(l: number, p: number, h: number, led: boolean): Blocco[] {
  const moduli = Math.max(3, Math.ceil(l / .58));
  const modulo = l / moduli;
  const base = Math.min(.43, h * .28);
  const zoccolo = Math.min(.035, base * .26);
  const fuga = Math.min(.004, modulo * .09, base * .05);
  const pannello = Math.min(.055, p * .22);
  const schermo = { l: Math.min(1.55, l * .65), h: Math.min(.88, h * .43) };
  const profilo = Math.min(.048, p * .17, h * .04);
  const quotaLed = h - profilo;
  return [
    b("legno", 0, -p * .07, zoccolo, l - 2 * fuga, p * .86, base - zoccolo, .006),
    ...Array.from({ length: moduli }, (_, i) => {
      const x = (i + .5 - moduli / 2) * modulo;
      return [
        b("legno", x, -p / 2 + pannello / 2, base, modulo - fuga, pannello, h - base, .002),
        b("legno", x, p * .461, zoccolo + fuga, modulo - fuga, p * .072, base - zoccolo - 2 * fuga, .004),
      ];
    }).flat(),
    b("schermo", 0, -p / 2 + pannello + .029, base + Math.min(.25, h * .11), schermo.l, .06, schermo.h, .009),
    ...(led ? [
      b("legno", 0, -p / 2 + pannello + profilo / 2, quotaLed, l, profilo, profilo, .003),
      b("luce_calda", 0, -p / 2 + pannello + profilo / 2, quotaLed - .005, l * .96, profilo * .45, .005),
    ] : []),
  ];
}

function scalaConRinghiera(gradini: Blocco[], centro: { x: number; z: number }, r: number, costruttore: (materiale: string) => CostruttoreMesh): void {
  const legno = costruttore("legno"), metallo = costruttore("grafite");
  const c = Math.cos(r), s = Math.sin(r);
  const punto = (x: number, y: number, z: number): V3 => [centro.x + c * x - s * z, y, centro.z + s * x + c * z];
  for (const gradino of gradini) {
    const quota = gradino.y + gradino.h;
    const spessore = Math.min(.052, quota * .64);
    legno.scatola(centro.x, centro.z, quota - spessore, gradino.l, gradino.p, spessore, r, 0, gradino.z, 0, .006);
  }
  // Geometria di visualizzazione. La quota di camminamento è la stessa delle pedate standard.
  const bordo = Math.max(0, gradini[0].l / 2 - .045);
  const altezzaCorrimano = .9;
  for (const lato of [-bordo, bordo]) {
    const corrimano: V3[] = [];
    const cosciale: V3[] = [];
    for (const gradino of gradini) {
      const quota = gradino.y + gradino.h;
      metallo.scatola(centro.x, centro.z, quota, .017, .017, altezzaCorrimano, r, lato, gradino.z, 0, .002);
      corrimano.push(punto(lato, quota + altezzaCorrimano, gradino.z));
      cosciale.push(punto(lato * .84, Math.max(.037, quota - .093), gradino.z));
    }
    legno.tubo(corrimano, .024);
    metallo.tubo(cosciale, .037);
  }
}

/** Profili circolari e superficie liscia per ceramiche e lampade. */
function profiloTondo(mesh: CostruttoreMesh, x: number, z: number, sezioni: ReadonlyArray<readonly [number, number]>) {
  const lati = 28;
  for (let i = 1; i < sezioni.length; i++) {
    const [y0, r0] = sezioni[i - 1], [y1, r1] = sezioni[i];
    for (let j = 0; j < lati; j++) {
      const a = j * 2 * Math.PI / lati, b = (j + 1) * 2 * Math.PI / lati;
      const punto = (a: number, y: number, r: number): V3 => [x + r * Math.cos(a), y, z + r * Math.sin(a)];
      const normale = (a: number): V3 => {
        const n = Math.hypot(y1 - y0, r1 - r0) || 1;
        return [(y1 - y0) * Math.cos(a) / n, (r0 - r1) / n, (y1 - y0) * Math.sin(a) / n];
      };
      mesh.quadLiscio([punto(a, y0, r0), punto(b, y0, r0), punto(b, y1, r1), punto(a, y1, r1)], [normale(a), normale(b), normale(b), normale(a)]);
    }
  }
}

function dettagliTavolo(l: number, p: number, h: number, centro: { x: number; z: number }, r: number, fabbrica: (materiale: string) => CostruttoreMesh) {
  const tessile = fabbrica("lino_avorio");
  tessile.scatola(centro.x, centro.z, h, l * .384, p * .97, .004, r, 0, 0, 0, .002);
  const rPiatto = Math.min(.119, p * .18, l * .17);
  for (const segno of [-1, 1]) {
    const offset = p * .27 * segno;
    profiloTondo(fabbrica("ceramica_smalto"), centro.x - offset * Math.sin(r), centro.z + offset * Math.cos(r),
      [[h + .004, .001], [h + .004, rPiatto * .73], [h + .017, rPiatto], [h + .024, rPiatto * .974], [h + .01, rPiatto * .69], [h + .01, .001]]);
  }
  const rVaso = Math.min(.058, rPiatto * .55);
  profiloTondo(fabbrica("pietra"), centro.x, centro.z, [[h + .004, .001], [h + .004, rVaso * .65], [h + .05, rVaso],
    [h + .108, rVaso * .68], [h + .135, rVaso * .36], [h + .135, rVaso * .29], [h + .108, rVaso * .45]]);
}

/**
 * Costruisce l'elemento in un costruttore per materiale.
 * Misure in metri; rotazione in radianti (in senso orario sulla pianta, cioè dall'asse x verso z).
 */
function costruisciScalaCad(
  alzate: AlzataCad[], l: number, p: number, h: number, centro: { x: number; z: number }, rotazione: number, mesh: CostruttoreMesh,
): void {
  const cos = Math.cos(rotazione), sin = Math.sin(rotazione);
  const pedate = pedateCad(alzate, l, p);
  const alzata = h / pedate.length;
  pedate.forEach((pedata, i) => {
    const quota = alzata * (i + 1);
    const bordo = pedata.map(({ x, y }) => ({ x: centro.x + x * cos - y * sin, y: centro.z + x * sin + y * cos }));
    const sotto = bordo.map(({ x, y }, j): V3 => [x, Math.max(0, quota - (j < 2 ? alzata : 0) - 0.18), y]);
    const verso = Math.sign(areaConSegno(bordo));
    mesh.poligono(bordo.map(({ x, y }) => [x, quota, y]), [0, 1, 0]);
    mesh.poligono(sotto, [0, -1, 0]);
    for (let k = 0; k < bordo.length; k++) {
      const prossimo = (k + 1) % bordo.length;
      const a = bordo[k], b = bordo[prossimo];
      mesh.quad(sotto[k], sotto[prossimo], [b.x, quota, b.y], [a.x, quota, a.y], [verso * (b.y - a.y), 0, verso * (a.x - b.x)]);
    }
  });
}

export function costruisciElemento(
  tipo: string,
  centro: { x: number; z: number },
  rotazione: number,
  misure: { l?: number; p?: number; h?: number; quota?: number; senzaCabina?: boolean; interpiano?: number; alzateCad?: AlzataCad[]; modello?: string; attaccoDoccia?: AttaccoDoccia3D },
  costruttore: (materiale: string) => CostruttoreMesh,
): void {
  const modello = modelloElemento(tipo);
  if (eCampo(tipo)) return costruisciCampo(tipo, centro, rotazione, misure.l ?? modello.misure.l, misure.p ?? modello.misure.p, costruttore);
  const l = misure.l ?? modello.misure.l;
  const p = misure.p ?? modello.misure.p;
  const h = misure.h ?? modello.misure.h;
  if (tipo === "scala" && misure.alzateCad) return costruisciScalaCad(misure.alzateCad, l, p, h, centro, rotazione, costruttore("legno"));
  const variante = misure.modello;
  if (tipo === "tenda") return costruisciTenda(centro, rotazione, l, p, h, variante === "lino_chiusa", costruttore);
  if (tipo === "quadro") return costruisciQuadro(centro, rotazione, l, p, h, variante === "salvia", costruttore);
  if (tipo === "scaldasalviette") return costruisciScaldasalviette(centro, rotazione, l, p, h, costruttore);
  if (tipo === "pianta_vaso" && h > 0) {
    const r = Math.min(l, p) * .35, { x, z } = centro;
    profiloTondo(costruttore("terracotta"), x, z, [[0, .001], [0, r * .8], [h * .49, r], [h * .52, r], [h * .52, .001]]);
    const foglie = costruttore("fogliame");
    for (let i = 0; i < 13; i++) {
      const angolo = rotazione + i * Math.PI * (3 - Math.sqrt(5)), cos = Math.cos(angolo), sin = Math.sin(angolo);
      const lunghezza = r * (1.38 - i * .049), y = h * (.72 + i * .023);
      const radice: V3 = [x, h * .49, z], punta: V3 = [x + cos * lunghezza, y, z + sin * lunghezza];
      const dx = cos * lunghezza * .52, dz = sin * lunghezza * .52, w = r * .21;
      foglie.poligono([radice, [x + dx + sin * w, h * .62, z + dz - cos * w], punta,
        [x + dx - sin * w, h * .62, z + dz + cos * w]], [0, 1, 0]);
    }
    return;
  }
  if (modello === MODELLI.albero && variante === "olivo") return costruisciOlivo(l, p, h || 3.5, centro, rotazione, costruttore);
  if (modello === MODELLI.divano && variante === "lino_base_rovere") return costruisciDivanoLino(l, p, h, centro, rotazione, costruttore);
  if (modello === MODELLI.letto && (variante === "lino_trapuntato" || variante === "cassettoni") && l > .4 && p > .8) {
    return lettoInLino(l, p, h, centro, rotazione, costruttore, variante === "cassettoni");
  }
  if (tipo === "scala" && variante === "alzatine_legno") return scalaConRinghiera(modello.blocchi(l, p, h), centro, rotazione, costruttore);
  if (modello === MODELLI.piscina) return costruisciPiscina(l, p, h, centro, rotazione, variante, misure.quota ?? 0, costruttore);
  if (modello === MODELLI.lettino) return costruisciLettino(l, p, h, centro, rotazione, costruttore);
  if (modello === MODELLI.auto) return costruisciAuto(l, p, h, centro, rotazione, variante === "suv", costruttore);
  if (modello === MODELLI.wc || modello === MODELLI.bidet) return costruisciSanitario(modello === MODELLI.wc ? "wc" : "bidet", centro, rotazione, l, p, h, costruttore, variante);
  if (modello === MODELLI.lavabo) return costruisciLavabo(centro, rotazione, l, p, h, costruttore, variante ?? "incasso");
  if (modello === MODELLI.vasca) return costruisciVasca(centro, rotazione, l, p, h, costruttore, variante ?? "incasso");
  if (modello === MODELLI.lampada_piantana) {
    const r = Math.min(l, p) / 2, { x, z } = centro, base = Math.min(.034, h * .07);
    profiloTondo(costruttore("grafite"), x, z, [[0, .001], [0, r * .83], [base, r * .77], [base, .001]]);
    costruttore("ottone").tubo([[x, base, z], [x, h * .88, z]], Math.min(.011, r * .12));
    profiloTondo(costruttore("lino_avorio"), x, z, [[h * .79, r * .972], [h, r * .69], [h, r * .65], [h * .79, r * .93], [h * .79, r * .972]]);
    return;
  }
  if (modello === MODELLI.lampada_sospensione && h > 1.9) {
    const { x, z } = centro, diametro = Math.min(l, p), bordo = .008;
    const r = diametro / 2, lampada = Math.max(1.68, h - .8), cima = lampada + r * 1.22;
    const metallo = costruttore("grafite");
    metallo.tubo([[x, cima, z], [x, h - .017, z]], .0025, 8);
    profiloTondo(metallo, x, z, [[h - .018, .048], [h - .014, .057], [h, .057], [h, .001]]);
    profiloTondo(metallo, x, z, [[lampada, r - bordo], [lampada, r], [lampada + r * .40, r * .83],
      [cima, r * .30], [cima + .012, r * .27], [cima + .012, .005]]);
    profiloTondo(costruttore("luce_calda"), x, z, [[lampada + .021, .001], [lampada + .021, r * .80],
      [lampada + .034, r * .80], [lampada + .034, .001]]);
    return;
  }
  if (modello === MODELLI.tavolino && variante === "marmo_tondo") {
    const r = Math.min(l, p) / 2;
    const spessore = Math.min(.085, h * .24), bordo = Math.min(.013, r * .12, spessore * .25);
    const sotto = h - spessore;
    const marmo = costruttore("finitura:pavimento:marmo");
    profiloTondo(marmo, centro.x, centro.z, [[sotto, .001], [sotto, r - bordo],
      [sotto + bordo, r], [h - bordo, r], [h, r - bordo], [h, .001]]);
    for (let i = 0; i < 3; i++) {
      const a = rotazione + i * 2 * Math.PI / 3;
      const x = centro.x + Math.cos(a) * r * .55;
      const z = centro.z + Math.sin(a) * r * .55;
      profiloTondo(marmo, x, z, [[0, .001], [0, r * .197], [bordo, r * .22], [sotto, r * .22]]);
    }
    return;
  }
  const blocchi = modello === MODELLI.doccia ? blocchiDoccia(l, p, h, misure.attaccoDoccia?.lato, variante)
    : modello === MODELLI.cucina && variante === "basi" ? basiCucina(l, p, h > 0 ? h : .9, false)
    : modello === MODELLI.cucina && variante === "rovere_nicchie" ? [...basiCucina(l, p, h > 0 ? h : .9, true, true), ...pensiliConNicchie(l, p, h > 0 ? h : .9)]
    : modello === MODELLI.cucina && (variante === "pensili" || variante === "pensili_led") ? [...basiCucina(l, p, h > 0 ? h : .9), ...blocchiPensili(l, p, h > 0 ? h : .9, variante === "pensili_led")]
    : modello === MODELLI.cucina_angolare && variante === "basi" ? blocchiCucinaAngolare(l, p, h > 0 ? h : .9, false)
    : modello === MODELLI.cucina_angolare && variante === "pensili_led" ? blocchiCucinaAngolare(l, p, h > 0 ? h : .9, true, true)
    : modello === MODELLI.cucina_angolare && variante === "rovere_nicchie" ? blocchiCucinaAngolare(l, p, h > 0 ? h : .9, true, true, true)
    : modello === MODELLI.isola_cucina && variante === "travertino_rovere" ? isolaInTravertino(l, p, h > 0 ? h : .9)
    : modello === MODELLI.armadio && variante === "scorrevole" ? blocchiArmadio(l, p, h, true)
    : modello === MODELLI.armadio && (variante === "rovere_gola" || variante === "cannettato") ? armadioRovere(l, p, h, variante === "cannettato")
    : modello === MODELLI.libreria && variante === "rovere_libri" ? libreriaConLibri(l, p, h)
    : modello === MODELLI.specchio_parete && variante === "retroilluminato" ? specchioLuminoso(l, p, h)
    : modello === MODELLI.barbecue && variante === "modulo_inox" ? grillDaEsterno(l, p, h || 1.14)
    : modello === MODELLI.divano && variante === "teak_esterno" ? sedutaTeak(l, p, h)
    : modello === MODELLI.pergola && variante === "lamelle_led" ? pergolaLuce(l, p, h)
    : modello === MODELLI.frigorifero && variante === "inox_incassato" && l > .30 && p > .26 && h > .65 ? frigoInox(l, p, h)
    : modello === MODELLI.divano && variante === "modulare" ? blocchiModulari(l, p, h)
    : modello === MODELLI.divano_angolare && variante === "chaise_lino" ? blocchiDivanoAngolare(l, p, h, true)
    : modello === MODELLI.mobile_tv && (variante === "boiserie" || variante === "boiserie_led") ? pareteTv(l, p, h, variante === "boiserie_led")
    : modello === MODELLI.mobile_tv && variante === "oled_55" ? mobileTvOLED(l, p, h)
    : modello === MODELLI.mobile_tv && variante ? mobileTv(l, p, h, variante === "sospeso")
    : modello.blocchi(l, p, h, { senzaCabina: misure.senzaCabina, interpiano: misure.interpiano });
  for (const bl of blocchi) {
    const frontaliLegno = variante === "pensili_led" && (modello === MODELLI.cucina || modello === MODELLI.cucina_angolare) && bl.materiale === "laccato";
    const testieraLegno = modello === MODELLI.letto && variante === "testiera_rovere" && bl.materiale === "tessuto";
    const materiale = frontaliLegno || testieraLegno ? "legno" : bl.materiale;
    costruttore(materiale).scatola(centro.x, centro.z, bl.y, bl.l, bl.p, bl.h, rotazione, bl.x, bl.z, bl.girata ?? 0, bl.raggio);
  }
  if (variante !== "basi" && (modello === MODELLI.cucina || modello === MODELLI.cucina_angolare)) {
    const [banco] = rettangoliIngombroArredo(tipo, l * 100, p * 100);
    dettagliCucina(l, banco.profondita / 100, h > 0 ? h : .9, banco.y / 100, centro, rotazione, costruttore);
  }
  if (modello === MODELLI.doccia && misure.attaccoDoccia) dettagliDoccia(l, p, h, centro, rotazione, misure.attaccoDoccia, costruttore);
  if (modello === MODELLI.tavolo && variante === "apparecchiato") dettagliTavolo(l, p, h, centro, rotazione, costruttore);
  if (modello === MODELLI.vetrinetta && h > .05) ceramicheNellaVetrina(l, p, h, centro, rotazione, costruttore);
}

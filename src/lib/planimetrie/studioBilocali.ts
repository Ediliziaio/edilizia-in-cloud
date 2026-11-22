import {
  apertureDelLocale, areaPoligono, assiDelMuro, contornoIncrociato, distanza, distanzaPuntoSegmento,
  interniSovrapposti, puntoInterno, puntoNelPoligono, ricostruisciLocali, segmentiSiIncrociano,
} from "../../../shared/planimetrie/geometria.ts";
import {
  eAmbienteInterno, origineMisura, scalaModelloDaVerificare, type Apertura, type Destinazione, type Livello, type Locale,
  type Muro, type Origine, type Proposta, type Punto,
} from "../../../shared/planimetrie/modello.ts";
import { sistemaDi } from "../../../shared/planimetrie/serramenti.ts";
import { controllaIngressiUnita, type IngressoUnita } from "./accessiPlanimetria";
import { assiRispettoIngresso, intervalliInterni, type Intervallo } from "./geometriaBilocali";
import { tramezzoIncontraElemento } from "./frazionamento";

export const FONTI_BILOCALI = {
  edilizio: "https://www2.comune.milano.it/documents/20126/200621210/Regolamento%2BEdilizio%2B2016.pdf/ef520144-6ac6-d3c2-c51e-99c6232fa962?t=1551192584474",
  dm: "https://www.gazzettaufficiale.it/eli/gu/1975/07/18/190/sg/pdf",
  pgt: "https://pgt.comune.milano.it/",
  destinazioni: "https://pgt.comune.milano.it/prnorme-di-attuazione/norme-di-attuazione/titolo-i-disposizioni-generali/capo-ii-disciplina-generale/art-8-disciplina-delle-destinazioni-duso-e-loro-mutamenti",
  lombardia: "https://normelombardia.consiglio.regione.lombardia.it/NormeLombardia/Accessibile/main.aspx?command=open&exp_coll=62001979&idparte=lr002005031100012ar0051a&selnode=62001979&view=showpart",
  mit: "https://www.mit.gov.it/linee-guida-dl-salva-casa",
  accessibilita: "https://www.gazzettaufficiale.it/eli/id/1989/06/23/089G0298/sg",
};

type Profilo = "milano" | "generico";
export type TipoAccessoBilocali = "comune" | "indipendenti";
export interface RichiestaBilocali {
  unita: 2 | 3;
  profilo: Profilo;
  accessoId?: string;
  tipoAccesso?: TipoAccessoBilocali;
}
export interface AvvioStudioBilocali {
  unita: 2 | 3;
  profilo?: Profilo;
  intervento?: "frazionamento" | "cambio_uso";
  tipoAccesso?: TipoAccessoBilocali;
  soloVerifica?: true;
}

export function leggiRichiestaStudioBilocali(frase: string): AvvioStudioBilocali | null {
  const testo = frase.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("it");
  const quanti = /\b(due|tre|2|3)\s+bilocali\b/.exec(testo);
  const soloVerifica = /^(?:verific|controll|confront|si riesc|si puo|posso|riusciamo|quanti)/.test(testo.trim());
  if (!quanti || (!soloVerifica && !/\b(?:frazion\w*|ricav\w*|divid\w*|trasform\w*|propon\w*|cre\w*|voglio|vorrei)\b/.test(testo))) return null;
  return {
    unita: ["3", "tre"].includes(quanti[1]) ? 3 : 2,
    ...(/\bmilano\b/.test(testo) ? { profilo: "milano" as const } : {}),
    ...(/\b(?:accessi|ingressi|porte)\s+(?:separat\w*|indipendent\w*|autonom\w*)\b/.test(testo) ? { tipoAccesso: "indipendenti" as const } : {}),
    ...(/\b(?:negozio|supermercato|commerciale|cambio d.uso)\b/.test(testo)
      ? { intervento: "cambio_uso" as const } : /\b(?:casa|appartamento|quadrilocale|trilocale)\b/.test(testo)
        ? { intervento: "frazionamento" as const } : {}),
    ...(soloVerifica ? { soloVerifica: true as const } : {}),
  };
}
type Facciata = "basso" | "alto" | "sinistra" | "destra";
type Limiti = { x0: number; y0: number; x1: number; y1: number };
type Parte = {
  nome: string;
  destinazione: Destinazione;
  unita?: string;
  u0: number; u1: number; v0: number; v1: number;
};
type Vano = { a: Apertura; da: Punto; fine: Punto; muro: Muro };
type MetricaLocale = { nome: string; mq: number; finestre: number; luceLordaMq: number; affacci: Facciata[] };
export interface BilocaleVerifica {
  sigla: string;
  mq: number;
  soggiorno: MetricaLocale;
  camera: MetricaLocale;
  ingresso: IngressoUnita;
  bagno: {
    mq: number;
    latoMinimoCm: number | null;
    disimpegno: boolean;
    aerazione: "finestra" | "meccanica" | "da_studiare";
    vanoApribileMq: number;
  };
}
export interface AlternativaBilocali {
  id: string;
  nome: string;
  proposta: Proposta;
  unita: BilocaleVerifica[];
  spaziEsterni: { id: string; nome: string; mq: number; accessibileDa: string[] }[];
  ingressoComune?: Punto;
  pilastriConservati: number;
  comuniMq: number;
  demolizioniMl: number;
  nuoviTramezziMl: number;
  pavimentiDaPosareMq: number;
  pavimentiDaConservareMq: number;
  criticita: string[];
  criticitaGeometriche: number;
}

export type StudioBilocali =
  | { ok: true; alternative: AlternativaBilocali[]; altezzaCm: number; altezzaStimata: boolean; omesse: string[] }
  | { ok: false; motivo: string; causa: "scala" | "scala_modello" | "perimetro" | "spazi_esterni" | "struttura" | "ingresso" | "indipendenti"; serveIngresso?: true };

const SPESSORE = 12;
const EPS = 1;
const modelli = [
  { id: "recupero", nome: "Recupero pavimenti asciutti", corridoio: 158, servizi: 218, bagno: 174, soggiorno: .54, bagnoASinistra: false, rinnova: false },
  { id: "rinnovo", nome: "Redistribuzione e pavimenti nuovi", corridoio: 178, servizi: 228, bagno: 187, soggiorno: .52, bagnoASinistra: true, rinnova: true },
] as const;
const FORME_VINCOLANTI = new Set(["pilastro", "scala", "scala_u", "scala_chiocciola", "ascensore", "muro_contenimento", "trave"]);
const arrotonda = (n: number) => Math.round(n * 100) / 100;
const mq = (l: Locale) => areaPoligono(l.contorno) / 10000;
const fmt = (n: number) => arrotonda(n).toLocaleString("it-IT");

function divisorioTraFinestre(obiettivo: number, min: number, max: number, finestre: Intervallo[], da: number, a: number) {
  const margine = SPESSORE / 2 + EPS;
  const esistenti = finestre.filter(f => f.da >= da - EPS && f.a <= a + EPS);
  const deciso = Math.min(max, Math.max(min, obiettivo));
  const possibili = [deciso, min, max, ...esistenti.flatMap(f => [f.da - margine, f.a + margine])]
    .filter(x => x >= min && x <= max && !esistenti.some(f => x > f.da - margine && x < f.a + margine));
  const punteggio = (x: number) => Number(esistenti.some(f => f.a < x)) + Number(esistenti.some(f => f.da > x));
  return possibili.sort((a, b) => punteggio(b) - punteggio(a) || Math.abs(a - obiettivo) - Math.abs(b - obiettivo))[0];
}

function limiti(punti: Punto[]): Limiti {
  return { x0: Math.min(...punti.map(p => p.x)), y0: Math.min(...punti.map(p => p.y)),
    x1: Math.max(...punti.map(p => p.x)), y1: Math.max(...punti.map(p => p.y)) };
}

const nomeEsterno = (nome?: string) => /\b(?:corte|cortile|patio|loggia|terrazzo|balcone|portico|veranda)\b/i.test(nome ?? "");
const eSpazioEsterno = (l: Locale) => ["terrazzo", "balcone", "giardino"].includes(l.destinazione)
  || (l.aperto && l.destinazione === "altro" && nomeEsterno(l.nome));
const sulMuro = (m: Muro, n: number): Punto => {
  const { dir } = assiDelMuro(m);
  return { x: m.p1.x + dir.x * n, y: m.p1.y + dir.y * n };
};

export function accessiBilocali(piano: Livello): Apertura[] {
  const esterne = new Set(piano.fatto.muri.filter(m => m.tipo === "esterno").map(m => m.id));
  const porteEsterni = new Set(piano.fatto.locali.filter(eSpazioEsterno)
    .flatMap(l => apertureDelLocale(l, piano.fatto).map(a => a.id)));
  return piano.fatto.aperture.filter(a => a.tipo === "porta" && a.sistema !== "fisso" && esterne.has(a.muroId) && !porteEsterni.has(a.id));
}

function datiBase(piano: Livello, richiesta: RichiestaBilocali) {
  const manca = (causa: Extract<StudioBilocali, { ok: false }>["causa"], motivo: string) => ({ ok: false as const, causa, motivo });
  const esterne = piano.fatto.muri.filter(m => m.tipo === "esterno");
  if (esterne.length < 3) return manca("perimetro", "Classifica le pareti perimetrali come esterne per individuare l’alloggio.");
  const chiusi = ricostruisciLocali(esterne);
  const localiInterni = piano.fatto.locali.filter(eAmbienteInterno);
  const centri = localiInterni.map(l => puntoInterno(l.contorno));
  const possibili = chiusi.filter(c => centri.some(p => p && puntoNelPoligono(p, c.contornoAsse)));
  const involucro = chiusi.length === 1 ? chiusi[0] : possibili.length === 1 ? possibili[0] : undefined;
  if (!involucro) return manca("perimetro", "Individua un alloggio con perimetro chiuso sul piano. Per più blocchi, scegli l’ambiente da dividere.");
  const { contornoAsse } = involucro;
  const spaziEsterni = piano.fatto.locali.filter(eSpazioEsterno);
  const areeEsterne = (piano.fatto.aree ?? []).filter(a => a.tipo === "pavimentato" || nomeEsterno(a.nome));
  if (spaziEsterni.some(l => interniSovrapposti(l.contorno, involucro.contorno))
    || areeEsterne.some(a => nomeEsterno(a.nome) && interniSovrapposti(a.contorno, involucro.contorno))
    || chiusi.some(c => c !== involucro && interniSovrapposti(c.contorno, involucro.contorno))) {
    return manca("spazi_esterni", "La pianta contiene un cortile interno o perimetri sovrapposti. Traccia le porzioni a mano per mantenere libero lo spazio esterno.");
  }
  const ids = new Set(involucro.muriIds);
  const esterni = esterne.filter(m => ids.has(m.id));
  const dentro = (p: Punto) => puntoNelPoligono(p, contornoAsse);
  const tramezzi = piano.fatto.muri.filter(m => m.tipo !== "esterno" && (
    dentro({ x: (m.p1.x + m.p2.x) / 2, y: (m.p1.y + m.p2.y) / 2 })
    || contornoAsse.some((p, i) => segmentiSiIncrociano(p, contornoAsse[(i + 1) % contornoAsse.length], m.p1, m.p2))));
  const elementoFisso = piano.fatto.elementi.find(e => dentro(e.posizione) && FORME_VINCOLANTI.has(e.tipo) && e.tipo !== "pilastro");
  if (elementoFisso) {
    return manca("struttura", `Elemento da conservare sulla pianta · ${elementoFisso.etichetta || elementoFisso.tipo.replaceAll("_", " ")}. Usa la divisione manuale per mantenere l’ingombro e il suo accesso.`);
  }
  if (tramezzi.some(m => m.tipo !== "tramezzo" || m.spessore >= 20 || origineMisura(m, "spessore") === "stimata")) {
    return manca("struttura", "Ci sono pareti strutturali o da classificare. Verifica la natura e lo spessore prima di ridistribuire i locali.");
  }
  const accessi = accessiBilocali(piano).filter(a => ids.has(a.muroId));
  const indipendenti = richiesta.tipoAccesso === "indipendenti";
  if (indipendenti && accessi.length !== richiesta.unita) return manca("indipendenti", "Per gli accessi indipendenti servono tante porte esistenti sullo stesso fronte quante sono le unità.");
  const porta = indipendenti ? accessi[0] : accessi.find(a => a.id === richiesta.accessoId) ?? (accessi.length === 1 ? accessi[0] : undefined);
  if (!porta) return {
    ok: false as const, causa: "ingresso" as const, serveIngresso: true as const,
    motivo: accessi.length ? "Scegli da quale porta si entra per generare le proposte." : "Indica sulla pianta la porta esistente da cui si entra nell’appartamento.",
  };
  const muroIngresso = esterni.find(m => m.id === porta.muroId)!;
  const centroIngresso = sulMuro(muroIngresso, porta.offset + porta.larghezza / 2);
  const frame = assiRispettoIngresso(contornoAsse, muroIngresso, centroIngresso);
  if (!frame) return manca("ingresso", "Controlla che la porta scelta apra sul perimetro dell’alloggio.");
  const origini = [...esterni, ...tramezzi, ...localiInterni.filter(l => {
    const p = puntoInterno(l.contorno);
    return p && dentro(p);
  })];
  const altezzaCm = Math.min(...origini.map(m => m.altezza));
  const altezzaStimata = origini.some(m => origineMisura(m, "altezza") === "stimata" || Math.abs(m.altezza - altezzaCm) > 1);
  const vani: Vano[] = piano.fatto.aperture.flatMap(a => {
    const muro = esterni.find(m => m.id === a.muroId);
    return muro ? [{ a, muro, da: sulMuro(muro, a.offset), fine: sulMuro(muro, a.offset + a.larghezza) }] : [];
  });
  const accessiId = new Set(accessi.map(a => a.id));
  const diretti = indipendenti ? vani.filter(v => accessiId.has(v.a.id)).map(v => {
    const a = frame.proietta(v.da), b = frame.proietta(v.fine);
    return { da: Math.min(a.u, b.u), a: Math.max(a.u, b.u), sulFronte: Math.abs(a.v - frame.quotaIngresso) <= EPS && Math.abs(b.v - frame.quotaIngresso) <= EPS };
  }).sort((a, b) => a.da - b.da) : [];
  if (diretti.some(d => !d.sulFronte)) return manca("indipendenti", "Gli ingressi sono su lati diversi. Scegli uno di essi per provare un percorso comune.");
  const fissi = piano.fatto.elementi.filter(e => e.tipo === "pilastro" || e.tipo === "colonna_scarico" || e.tipo === "quadro_elettrico" || !dentro(e.posizione));
  return { ok: true as const, esterni, tramezzi, vani, frame, porta, centroIngresso, diretti, altezzaCm, altezzaStimata, spaziEsterni, areeEsterne, fissi };
}

type Base = Extract<ReturnType<typeof datiBase>, { ok: true }>;

function alternativa(piano: Livello, dati: Base, richiesta: RichiestaBilocali, m: typeof modelli[number]): AlternativaBilocali | string {
  const { esterni, tramezzi, vani, frame, altezzaCm, altezzaStimata, diretti } = dati;
  const { larghezza, profondita, punto, proietta, contorno, quotaIngresso } = frame;
  const accessiSeparati = diretti.length > 0;
  const inizioUnita = accessiSeparati ? 0 : quotaIngresso + m.corridoio;
  const fronteServizi = (accessiSeparati ? quotaIngresso : inizioUnita) + m.servizi;
  const minimoModulo = m.bagno + 2 * 96 + SPESSORE;
  if (larghezza < minimoModulo * richiesta.unita || profondita - fronteServizi < 300) {
    return "Spazio insufficiente per collocare i locali e i passaggi in questa configurazione.";
  }
  const proiezioni = vani.map(v => {
    const a = proietta(v.da), b = proietta(v.fine);
    return { tipo: v.a.tipo, da: Math.min(a.u, b.u), a: Math.max(a.u, b.u), v0: Math.min(a.v, b.v), v1: Math.max(a.v, b.v) };
  });
  const margineVano = SPESSORE / 2 + EPS;
  const ingombri = proiezioni.filter(v => v.v1 + EPS >= inizioUnita);
  const svolte = contorno.filter(p => p.v >= inizioUnita).map(p => p.u);
  const margineMuro = Math.max(...esterni.map(m => m.spessore / 2)) + margineVano;
  const confini = [0];
  for (let i = 1; i < richiesta.unita; i++) {
    const min = Math.max(confini[i - 1] + minimoModulo, diretti[i - 1] ? diretti[i - 1].a + margineVano : 0);
    const max = Math.min(larghezza - (richiesta.unita - i) * minimoModulo, diretti[i] ? diretti[i].da - margineVano : larghezza);
    const voluto = larghezza * i / richiesta.unita;
    const posizioni = [Math.max(min, Math.min(max, voluto)), min, max,
      ...svolte.flatMap(u => [u - margineMuro, u, u + margineMuro]),
      ...ingombri.flatMap(v => [v.da - margineVano, v.a + margineVano])];
    const vicino = posizioni.filter(x => x >= min && x <= max
      && !svolte.some(u => Math.abs(x - u) > EPS && Math.abs(x - u) < margineMuro - EPS)
      && !ingombri.some(v => x > v.da - margineVano && x < v.a + margineVano))
      .sort((a, b) => Math.abs(a - voluto) - Math.abs(b - voluto))[0];
    if (vicino === undefined) return "Manca spazio tra le aperture esistenti per separare le unità.";
    confini.push(vicino);
  }
  confini.push(larghezza);

  const prefisso = "bil-" + crypto.randomUUID();
  const nuovi: Muro[] = [];
  const porte: Apertura[] = [];
  const parti: Parte[] = accessiSeparati ? [] : [
    { nome: "Corridoio comune", destinazione: "corridoio", unita: "Parti comuni", u0: 0, u1: larghezza, v0: 0, v1: inizioUnita },
  ];
  const origineAltezza: Origine = altezzaStimata ? "stimata" : "rilevata";
  const finestreDiFronte = proiezioni.filter(f => (f.tipo === "finestra" || f.tipo === "portafinestra")
    && f.a - f.da > EPS && f.v0 >= fronteServizi + EPS);

  const separa = (asse: "u" | "v", quota: number, da: number, a: number) => intervalliInterni(contorno, asse, quota, da, a).map(tratto => {
    const p1 = asse === "u" ? punto(quota, tratto.da) : punto(tratto.da, quota);
    const p2 = asse === "u" ? punto(quota, tratto.a) : punto(tratto.a, quota);
    const muro: Muro = { id: prefisso + "-m" + nuovi.length, p1, p2, spessore: SPESSORE,
      altezza: altezzaCm, tipo: "tramezzo", stato: "nuovo", origine: "stimata", origineMisure: { altezza: origineAltezza } };
    nuovi.push(muro);
    return { ...tratto, muro };
  });
  const apri = (tratti: Array<Intervallo & { muro: Muro }>, da: number, a: number, luce: number) => {
    const bersaglio = (da + a) / 2;
    const margine = luce / 2 + SPESSORE / 2 + 2;
    const possibili = tratti.flatMap(t => {
      const min = Math.max(da, t.da) + margine, max = Math.min(a, t.a) - margine;
      return min <= max ? [{ ...t, centro: Math.max(min, Math.min(max, bersaglio)) }] : [];
    });
    const scelto = possibili.sort((x, y) => Math.abs(x.centro - bersaglio) - Math.abs(y.centro - bersaglio))[0];
    if (!scelto) return false;
    porte.push({ id: prefisso + "-p" + porte.length, muroId: scelto.muro.id, tipo: "porta",
      offset: arrotonda(scelto.centro - scelto.da - luce / 2), larghezza: luce,
      altezza: Math.min(210, altezzaCm - 10), davanzale: 0, manovra: "battente", verso: null, stato: "nuovo", origine: "stimata" });
    return true;
  };
  const corridoio = accessiSeparati ? [] : separa("v", inizioUnita, 0, larghezza);
  for (let i = 0; i < richiesta.unita; i++) {
    const unita = String.fromCharCode(65 + i);
    const [u0, u1] = [confini[i], confini[i + 1]];
    const accesso = diretti[i];
    const bagnoSinistra = !accesso ? m.bagnoASinistra : accesso.da >= u0 + m.bagno + margineVano
      && (m.bagnoASinistra || accesso.a > u1 - m.bagno - margineVano);
    const limiteBagno = bagnoSinistra ? u0 + m.bagno : u1 - m.bagno;
    const dis0 = bagnoSinistra ? limiteBagno : u0;
    const dis1 = bagnoSinistra ? u1 : limiteBagno;
    if (accesso && (accesso.da < dis0 + margineVano || accesso.a > dis1 - margineVano)) return "La porta esistente non lascia spazio per separare bagno e ingresso in una delle unità.";
    const profonditaUtile = Math.max(1, profondita - fronteServizi - 22);
    const minimoGiorno = (richiesta.profilo === "milano" ? 17 : 14) * 10_000 / profonditaUtile + SPESSORE;
    const minimoNotte = 14 * 10_000 / profonditaUtile + SPESSORE;
    const obiettivo = u0 + (u1 - u0) * m.soggiorno;
    const divisorio = divisorioTraFinestre(obiettivo, Math.max(dis0 + 96, u0 + minimoGiorno), Math.min(dis1 - 96, u1 - minimoNotte), finestreDiFronte, u0, u1)
      ?? divisorioTraFinestre(obiettivo, dis0 + 96, dis1 - 96, finestreDiFronte, u0, u1);
    if (divisorio === undefined) return "Manca lo spazio per collegare soggiorno e camera con queste aperture.";
    if (i > 0) separa("u", u0, inizioUnita, profondita);
    const pareteServizi = separa("v", fronteServizi, u0, u1);
    separa("u", divisorio, fronteServizi, profondita);
    const pareteBagno = separa("u", limiteBagno, inizioUnita, fronteServizi);
    if ((!accessiSeparati && !apri(corridoio, dis0, dis1, 90))
      || !apri(pareteBagno, inizioUnita, fronteServizi, 80)
      || !apri(pareteServizi, dis0, Math.min(dis1, divisorio), 80)
      || !apri(pareteServizi, Math.max(dis0, divisorio), dis1, 80)) {
      return "Una rientranza o un tratto stretto impedisce di posare tutte le porte. Prova meno unità o un altro ingresso.";
    }
    parti.push(
      { unita, nome: unita + " · Soggiorno con cucina", destinazione: "soggiorno", u0, u1: divisorio, v0: fronteServizi, v1: profondita },
      { unita, nome: unita + " · Camera matrimoniale", destinazione: "camera", u0: divisorio, u1, v0: fronteServizi, v1: profondita },
      { unita, nome: unita + " · Bagno", destinazione: "bagno", u0: bagnoSinistra ? u0 : limiteBagno, u1: bagnoSinistra ? limiteBagno : u1,
        v0: inizioUnita, v1: fronteServizi },
      { unita, nome: unita + " · Disimpegno", destinazione: "disimpegno", u0: dis0, u1: dis1, v0: inizioUnita, v1: fronteServizi },
    );
  }
  for (const muro of nuovi) for (const p of [muro.p1, muro.p2]) {
    if (vani.some(v => {
      const { dir, normale } = assiDelMuro(v.muro);
      const dx = p.x - v.da.x, dy = p.y - v.da.y;
      const t = dx * dir.x + dy * dir.y;
      return Math.abs(dx * normale.x + dy * normale.y) <= EPS && t > -SPESSORE / 2 && t < v.a.larghezza + SPESSORE / 2;
    })) return "Un divisorio cadrebbe su una porta o una finestra esistente.";
  }
  const facce = ricostruisciLocali([...esterni, ...nuovi]);
  const facceProiettate = facce.map(f => ({ ...f, profilo: f.contornoAsse.map(proietta) }));
  const conteggiate = new Set<number>();
  const locali: Locale[] = [];
  for (const [i, p] of parti.entries()) {
    const corrispondenti = facceProiettate.flatMap((f, j) => f.profilo.every(q => q.u >= p.u0 - EPS && q.u <= p.u1 + EPS
      && q.v >= p.v0 - EPS && q.v <= p.v1 + EPS) ? [j] : []);
    const [j] = corrispondenti;
    if (corrispondenti.length !== 1 || conteggiate.has(j) || areaPoligono(facceProiettate[j].contorno) <= 1) {
      return "La distribuzione lascia porzioni scollegate sul perimetro. Prova meno unità o un altro ingresso.";
    }
    conteggiate.add(j);
    locali.push({
      id: prefisso + "-l" + i, nome: p.nome, destinazione: p.destinazione, unita: p.unita, contorno: facceProiettate[j].contorno,
      altezza: altezzaCm, origine: "stimata", origineMisure: { altezza: origineAltezza },
      ...((m.rinnova || p.destinazione === "bagno") ? { finiture: {
        pavimento: p.destinazione === "bagno" ? "Gres porcellanato effetto pietra" : "Rovere chiaro",
        pavimentoSpecifico: true,
      } } : {}),
    });
  }
  if (conteggiate.size !== facce.length) return "Restano porzioni del perimetro senza una destinazione. Rivedi il frazionamento a mano.";
  if (locali.some((l, i) => contornoIncrociato(l.contorno) || locali.slice(i + 1).some(a => interniSovrapposti(l.contorno, a.contorno)))) {
    return "Un locale ha un contorno sovrapposto. Controlla le pareti e la forma del perimetro.";
  }
  const elementiFissi = dati.fissi.filter(e => ["pilastro", "colonna_scarico", "quadro_elettrico"].includes(e.tipo));
  const interferenza = elementiFissi.find(e => nuovi.some(m => tramezzoIncontraElemento([m.p1, m.p2], e, SPESSORE))
    || (e.tipo === "pilastro" && locali.some(l => ["corridoio", "disimpegno"].includes(l.destinazione) && puntoNelPoligono(e.posizione, l.contorno))));
  if (interferenza) return "Un divisorio o un passaggio incontra " + (interferenza.etichetta || interferenza.tipo.replaceAll("_", " ")) + ". Prova un’altra distribuzione.";

  const esterniConservati: Locale[] = dati.spaziEsterni.map(({ unita: _prima, ...l }) => ({ ...l, aperto: true }));
  const idDemoliti = new Set(tramezzi.map(m => m.id));
  const proposta: Proposta = {
    ...piano.fatto, id: "A", nome: richiesta.unita + " bilocali · " + m.nome, distribuzioneBilocali: true,
    locali: [...locali, ...esterniConservati],
    muri: [...piano.fatto.muri.map(m => idDemoliti.has(m.id) ? { ...m, stato: "da_demolire" as const } : m), ...nuovi],
    aperture: [...piano.fatto.aperture.map(a => idDemoliti.has(a.muroId) ? { ...a, stato: "da_demolire" as const } : a), ...porte],
    elementi: dati.fissi.map(e => ({ ...e, localeId: [...locali, ...esterniConservati].find(l => puntoNelPoligono(e.posizione, l.contorno))?.id ?? null })),
  };
  const { ingressi, vani: passaggi, recinzioniChiuse } = controllaIngressiUnita(proposta, accessiSeparati ? undefined : dati.porta.id, piano.quota);
  if (recinzioniChiuse.length) return `${recinzioniChiuse.join(", ")} · indica un cancello sul confine e verifica il percorso dalla strada.`;
  const tipoAtteso = accessiSeparati ? "diretto" : "comune";
  if (ingressi.length !== richiesta.unita || ingressi.some(a => a.tipo !== tipoAtteso || a.ambientiScollegati.length)) {
    return accessiSeparati ? "Controlla che ogni porta porti a una sola unità e raggiunga tutti i suoi locali."
      : "La porta scelta non collega tutte le unità attraverso il corridoio comune.";
  }

  const note: string[] = [];
  const geometria: string[] = [];
  const milano = richiesta.profilo === "milano";
  if (!accessiSeparati && dati.porta.larghezza < 80) geometria.push("Ingresso comune · vano da " + fmt(dati.porta.larghezza) + " cm. Verifica la luce netta richiesta per l’intervento (D.M. 236/1989, § 8.1.1).");
  const finestreDiLocale = (l: Locale) => {
    const adiacenti = new Set(apertureDelLocale(l, proposta).map(a => a.id));
    return vani.filter(v => adiacenti.has(v.a.id) && (v.a.tipo === "finestra" || v.a.tipo === "portafinestra"));
  };
  const localeVerifica = (l: Locale, minimo: number): MetricaLocale => {
    const finestre = finestreDiLocale(l);
    const superficie = mq(l);
    const luceLordaMq = finestre.reduce((tot, v) => tot + v.a.larghezza * v.a.altezza / 10_000, 0);
    if (superficie < minimo) geometria.push(l.nome + " ha " + fmt(superficie) + " m². Obiettivo della simulazione " + minimo + " m².");
    if (!finestre.length) {
      geometria.push(l.nome + " è senza finestra esterna nel disegno.");
    } else if (milano) {
      const quotaSommitale = Math.max(...finestre.map(v => v.a.davanzale + v.a.altezza));
      const distanzaMassima = Math.max(...l.contorno.map(p => Math.min(...finestre.map(v => distanzaPuntoSegmento(p, v.da, v.fine)))));
      if (distanzaMassima > quotaSommitale * 3.5) note.push(l.nome + " · verifica la profondità rispetto alle finestre (art. 105).");
      const rapporto = distanzaMassima > quotaSommitale * 2.5 ? 8 : 10;
      if (luceLordaMq < superficie / rapporto) note.push(l.nome + " · luce lorda sotto 1/" + rapporto + " della superficie. Verifica l’art. 105.");
    } else if (luceLordaMq < superficie / 8) {
      note.push(l.nome + " ha un vano finestrato lordo sotto 1/8 della superficie del locale.");
    }
    if (altezzaCm < 270) (altezzaStimata ? note : geometria).push(l.nome + " è sotto l’altezza ordinaria di 2,70 m usata nella simulazione.");
    const affacci = finestre.map((v): Facciata => {
      const { normale } = assiDelMuro(v.muro);
      const centro = sulMuro(v.muro, v.a.offset + v.a.larghezza / 2);
      const c = proietta(centro);
      const s = v.muro.spessore / 2 + 4;
      const verso = puntoNelPoligono({ x: centro.x + normale.x * s, y: centro.y + normale.y * s }, l.contorno) ? -s : s;
      const fuori = proietta({ x: centro.x + normale.x * verso, y: centro.y + normale.y * verso });
      return Math.abs(fuori.v - c.v) >= Math.abs(fuori.u - c.u)
        ? fuori.v > c.v ? "alto" : "basso" : fuori.u > c.u ? "destra" : "sinistra";
    });
    return { nome: l.nome, mq: arrotonda(superficie), finestre: finestre.length, luceLordaMq: arrotonda(luceLordaMq), affacci };
  };
  const unita = ingressi.map((ingresso, i): BilocaleVerifica => {
    const j = i * 4 + (accessiSeparati ? 0 : 1);
    const [soggiorno, camera, bagno, disimpegno] = locali.slice(j, j + 4);
    const giorno = localeVerifica(soggiorno, milano ? 17 : 14);
    const notte = localeVerifica(camera, 14);
    const superficie = mq(soggiorno) + mq(camera) + mq(bagno) + mq(disimpegno);
    if (ingresso.porta && ingresso.porta.larghezza < 80) geometria.push("Unità " + ingresso.sigla + " · vano d’ingresso da " + fmt(ingresso.porta.larghezza) + " cm. Verifica la luce netta (D.M. 236/1989, § 8.1.1).");
    if (milano && superficie >= 60 && new Set([...giorno.affacci, ...notte.affacci]).size === 1) {
      note.push("Unità " + ingresso.sigla + " · " + fmt(superficie) + " m² e un solo affaccio disegnato. Verifica l’art. 104.");
    }
    const r = limiti(bagno.contorno.map(p => { const q = proietta(p); return { x: q.u, y: q.v }; }));
    const bagnoMq = mq(bagno);
    const larghezza = r.x1 - r.x0, profondita = r.y1 - r.y0;
    const latoMinimoCm = Math.abs(bagnoMq * 10_000 - larghezza * profondita) < 2 ? arrotonda(Math.min(larghezza, profondita)) : null;
    const collega = (a: string, b: string, soloPorta: boolean) => passaggi.some(p => {
      const [uno, due] = p.lati;
      return (!soloPorta || p.apertura.tipo === "porta") && uno.length === 1 && due.length === 1
        && ((uno[0] === a && due[0] === b) || (uno[0] === b && due[0] === a));
    });
    const separato = collega(bagno.id, disimpegno.id, true) && collega(disimpegno.id, soggiorno.id, true)
      && !collega(bagno.id, soggiorno.id, false);
    const vanoApribileMq = Math.max(0, ...finestreDiLocale(bagno).filter(v => sistemaDi(v.a) !== "fisso").map(v => v.a.larghezza * v.a.altezza / 10_000));
    const sogliaVano = milano ? Math.max(.5, bagnoMq / 10) : 0;
    const aerazione = vanoApribileMq > 0 && vanoApribileMq >= sogliaVano ? "finestra"
      : milano && superficie > 70 ? "da_studiare" : "meccanica";
    if (milano && (latoMinimoCm === null || latoMinimoCm < 120)) (latoMinimoCm === null ? note : geometria).push(bagno.nome + " · verifica il lato utile rispetto a 1,20 m (art. 97).");
    if (milano && !separato) note.push(bagno.nome + " · verifica la separazione con porte dalla zona cottura (art. 98).");
    if (aerazione === "da_studiare") note.push(bagno.nome + " · verifica le condizioni di aerazione per l’unità oltre 70 m² (art. 107).");
    return { sigla: ingresso.sigla, mq: arrotonda(superficie), soggiorno: giorno, camera: notte, ingresso,
      bagno: { mq: arrotonda(bagnoMq), latoMinimoCm, disimpegno: separato, aerazione, vanoApribileMq: arrotonda(vanoApribileMq) } };
  });

  const destinazioni = new Map(locali.map(l => [l.id, l.unita]));
  const spaziEsterni: AlternativaBilocali["spaziEsterni"] = esterniConservati.map(l => {
    const accessibileDa = passaggi.flatMap(p => {
      const [a, b] = p.lati;
      return a.length === 1 && b.length === 1 ? [a[0] === l.id ? destinazioni.get(b[0]) : b[0] === l.id ? destinazioni.get(a[0]) : undefined] : [];
    }).filter((u): u is string => !!u);
    return { id: l.id, nome: l.nome, mq: arrotonda(mq(l)), accessibileDa: [...new Set(accessibileDa)] };
  });
  for (const a of dati.areeEsterne) {
    if (esterniConservati.some(l => interniSovrapposti(l.contorno, a.contorno))) continue;
    spaziEsterni.push({ id: a.id, nome: a.nome || "Pavimentazione esterna", mq: arrotonda(areaPoligono(a.contorno) / 10_000), accessibileDa: [] });
  }
  return {
    id: m.id, nome: m.nome, proposta, unita, spaziEsterni, comuniMq: accessiSeparati ? 0 : arrotonda(mq(locali[0])),
    ...(accessiSeparati ? {} : { ingressoComune: dati.centroIngresso }),
    pilastriConservati: elementiFissi.filter(e => e.tipo === "pilastro").length,
    demolizioniMl: arrotonda(tramezzi.reduce((tot, m) => tot + distanza(m.p1, m.p2) / 100, 0)),
    nuoviTramezziMl: arrotonda(nuovi.reduce((tot, m) => tot + distanza(m.p1, m.p2) / 100, 0)),
    pavimentiDaPosareMq: arrotonda(locali.filter(l => l.finiture?.pavimento).reduce((tot, l) => tot + mq(l), 0)),
    pavimentiDaConservareMq: arrotonda(locali.filter(l => !l.finiture?.pavimento).reduce((tot, l) => tot + mq(l), 0)),
    criticita: [...geometria, ...note],
    criticitaGeometriche: geometria.length,
  };
}

export function simulaBilocali(piano: Livello, richiesta: RichiestaBilocali): StudioBilocali {
  if (piano.ricalco?.calibrata === false) return { ok: false, causa: "scala", motivo: "Calibra la tavola con una distanza misurata, poi avvia lo studio." };
  if (scalaModelloDaVerificare(piano)) return { ok: false, causa: "scala_modello", motivo: "Riscontra una lunghezza nota sulle pareti del modello prima di confrontare le varianti." };
  const base = datiBase(piano, richiesta);
  if (base.ok === false) return base;
  const alternative: AlternativaBilocali[] = [];
  const omesse: string[] = [];
  for (const m of modelli) {
    const esito = alternativa(piano, base, richiesta, m);
    if (typeof esito === "string") omesse.push(m.nome + " · " + esito);
    else alternative.push(esito);
  }
  return { ok: true, alternative, altezzaCm: base.altezzaCm, altezzaStimata: base.altezzaStimata, omesse };
}

export function miglioreBilocali(alternative: AlternativaBilocali[]) {
  return alternative.reduce<AlternativaBilocali | undefined>((migliore, a) => !migliore
    || a.criticitaGeometriche < migliore.criticitaGeometriche
    || (a.criticitaGeometriche === migliore.criticitaGeometriche && a.criticita.length < migliore.criticita.length) ? a : migliore, undefined);
}

export function sintetizzaBilocali(studio: StudioBilocali): { testo: string; alternative: number; criticita: number | null; geometria: number | null } {
  if (studio.ok === false) return { testo: studio.motivo, alternative: 0, criticita: null, geometria: null };
  const migliore = miglioreBilocali(studio.alternative);
  if (!migliore) return { testo: studio.omesse[0] ?? "Nessuna distribuzione trovata sulla sagoma.", alternative: 0, criticita: null, geometria: null };
  const alternative = studio.alternative.length;
  const geometria = migliore.criticitaGeometriche;
  const criticita = migliore.criticita.length;
  const verifiche = [
    geometria > 0 && (geometria === 1 ? "1 criticità geometrica" : `${geometria} criticità geometriche`),
    criticita !== geometria && (criticita - geometria === 1 ? "1 verifica aperta" : `${criticita - geometria} verifiche aperte`),
  ].filter(Boolean).join(" e ");
  return {
    testo: (alternative === 1 ? "1 distribuzione" : `${alternative} distribuzioni`) + " con percorsi interni disegnati. "
      + (verifiche ? "La migliore ha " + verifiche + "." : "La migliore supera i controlli geometrici eseguiti."),
    alternative, criticita, geometria,
  };
}

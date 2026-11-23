import { definizioneCampo, disegnoCampo } from "./campiSport";
import { apertureDelLocale, comeApertura, type AperturaPer3D, type Mesh3D, type MuroPer3D, type PianoPer3D, type Scena3D, type Vista3D } from "./tred";
import { areaPoligono } from "../../../shared/planimetrie/geometria";

const formato = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const metri = (cm: number) => formato.format(cm / 100) + " m";

function proiezione(mesh: Mesh3D, dx: number, dz: number, x = 0, z = 0) {
  let minimo = Infinity, massimo = -Infinity;
  for (let i = 0; i < mesh.posizioni.length; i += 3) {
    const lungo = (mesh.posizioni[i] * 100 - x) * dx + (mesh.posizioni[i + 2] * 100 - z) * dz;
    minimo = Math.min(minimo, lungo);
    massimo = Math.max(massimo, lungo);
  }
  return { ampiezza: massimo - minimo, centro: (minimo + massimo) / 2 };
}

export interface RiscontroRenderLocale {
  nome: string;
  dato: string;
  avviso?: string;
}

function corrispondeVano(telaio: Mesh3D | undefined, muro: MuroPer3D | undefined, a: AperturaPer3D, quota = 0) {
  if (!muro || !telaio) return false;
  const dx = muro.b.x - muro.a.x, dz = muro.b.y - muro.a.y, lunghezza = Math.hypot(dx, dz);
  if (lunghezza < 1) return false;
  const { ampiezza, centro } = proiezione(telaio, dx / lunghezza, dz / lunghezza, muro.a.x, muro.a.y);
  let minimo = Infinity, massimo = -Infinity;
  for (let i = 1; i < telaio.posizioni.length; i += 3) {
    minimo = Math.min(minimo, telaio.posizioni[i] * 100);
    massimo = Math.max(massimo, telaio.posizioni[i] * 100);
  }
  return Math.abs(ampiezza - a.larghezza) <= 2 && Math.abs(centro - a.posizione) <= 2
    && Math.abs(minimo - quota - a.davanzale) <= 2 && Math.abs(massimo - minimo - a.altezza) <= 2;
}

function superficieOrizzontale({ posizioni: p, indici }: Mesh3D) {
  let area = 0;
  for (let i = 0; i < indici.length; i += 3) {
    const a = indici[i] * 3, b = indici[i + 1] * 3, c = indici[i + 2] * 3;
    area += Math.abs((p[b] - p[a]) * (p[c + 2] - p[a + 2]) - (p[b + 2] - p[a + 2]) * (p[c] - p[a])) / 2;
  }
  return area;
}

/** Quote del solo ambiente selezionato, misurate sulla stessa scena inviata al render. */
export function riscontroStanzaRenderLocale(scena: Scena3D, piano: PianoPer3D, vista: Vista3D, id: string): RiscontroRenderLocale[] {
  const pianta = piano.piante[vista === "fatto" ? "fatto" : "progetto"];
  const locale = pianta.locali.find(l => l.id === id);
  if (!locale) return [];
  const mesh = new Map(scena.mesh.map(m => [m.id, m]));
  const pavimento = mesh.get("pavimento:" + id);
  const soffitto = mesh.get("soffitto:" + id);
  const superficie = areaPoligono(locale.contorno) / 10000;
  const misura = pavimento ? superficieOrizzontale(pavimento) : null;
  const altezza = soffitto ? soffitto.posizioni[1] * 100 : null;
  const misure: RiscontroRenderLocale[] = [{
    nome: locale.nome, dato: `${formato.format(superficie)} m² · ${metri(locale.altezza)} di altezza`,
    avviso: misura === null || Math.abs(misura - superficie) > .02 ? "Confronta il contorno o gli eventuali fori del pavimento nel 3D."
      : altezza !== null && Math.abs(altezza - locale.altezza) > 2 ? "Confronta l’altezza del soffitto nel 3D." : undefined,
  }];
  const muri = new Map(pianta.muri.map(m => [m.id, m]));
  const aperturaPerId = new Map(pianta.aperture.map(a => [a.id, a]));
  for (const vano of apertureDelLocale(pianta, id, vista)) {
    const a = aperturaPerId.get(vano.id)!;
    const telaio = mesh.get((a.tipo === "porta" ? "stipite:" : "telaio:") + a.id);
    const davanzale = a.davanzale > 0 ? ` · Davanzale ${metri(a.davanzale)}` : "";
    misure.push({ nome: vano.nome, dato: `${metri(a.larghezza)} × ${metri(a.altezza)}${davanzale}`,
      avviso: a.tipo === "varco" || corrispondeVano(telaio, muri.get(a.muroId), a) ? undefined : "Telaio e quota del vano da riscontrare nel 3D." });
  }
  return misure;
}

/** Misura le superfici di gioco e i telai sulla mesh usata da entrambi i motori. */
export function riscontroRenderLocale(scena: Scena3D, piani: PianoPer3D[], vista: Vista3D): RiscontroRenderLocale[] {
  const indici = new Map(scena.mesh.map(m => [m.id, m]));
  const misure: RiscontroRenderLocale[] = [];
  for (const piano of piani) {
    const pianta = piano.piante[vista === "fatto" ? "fatto" : "progetto"];
    const prefisso = piani.length > 1 ? piano.id + "/" : "";
    for (const e of pianta.elementi) {
      const d = definizioneCampo(e.tipo);
      if (!d) continue;
      const m = indici.get(prefisso + `elemento:${e.id}:${d.materiale.gioco}`);
      if (!m) continue;
      const gioco = disegnoCampo(e.tipo, e.larghezza ?? d.ingombro[0], e.profondita ?? d.ingombro[1])!.gioco;
      const r = e.rotazione * Math.PI / 180;
      const l = proiezione(m, Math.cos(r), Math.sin(r), e.centro.x, e.centro.y);
      const p = proiezione(m, -Math.sin(r), Math.cos(r), e.centro.x, e.centro.y);
      const corrisponde = Math.abs(l.ampiezza - gioco.x1 + gioco.x0) < 1 && Math.abs(p.ampiezza - gioco.y1 + gioco.y0) < 1
        && Math.abs(l.centro) < 1 && Math.abs(p.centro) < 1;
      misure.push({ nome: d.nome, dato: `${metri(l.ampiezza)} × ${metri(p.ampiezza)} tra le linee`,
        avviso: corrisponde ? undefined : "Controlla la posizione e le dimensioni del campo sulla pianta." });
    }
    const muri = new Map(pianta.muri.map(m => [m.id, m]));
    const vani = pianta.aperture.filter(a => a.tipo !== "varco" && comeApertura(a.stato, vista) === "aperta");
    if (!vani.length && !pianta.muri.some(m => indici.has(prefisso + "muro:" + m.id))) continue;
    const daVerificare = vani.filter(a => !corrispondeVano(
      indici.get(prefisso + (a.tipo === "porta" ? "stipite:" : "telaio:") + a.id), muri.get(a.muroId), a, prefisso ? piano.quota : 0));
    const porte = vani.filter(a => a.tipo === "porta").length;
    misure.push({ nome: piano.nome, dato: `${porte} porte · ${vani.length - porte} finestre e portefinestre`,
      avviso: daVerificare.length ? `${daVerificare.length} telai da riscontrare nel 3D (${daVerificare.map(a => a.id).join(", ")}).` : undefined });
  }
  return misure;
}

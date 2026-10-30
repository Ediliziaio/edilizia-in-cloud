/**
 * Dalla pianta alla scena 3D: muri estrusi con i vani, pavimenti e soffitti dei
 * locali, sanitari e arredi. Funzione pura: nessuna dipendenza da three.js, così
 * la stessa scena serve al visore, alle esportazioni (GLB, OBJ) e ai test.
 */
import { CostruttoreMesh } from "./costruttore";
import { costruisciElemento, modelloElemento } from "./elementi";
import { pulisciPoligono, v2 } from "./geometria2d";
import { MATERIALI, materialeMuro, materialePavimento } from "./materiali";
import { calcolaIncroci, costruisciMuro, costruisciTamponamento, costruisciVetro, preparaMuro, sistemaVani, type MuroCalc, type VanoMuro } from "./muri";
import type { AperturaPer3D, Mesh3D, OpzioniScena, PiantaPer3D, Scena3D, StatoOggetto, V3, Vista3D } from "./tipi";

const CM = 0.01;

/** Il muro c'è in questa vista? */
export function muroPresente(stato: StatoOggetto, vista: Vista3D): boolean {
  if (vista === "confronto") return true;
  if (vista === "fatto") return stato !== "nuovo";
  return stato !== "demolire";
}

/** Come si presenta un'apertura nella vista: aperta, chiusa (muro pieno) o tamponata in rosso. */
export function comeApertura(stato: StatoOggetto, vista: Vista3D): "aperta" | "chiusa" | "tamponata" {
  if (vista === "fatto") return stato === "nuovo" ? "chiusa" : "aperta";
  if (vista === "progetto") return stato === "demolire" ? "chiusa" : "aperta";
  return stato === "demolire" ? "tamponata" : "aperta";
}

const NOMI_APERTURA: Record<AperturaPer3D["tipo"], string> = { porta: "Porta", finestra: "Finestra", portafinestra: "Portafinestra" };

export function nomeApertura(a: AperturaPer3D): string {
  return `${NOMI_APERTURA[a.tipo] ?? "Apertura"} ${a.id}`;
}

export function muriCalcolati(pianta: PiantaPer3D, vista: Vista3D): MuroCalc[] {
  return pianta.muri
    .filter((m) => muroPresente(m.stato, vista))
    .map((m) => preparaMuro({ id: m.id, a: v2(m.a.x * CM, m.a.y * CM), b: v2(m.b.x * CM, m.b.y * CM), spessore: m.spessore * CM, altezza: m.altezza * CM, stato: m.stato }))
    .filter((m): m is MuroCalc => m !== null);
}

export function costruisciScena(pianta: PiantaPer3D, opzioni: OpzioniScena = {}): Scena3D {
  const vista = opzioni.vista ?? "progetto";
  const colori = vista === "confronto";
  const conSoffitto = opzioni.soffitto ?? true;
  const conElementi = opzioni.elementi ?? true;
  const mesh: Mesh3D[] = [];
  const avvisi: string[] = [];

  const muri = muriCalcolati(pianta, vista);
  const scartati = pianta.muri.filter((m) => muroPresente(m.stato, vista)).length - muri.length;
  if (scartati > 0) avvisi.push(`${scartati} muri senza lunghezza, spessore o altezza: non disegnati.`);
  const { estremi, nodi } = calcolaIncroci(muri);

  for (const m of muri) {
    const e = estremi.get(m.id)!;
    const richieste = pianta.aperture
      .filter((a) => a.muroId === m.id)
      .map((a) => ({ a, come: comeApertura(a.stato, vista) }))
      .filter((x) => x.come !== "chiusa");
    const { vani, avvisi: avvisiVani } = sistemaVani(
      m,
      e,
      richieste.map(({ a }) => {
        const c = a.posizione * CM;
        const l = a.larghezza * CM;
        return { id: a.id, nome: nomeApertura(a), s0: c - l / 2, s1: c + l / 2, z0: a.davanzale * CM, z1: (a.davanzale + a.altezza) * CM };
      }),
    );
    avvisi.push(...avvisiVani);
    const apertura = (v: VanoMuro) => richieste.find((r) => r.a.id === v.id)!;

    // Le spallette di un vano da aprire si colorano di giallo (si demolisce la muratura).
    const spallette = new Map<string, CostruttoreMesh>();
    const corpo = new CostruttoreMesh();
    costruisciMuro(m, e, vani, corpo, (v) => {
      const { a } = apertura(v);
      if (!(colori && a.stato === "nuovo" && m.stato === "esistente")) return corpo;
      if (!spallette.has(v.id)) spallette.set(v.id, new CostruttoreMesh());
      return spallette.get(v.id)!;
    });
    mesh.push(corpo.mesh({ id: `muro:${m.id}`, nome: `Muro ${m.id}`, genere: "muro", materiale: materialeMuro(m.stato, colori), riferimento: m.id }));
    for (const [id, c] of spallette) {
      mesh.push(c.mesh({ id: `vano:${id}`, nome: `Vano da aprire ${id}`, genere: "vano", materiale: "muro_demolire", riferimento: id }));
    }

    for (const v of vani) {
      const { a, come } = apertura(v);
      if (come === "tamponata") {
        const c = new CostruttoreMesh();
        costruisciTamponamento(m, v, c);
        mesh.push(c.mesh({ id: `tamponamento:${a.id}`, nome: `Chiusura ${nomeApertura(a)}`, genere: "tamponamento", materiale: "muro_nuovo", riferimento: a.id }));
      } else if (a.tipo !== "porta") {
        const c = new CostruttoreMesh();
        costruisciVetro(m, v, c);
        mesh.push(c.mesh({ id: `vetro:${a.id}`, nome: `Vetro ${nomeApertura(a)}`, genere: "vetro", materiale: "vetro", riferimento: a.id }));
      }
    }
  }

  nodi.forEach((nodo, i) => {
    const c = new CostruttoreMesh();
    const contorno = pulisciPoligono(nodo.contorno, 1e-6);
    c.poligono(contorno.map((p) => [p.x, nodo.altezza, p.y] as V3), [0, 1, 0]);
    c.poligono(contorno.map((p) => [p.x, 0, p.y] as V3), [0, -1, 0]);
    if (!c.vuoto()) mesh.push(c.mesh({ id: `nodo:${i + 1}`, nome: `Incrocio muri ${i + 1}`, genere: "nodo", materiale: "muro", riferimento: "" }));
  });

  for (const l of pianta.locali) {
    const contorno = pulisciPoligono(l.contorno.map((p) => v2(p.x * CM, p.y * CM)));
    if (contorno.length < 3) {
      avvisi.push(`${l.nome}: contorno non valido, pavimento non disegnato.`);
      continue;
    }
    const pav = new CostruttoreMesh();
    pav.orizzontale(contorno, 0, true);
    mesh.push(pav.mesh({ id: `pavimento:${l.id}`, nome: `Pavimento ${l.nome}`, genere: "pavimento", materiale: materialePavimento(l.destinazione), riferimento: l.id }));
    if (conSoffitto) {
      const sof = new CostruttoreMesh();
      sof.orizzontale(contorno, l.altezza * CM, false);
      mesh.push(sof.mesh({ id: `soffitto:${l.id}`, nome: `Soffitto ${l.nome}`, genere: "soffitto", materiale: "soffitto", riferimento: l.id }));
    }
  }

  if (conElementi) {
    for (const el of pianta.elementi) {
      const perMateriale = new Map<string, CostruttoreMesh>();
      costruisciElemento(
        el.tipo,
        { x: el.centro.x * CM, z: el.centro.y * CM },
        (el.rotazione * Math.PI) / 180,
        { l: el.larghezza !== undefined ? el.larghezza * CM : undefined, p: el.profondita !== undefined ? el.profondita * CM : undefined, h: el.altezza !== undefined ? el.altezza * CM : undefined },
        (materiale) => {
          if (!perMateriale.has(materiale)) perMateriale.set(materiale, new CostruttoreMesh());
          return perMateriale.get(materiale)!;
        },
      );
      const nome = `${modelloElemento(el.tipo).nome} ${el.id}`;
      for (const [materiale, c] of perMateriale) {
        mesh.push(c.mesh({ id: `elemento:${el.id}:${materiale}`, nome: perMateriale.size > 1 ? `${nome} (${MATERIALI[materiale]?.nome.toLowerCase() ?? materiale})` : nome, genere: "elemento", materiale, riferimento: el.id }));
      }
    }
  }

  const usati = new Set(mesh.map((m) => m.materiale));
  const materiali = Object.fromEntries(Object.entries(MATERIALI).filter(([k]) => usati.has(k)));
  return { mesh: mesh.filter((m) => m.indici.length > 0), materiali, limiti: limitiDi(mesh), avvisi };
}

export function limitiDi(mesh: Mesh3D[], genere?: (g: Mesh3D["genere"]) => boolean): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const m of mesh) {
    if (genere && !genere(m.genere)) continue;
    for (let i = 0; i < m.posizioni.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], m.posizioni[i + k]);
        max[k] = Math.max(max[k], m.posizioni[i + k]);
      }
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

import { costruisciScena } from "./scena";
import { definizioneMateriale } from "./materiali";
import type { PiantaPer3D, Scena3D, Vista3D } from "./tipi";
import { PAVIMENTI_STANZA } from "../../../../shared/planimetrie/finiture";
import { modelloArredo } from "../../../../shared/planimetrie/modelliArredo";

export const PIANI_CUCINA_RENDER = PAVIMENTI_STANZA.filter(c => ["marmo", "marmo_calacatta", "marmo_marquinia", "travertino"].includes(c.id));
export const haPianoCucina = (tipo: string) => ["cucina", "cucina_angolare", "isola_cucina"].includes(tipo);

export type VarianteArredoRender = { modello?: string; colore?: string; pianoCucina?: string };
export type VariantiRender = { pavimento?: string; pareti?: string; arredi?: Record<string, VarianteArredoRender> };

/** Rigenera i soli oggetti e le finiture selezionati per questa immagine. */
export function scenaConVarianti(pianta: PiantaPer3D, scena: Scena3D, vista: Vista3D, localeId: string | undefined, varianti: VariantiRender) {
  const arredi = varianti.arredi ?? {};
  const pavimentoId = "pavimento:" + localeId;
  const finiture = !!localeId && (varianti.pavimento || varianti.pareti) && scena.mesh.some(m => m.id === pavimentoId);
  if (!finiture && !Object.keys(arredi).length) return { pianta, scena };
  const locali = finiture ? pianta.locali.map(l => {
    if (l.id !== localeId) return l;
    const base = l.finiture ?? {};
    return { ...l, finiture: {
      ...base,
      ...(varianti.pavimento ? { pavimento: varianti.pavimento } : {}),
      ...(varianti.pareti ? base.rivestimento ? { rivestimento: { ...base.rivestimento, materiale: varianti.pareti } }
        : { pareti: varianti.pareti } : {}),
    } };
  }) : pianta.locali;
  const piantaVariante = { ...pianta, locali, elementi: pianta.elementi.map(e => {
    const scelta = arredi[e.id];
    return scelta ? { ...e, ...modelloArredo(e.tipo, scelta.modello)?.misure,
      modello: scelta.modello ?? e.modello, colore: scelta.colore ?? e.colore } : e;
  }) };
  const nuova = costruisciScena(piantaVariante, { vista });
  const aggiorna = (m: Scena3D["mesh"][number]) =>
    (m.id.startsWith("elemento:") && Object.hasOwn(arredi, m.riferimento))
    || (finiture && m.riferimento === localeId && (m.id === pavimentoId || m.id.startsWith("finitura:")));
  const materiali = { ...nuova.materiali, ...scena.materiali };
  const piani = new Map(piantaVariante.elementi.filter(e => haPianoCucina(e.tipo)).flatMap(e => {
    const campione = PIANI_CUCINA_RENDER.find(c => c.id === arredi[e.id]?.pianoCucina);
    const base = campione && definizioneMateriale("finitura:pavimento:" + campione.id);
    if (!campione || !base) return [];
    const chiave = "piano_cucina:" + campione.id;
    materiali[chiave] = { ...base, finituraProgetto: true };
    return [[e.id, chiave] as const];
  }));
  const mesh = [...scena.mesh.filter(m => !aggiorna(m)), ...nuova.mesh.filter(aggiorna).map(m => {
    const piano = piani.get(m.riferimento);
    return piano && m.materiale === "quarzo" ? { ...m, materiale: piano } : m;
  })];
  return { pianta: piantaVariante, scena: { ...scena, mesh, materiali } };
}

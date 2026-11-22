import { intersezioneAssi, sulTratto } from "../../../../shared/planimetrie/geometria.ts";
import type { Muro, Pianta, Punto, StatoElemento } from "./adattatore";
import { modificabile, nuovoId, statoNuovo, visibile, type Vista } from "./comandi";
import { direzione, dist, lunghezzaMuro, proiettaSuMuro } from "./geometria";

export type ComandoCad = "taglia" | "estendi" | "offset";
export const NOMI_COMANDI_CAD: Record<ComandoCad, string> = { taglia: "Taglia", estendi: "Estendi", offset: "Offset" };

export type AnteprimaCad =
  | { ok: true; muro: Muro; aggiungi: boolean; rimosso?: { p1: Punto; p2: Punto } }
  | { ok: false; messaggio: string };

const errore = (messaggio: string): AnteprimaCad => ({ ok: false, messaggio });

export function riferimentoCadVisibile(stato: StatoElemento, vista: Vista): boolean {
  return visibile(stato, vista) && (vista === "fatto" || stato !== "da_demolire");
}

/** Intervallo parallelo a una parete. Ritorna anche per tratti sovrapposti solo in parte. */
function proiezioneParallela(muro: Muro, a: Punto, b: Punto, tolleranza: number): [number, number] | null {
  const u = direzione(muro);
  const scostamento = (p: Punto) => (p.y - muro.p1.y) * u.x - (p.x - muro.p1.x) * u.y;
  if (Math.max(Math.abs(scostamento(a)), Math.abs(scostamento(b))) > tolleranza) return null;
  const t1 = proiettaSuMuro(a, muro).tLibero, t2 = proiettaSuMuro(b, muro).tLibero;
  return [Math.min(t1, t2), Math.max(t1, t2)];
}

export function preparaModificaCad(pianta: Pianta, opzioni: {
  comando: ComandoCad;
  vista: Vista;
  riferimento: Muro;
  bersaglio?: Muro;
  cursore: Punto;
  distanzaCm?: number;
}): AnteprimaCad {
  const { comando, vista, riferimento, bersaglio, cursore, distanzaCm } = opzioni;
  if (!riferimentoCadVisibile(riferimento.stato, vista)) return errore("Scegli una parete di riferimento visibile.");

  if (comando === "offset") {
    if (distanzaCm === undefined || !Number.isFinite(distanzaCm) || distanzaCm <= 0) return errore("Inserisci una distanza maggiore di zero.");
    const u = direzione(riferimento);
    const lato = (cursore.y - riferimento.p1.y) * u.x - (cursore.x - riferimento.p1.x) * u.y;
    if (Math.abs(lato) < 0.02) return errore("Indica da quale lato creare la parallela.");
    const d = Math.sign(lato) * distanzaCm;
    const sposta = (p: Punto) => ({ x: p.x - u.y * d, y: p.y + u.x * d });
    const muro: Muro = {
      ...riferimento, p1: sposta(riferimento.p1), p2: sposta(riferimento.p2),
      stato: statoNuovo(vista), tipo: "tramezzo", origine: "rilevata",
      ...(riferimento.tipo !== "tramezzo" && { funzioneDaVerificare: true }),
    };
    if (![muro.p1.x, muro.p1.y, muro.p2.x, muro.p2.y].every(Number.isFinite) || lunghezzaMuro(muro) < 5) {
      return errore("La distanza non produce una parete valida.");
    }
    const lunghezza = lunghezzaMuro(muro);
    if (pianta.muri.some(m => {
      if (!riferimentoCadVisibile(m.stato, vista)) return false;
      const t = proiezioneParallela(muro, m.p1, m.p2, 0.02);
      return t && Math.min(t[1], lunghezza) - Math.max(t[0], 0) > 0.5;
    })) return errore("Sul tratto della parallela c'è già una parete.");
    return { ok: true, muro, aggiungi: true };
  }

  if (!bersaglio || bersaglio.id === riferimento.id) return errore("Scegli una seconda parete.");
  if (!riferimentoCadVisibile(bersaglio.stato, vista) || !modificabile(bersaglio.stato, vista)) {
    return errore("In Progetto puoi modificare le pareti nuove. Usa questa parete come riferimento.");
  }
  const incrocio = intersezioneAssi(bersaglio, riferimento);
  if (!incrocio || !sulTratto(incrocio.tB, riferimento)) return errore("L’asse della parete non incontra il tratto di riferimento.");
  const { punto, tA } = incrocio;
  const lunghezza = lunghezzaMuro(bersaglio);
  const tTaglio = tA * lunghezza;
  const tClic = proiettaSuMuro(cursore, bersaglio).t;

  if (comando === "estendi") {
    if (sulTratto(tA, bersaglio)) return errore("La parete arriva già al riferimento.");
    const estremo = tA < 0 ? "p1" : "p2";
    if ((tClic < lunghezza / 2) !== (estremo === "p1")) return errore("Seleziona l’estremità rivolta verso il riferimento.");
    return { ok: true, muro: { ...bersaglio, [estremo]: punto }, aggiungi: false };
  }

  if (tTaglio <= 0.02 || tTaglio >= lunghezza - 0.02) return errore("Il riferimento deve attraversare la parete da tagliare.");
  if (Math.abs(tClic - tTaglio) <= 0.02) return errore("Scegli il tratto su uno dei due lati del riferimento.");
  const estremo = tClic < tTaglio ? "p1" : "p2";
  const da = estremo === "p1" ? tTaglio : 0;
  const a = estremo === "p2" ? tTaglio : lunghezza;
  if (a - da < 5) return errore("La parete rimanente deve essere lunga almeno 5 cm.");
  if (pianta.aperture.some(vano => vano.muroId === bersaglio.id &&
    (vano.posizione - vano.larghezza / 2 < da - 0.02 || vano.posizione + vano.larghezza / 2 > a + 0.02))) {
    return errore("Il tratto da tagliare contiene un’apertura. Spostala prima di tagliare.");
  }
  const rimossoDa = estremo === "p1" ? 0 : tTaglio;
  const rimossoA = estremo === "p2" ? lunghezza : tTaglio;
  if (vista === "fatto" && pianta.locali.some(locale => !locale.aperto && visibile(locale.stato, vista) &&
    locale.contorno.some((inizio, i, contorno) => {
      const fine = contorno[(i + 1) % contorno.length];
      const t = proiezioneParallela(bersaglio, inizio, fine, locale.alFiloInterno ? bersaglio.spessore / 2 + 0.5 : 0.5);
      return t && Math.min(t[1], rimossoA) - Math.max(t[0], rimossoDa) > 1;
    }))) return errore("Il tratto delimita un locale. Apri Progetto per modificare la distribuzione.");

  return { ok: true, muro: { ...bersaglio, [estremo]: punto }, aggiungi: false, rimosso: { p1: bersaglio[estremo], p2: punto } };
}

export function applicaModificaCad(pianta: Pianta, r: Extract<AnteprimaCad, { ok: true }>): { pianta: Pianta; id: string } {
  if (r.aggiungi) {
    const id = nuovoId("muro");
    return { pianta: { ...pianta, muri: [...pianta.muri, { ...r.muro, id }] }, id };
  }
  const muro = r.muro;
  const prima = pianta.muri.find(m => m.id === muro.id);
  if (!prima) return { pianta, id: muro.id };
  const spostamento = proiettaSuMuro(muro.p1, prima).tLibero;
  return { id: muro.id, pianta: {
    ...pianta,
    muri: pianta.muri.map(m => m.id === muro.id ? muro : m),
    aperture: Math.abs(spostamento) < 1e-9 ? pianta.aperture : pianta.aperture.map(a =>
      a.muroId === muro.id ? { ...a, posizione: a.posizione - spostamento } : a),
  } };
}

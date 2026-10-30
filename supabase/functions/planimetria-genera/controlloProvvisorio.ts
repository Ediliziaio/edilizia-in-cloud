// Controllo geometrico PROVVISORIO: «niente piante rotte» prima di salvare.
// Il controllo vero è della fase 1 (shared/planimetrie/); questo regge finché
// non c'è, con le stesse tre domande del piano: muri chiusi attorno ai locali,
// locali con area positiva, aperture dentro i muri.

import type { Livello, Planimetria } from "./modelloProvvisorio.ts";
import { area, areaSovrapposta, autointersecante, distanza, proiezione } from "./geometria.ts";

export interface ErroreGeometrico {
  codice: string;
  /** Per il secondo tentativo dell'AI: preciso, con nomi e numeri. */
  dettaglio: string;
}

const AREA_MINIMA_CM2 = 0.5 * 10_000; // mezzo metro quadro
const TOLLERANZA_CM = 5;

export function controllaPlanimetria(p: Planimetria): ErroreGeometrico[] {
  const errori: ErroreGeometrico[] = [];
  if (!p.livelli.length) errori.push({ codice: "nessun_livello", dettaglio: "La pianta non ha nessun piano." });
  for (const livello of p.livelli) errori.push(...controllaLivello(livello));
  return errori;
}

function controllaLivello(l: Livello): ErroreGeometrico[] {
  const errori: ErroreGeometrico[] = [];
  if (!l.locali.length) errori.push({ codice: "nessun_locale", dettaglio: "Nessun locale trovato." });

  for (const loc of l.locali) {
    if (loc.contorno.length < 3) {
      errori.push({ codice: "locale_aperto", dettaglio: `Il locale «${loc.nome}» ha meno di 3 vertici.` });
      continue;
    }
    if (loc.contorno.some((pt) => !Number.isFinite(pt.x) || !Number.isFinite(pt.y))) {
      errori.push({ codice: "coordinate_non_valide", dettaglio: `Il locale «${loc.nome}» ha coordinate non numeriche.` });
      continue;
    }
    if (area(loc.contorno) < AREA_MINIMA_CM2) {
      errori.push({ codice: "locale_area_nulla", dettaglio: `Il locale «${loc.nome}» ha area quasi nulla (${(area(loc.contorno) / 10_000).toFixed(2)} mq).` });
    }
    if (autointersecante(loc.contorno)) {
      errori.push({ codice: "locale_intrecciato", dettaglio: `Il contorno del locale «${loc.nome}» si incrocia con se stesso: elenca i vertici in ordine lungo il perimetro.` });
    }
    if (!(loc.altezza.valore > 100 && loc.altezza.valore < 1000)) {
      errori.push({ codice: "altezza_non_valida", dettaglio: `Il locale «${loc.nome}» ha altezza ${loc.altezza.valore} cm.` });
    }
  }

  for (let i = 0; i < l.locali.length; i++) {
    for (let j = i + 1; j < l.locali.length; j++) {
      const a = l.locali[i];
      const b = l.locali[j];
      if (a.contorno.length < 3 || b.contorno.length < 3) continue;
      const piccola = Math.min(area(a.contorno), area(b.contorno));
      if (piccola <= 0) continue;
      const sovrapposta = areaSovrapposta(a.contorno, b.contorno);
      if (sovrapposta > 0.1 * piccola) {
        errori.push({ codice: "locali_sovrapposti", dettaglio: `I locali «${a.nome}» e «${b.nome}» si sovrappongono per circa ${(sovrapposta / 10_000).toFixed(1)} mq.` });
      }
    }
  }

  const muri = new Map(l.muri.map((m) => [m.id, m]));
  for (const m of l.muri) {
    const lung = distanza(m.p1, m.p2);
    if (lung < TOLLERANZA_CM) errori.push({ codice: "muro_nullo", dettaglio: `Il muro ${m.id} è lungo ${lung.toFixed(0)} cm.` });
    if (!(m.spessore.valore > 0 && m.spessore.valore <= 100)) {
      errori.push({ codice: "spessore_non_valido", dettaglio: `Il muro ${m.id} ha spessore ${m.spessore.valore} cm.` });
    }
  }

  // Ogni lato di un locale deve stare su un muro: è il «muri chiusi» del piano.
  for (const loc of l.locali) {
    if (loc.contorno.length < 3) continue;
    for (let k = 0; k < loc.contorno.length; k++) {
      const a = loc.contorno[k];
      const b = loc.contorno[(k + 1) % loc.contorno.length];
      if (distanza(a, b) < 20) continue;
      const coperto = l.muri.some((m) => {
        const tol = m.spessore.valore / 2 + 15;
        const pa = proiezione(a, m.p1, m.p2);
        const pb = proiezione(b, m.p1, m.p2);
        const mezzo = proiezione({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, m.p1, m.p2);
        return pa.distanza <= tol && pb.distanza <= tol && mezzo.distanza <= tol;
      });
      if (!coperto) {
        errori.push({ codice: "lato_senza_muro", dettaglio: `Un lato del locale «${loc.nome}» non poggia su nessun muro.` });
        break;
      }
    }
  }

  const perMuro = new Map<string, Array<{ da: number; a: number; id: string }>>();
  for (const ap of l.aperture) {
    const m = muri.get(ap.muro_id);
    if (!m) {
      errori.push({ codice: "apertura_senza_muro", dettaglio: `L'apertura ${ap.id} è su un muro che non esiste.` });
      continue;
    }
    const lung = distanza(m.p1, m.p2);
    const meta = ap.larghezza.valore / 2;
    if (!(ap.larghezza.valore > 30 && ap.larghezza.valore < 600)) {
      errori.push({ codice: "apertura_larghezza", dettaglio: `L'apertura ${ap.id} (${ap.tipo}) è larga ${ap.larghezza.valore.toFixed(0)} cm.` });
    }
    if (ap.posizione - meta < -TOLLERANZA_CM || ap.posizione + meta > lung + TOLLERANZA_CM) {
      errori.push({ codice: "apertura_fuori_muro", dettaglio: `L'apertura ${ap.id} (${ap.tipo}, ${ap.larghezza.valore.toFixed(0)} cm) esce dal muro lungo ${lung.toFixed(0)} cm.` });
    }
    const elenco = perMuro.get(m.id) ?? [];
    elenco.push({ da: ap.posizione - meta, a: ap.posizione + meta, id: ap.id });
    perMuro.set(m.id, elenco);
  }
  for (const [muroId, elenco] of perMuro) {
    elenco.sort((x, y) => x.da - y.da);
    for (let k = 1; k < elenco.length; k++) {
      if (elenco[k].da < elenco[k - 1].a - TOLLERANZA_CM) {
        errori.push({ codice: "aperture_sovrapposte", dettaglio: `Le aperture ${elenco[k - 1].id} e ${elenco[k].id} si sovrappongono sul muro ${muroId}.` });
      }
    }
  }
  return errori;
}

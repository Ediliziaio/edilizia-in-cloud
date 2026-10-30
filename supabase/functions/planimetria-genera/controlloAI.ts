// Il controllo di una pianta generata: quello della fase 1
// (shared/planimetrie/controllo.ts, solo gli ERRORI bloccano) più due verifiche
// che servono solo a ciò che arriva da un modello di visione: stanze che si
// sovrappongono (il controllo comune non lo guarda: nell'editor non succede) e
// vani di larghezza assurda. I dettagli vanno nel secondo tentativo del modello.

import { controllaPlanimetria } from "../../../shared/planimetrie/controllo.ts";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { area, areaSovrapposta } from "./geometria.ts";

export interface ProblemaGenerazione {
  codice: string;
  /** Per il secondo tentativo dell'AI: preciso, con nomi e numeri. */
  dettaglio: string;
}

export function controllaGenerata(p: Planimetria): ProblemaGenerazione[] {
  const problemi: ProblemaGenerazione[] = [];
  const nomi = new Map<string, string>();
  for (const l of p.livelli) {
    for (const loc of l.fatto.locali) nomi.set(loc.id, `locale «${loc.nome}»`);
    for (const a of l.fatto.aperture) nomi.set(a.id, `${a.tipo} ${a.id} larga ${Math.round(a.larghezza)} cm`);
    for (const m of l.fatto.muri) nomi.set(m.id, `parete ${m.id}`);
  }
  for (const pr of controllaPlanimetria(p)) {
    if (pr.gravita !== "errore") continue;
    const chi = pr.oggettoId ? nomi.get(pr.oggettoId) : null;
    problemi.push({ codice: pr.codice, dettaglio: chi ? `${pr.messaggio} (${chi})` : pr.messaggio });
  }
  for (const l of p.livelli) {
    const locali = l.fatto.locali;
    for (let i = 0; i < locali.length; i++) {
      for (let j = i + 1; j < locali.length; j++) {
        const a = locali[i];
        const b = locali[j];
        if (a.contorno.length < 3 || b.contorno.length < 3) continue;
        const piccola = Math.min(area(a.contorno), area(b.contorno));
        const comune = piccola > 0 ? areaSovrapposta(a.contorno, b.contorno) : 0;
        if (comune > 0.1 * piccola) {
          problemi.push({ codice: "locali_sovrapposti", dettaglio: `I locali «${a.nome}» e «${b.nome}» si sovrappongono per circa ${(comune / 10_000).toFixed(1)} mq.` });
        }
      }
    }
    for (const a of l.fatto.aperture) {
      if (a.larghezza > 600) problemi.push({ codice: "apertura_larghezza", dettaglio: `L'apertura ${a.id} (${a.tipo}) risulta larga ${Math.round(a.larghezza)} cm.` });
    }
  }
  return problemi;
}

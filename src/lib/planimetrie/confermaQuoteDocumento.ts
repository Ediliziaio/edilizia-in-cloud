import type { Locale, Muro, Planimetria } from "../../../shared/planimetrie/modello.ts";
import { confermaVerifica, valoreSulDisegno, verificheDelDocumento } from "../../../shared/planimetrie/verificaDocumento.ts";
import { aPlanimetria, daPlanimetria, quantitaLocale } from "@/components/planimetrie/editor/adattatore";
import { impostaLatoStanza } from "@/components/planimetrie/editor/comandi";

function pareteDelLocale(m: Muro, c: Locale): boolean {
  const dx = m.p2.x - m.p1.x, dy = m.p2.y - m.p1.y, len = Math.hypot(dx, dy);
  if (len < 1) return false;
  const ux = dx / len, uy = dy / len;
  return c.contorno.some((a, i) => {
    const b = c.contorno[(i + 1) % c.contorno.length];
    const lato = Math.hypot(b.x - a.x, b.y - a.y);
    if (lato < 1 || Math.abs((b.x - a.x) * uy - (b.y - a.y) * ux) / lato > 0.01) return false;
    const distanza = Math.abs((a.x - m.p1.x) * uy - (a.y - m.p1.y) * ux);
    const ta = (a.x - m.p1.x) * ux + (a.y - m.p1.y) * uy;
    const tb = (b.x - m.p1.x) * ux + (b.y - m.p1.y) * uy;
    return Math.abs(distanza - m.spessore / 2) < 1 && Math.min(len, Math.max(ta, tb)) - Math.max(0, Math.min(ta, tb)) > 1;
  });
}

/** Applica solo una misura scelta esplicitamente dall'utente, quindi registra la verifica sul risultato. */
export function applicaQuotaDocumento(doc: Planimetria, id: string, cm: number, nota?: string): Planimetria {
  if (!Number.isFinite(cm) || cm < 5 || cm > 100000) throw new Error("Scrivi una misura valida in centimetri.");
  const v = verificheDelDocumento(doc).find((c) => c.id === id);
  const r = v?.riferimento;
  if (!v || !r) throw new Error("Questa quota non è associata a un elemento: correggi il disegno e annota la verifica.");
  const misuraAttuale = valoreSulDisegno(doc, v);
  if (misuraAttuale !== null && (cm < misuraAttuale * 0.5 || cm > misuraAttuale * 2)) throw new Error("Questa quota è molto diversa dalla misura totale: verifica se riguarda solo un tratto della parete. Correggi il dettaglio sul disegno.");
  const livello = doc.livelli.find((l) => l.id === r.livelloId);
  if (!livello) throw new Error("Piano non trovato.");
  let nuova: Planimetria;
  if (r.tipo === "apertura") {
    const apertura = livello.fatto.aperture.find((a) => a.id === r.oggettoId);
    const muro = livello.fatto.muri.find((m) => m.id === apertura?.muroId);
    if (!apertura || !muro || !["larghezza", "altezza"].includes(r.campo)) throw new Error("Correggi questo dettaglio selezionando l'apertura sul disegno.");
    const lunghezza = Math.hypot(muro.p2.x - muro.p1.x, muro.p2.y - muro.p1.y);
    if (r.campo === "larghezza" && apertura.offset + cm > lunghezza + 0.05) throw new Error("Il vano supererebbe l'angolo. Verifica anche la posizione sul disegno.");
    if (r.campo === "altezza" && apertura.davanzale + cm > muro.altezza) throw new Error("L'apertura supererebbe l'altezza della parete.");
    nuova = { ...doc, livelli: doc.livelli.map((l) => l.id !== livello.id ? l : { ...l, fatto: { ...l.fatto, aperture: l.fatto.aperture.map((a) => a.id === apertura.id ? { ...a, [r.campo]: cm, origineMisure: { ...a.origineMisure, [r.campo]: "rilevata" } } : a) } }) };
  } else if (r.campo === "altezza") {
    if (cm < 150 || cm > 3000) throw new Error("Controlla l'altezza del locale (in centimetri).");
    const c = livello.fatto.locali.find((x) => x.id === r.oggettoId);
    if (!c) throw new Error("Stanza non trovata.");
    const muri = livello.fatto.muri.map((m) => {
      if (!pareteDelLocale(m, c)) return m;
      const vicini = livello.fatto.locali.filter((x) => x.id !== c.id && pareteDelLocale(m, x));
      const altezza = Math.max(cm, ...vicini.map((x) => x.altezza));
      if (livello.fatto.aperture.some((a) => a.muroId === m.id && a.davanzale + a.altezza > altezza)) throw new Error("L'altezza richiesta taglierebbe un'apertura: controlla anche porte e finestre sul disegno.");
      return { ...m, altezza, ...(altezza === cm ? { origineMisure: { ...m.origineMisure, altezza: "rilevata" as const } } : {}) };
    });
    nuova = { ...doc, livelli: doc.livelli.map((l) => l.id !== livello.id ? l : { ...l, fatto: { ...l.fatto, muri, locali: l.fatto.locali.map((x) => x.id === r.oggettoId ? { ...x, altezza: cm, origineMisure: { ...x.origineMisure, altezza: "rilevata" } } : x) } }) };
  } else if (r.campo === "larghezza" || r.campo === "profondita") {
    const p = daPlanimetria(doc, livello.id);
    const c = p.locali.find((x) => x.id === r.oggettoId);
    if (!c) throw new Error("Stanza non trovata.");
    const q = quantitaLocale(p, c);
    const attuale = valoreSulDisegno(doc, v)!;
    const candidati = c.contorno.flatMap((a, i) => {
      const b = c.contorno[(i + 1) % c.contorno.length];
      const lungoAsse = r.campo === "larghezza" ? Math.abs(b.y - a.y) < 0.5 : Math.abs(b.x - a.x) < 0.5;
      return lungoAsse && Math.abs(q.lati[i] - attuale) < 0.1 ? [i] : [];
    });
    if (!candidati.length) throw new Error("La misura totale attraversa più lati: correggila selezionando le pareti del disegno.");
    nuova = aPlanimetria(impostaLatoStanza(p, c.id, candidati[0], cm), doc, livello.id);
  } else throw new Error("Correggi questo dettaglio direttamente sul disegno.");
  const attuale = valoreSulDisegno(nuova, v);
  if (attuale === null || Math.abs(attuale - cm) > 0.05) throw new Error("La modifica non coincide con la quota richiesta: controlla le pareti nell'editor.");
  return confermaVerifica(nuova, id, { valoreCm: cm, nota });
}

/**
 * La pianta di una sola stanza vista dall'alto, come SVG: è il vincolo che si allega al
 * render (insieme alle misure scritte nel prompt) e l'anteprima che vede l'utente.
 *
 * Pareti numerate nel giro della stanza, porte in blu, finestre in arancio, ognuna col
 * suo nome («Porta 1», «Finestra 2»): gli stessi nomi del prompt, così il modello lega
 * il disegno alle parole. Nessun testo tecnico: è un disegno da leggere a colpo d'occhio.
 */
import type { Punto } from "../planimetrie/modello.ts";
import type { VincoliStanza } from "./vincoli.ts";

const COLORE: Record<string, string> = { porta: "#1d4ed8", varco: "#1d4ed8", finestra: "#ea580c", portafinestra: "#ea580c" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** SVG quadrato `lato` × `lato` pixel; `lingua` sceglie i nomi italiani (anteprima) o inglesi (modello). */
export function svgPiantaStanza(v: VincoliStanza, opz: { lato?: number; lingua?: "it" | "en" } = {}): string {
  const lato = opz.lato ?? 1024;
  const it = (opz.lingua ?? "it") === "it";
  const xs = v.contorno.map((p) => p.x);
  const ys = v.contorno.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const ampiezza = Math.max(maxX - minX, maxY - minY, 1);
  const margine = lato * 0.14;
  const scala = (lato - 2 * margine) / ampiezza;
  const ox = margine + ((lato - 2 * margine) - (maxX - minX) * scala) / 2;
  const oy = margine + ((lato - 2 * margine) - (maxY - minY) * scala) / 2;
  // y del modello verso l'alto → y dello schermo verso il basso.
  const sx = (p: Punto) => ox + (p.x - minX) * scala;
  const sy = (p: Punto) => lato - (oy + (p.y - minY) * scala);
  const testo = Math.round(lato * 0.026);
  const muro = Math.max(6, Math.round(lato * 0.014));

  const centro = { x: xs.reduce((a, b) => a + b, 0) / xs.length, y: ys.reduce((a, b) => a + b, 0) / ys.length };
  const pezzi: string[] = [];
  const contorno = v.contorno.map((p) => `${sx(p).toFixed(1)},${sy(p).toFixed(1)}`).join(" ");
  pezzi.push(`<rect width="${lato}" height="${lato}" fill="#ffffff"/>`);
  pezzi.push(`<polygon points="${contorno}" fill="#f3f4f6" stroke="#111827" stroke-width="${muro}" stroke-linejoin="miter"/>`);

  for (const pr of v.pareti) {
    // Numero della parete appena fuori dal muro, al centro del lato.
    const mx = (pr.da.x + pr.a.x) / 2, my = (pr.da.y + pr.a.y) / 2;
    const dx = pr.a.x - pr.da.x, dy = pr.a.y - pr.da.y;
    const l = Math.hypot(dx, dy) || 1;
    // Contorno antiorario: l'esterno sta a destra del verso di percorrenza.
    const fuori = { x: dy / l, y: -dx / l };
    const d = (testo * 1.6) / scala;
    const px = sx({ x: mx + fuori.x * d, y: my + fuori.y * d });
    const py = sy({ x: mx + fuori.x * d, y: my + fuori.y * d });
    pezzi.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(testo * 0.95).toFixed(1)}" fill="#111827"/>`);
    pezzi.push(`<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" fill="#ffffff" font-size="${testo}" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="central">${pr.numero}</text>`);
  }

  for (const a of v.aperture) {
    const pr = v.pareti[a.parete - 1];
    if (!pr) continue;
    const l = pr.lunghezza_cm || 1;
    const t0 = a.da_inizio_parete_cm / l;
    const t1 = Math.min(1, (a.da_inizio_parete_cm + a.larghezza_cm) / l);
    const p0 = { x: pr.da.x + (pr.a.x - pr.da.x) * t0, y: pr.da.y + (pr.a.y - pr.da.y) * t0 };
    const p1 = { x: pr.da.x + (pr.a.x - pr.da.x) * t1, y: pr.da.y + (pr.a.y - pr.da.y) * t1 };
    const colore = COLORE[a.tipo] ?? "#1d4ed8";
    pezzi.push(`<line x1="${sx(p0).toFixed(1)}" y1="${sy(p0).toFixed(1)}" x2="${sx(p1).toFixed(1)}" y2="${sy(p1).toFixed(1)}" stroke="${colore}" stroke-width="${muro * 2.2}" stroke-linecap="butt"/>`);
    // Nome dentro la stanza, verso il centro.
    const m = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const verso = { x: centro.x - m.x, y: centro.y - m.y };
    const lv = Math.hypot(verso.x, verso.y) || 1;
    const d = (testo * 1.8) / scala;
    const q = { x: m.x + (verso.x / lv) * d, y: m.y + (verso.y / lv) * d };
    pezzi.push(`<text x="${sx(q).toFixed(1)}" y="${sy(q).toFixed(1)}" fill="${colore}" font-size="${testo}" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="central">${esc(it ? a.etichetta : a.label)}</text>`);
  }

  const titolo = it
    ? `${v.locale.nome} — ${(v.locale.larghezza_cm / 100).toFixed(2).replace(".", ",")} × ${(v.locale.profondita_cm / 100).toFixed(2).replace(".", ",")} m`
    : `${v.locale.destinazione} — ${(v.locale.larghezza_cm / 100).toFixed(2)} × ${(v.locale.profondita_cm / 100).toFixed(2)} m`;
  pezzi.push(`<text x="${lato / 2}" y="${(testo * 1.6).toFixed(1)}" fill="#111827" font-size="${Math.round(testo * 1.1)}" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">${esc(titolo)}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lato}" height="${lato}" viewBox="0 0 ${lato} ${lato}">${pezzi.join("")}</svg>`;
}

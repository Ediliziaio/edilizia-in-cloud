import { aspettoTettoFv, azimutVistaTettoFv } from "./fvAspettoTetto.ts";
import { areaPoligono, ingombroModulo, poligonoValido, rettangoloNellaFalda, type DisegnoCommercialeFv, type PuntoFv } from "./fvDisegnoCommerciale.ts";

type P3 = PuntoFv & { z: number };
const rad = Math.PI / 180;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const numero = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
const dot = (a: P3, b: P3) => a.x * b.x + a.y * b.y + a.z * b.z;
const unit = (p: P3): P3 => { const l = Math.hypot(p.x, p.y, p.z); return { x: p.x / l, y: p.y / l, z: p.z / l }; };
const cross = (a: P3, b: P3): P3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** Inversa del piano metrico dell'editor: conserva posizione geografica, pendenza
 * e vertici dei moduli. La vista PDF non usa il reticolo separato delle falde. */
export function geometriaTettoDocumento(piano: DisegnoCommercialeFv) {
  if (!piano.mappa?.falde.length) return null;
  if (!piano.mappa.falde.every(f => poligonoValido(f.punti) && piano.falde.some(q => q.id === f.id))) return null;
  const altezza = piano.schema3d?.altezza ?? 8;
  const falde = piano.mappa.falde.map((f, indice) => {
    const locale = piano.falde.find(q => q.id === f.id)!;
    const d = { x: Math.sin(f.azimut * rad), y: Math.cos(f.azimut * rad) };
    const massimo = Math.max(...f.punti.map(p => p.x * d.x + p.y * d.y));
    const punti = f.punti.map(p => ({ ...p, z: altezza + (massimo - p.x * d.x - p.y * d.y) * Math.tan(f.inclinazione * rad) }));
    const origine = punti.reduce((a, p) => ({ x: a.x + p.x / punti.length, y: a.y + p.y / punti.length, z: a.z + p.z / punti.length }), { x: 0, y: 0, z: 0 });
    const normale = punti.reduce((a, p, i) => {
      const q = punti[(i + 1) % punti.length];
      return { x: a.x + (p.y - q.y) * (p.z + q.z), y: a.y + (p.z - q.z) * (p.x + q.x), z: a.z + (p.x - q.x) * (p.y + q.y) };
    }, { x: 0, y: 0, z: 0 });
    let n = unit(normale);
    if (n.z < 0) n = { x: -n.x, y: -n.y, z: -n.z };
    const bordo = n.z < Math.cos(rad) ? { x: -n.y, y: n.x, z: 0 } : { x: 1, y: 0, z: 0 };
    const prodotto = dot(bordo, n);
    const u = unit({ x: bordo.x - n.x * prodotto, y: bordo.y - n.y * prodotto, z: bordo.z - n.z * prodotto });
    const v = unit(cross(n, u));
    const contorno = punti.map(p => {
      const q = { x: p.x - origine.x, y: p.y - origine.y, z: p.z - origine.z };
      return { x: dot(q, u), y: dot(q, v) };
    });
    const offset = { x: 0, y: 0 };
    const nelMondo = (p: PuntoFv, distacco = 0): P3 => ({
      x: origine.x + u.x * (p.x - offset.x) + v.x * (p.y - offset.y) + n.x * distacco,
      y: origine.y + u.y * (p.x - offset.x) + v.y * (p.y - offset.y) + n.y * distacco,
      z: origine.z + u.z * (p.x - offset.x) + v.z * (p.y - offset.y) + n.z * distacco,
    });
    return { ...f, indice, punti, contorno, offset, nelMondo, pianta: areaPoligono(f.punti), superficie: areaPoligono(locale.punti), lati: punti.map((p, i) => {
      const q = punti[(i + 1) % punti.length]; return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    }) };
  });
  const larghezza = Math.max(...falde.map(f => Math.max(...f.contorno.map(p => p.x)) - Math.min(...f.contorno.map(p => p.x)))) + 2;
  const altezzaTavola = Math.max(...falde.map(f => Math.max(...f.contorno.map(p => p.y)) - Math.min(...f.contorno.map(p => p.y)))) + 2;
  for (const f of falde) {
    f.offset.x = f.indice % 2 * larghezza - Math.min(...f.contorno.map(p => p.x));
    f.offset.y = Math.floor(f.indice / 2) * altezzaTavola - Math.min(...f.contorno.map(p => p.y));
  }
  const rett = (r: { x: number; y: number; w: number; h: number }) => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
  const pannelli = piano.pannelli.map(p => {
    const f = falde.find(f => f.id === p.faldaId)!;
    const r = ingombroModulo(p, piano.modulo);
    // I supporti alzano solo il lato alto del modulo, come nell'editor 3D.
    const vertici = rett(r).map((q, i) => {
      const t = p.supporto ? .15 + Math.tan(p.supporto.inclinazione * rad) * (p.supporto.verso === "y-" ? (i < 2 ? 0 : r.h) : p.supporto.verso === "x+" ? (i === 1 || i === 2 ? 0 : r.w) : (i === 1 || i === 2 ? r.w : 0)) : 0;
      return f.nelMondo(q, .055 + t);
    });
    return { id: p.id, faldaId: p.faldaId, punti: vertici };
  });
  const ostacoli = piano.ostacoli.flatMap(o => {
    const f = falde.find(f => rettangoloNellaFalda(o, piano.falde.find(q => q.id === f.id)!, 0));
    return f ? [{ id: o.id, punti: rett(o).map(p => f.nelMondo(p, .08)) }] : [];
  });
  return { falde, pannelli, ostacoli, altezza, aspetto: aspettoTettoFv(piano.schema3d?.copertura, !!piano.industriale) };
}

type Geometria = NonNullable<ReturnType<typeof geometriaTettoDocumento>>;
const colori = ["#d9e4e9", "#e7d9c9", "#d8e8de", "#e2dded"];

/** SVG incorporato: resta nitido nella stampa e non dipende da canvas/WebGL,
 * crediti AI, rete o fotografie del provider cartografico. */
export function svgTettoDocumento(g: Geometria, vista: "pianta" | "3d") {
  const treD = vista === "3d";
  // Guarda la falda principale dal lato esposto: una camera fissa può mostrarla
  // quasi di taglio quando azimut e pendenza coincidono con la direzione vista.
  const angolo = azimutVistaTettoFv(g.falde.map(f => ({ id: f.id, azimut: f.azimut, area: f.superficie })), g.pannelli) * rad, d = { x: Math.sin(angolo), y: Math.cos(angolo) };
  const proietta = (p: P3): PuntoFv => treD ? { x: -d.y * p.x + d.x * p.y, y: (d.x * p.x + d.y * p.y) * Math.sin(55 * rad) - p.z * Math.cos(55 * rad) } : { x: p.x, y: -p.y };
  const tutti = g.falde.flatMap(f => f.punti.flatMap(p => treD ? [p, { ...p, z: 0 }] : [p]));
  const ps = tutti.map(proietta), minX = Math.min(...ps.map(p => p.x)), minY = Math.min(...ps.map(p => p.y));
  const w = Math.max(...ps.map(p => p.x)) - minX, h = Math.max(...ps.map(p => p.y)) - minY;
  const scala = Math.min(610 / Math.max(w, .1), 310 / Math.max(h, .1));
  const at = (p: P3) => { const q = proietta(p); return { x: 360 + (q.x - minX - w / 2) * scala, y: 205 + (q.y - minY - h / 2) * scala }; };
  const punti = (p: P3[]) => p.map(at).map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ");
  const poligono = (p: P3[], fill: string, attributi = "") => `<polygon points="${punti(p)}" fill="${fill}" stroke="#596c77" stroke-width="1.2" ${attributi}/>`;
  // Solo i bordi esterni scendono a terra: i colmi condivisi non sono pareti.
  const chiave = (p: P3) => [p.x, p.y, p.z].map(n => n.toFixed(3)).join(",");
  const bordi = g.falde.flatMap(f => f.punti.map((a, i) => { const b = f.punti[(i + 1) % f.punti.length]; return { a, b, key: [chiave(a), chiave(b)].sort().join("/") }; }));
  const frequenza = new Map<string, number>();
  for (const b of bordi) frequenza.set(b.key, (frequenza.get(b.key) ?? 0) + 1);
  const sfuma = (hex: string, fattore: number) => "#" + hex.slice(1).match(/../g)!.map(v => Math.round(Math.min(255, parseInt(v, 16) * fattore)).toString(16).padStart(2, "0")).join("");
  const pareti = treD ? bordi.filter(b => frequenza.get(b.key) === 1).map(({ a, b }) => {
    return { profondita: ((a.x + b.x) * d.x + (a.y + b.y) * d.y) / 2, punti: [a, b, { ...b, z: 0 }, { ...a, z: 0 }] };
  }).sort((a, b) => a.profondita - b.profondita).map(p => { const [a, b] = p.punti, dx = b.x - a.x, dy = b.y - a.y; const luce = .88 + .1 * Math.abs((dx - dy) / Math.max(.01, Math.hypot(dx, dy) * 1.42)); return poligono(p.punti, sfuma(g.aspetto.parete, luce)); }).join("") : "";
  const defs: string[] = [];
  const tetto = [...g.falde].sort((a, b) => a.punti.reduce((s, p) => s + p.x * d.x + p.y * d.y, 0) / a.punti.length - b.punti.reduce((s, p) => s + p.x * d.x + p.y * d.y, 0) / b.punti.length).map(f => {
    let fill = colori[f.indice % colori.length];
    if (treD) {
      const origine = at(f.nelMondo(f.offset)), u = at(f.nelMondo({ x: f.offset.x + 1, y: f.offset.y })), v = at(f.nelMondo({ x: f.offset.x, y: f.offset.y + 1 }));
      const id = `fv-copertura-${f.indice}`, shade = .83 + .23 * Math.max(0, Math.cos((f.azimut - 215) * rad));
      const base = sfuma(g.aspetto.colore, shade);
      defs.push(`<pattern id="${id}" width=".56" height=".66" patternUnits="userSpaceOnUse" patternTransform="matrix(${u.x-origine.x} ${u.y-origine.y} ${v.x-origine.x} ${v.y-origine.y} ${origine.x} ${origine.y})"><rect width=".56" height=".66" fill="${base}"/>${g.aspetto.tipo === "lamiera" ? '<path d="M.03 0V.66 M.31 0V.66" stroke="#fff" stroke-opacity=".18" stroke-width=".025"/>' : '<path d="M0 0H.56 M0 .33H.56 M.14 0V.33 M.42 0V.33 M0 .33V.66 M.28 .33V.66 M.56 .33V.66" stroke="#322e28" stroke-opacity=".4" stroke-width=".012"/><path d="M.19 .01V.32 M.47 .01V.32 M.05 .34V.65 M.33 .34V.65" stroke="#fff" stroke-opacity=".18" stroke-width=".035"/>'}</pattern>`);
      fill = `url(#${id})`;
    }
    const moduli = g.pannelli.filter(p => p.faldaId === f.id).map(p => {
      const superficie = poligono(p.punti, g.aspetto.pannello, `data-fv-panel="${esc(p.id)}"`);
      if (!treD) return superficie;
      const mix = (a: P3, b: P3, t: number): P3 => ({ x: a.x+(b.x-a.x)*t, y: a.y+(b.y-a.y)*t, z: a.z+(b.z-a.z)*t });
      const linea = (a: P3, b: P3) => { const x = at(a), y = at(b); return `<path d="M${x.x} ${x.y}L${y.x} ${y.y}" stroke="#637a8c" stroke-opacity=".45" stroke-width=".35"/>`; };
      const [a,b,c,d] = p.punti;
      return superficie + `<g data-fv-cells="${esc(p.id)}">${Array.from({length:5},(_,i)=>linea(mix(a,b,(i+1)/6),mix(d,c,(i+1)/6))).join("")}${Array.from({length:11},(_,i)=>linea(mix(a,d,(i+1)/12),mix(b,c,(i+1)/12))).join("")}</g>` + `<polygon points="${punti(p.punti)}" fill="none" stroke="${g.aspetto.cornice}" stroke-width="1.15"/>`;
    }).join("");
    const label = at(f.punti[0]);
    return poligono(f.punti, fill, `data-fv-roof="${esc(f.id)}"`) + moduli + (!treD ? `<g transform="translate(${label.x} ${label.y})"><circle r="11" fill="#fff" stroke="#64748b"/><text y="4" text-anchor="middle" font-size="12" fill="#1e3a5f">${f.indice + 1}</text></g>` : "");
  }).join("");
  const ostacoli = g.ostacoli.map(o => poligono(o.punti, "#e8ad65")).join("");
  const quote = !treD ? g.falde.map(f => f.punti.length <= 8 ? f.punti.map((p, i) => {
    const q = f.punti[(i + 1) % f.punti.length], a = at(p), b = at(q);
    if (Math.hypot(a.x - b.x, a.y - b.y) < 45) return "";
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    return `<g transform="translate(${x} ${y})"><rect x="-29" y="-9" width="58" height="18" rx="4" fill="#fff" fill-opacity=".95"/><text text-anchor="middle" y="4" fill="#1e3a5f" font-size="11">${numero(Math.hypot(q.x - p.x, q.y - p.y))} m</text></g>`;
  }).join("") : "").join("") : "";
  const potenza = 10 ** Math.floor(Math.log10(Math.max(w / 4, .01)));
  const scalaM = [5, 2, 1].find(n => n * potenza <= w / 4)! * potenza;
  const nord = !treD ? '<g transform="translate(684 40)"><path d="M0 -14 L5 5 L0 1 L-5 5 Z" fill="#1e3a5f"/><text y="-20" text-anchor="middle" font-size="12" fill="#1e3a5f">N</text></g>' : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 410" role="img" aria-label="${treD ? "Vista 3D del tetto disegnato con i pannelli" : "Disegno del tetto in pianta con falde, pannelli e misure"}" style="width:100%;height:100%;background:#f7fafb;font-family:Arial,sans-serif">${treD ? `<defs>${defs.join("")}</defs><ellipse cx="360" cy="332" rx="218" ry="37" fill="#7c8176" opacity=".12"/>` : ""}${pareti}${tetto}${ostacoli}${quote}${nord}${!treD ? `<g transform="translate(32 380)"><path d="M0 -5 v5 h${scalaM * scala} v-5" stroke="#1e3a5f" fill="none"/><text x="0" y="16" fill="#475569" font-size="11">${scalaM} m · misure in pianta</text></g>` : ""}</svg>`;
}

export function tabellaFaldeDocumento(g: Geometria, da = 0) {
  return `<table class="fv-roof-table"><thead><tr><th>Falda</th><th>In pianta</th><th>Superficie</th><th>Pendenza</th><th>Azimut</th><th>Moduli</th></tr></thead><tbody>${g.falde.slice(da, da + 6).map(f => `<tr><td><strong>${f.indice + 1} · ${esc(f.nome.slice(0, 45))}${f.nome.length > 45 ? "…" : ""}</strong></td><td>${numero(f.pianta)} m²</td><td>${numero(f.superficie)} m²</td><td>${numero(f.inclinazione)}°${f.inclinazioneStimata ? "*" : ""}</td><td>${numero(f.azimut)}°</td><td>${g.pannelli.filter(p => p.faldaId === f.id).length}</td></tr>`).join("")}</tbody></table>`;
}

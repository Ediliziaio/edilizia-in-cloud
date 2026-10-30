/** Geometria piana di supporto al 3D: vettori, poligoni, triangolazione. Funzioni pure. */

export interface V2 {
  x: number;
  y: number;
}

export const v2 = (x: number, y: number): V2 => ({ x, y });
export const piu = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
export const meno = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
export const per = (a: V2, k: number): V2 => ({ x: a.x * k, y: a.y * k });
export const scalare = (a: V2, b: V2) => a.x * b.x + a.y * b.y;
export const vettoriale = (a: V2, b: V2) => a.x * b.y - a.y * b.x;
export const lunghezza = (a: V2) => Math.hypot(a.x, a.y);
export const distanza = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.y - b.y);
export const normalizza = (a: V2): V2 => {
  const l = lunghezza(a);
  return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
/** Ruota di +90° (dall'asse x verso l'asse y). */
export const perpendicolare = (a: V2): V2 => ({ x: -a.y, y: a.x });

/** Area con segno (positiva se i vertici girano dall'asse x verso l'asse y). */
export function areaConSegno(poligono: V2[]): number {
  let s = 0;
  for (let i = 0; i < poligono.length; i++) {
    const a = poligono[i];
    const b = poligono[(i + 1) % poligono.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function perimetro(poligono: V2[]): number {
  let s = 0;
  for (let i = 0; i < poligono.length; i++) s += distanza(poligono[i], poligono[(i + 1) % poligono.length]);
  return s;
}

export function puntoNelPoligono(p: V2, poligono: V2[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

/** Toglie i vertici doppi consecutivi e quelli allineati. */
export function pulisciPoligono(poligono: V2[], tolleranza = 1e-9): V2[] {
  let punti = poligono.filter((p, i) => distanza(p, poligono[(i + 1) % poligono.length]) > tolleranza);
  let cambiato = true;
  while (cambiato && punti.length > 3) {
    cambiato = false;
    for (let i = 0; i < punti.length; i++) {
      const a = punti[(i + punti.length - 1) % punti.length];
      const b = punti[i];
      const c = punti[(i + 1) % punti.length];
      if (Math.abs(vettoriale(meno(b, a), meno(c, b))) <= tolleranza * Math.max(1, distanza(a, c))) {
        punti = punti.filter((_, k) => k !== i);
        cambiato = true;
        break;
      }
    }
  }
  return punti;
}

/**
 * Triangolazione a orecchie di un poligono semplice (anche concavo, senza buchi).
 * Restituisce terne di indici nel poligono dato.
 */
export function triangola(poligono: V2[]): [number, number, number][] {
  const n = poligono.length;
  if (n < 3) return [];
  const antiorario = areaConSegno(poligono) > 0;
  const restanti = Array.from({ length: n }, (_, i) => (antiorario ? i : n - 1 - i));
  const out: [number, number, number][] = [];
  const convesso = (a: V2, b: V2, c: V2) => vettoriale(meno(b, a), meno(c, b)) > 1e-12;
  const dentroTriangolo = (p: V2, a: V2, b: V2, c: V2) =>
    vettoriale(meno(b, a), meno(p, a)) >= -1e-12 &&
    vettoriale(meno(c, b), meno(p, b)) >= -1e-12 &&
    vettoriale(meno(a, c), meno(p, c)) >= -1e-12;

  let guardia = n * n;
  while (restanti.length > 3 && guardia-- > 0) {
    let tagliato = false;
    for (let i = 0; i < restanti.length; i++) {
      const ia = restanti[(i + restanti.length - 1) % restanti.length];
      const ib = restanti[i];
      const ic = restanti[(i + 1) % restanti.length];
      const a = poligono[ia];
      const b = poligono[ib];
      const c = poligono[ic];
      if (!convesso(a, b, c)) continue;
      const contiene = restanti.some(
        (k) => k !== ia && k !== ib && k !== ic && dentroTriangolo(poligono[k], a, b, c),
      );
      if (contiene) continue;
      out.push([ia, ib, ic]);
      restanti.splice(i, 1);
      tagliato = true;
      break;
    }
    // Poligono rovinato (autointersecante): chiude a ventaglio quello che resta.
    if (!tagliato) break;
  }
  for (let i = 1; i + 1 < restanti.length; i++) out.push([restanti[0], restanti[i], restanti[i + 1]]);
  return out;
}

/** Taglia un poligono convesso tenendo la parte dove `scalare(p - origine, direzione)` sta in [da, a]. */
export function tagliaTraDue(poligono: V2[], origine: V2, direzione: V2, da: number, a: number): V2[] {
  const taglia = (punti: V2[], dentro: (s: number) => boolean, soglia: number) => {
    const out: V2[] = [];
    for (let i = 0; i < punti.length; i++) {
      const p = punti[i];
      const q = punti[(i + 1) % punti.length];
      const sp = scalare(meno(p, origine), direzione);
      const sq = scalare(meno(q, origine), direzione);
      if (dentro(sp)) out.push(p);
      if (dentro(sp) !== dentro(sq)) {
        const t = (soglia - sp) / (sq - sp);
        out.push(piu(p, per(meno(q, p), t)));
      }
    }
    return out;
  };
  const primo = taglia(poligono, (s) => s >= da, da);
  return taglia(primo, (s) => s <= a, a);
}

/** Il rettangolo più piccolo che contiene il poligono, orientato come uno dei suoi lati. */
export function rettangoloMinimo(poligono: V2[]): { larghezza: number; profondita: number; direzione: V2 } {
  let migliore = { area: Infinity, larghezza: 0, profondita: 0, direzione: v2(1, 0) };
  for (let i = 0; i < poligono.length; i++) {
    const d = normalizza(meno(poligono[(i + 1) % poligono.length], poligono[i]));
    if (lunghezza(d) === 0) continue;
    const n = perpendicolare(d);
    let minS = Infinity, maxS = -Infinity, minT = Infinity, maxT = -Infinity;
    for (const p of poligono) {
      const s = scalare(p, d);
      const t = scalare(p, n);
      minS = Math.min(minS, s); maxS = Math.max(maxS, s);
      minT = Math.min(minT, t); maxT = Math.max(maxT, t);
    }
    const area = (maxS - minS) * (maxT - minT);
    if (area < migliore.area - 1e-9) migliore = { area, larghezza: maxS - minS, profondita: maxT - minT, direzione: d };
  }
  // La larghezza è il lato lungo.
  if (migliore.profondita > migliore.larghezza) {
    return { larghezza: migliore.profondita, profondita: migliore.larghezza, direzione: perpendicolare(migliore.direzione) };
  }
  return { larghezza: migliore.larghezza, profondita: migliore.profondita, direzione: migliore.direzione };
}

/** Un punto sicuramente dentro il poligono: il baricentro se ci cade, altrimenti il baricentro del triangolo più grande. */
export function puntoInterno(poligono: V2[]): V2 {
  const a = areaConSegno(poligono);
  if (Math.abs(a) > 1e-12) {
    let cx = 0, cy = 0;
    for (let i = 0; i < poligono.length; i++) {
      const p = poligono[i];
      const q = poligono[(i + 1) % poligono.length];
      const f = p.x * q.y - q.x * p.y;
      cx += (p.x + q.x) * f;
      cy += (p.y + q.y) * f;
    }
    const c = v2(cx / (6 * a), cy / (6 * a));
    if (puntoNelPoligono(c, poligono)) return c;
  }
  let migliore = poligono[0];
  let area = -1;
  for (const [i, j, k] of triangola(poligono)) {
    const t = Math.abs(vettoriale(meno(poligono[j], poligono[i]), meno(poligono[k], poligono[i]))) / 2;
    if (t > area) {
      area = t;
      migliore = v2((poligono[i].x + poligono[j].x + poligono[k].x) / 3, (poligono[i].y + poligono[j].y + poligono[k].y) / 3);
    }
  }
  return migliore;
}

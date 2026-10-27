import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as bgn from '@/lib/bagni/calcoli';
import * as clm from '@/lib/climatizzazione/calcoli';
import * as ele from '@/lib/elettrico/calcoli';
import * as idr from '@/lib/termoidraulico/calcoli';
import * as pav from '@/lib/pavimenti/calcoli';
import * as pis from '@/lib/piscine/calcoli';
import * as rst from '@/lib/ristrutturazione/calcoli';
import * as tet from '@/lib/tetti/calcoli';

const moduli = { bgn, clm, ele, idr, pav, pis, rst, tet } as const;
const riga = (capitolo: string, q: number, prezzo: number, costoMat: number, costoMan: number, extra: Record<string, unknown> = {}) =>
  ({ capitolo_nome: capitolo, quantita: q, prezzo_unitario: prezzo, sconto_pct: 0, costo_materiali: costoMat, costo_manodopera: costoMan, ...extra });

describe.each(Object.entries(moduli))('%s: la voce opzionale non pesa nei totali', (_nome, m) => {
  const base = [riga('A', 1, 1000, 300, 200), riga('B', 2, 100, 40, 20)];
  const conOpz = [...base, riga('A', 1, 5000, 2000, 1000, { opzionale: true })];
  it('imponibile, IVA, totale e costi restano quelli delle voci incluse', () => {
    const senza = m.calcTotaliComputo(base as never, { sconto_pct: 0, iva_pct: 10 });
    const con = m.calcTotaliComputo(conOpz as never, { sconto_pct: 0, iva_pct: 10 });
    expect(con.imponibile).toBe(senza.imponibile);
    expect(con.totale).toBe(senza.totale);
    expect(con.costoTot).toBe(senza.costoTot);
    expect(con.marginePct).toBe(senza.marginePct);
    expect(con.perCapitolo).toEqual(senza.perCapitolo);
  });
  it('una voce opzionale senza costo non rende «incompleti» i costi', () => {
    const t = m.calcTotaliComputo([...base, riga('A', 1, 800, 0, 0, { opzionale: true })] as never, { sconto_pct: 0, iva_pct: 10 });
    expect(t.righeSenzaCosto).toBe(0);
    expect(t.marginePct).not.toBeNull();
  });
  it('opzionale false o assente conta come sempre', () => {
    const a = m.calcTotaliComputo([riga('A', 1, 100, 10, 10, { opzionale: false })] as never, { sconto_pct: 0, iva_pct: 0 });
    const b = m.calcTotaliComputo([riga('A', 1, 100, 10, 10)] as never, { sconto_pct: 0, iva_pct: 0 });
    expect(a.imponibile).toBe(100);
    expect(b.imponibile).toBe(100);
  });
});

/** Ogni punto che passa le voci ai totali elencando i campi a mano deve portarsi dietro `opzionale`: se ne manca uno, quel totale
 *  (economia, PDF, anteprima, salvataggio) conterebbe le opzionali e i numeri non tornerebbero. */
describe('tutti i punti che calcolano i totali portano opzionale', () => {
  const radice = join(process.cwd(), 'src');
  const file: string[] = [];
  const scorri = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== 'test') scorri(p); } else if (/\.tsx?$/.test(n) && !/\.test\./.test(n)) file.push(p); } };
  scorri(radice);
  it('nessun letterale chiude dopo costo_manodopera senza opzionale', () => {
    const colpevoli = file.filter(f => /costo_manodopera: \w+\.costo_manodopera,?\n\s*\}\)\)/.test(readFileSync(f, 'utf8')));
    expect(colpevoli).toEqual([]);
  });
  it('le letture dei hook per i totali selezionano opzionale', () => {
    for (const m of ['Bagni', 'Climatizzazione', 'Elettrico', 'Termoidraulico', 'Pavimenti', 'Piscine', 'Ristrutturazione', 'Tetti']) {
      const s = readFileSync(join(radice, 'hooks', `use${m}Progetto.ts`), 'utf8');
      expect(s, m).toMatch(/\.select\("capitolo_nome, quantita, prezzo_unitario, sconto_pct, costo_materiali, costo_manodopera[^"]*opzionale"\)/);
    }
  });
});

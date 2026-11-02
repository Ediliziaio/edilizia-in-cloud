/**
 * I controlli sul cronoprogramma proposto dall'AI (2/11/2026). Nella prova su Demo 2 ha aggiunto
 * gli scavi, che nel computo non c'erano, e ha ignorato le squadre indicate.
 */
export interface FaseCrono { nome: string; inizio: number; durata: number; nota: string }

const AMMESSE = /allestiment|sicurezz|stagionat|asciugat|attesa|pulizi|collaud|consegn|approvvigion|ordine materiali/i;
const SOLO_ATTESA = /stagionat|asciugat|attesa/i;

const radici = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z]+/).filter((w) => w.length > 3).map((w) => w.slice(0, 5));

/** Toglie le fasi che non parlano di niente che sia nel computo. Quelle di servizio restano. */
export function fasiDelComputo(fasi: readonly FaseCrono[], testoComputo: string): FaseCrono[] {
  const presenti = new Set(radici(testoComputo));
  return fasi.filter((f) => AMMESSE.test(f.nome) || radici(f.nome).some((r) => presenti.has(r)));
}

/** Toglie i giorni in cui, tolta una fase, nessuno lavorerebbe. */
export function chiudiBuchi(fasi: readonly FaseCrono[]): FaseCrono[] {
  const fine = Math.max(0, ...fasi.map((f) => f.inizio + f.durata - 1));
  const nuovo = new Map<number, number>();
  let g = 0;
  for (let d = 1; d <= fine; d++) {
    if (fasi.some((f) => d >= f.inizio && d < f.inizio + f.durata)) nuovo.set(d, ++g);
  }
  return fasi.map((f) => ({ ...f, inizio: nuovo.get(f.inizio) ?? f.inizio }));
}

/** Mai più di `squadre` fasi di lavoro insieme: chi non ci sta aspetta. Le attese non occupano squadre. */
export function limitaSquadre(fasi: readonly FaseCrono[], squadre: number | null | undefined): FaseCrono[] {
  if (!squadre || squadre < 1) return [...fasi];
  const piazzate: FaseCrono[] = [];
  for (const f of [...fasi].sort((a, b) => a.inizio - b.inizio)) {
    if (SOLO_ATTESA.test(f.nome)) { piazzate.push(f); continue; }
    let inizio = f.inizio;
    const occupata = (d: number) => piazzate.filter((p) => !SOLO_ATTESA.test(p.nome) && d >= p.inizio && d < p.inizio + p.durata).length >= squadre;
    for (let d = inizio; d < inizio + f.durata; d++) {
      if (occupata(d)) { inizio = d + 1; }
    }
    piazzate.push({ ...f, inizio });
  }
  return piazzate;
}

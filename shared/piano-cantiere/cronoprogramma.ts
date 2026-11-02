/**
 * I controlli sul cronoprogramma proposto dall'AI (2/11/2026). Nella prova su Demo 2 ha aggiunto
 * gli scavi, che nel computo non c'erano, e ha ignorato le squadre indicate. Le fasi non si tolgono:
 * il nome di una fase e quello delle voci possono essere diversi («Opere murarie» e «Tramezzi»).
 * Si segnalano solo i lavori specifici che nel computo non compaiono.
 */
export interface FaseCrono { nome: string; inizio: number; durata: number; nota: string }

const SOLO_ATTESA = /stagionat|asciugat|attesa/i;
const LAVORI_SPECIFICI = ["scav", "sbanc", "fondaz", "ponteg", "demoli", "cappott", "fotovolt", "ascensor", "piscin"];

const senzaAccenti = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** I nomi delle fasi con un lavoro specifico che nel computo non c'è, con la nota che lo dice. */
export function segnaFasiFuoriComputo(fasi: readonly FaseCrono[], testoComputo: string): { fasi: FaseCrono[]; daControllare: string[] } {
  const computo = senzaAccenti(testoComputo);
  const daControllare: string[] = [];
  const out = fasi.map((f) => {
    const nome = senzaAccenti(f.nome);
    if (!LAVORI_SPECIFICI.some((l) => nome.includes(l) && !computo.includes(l))) return f;
    daControllare.push(f.nome);
    return { ...f, nota: [f.nota, "Nel computo non vedo questo lavoro: controlla o togli la fase."].filter(Boolean).join(" ") };
  });
  return { fasi: out, daControllare };
}

/** Mai più di `squadre` fasi di lavoro insieme: chi non ci sta aspetta. Le attese seguono la fase prima di loro. */
export function limitaSquadre(fasi: readonly FaseCrono[], squadre: number | null | undefined): FaseCrono[] {
  if (!squadre || squadre < 1) return [...fasi];
  const piazzate: FaseCrono[] = [];
  let ultimoSpostamento = 0;
  for (const f of [...fasi].sort((a, b) => a.inizio - b.inizio)) {
    if (SOLO_ATTESA.test(f.nome)) { piazzate.push({ ...f, inizio: f.inizio + ultimoSpostamento }); continue; }
    let inizio = f.inizio;
    const occupata = (d: number) => piazzate.filter((p) => !SOLO_ATTESA.test(p.nome) && d >= p.inizio && d < p.inizio + p.durata).length >= squadre;
    for (let d = inizio; d < inizio + f.durata; d++) {
      if (occupata(d)) inizio = d + 1;
    }
    ultimoSpostamento = inizio - f.inizio;
    piazzate.push({ ...f, inizio });
  }
  return piazzate;
}

/** Persone di una squadra e ore utili al giorno: per dire al modello quanto dura un lavoro. */
const PERSONE_SQUADRA = 3;
const ORE_UTILI_GIORNO = 6.8;

/** Le ore di manodopera per capitolo in una riga per il prompt. Così le durate partono da un conto, non da un'impressione. */
export function righeOreCapitoli(capitoli: readonly { nome: string; importo: number | null }[], stime: ReadonlyMap<string, number>, costoOrario: number): string[] {
  return capitoli.flatMap((c) => {
    const f = stime.get(c.nome.trim().slice(0, 120).toLowerCase());
    if (!f || !c.importo) return [];
    const ore = c.importo * f / costoOrario;
    return [`- ${c.nome}: circa ${Math.round(ore)} ore di lavoro, cioè ${Math.max(1, Math.round(ore / (PERSONE_SQUADRA * ORE_UTILI_GIORNO)))} giorni per una squadra di ${PERSONE_SQUADRA} persone`];
  });
}

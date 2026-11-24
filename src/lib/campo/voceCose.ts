/**
 * Dal racconto a voce alle fasi, alle voci del computo e ai mezzi del cantiere (24/11/2026).
 *
 * Prudente: una cosa si segna solo se le parole dette la indicano chiaramente. Si confrontano le parole «di peso»
 * del nome (almeno 5 lettere, non «della», «per», …) con quelle del racconto, per radice (ponteggio/ponteggi,
 * isolamento/isolare). Vince solo chi ne ha più di tutti; a pari merito (due «Miscelatore e aspiratore») non si
 * segna niente: decide la persona con un tocco. Si cerca frase per frase, così «ho fatto A e B» trova entrambe.
 */
export interface Voce { key: string; nome: string }

const VUOTE = new Set(["della", "delle", "dello", "degli", "nella", "nelle", "sulla", "sulle", "dalla", "dalle", "anche", "tutto", "tutti", "tutte",
  "oggi", "lavoro", "lavori", "fatto", "fatta", "fatti", "abbiamo", "eravamo", "sono", "stato", "stata", "messo", "messa", "dopo", "prima",
  "verifica", "realizzazione", "fornitura", "posa", "opere", "lavorazione", "lavorazioni"]);

const pulisci = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const radice = (p: string) => p.slice(0, Math.min(p.length, 6));

export function paroleDiPeso(s: string): string[] {
  return [...new Set(pulisci(s).split(/[^a-z0-9]+/).filter(p => p.length >= 5 && !VUOTE.has(p)).map(radice))];
}

/** La voce indicata dal racconto: solo se la migliore è una sola (a pari merito decide la persona). */
export function trovaNelRacconto(racconto: string, voci: Voce[]): string[] {
  const detto = new Set(paroleDiPeso(racconto));
  if (!detto.size) return [];
  const punti = voci.map(v => ({ key: v.key, punti: paroleDiPeso(v.nome).filter(p => detto.has(p)).length }))
    .filter(x => x.punti > 0);
  if (!punti.length) return [];
  const meglio = Math.max(...punti.map(x => x.punti));
  const primi = punti.filter(x => x.punti === meglio);
  return primi.length === 1 ? [primi[0].key] : [];
}

/** Frase per frase: «ho montato i ponteggi. Poi abbiamo sostituito gli infissi» trova due cose diverse. */
export function trovaNelleFrasi(racconto: string, voci: Voce[]): string[] {
  const frasi = racconto.split(/[.;!?\n]+|\b(?:poi|e poi|inoltre|dopo)\b/i).map(f => f.trim()).filter(Boolean);
  return [...new Set([...trovaNelRacconto(racconto, voci), ...frasi.flatMap(f => trovaNelRacconto(f, voci))])];
}

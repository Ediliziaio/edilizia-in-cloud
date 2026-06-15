/**
 * Avatar a tinta deterministica per il client Posta (Unibox).
 *
 * Lo stesso contatto riceve sempre lo stesso accostamento bg/testo: dà alla lista
 * conversazioni e al thread il colpo d'occhio "premium" di Instantly/Smartlead
 * (iniziali colorate per riconoscere a colpo d'occhio chi scrive) senza dipendere
 * dall'ordine di rendering. Palette tenue (50/700) coerente coi badge intent del
 * resto del modulo: niente blocchi pieni che competano con l'accent `primary`.
 *
 * Allineato al pattern `avatarColor` già usato altrove nell'admin (hash djb2 →
 * indice nella palette), ma con varianti soft adatte allo sfondo bianco delle card.
 */
const AVATAR_TINTS = [
  "bg-rose-50 text-rose-700",
  "bg-blue-50 text-blue-700",
  "bg-emerald-50 text-emerald-700",
  "bg-amber-50 text-amber-700",
  "bg-violet-50 text-violet-700",
  "bg-cyan-50 text-cyan-700",
  "bg-pink-50 text-pink-700",
  "bg-teal-50 text-teal-700",
  "bg-indigo-50 text-indigo-700",
  "bg-orange-50 text-orange-700",
  "bg-sky-50 text-sky-700",
  "bg-fuchsia-50 text-fuchsia-700",
] as const;

/** Classi `bg`+`text` deterministiche per le iniziali, a partire da un seed (nome/email). */
export function avatarTint(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
}

/**
 * Toglie le emoji da un testo da stampare (10/11/2026): nei documenti non escono in stampa e non sono professionali.
 *
 * Solo le emoji vere: quelle che si disegnano a colori da sé, i pittogrammi dal piano U+1F000 in su e i simboli
 * seguiti dal selettore «emoji» (U+FE0F), con le loro sequenze (ZWJ, tonalità della pelle). ©, ®, ™, le frecce e
 * gli altri simboli tipografici restano. Uno spazio rimasto doppio torna singolo.
 */
const EMOJI = "(?:\\p{Emoji_Presentation}|[\\u{1F000}-\\u{1FAFF}]|\\p{Extended_Pictographic}\\uFE0F)";
const SEQUENZA = new RegExp(
  `( ?)${EMOJI}[\\u{1F3FB}-\\u{1F3FF}]?\\uFE0F?(?:\\u200D${EMOJI}?[\\u{1F3FB}-\\u{1F3FF}]?\\uFE0F?)*( ?)|\\uFE0F|\\u20E3`,
  "gu",
);

export function senzaEmoji(testo: string): string {
  return testo.replace(SEQUENZA, (_m, prima?: string, dopo?: string) => (prima && dopo ? " " : prima || ""));
}

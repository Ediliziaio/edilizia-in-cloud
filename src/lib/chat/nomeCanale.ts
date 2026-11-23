/**
 * Come si legge il nome di un canale di gruppo.
 *
 * I canali dei cantieri nascono nel database col nome tecnico «cantiere-ord-2026-001» (minuscolo, trattini):
 * in chat l'operaio leggeva quello (collaudo 23/11/2026). Si mostra «Cantiere ORD-2026-001»; il nome salvato non
 * cambia, perché altri punti lo usano per riconoscere il canale.
 */
type Traduci = (testo: string, valori?: Readonly<Record<string, string | number>>) => string;
const inItaliano: Traduci = (testo, valori) => testo.replace(/\{(\w+)\}/g, (tutto, nome: string) => String(valori?.[nome] ?? tutto));

/** `t` traduce la parola «Cantiere» nella lingua dell'operaio (area campo); senza, resta in italiano. */
export function nomeCanaleLeggibile(nome: string | null | undefined, t: Traduci = inItaliano): string {
  const testo = (nome ?? "").trim();
  const cantiere = /^cantiere-(.+)$/i.exec(testo);
  if (cantiere) return t("Cantiere {codice}", { codice: cantiere[1].toUpperCase() });
  return testo;
}

/**
 * Il «traduttore» che le funzioni di supporto (lib) possono ricevere per comporre frasi nella lingua dell'operaio.
 * Senza, restituiscono l'italiano di sempre: così il server, il PDF e l'ufficio non cambiano.
 * Nelle schermate del campo si passa la `t` di `useT()`.
 */
export type Traduttore = (testo: string, valori?: Readonly<Record<string, string | number>>) => string;

export const italiano: Traduttore = (testo, valori) =>
  valori ? testo.replace(/\{(\w+)\}/g, (tutto, nome: string) => (nome in valori ? String(valori[nome]) : tutto)) : testo;

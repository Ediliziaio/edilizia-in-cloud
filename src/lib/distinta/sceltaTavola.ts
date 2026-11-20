/** Suggerimento dal nome: un PDF generico resta selezionabile, ma non viene trattato come tavola da solo. */
export function sembraTavola(nome: string): boolean {
  const n = nome.toLocaleLowerCase("it-IT");
  if (/computo|preventivo|contratto|fattura|capitolato|elenco.prezzi/.test(n)) return false;
  return /planimetr|tavol|piant[ae](?:\b|_)|schema|schemi|disegn|layout/.test(n);
}

import type { Area, Modifica } from "../../../shared/silvio-commessa/piano.ts";

/** Solo divieti espliciti scritti nella chat dall'utente, mai istruzioni degli allegati. */
export function vincoliDalTestoUtente(testo: string): Modifica[] {
  const frasi = testo.toLowerCase().split(/[.!?;,\n]/).filter((s) => /\bnon\s+(?:assegnare|aggiungere|proporre|creare|generare)\b/.test(s));
  const chiavi = new Set<string>();
  for (const frase of frasi) {
    const divieto = frase.slice(frase.search(/\bnon\s/));
    if (/\b(personale|persone|dipendenti|squadra)\b/.test(divieto)) {
      chiavi.add("persone.squadra"); chiavi.add("persone.capomastro");
    }
    if (/\b(ditte|ditta|subappaltatori|subappalti)\b/.test(divieto)) {
      chiavi.add("ditte.assegnate"); chiavi.add("ditte.contratti");
    }
    if (/\b(oda|ordini(?:\s+di\s+acquisto)?|acquisti)\b/.test(divieto)) chiavi.add("materiali.acquisti");
  }
  return [...chiavi].map((chiave) => ({ tipo: "togli", area: chiave.split(".")[0] as Area, chiave }));
}

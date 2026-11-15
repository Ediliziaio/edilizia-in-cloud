/**
 * La voce leggibile di una categoria di costo (15/11/2026). La stessa spesa arriva scritta in
 * modi diversi (moduli diversi, import, maiuscole): «Personale» e «stipendi», «subappalti» e
 * «Squadre esterne», «trasporti_noleggi». Una regola sola per Panoramica e Pianificazione.
 */
const SINONIMI: Array<[string[], string]> = [
  [["personale", "stipendi", "stipendio", "dipendenti", "salari"], "Personale"],
  [["fornitori", "materiali", "materiale", "acquisti"], "Materiali & fornitori"],
  [["squadre esterne", "squadre_esterne", "subappalti", "subappalto", "squadre"], "Squadre esterne"],
  [["provvigioni", "provvigione"], "Provvigioni"],
  [["affitti", "affitto", "immobili"], "Immobili e affitti"],
  [["veicoli", "mezzi", "noleggio_mezzi_attrezzature", "noleggio mezzi e attrezzature", "trasporti_noleggi", "trasporti e noleggi"], "Veicoli, mezzi e noleggi"],
  [["inps", "inail", "contributi", "f24"], "Contributi e F24"],
];

export function voceCosto(categoria: string | null | undefined): string {
  const cat = (categoria ?? "").trim();
  if (!cat) return "Altro";
  const lower = cat.toLowerCase().replace(/\s+/g, " ");
  for (const [nomi, voce] of SINONIMI) if (nomi.includes(lower)) return voce;
  const pulita = lower.replace(/_/g, " ");
  return pulita.charAt(0).toUpperCase() + pulita.slice(1);
}

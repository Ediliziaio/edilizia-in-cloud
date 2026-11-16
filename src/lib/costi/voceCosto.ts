/**
 * La voce leggibile di una categoria di costo (15/11/2026). La stessa spesa arriva scritta in
 * modi diversi (moduli diversi, import, maiuscole): «Personale» e «stipendi», «subappalti» e
 * «Squadre esterne», «trasporti_noleggi». Una regola sola per Panoramica e Pianificazione.
 *
 * 16/11/2026 — le OTTO FAMIGLIE del tipo del fornitore (`src/lib/fornitori/tipiFornitore.ts`)
 * hanno una voce ciascuna. Da quando `contabilizza_fattura_ricevuta` scrive la categoria del
 * costo prendendola dal tipo (migrazione 20290417160000), quei valori arrivano qui per davvero:
 * prima se ne vedevano tre (materiali, subappalto, mezzi) e le altre cinque uscivano con
 * l'etichetta ripulita a caso — «Noli servizi», «Finanza enti». `agenti` finisce in
 * «Provvigioni», dove stavano già le provvigioni scritte a mano: altrimenti la stessa spesa
 * si spaccava in due voci. `tipiFornitoreCoperti` in voceCosto.test.ts non lascia scoperta
 * una famiglia nuova.
 *
 * Nella stessa passata le categorie di `ai-fattura-classify` che hanno un corrispondente
 * ovvio — `consulenze_professionali`, `carburanti`, `servizi_generali`, `trasporti` — si
 * uniscono alla famiglia giusta invece di restare voci a sé.
 */
const SINONIMI: Array<[string[], string]> = [
  [["personale", "stipendi", "stipendio", "dipendenti", "salari"], "Personale"],
  [["fornitori", "materiali", "materiale", "acquisti"], "Materiali & fornitori"],
  [["squadre esterne", "squadre_esterne", "subappalti", "subappalto", "squadre"], "Squadre esterne"],
  [["noli_servizi", "noli e servizi", "trasporti"], "Noli e servizi di cantiere"],
  [["professionisti", "consulenze_professionali", "consulenze professionali"], "Professionisti e tecnici"],
  [["provvigioni", "provvigione", "agenti"], "Provvigioni"],
  [["affitti", "affitto", "immobili"], "Immobili e affitti"],
  [["veicoli", "mezzi", "noleggio_mezzi_attrezzature", "noleggio mezzi e attrezzature", "trasporti_noleggi", "trasporti e noleggi", "carburanti"], "Veicoli, mezzi e noleggi"],
  [["generali", "spese generali", "servizi_generali", "servizi generali"], "Spese generali"],
  [["finanza_enti", "finanza e enti"], "Banche, assicurazioni ed enti"],
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

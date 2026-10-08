import type { SilvioPageContext } from "@/hooks/useSilvioPageContext";

export function silvioContextSuggestions(context: SilvioPageContext | null): string[] {
  switch (context?.entity_type) {
    case "order": return ["Qual è il margine stimato di questa commessa? Segnala i dati mancanti.", "Quali costi mancano in questa commessa?", "Riassumi avanzamento e prossime attività di questa commessa."];
    case "quote": return ["Riassumi questo preventivo.", "Quali dati devo completare prima di inviarlo?", "Controlla costi e margine di questo preventivo."];
    case "customer": return ["Riassumi la situazione di questo cliente.", "Quali pagamenti risultano ancora aperti per questo cliente?", "Prepara una bozza di follow-up per questo cliente, senza inviarla."];
    case "warehouse_overview": return ["Quali materiali sono sotto scorta?", "Quali materiali sono impegnati nelle commesse?", "Quali movimenti di magazzino richiedono verifica?"];
    default: return ["Quali sono le tre priorità di oggi?", "Quali pagamenti devo controllare?", "Quali commesse richiedono attenzione sui costi?"];
  }
}

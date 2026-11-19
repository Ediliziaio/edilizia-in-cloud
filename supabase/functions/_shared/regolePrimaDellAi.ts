/**
 * Prima le regole, poi l'AI (fase 5 del piano anomalie, 14/11/2026).
 *
 * La classificazione di una fattura ricevuta dà due cose: la categoria di spesa e la commessa. La
 * commessa si riconosce senza AI dai codici della fattura (CUP, CIG, codice commessa: funzione SQL
 * `commessa_da_codici`). L'AI si chiama solo per ciò che le regole non sanno dire, e il motivo finisce
 * nel registro dei costi AI. Modulo puro: lo usa ai-fattura-classify, lo provano i test.
 */
import type { EsitoCatenaServer } from "./catenaFatturaServer.ts";

export interface CommessaDaRegole {
  order_id: string;
  motivo: string;
}

/**
 * I documenti della fattura (DDT, ordine, codice, indirizzo) indicano commesse diverse
 * (shared/acquisti/catena.ts). La commessa non la sceglie nessuno: né le regole né l'AI.
 */
export interface ConflittoDaRegole {
  conflitto: string;
  richiedeScelta?: boolean;
}

/** Nessuna singola proposta può assorbire una fattura riferita a più destinazioni. */
export function decidiRiferimentiCommessa(codici: CommessaDaRegole | null, catena: EsitoCatenaServer): {
  regola: CommessaDaRegole | null; proposta: CommessaDaRegole | null; conflitto: ConflittoDaRegole | null;
} {
  const fermati = (conflitto: string, richiedeScelta = false): ReturnType<typeof decidiRiferimentiCommessa> => ({ regola: null, proposta: null, conflitto: { conflitto, richiedeScelta } });
  if (catena.conflitto) return fermati(catena.conflitto, catena.catena?.esito === "scelta");
  if (catena.saltata && catena.catena) return fermati(catena.saltata, true);
  const quote = catena.catena?.allocazioni ?? [];
  const destinazioni = new Set(quote.filter(a => a.destinazione.tipo !== "da_attribuire").map(a => `${a.destinazione.tipo}:${a.destinazione.id}`));
  if (destinazioni.size > 1) return fermati("La fattura indica più destinazioni: conferma la ripartizione delle righe.", true);
  if (destinazioni.size && quote.some(a => a.destinazione.tipo === "da_attribuire")) return fermati("Alcune righe sono ancora da attribuire: conferma la ripartizione della fattura.", true);
  const candidata = catena.commessa ?? catena.proposta;
  if (codici && candidata && codici.order_id !== candidata.order_id) return fermati(`${codici.motivo} e ${candidata.motivo} indicano commesse diverse.`);
  // Il magazzino non diventa una commessa soltanto perché un altro codice sembra compatibile.
  if (codici && quote.some(a => a.destinazione.tipo === "magazzino")) return fermati("I documenti indicano il magazzino e i codici una commessa diversa.");
  const regola = catena.commessa ?? codici;
  return { regola, proposta: regola ? null : catena.proposta ?? null, conflitto: null };
}

export interface Decisione {
  /** true = serve il modello. */
  chiamaAi: boolean;
  /** Perché serve, per il registro; null se non serve. */
  motivo: string | null;
}

export function decidiClassificazione(regola: CommessaDaRegole | null, categoriaGia: string | null | undefined): Decisione {
  const haCategoria = !!categoriaGia && categoriaGia.trim() !== "";
  if (regola && haCategoria) return { chiamaAi: false, motivo: null };
  if (regola) return { chiamaAi: true, motivo: "categoria mancante (commessa già riconosciuta da " + regola.motivo.split(" ")[0] + ")" };
  return { chiamaAi: true, motivo: haCategoria ? "commessa non riconosciuta da CUP/CIG/codice" : "categoria mancante e commessa non riconosciuta da CUP/CIG/codice" };
}

/**
 * La commessa da salvare: quella delle regole vince su quella del modello; un conflitto fra i
 * documenti vince su tutte e due (nessuna commessa, il motivo dice perché).
 */
export function commessaFinale(
  regola: CommessaDaRegole | null,
  ai: { orderId: string | null; confidenza: number },
  conflitto?: ConflittoDaRegole | null,
  proposta?: CommessaDaRegole | null,
): { orderId: string | null; confidenza: number; motivo: string | null } {
  if (conflitto) return { orderId: null, confidenza: 0, motivo: `${conflitto.richiedeScelta ? "Riferimenti da verificare" : "Conflitto fra i documenti, da decidere"}: ${conflitto.conflitto}`.slice(0, 300) };
  if (regola) return { orderId: regola.order_id, confidenza: 1, motivo: regola.motivo };
  if (proposta) return { orderId: proposta.order_id, confidenza: 0.6, motivo: proposta.motivo };
  return { orderId: ai.orderId, confidenza: ai.confidenza, motivo: null };
}
